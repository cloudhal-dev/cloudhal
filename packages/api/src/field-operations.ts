/**
 * RFC-0041 §6, §8: field operations over REST. Studio's person holding `site:settings` (and
 * `content:write`, which the operations also need because they rewrite entries) runs them
 * directly; agents ask through MCP, where a person approves. The operator's CLI reaches the same
 * handlers through `/api/admin` with the deployment token (`cloudhal fields … --remote`).
 *
 * - `POST …/collections/:key/fields/operations` ← `{ op, …, dryRun? }` → the result (`done: false`
 *   when the budget ran out); `?continue=<operationId>` resumes one instead, with
 *   `{ onInvalid: "clear" }` dropping values that stopped converting (RFC-0045 §7)
 * - `GET  …/collections/:key/fields/operations/:operationId` → its status
 * - `POST …/collections/:key/fields/operations/:operationId/revert` ← `{ onInvalid? }` → the revert
 *   result (call again while `done: false`)
 *
 * Refusals are the store's codes: `operation_in_progress` (409), `field_values_unconvertible` (422,
 * with the dry run's report in `details.report`), `field_operation_incomplete` (409), and the
 * definition codes (`unknown_field`, `field_key_duplicate`, `field_key_reserved`, …).
 */
import { holds } from "@cloudhal/agent-runtime";
import type { Actor, FieldOption, SubFieldDefinition } from "@cloudhal/core-contracts";
import {
  continueFieldOperation,
  FIELD_OPERATIONS,
  type FieldOperation,
  fieldOperationStatus,
  revertFieldOperation,
  runFieldOperation,
  type SiteGraphStore,
} from "@cloudhal/core-ts";
import { ALL_FIELD_TYPES, type FieldType } from "@cloudhal/core-ts/fields";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "./context.ts";
import { badRequest, missingScope, notFound } from "./errors.ts";
import { actorOf } from "./governance.ts";
import { param } from "./params.ts";

type Body = Record<string, unknown>;

const str = (b: Body, name: string): string => {
  const v = b[name];
  if (typeof v !== "string" || !v) throw badRequest(`${name} is required`);
  return v;
};

/** RFC-0045 §7: a repeater's sub-field, when the body names one. */
function subOf(b: Body): { sub?: string } {
  if (b.sub === undefined) return {};
  if (typeof b.sub !== "string" || !b.sub) throw badRequest("sub must be a sub-field key");
  return { sub: b.sub };
}

/** RFC-0045 §7: a type change's inputs for references and repeaters, each only when given. */
function stage4Of(b: Body) {
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (b.collections !== undefined && !strings(b.collections))
    throw badRequest("collections must be a list of collection keys");
  if (b.maxItems !== undefined && !Number.isInteger(b.maxItems))
    throw badRequest("maxItems must be a whole number");
  const record = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (b.subFields !== undefined && (!Array.isArray(b.subFields) || !b.subFields.every(record)))
    throw badRequest("subFields must be a list of sub-field definitions");
  if (b.itemLabel !== undefined && typeof b.itemLabel !== "string")
    throw badRequest("itemLabel must be a sub-field key");
  return {
    ...(b.collections !== undefined ? { collections: b.collections as string[] } : {}),
    ...(b.maxItems !== undefined ? { maxItems: b.maxItems as number } : {}),
    ...(b.subFields !== undefined ? { subFields: b.subFields as SubFieldDefinition[] } : {}),
    ...(b.itemLabel !== undefined ? { itemLabel: b.itemLabel as string } : {}),
  };
}

/**
 * The request body as an operation on `collection`; 400 for a malformed one. Reference and
 * repeater targets parse; the store refuses them (`fields_unsupported`) without its capability (RFC-0045 §1).
 */
export function operationOf(collection: string, b: Body): FieldOperation {
  const op = b.op;
  if (typeof op !== "string" || !FIELD_OPERATIONS.includes(op as FieldOperation["op"]))
    throw badRequest(`op must be one of ${FIELD_OPERATIONS.join(", ")}`);
  const sub = subOf(b);
  if (op === "rename_field")
    return { op, collection, from: str(b, "from"), to: str(b, "to"), ...sub };
  if (op === "remove_field") return { op, collection, key: str(b, "key"), ...sub };
  if (op === "set_field_localized") {
    if (typeof b.localized !== "boolean") throw badRequest("localized must be a boolean");
    return { op, collection, key: str(b, "key"), localized: b.localized, ...sub };
  }
  const type = str(b, "type");
  if (!ALL_FIELD_TYPES.includes(type as FieldType))
    throw badRequest(`type must be one of ${ALL_FIELD_TYPES.join(", ")}`);
  if (b.onInvalid !== undefined && b.onInvalid !== "clear")
    throw badRequest('onInvalid is "clear" or absent');
  if (b.multiple !== undefined && typeof b.multiple !== "boolean")
    throw badRequest("multiple must be a boolean");
  if (b.options !== undefined && !Array.isArray(b.options))
    throw badRequest("options must be a list of { value, labels }");
  return {
    op: "change_field_type",
    collection,
    key: str(b, "key"),
    type: type as FieldType,
    ...sub,
    ...stage4Of(b),
    ...(b.options ? { options: b.options as FieldOption[] } : {}),
    ...(b.multiple !== undefined ? { multiple: b.multiple as boolean } : {}),
    ...(b.onInvalid === "clear" ? { onInvalid: "clear" as const } : {}),
  };
}

/**
 * RFC-0045 §7: `{ onInvalid: "clear" }` on a continue or a revert drops the values that stopped
 * converting while the operation ran, so it can always finish.
 */
function clearOf(b: Body): { onInvalid?: "clear" } {
  if (b.onInvalid === undefined) return {};
  if (b.onInvalid !== "clear") throw badRequest('onInvalid is "clear" or absent');
  return { onInvalid: "clear" };
}

/** The operation must belong to the collection in the path. */
async function ownStatus(store: SiteGraphStore, siteId: string, key: string, id: string) {
  const status = await fieldOperationStatus(store, siteId, id);
  if (status.operation.collection !== key) throw notFound("not found: field operation");
  return status;
}

/** The handlers, for the people's routes and the operator's alike. */
export function fieldOperationHandlers(actor: (c: Context<Env>) => Actor) {
  return new Hono<Env>()
    .post("/:key/fields/operations", async (c) => {
      const store = c.get("store");
      const siteId = param(c, "siteId");
      const key = param(c, "key");
      const resume = c.req.query("continue");
      const b = ((await c.req.json().catch(() => null)) ?? {}) as Body;
      if (resume) {
        const clear = clearOf(b);
        await ownStatus(store, siteId, key, resume);
        return c.json(
          await continueFieldOperation(store, siteId, resume, { actor: actor(c), ...clear }),
        );
      }
      if (b.dryRun !== undefined && typeof b.dryRun !== "boolean")
        throw badRequest("dryRun must be a boolean");
      const op = operationOf(key, b);
      return c.json(
        await runFieldOperation(store, siteId, op, { actor: actor(c), dryRun: b.dryRun === true }),
      );
    })
    .get("/:key/fields/operations/:operationId", async (c) =>
      c.json(
        await ownStatus(
          c.get("store"),
          param(c, "siteId"),
          param(c, "key"),
          param(c, "operationId"),
        ),
      ),
    )
    .post("/:key/fields/operations/:operationId/revert", async (c) => {
      const store = c.get("store");
      const siteId = param(c, "siteId");
      const id = param(c, "operationId");
      await ownStatus(store, siteId, param(c, "key"), id);
      const b = ((await c.req.json().catch(() => null)) ?? {}) as Body;
      return c.json(
        await revertFieldOperation(store, siteId, id, { actor: actor(c), ...clearOf(b) }),
      );
    });
}

/**
 * The people's routes under `/api/sites/:siteId/collections`. `ROUTE_SCOPES` asks `site:settings`
 * for the writes; the operations rewrite entries, so `content:write` is checked here too.
 */
export const fieldOperations: Hono<Env> = new Hono<Env>()
  .use("/:key/fields/operations/*", async (c, next) => {
    const principal = c.get("principal");
    if (c.req.method === "POST" && principal && !holds(principal.scopes, "content:write"))
      throw missingScope("content:write");
    await next();
  })
  .use("/:key/fields/operations", async (c, next) => {
    const principal = c.get("principal");
    if (principal && !holds(principal.scopes, "content:write")) throw missingScope("content:write");
    await next();
  })
  .route("/", fieldOperationHandlers(actorOf));
