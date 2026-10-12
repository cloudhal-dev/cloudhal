/**
 * Schedules for people (RFC-0008 §13): running a schedule tool's handler as the signed-in person
 * (the same code agents reach over MCP, so REST and MCP decide alike), mapping tool errors to HTTP,
 * and the rights source the scheduler's run-time re-check uses (§10.6).
 */
import type { AgentMode, OwnLimit, Principal, Role } from "@cloudhal/agent-runtime";
import type { Actor, Release } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import {
  createReleaseApprovalCheck,
  type ReleaseRightsSource,
  schedulesAvailable,
} from "@cloudhal/mcp-server/schedules";
import {
  defineTools,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  toToolError,
} from "@cloudhal/mcp-server/tools";
import type { ApprovalVerdict } from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { SqlDriver } from "@cloudhal/storage";
import type { Context } from "hono";
import type { AgentKeyService, StaffService } from "./auth.ts";
import { actorIdForUser, agentKeyStateFromSql } from "./auth.ts";
import type { Env } from "./context.ts";
import { apiError, missingScope, notFound } from "./errors.ts";
import { StaffStore } from "./staff.ts";

let defs: Map<string, ToolDefinition> | undefined;
function tool(name: string): ToolDefinition {
  defs ??= new Map(defineTools().map((t) => [t.name, t]));
  const def = defs.get(name);
  if (!def) throw new Error(`unknown tool ${name}`);
  return def;
}

/** The deployment's schedules, or 404 when it has none. */
export function schedulesOf(c: Context<Env>) {
  const deps = c.get("schedules");
  if (!schedulesAvailable(deps)) throw notFound("schedules are not enabled on this server");
  return deps;
}

const STATUS: Partial<Record<string, 400 | 403 | 404 | 409 | 422>> = {
  not_found: 404,
  conflict: 409,
  denied: 403,
  approval_required: 409,
  invalid: 400,
  schedules_disabled: 404,
  gates_unsupported: 409,
  invalid_availability: 422,
};

/** A tool error as the REST answer (`error` is the code; `state_changed` and the like keep theirs). */
export function toolErrorResponse(e: ToolError): never {
  const inner = /^([a-z_]+): /.exec(e.message)?.[1];
  const code =
    inner && ["state_changed", "too_far_for_request", "dependency_missing"].includes(inner)
      ? inner
      : typeof e.details.code === "string"
        ? (e.details.code as string)
        : e.code;
  throw apiError(STATUS[e.code] ?? 400, code, e.message, { ...e.details });
}

/**
 * Runs a schedule tool's handler for the signed-in person (§13: people use REST, agents MCP):
 * the policy decides the own limit as for MCP, the person counts as having confirmed (they act in
 * their own Studio), and the call is audited under `event`.
 */
export async function runAsPerson(
  c: Context<Env>,
  name: string,
  args: Record<string, unknown>,
  event: string,
  extra: Partial<ToolContext> = {},
): Promise<Record<string, unknown>> {
  const def = tool(name);
  const principal = c.get("principal") as Principal;
  const person: Principal = {
    actor: principal.actor,
    scopes: principal.scopes,
    ...(principal.person ? { person: principal.person } : {}),
  };
  const verdict = c.get("policy")().evaluate(person, name, { confirmed: true, args });
  if (verdict.kind === "deny") throw missingScope(def.scopes.join(", "), verdict.reason);
  let effect: Record<string, unknown> | undefined;
  const ctx: ToolContext = {
    store: c.get("store"),
    principal: person,
    approvals: c.get("approvals"),
    ownership: c.get("ownership"),
    schedules: c.get("schedules"),
    now: c.get("now"),
    confirmed: true,
    ...(verdict.kind === "allow" && verdict.limit ? { limit: verdict.limit as OwnLimit } : {}),
    ...(c.get("audit") ? { audit: c.get("audit") } : {}),
    report: (e) => {
      effect = { ...effect, ...e };
    },
    ...extra,
  };
  try {
    if (def.precheck) await def.precheck(args, ctx);
    const result = (await def.handler(args, ctx)) as Record<string, unknown>;
    const releaseId =
      (result.release as { id?: string } | undefined)?.id ??
      (typeof effect?.releaseId === "string" ? effect.releaseId : undefined);
    await c.get("audit")?.record({
      at: c.get("now")().toISOString(),
      actor: principal.actor,
      siteId: typeof args.siteId === "string" ? args.siteId : undefined,
      tool: event,
      decision: "allow",
      outcome: "ok",
      input: { ...args, ...(effect ? { effect } : {}) },
      ...(releaseId ? { releaseId } : {}),
      ...(typeof result.status === "string" && result.status === "approval-pending"
        ? { reason: "waits for someone whose role allows it", cause: "role" as const }
        : {}),
    });
    return result;
  } catch (raw) {
    const e = toToolError(raw);
    if (e instanceof ToolError) toolErrorResponse(e);
    throw e;
  }
}

/** Audits a person's schedule action that does not run a tool (settings, automations, publish now). */
export async function auditPerson(
  c: Context<Env>,
  event: string,
  input: Record<string, unknown>,
  ids: { siteId?: string; releaseId?: string; automationId?: string; runId?: string } = {},
  reason?: string,
): Promise<void> {
  const actor = c.get("actor") as Actor;
  await c.get("audit")?.record({
    at: c.get("now")().toISOString(),
    actor,
    siteId: ids.siteId,
    tool: event,
    decision: "allow",
    outcome: "ok",
    input,
    ...(reason ? { reason } : {}),
    ...(ids.releaseId ? { releaseId: ids.releaseId } : {}),
    ...(ids.automationId ? { automationId: ids.automationId } : {}),
    ...(ids.runId ? { runId: ids.runId } : {}),
  });
}

/**
 * The rights source for `createReleaseApprovalCheck` (§10.6) over the deployment's members and
 * agent keys: a person's role now (undefined once they left), an `auto` approval's key (undefined
 * once revoked or its creator left). Wire it into the scheduler with the graph store, the schedule
 * store and `staff.ownership`.
 */
export function releaseRights(
  staff: StaffService,
  agentKeys?: AgentKeyService,
): ReleaseRightsSource {
  return {
    async role(personId: string): Promise<Role | undefined> {
      const member = (await staff.store.list()).find((m) => actorIdForUser(m.userId) === personId);
      return member?.role;
    },
    ...(agentKeys?.state
      ? {
          async key(keyId: string): Promise<{ mode: AgentMode; creatorRole: Role } | undefined> {
            const state = await agentKeys.state?.(keyId);
            return state?.enabled && state.creatorRole
              ? { mode: state.effectiveMode, creatorRole: state.creatorRole }
              : undefined;
          },
        }
      : {}),
  };
}

/**
 * The scheduler's `checkApproval` (RFC-0008 §10.6) over the deployment's database, for a tick that
 * runs outside any request (the admin Worker's cron and alarm, the Node ticker): members and agent
 * keys are read as they are now. A deployment without members (auth-less local use) has nobody
 * whose rights could lapse, so every approval holds there.
 */
export function releaseApprovalCheck(o: {
  sql: SqlDriver;
  graph: SiteGraphStore;
}): (release: Release, now: Date) => Promise<ApprovalVerdict> {
  const staff = new StaffStore(o.sql);
  const store = new SqlScheduleStore(o.sql);
  return async (release, now) => {
    const members = await staff.list();
    if (members.length === 0) return { ok: true };
    const rights: ReleaseRightsSource = {
      async role(personId) {
        return members.find((m) => actorIdForUser(m.userId) === personId)?.role;
      },
      async key(keyId) {
        const state = await agentKeyStateFromSql(o.sql, keyId, now);
        return state?.enabled && state.creatorRole
          ? { mode: state.effectiveMode, creatorRole: state.creatorRole }
          : undefined;
      },
    };
    return createReleaseApprovalCheck({
      graph: o.graph,
      store,
      ownership: {
        async personOf(actor) {
          if (actor.kind === "human") return actor.id;
          if (actor.kind !== "agent") return undefined;
          const userId = await staff.userOfAgent(actor.id);
          return userId ? actorIdForUser(userId) : undefined;
        },
      },
      rights,
    })(release, now);
  };
}
