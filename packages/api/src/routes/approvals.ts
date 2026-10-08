/**
 * `/api/sites/:siteId/approvals` — requests waiting for a person (ADR-0014): agents' publish /
 * rollback / delete / elevation requests, and people's publishes their role cannot make alone
 * (cause `role`, RFC-0005 §6). People only; decisions are audited.
 *
 * - `GET  /?status=pending|approved|denied|consumed|expired` → `{items: (Approval & {canDecide})[]}`.
 *   With `audit:read` (Editor+) every request; otherwise requests from the caller's own keys,
 *   their own requests, and those they can decide.
 * - `POST /:approvalId/approve` · `POST /:approvalId/deny`
 *   403 `cannot_decide` (details.code: own_request | not_key_creator | mode_above_role |
 *   missing_scope | not_own): only someone who could make the same call right now decides (I8);
 *   nobody approves their own request; the key's creator may always deny their agent's requests.
 *   409 `conflict`: no longer pending · 409 `elevation_conflict`: still pending, but the agent's key
 *   cannot take the elevation · 409 `state_changed`: a person's request no longer matches the site
 *   (it is denied; publish the current state yourself)
 *
 * An agent's `request_elevation` (ADR-0016) is carried out here when its key's creator approves it.
 * A person's `role` request is carried out here too: approving it publishes with the approver's
 * rights at the approved state, and the request is marked used.
 */
import {
  type AgentMode,
  type Approval,
  type ApprovalStatus,
  checkEntryLimit,
  elevationProblem,
  holds,
  isAgentMode,
  isMoreAutonomous,
  modeCap,
  OwnLimitError,
  type Principal,
} from "@cloudhal/agent-runtime";
import type { Site } from "@cloudhal/core-contracts";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound, unauthorized } from "../errors.ts";
import { ownOnlyPending, ownOnlySnapshot, snapshotPublishState } from "../own.ts";
import { param } from "../params.ts";

const REQUEST_ELEVATION = "request_elevation";

interface ElevationInput {
  keyId: string;
  mode: AgentMode;
  minutes: number;
  reason?: string;
}

function elevationInput(a: Approval): ElevationInput | undefined {
  const i = a.input as Partial<ElevationInput> | undefined;
  if (!i || typeof i.keyId !== "string" || !isAgentMode(i.mode) || typeof i.minutes !== "number")
    return undefined;
  return i as ElevationInput;
}

/**
 * The request is still pending, but the key cannot take it: distinct from `conflict` (already
 * decided), so a client knows the request stays in the list.
 */
function elevationConflict(c: Context<Env>, message: string): Response {
  return c.json({ error: "elevation_conflict", message }, 409);
}

/**
 * Before deciding an elevation request: the approver's own key still exists and can still take it
 * (its own mode may have changed meanwhile). Returns the minutes to grant.
 */
async function checkElevation(
  c: Context<Env>,
  request: Approval,
): Promise<{ input: ElevationInput; minutes: number } | Response> {
  const keys = c.get("agentKeys");
  const input = elevationInput(request);
  if (!keys || !input)
    return c.json(
      { error: "conflict", message: "this elevation request cannot be granted here" },
      409,
    );
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { minutes?: unknown };
  if (body.minutes !== undefined && typeof body.minutes !== "number")
    throw badRequest("minutes must be a number");
  const minutes = body.minutes ?? input.minutes;
  if (minutes > input.minutes) throw badRequest("an approver can shorten a request, not extend it");
  const key = (await keys.list({ headers: c.req.raw.headers })).find((k) => k.id === input.keyId);
  if (!key) return elevationConflict(c, "the agent's key no longer exists, or it is not yours");
  const problem = elevationProblem(key.mode, input.mode, minutes);
  if (problem) return elevationConflict(c, problem);
  return { input, minutes };
}

type DecideCheck = { ok: true } | { ok: false; code: string; reason: string };

const NO = (code: string, reason: string): DecideCheck => ({ ok: false, code, reason });

/** Who the person behind a request is (an agent's key creator, or the person themselves). */
async function requesterPerson(c: Context<Env>, request: Approval): Promise<string | undefined> {
  return c.get("ownership").personOf(request.actor);
}

/**
 * `canDecide` (RFC-0005 §6, I8): the approver is a member who could make the same call now, with
 * the own limit measured against them; nobody approves their own person-filed request; only the
 * key's creator decides an elevation, up to their role's cap. Approval gates are ignored (the
 * approver is the gate). The key's creator may always deny their own agent's requests.
 */
export async function canDecide(
  c: Context<Env>,
  request: Approval,
  decision: "approve" | "deny",
): Promise<DecideCheck> {
  const principal = c.get("principal");
  if (!principal) return NO("unauthorized", "sign in");
  // Without a membership source every person may decide (auth-less servers, tests).
  if (!c.get("staff") || !principal.person) return { ok: true };
  const person = principal.person;
  const ownRequest = request.actor.kind === "human" && request.actor.id === principal.actor.id;
  const byMyAgent =
    request.actor.kind === "agent" && (await requesterPerson(c, request)) === person.id;
  if (decision === "deny" && (ownRequest || byMyAgent)) return { ok: true };
  if (ownRequest) return NO("own_request", "nobody approves their own request");

  if (request.tool === REQUEST_ELEVATION) {
    const input = elevationInput(request);
    if (!byMyAgent || !input)
      return NO(
        "not_key_creator",
        "only the person who created the agent's key grants it more autonomy",
      );
    const cap = modeCap(person.role);
    if (isMoreAutonomous(input.mode, cap))
      return NO("mode_above_role", `your role allows keys up to ${cap.toUpperCase()} mode`);
    return { ok: true };
  }

  const asPerson: Principal = { actor: principal.actor, scopes: principal.scopes, person };
  const verdict = c.get("policy")().evaluate(asPerson, request.tool, { confirmed: true });
  if (verdict.kind === "deny")
    return NO("missing_scope", `your role cannot ${request.tool}: ${verdict.reason}`);
  const limit = verdict.limit;
  if (!limit) return { ok: true };
  const input = (request.input ?? {}) as Record<string, unknown>;
  const store = c.get("store");
  if (limit.target === "changeset") {
    const site = request.siteId ? await store.getSite(request.siteId) : undefined;
    if (!site) return NO("not_found", "the site no longer exists");
    const check =
      typeof input.snapshotId === "string"
        ? await ownOnlySnapshot(c, site, input.snapshotId, person.id)
        : await ownOnlyPending(store, c, site.id, person.id);
    return check.ownOnly
      ? { ok: true }
      : NO("not_own", "the publish includes work that is not yours; an Editor decides it");
  }
  // An entry tool: the target must be the approver's own (and, for draft-own, never published).
  if (typeof input.entryId !== "string") return { ok: true };
  const entry = await store.getContentEntry(input.entryId);
  if (!entry) return { ok: true }; // the call fails on its own when redeemed
  try {
    await checkEntryLimit({
      limit,
      op: request.tool === "delete_entry" ? "delete" : "update",
      person: person.id,
      owner: c.get("ownership"),
      stored: entry,
      next:
        request.tool === "update_entry" && typeof input.status === "string"
          ? { ...entry, status: input.status as typeof entry.status }
          : undefined,
    });
  } catch (e) {
    if (e instanceof OwnLimitError) return NO("not_own", e.message);
    throw e;
  }
  return { ok: true };
}

/** Is the site still in the state a person's request is bound to? */
async function stillCurrent(c: Context<Env>, request: Approval, site: Site): Promise<boolean> {
  const input = (request.input ?? {}) as { snapshotId?: unknown };
  if (typeof input.snapshotId === "string")
    return snapshotPublishState(site, input.snapshotId) === request.stateHash;
  return (await c.get("store").stateHash(site.id)) === request.stateHash;
}

/** Carries out an approved person-request to publish, with the approver's rights. */
async function publishFor(c: Context<Env>, request: Approval, site: Site) {
  const store = c.get("store");
  const actor = c.get("actor") as NonNullable<Env["Variables"]["actor"]>;
  const input = (request.input ?? {}) as { snapshotId?: unknown; label?: unknown };
  const snapshotId =
    typeof input.snapshotId === "string"
      ? input.snapshotId
      : (
          await store.createSnapshot(site.id, {
            actor,
            reason: "publish",
            ...(typeof input.label === "string" && input.label ? { label: input.label } : {}),
          })
        ).id;
  const published = await store.publish(site, snapshotId);
  await c.get("audit")?.record({
    at: new Date().toISOString(),
    actor,
    siteId: site.id,
    tool: "publish",
    decision: "allow",
    outcome: "ok",
    snapshotId,
    reason: `published request ${request.id} from ${request.actor.name ?? request.actor.id}`,
    input: { requestId: request.id, snapshotId },
  });
  return { site: published, snapshotId };
}

const STATUSES = new Set<ApprovalStatus>(["pending", "approved", "denied", "consumed", "expired"]);

export const approvals: Hono<Env> = new Hono<Env>()
  .use("*", async (c, next) => {
    if (!c.get("approvals")) throw notFound("approvals are not enabled on this server");
    await next();
  })
  .get("/", async (c) => {
    const status = c.req.query("status");
    if (status !== undefined && !STATUSES.has(status as ApprovalStatus))
      throw badRequest("unknown status");
    const store = c.get("approvals");
    const items = await store?.list({
      siteId: param(c, "siteId"),
      ...(status ? { status: status as ApprovalStatus } : {}),
    });
    // `expired` is computed on read; filter again so a stale pending row is not listed as pending
    const listed = status ? (items ?? []).filter((a) => a.status === status) : (items ?? []);
    const principal = c.get("principal");
    const seesAll = !principal?.person || holds(principal.scopes, "audit:read");
    const out: (Approval & { canDecide: boolean })[] = [];
    for (const a of listed) {
      const decidable = a.status === "pending" && (await canDecide(c, a, "approve")).ok;
      const mine =
        a.actor.id === principal?.actor.id ||
        (principal?.person !== undefined &&
          (await c.get("ownership").personOf(a.actor)) === principal.person.id);
      if (seesAll || mine || decidable) out.push({ ...a, canDecide: decidable });
    }
    return c.json({ items: out });
  })
  .post("/:approvalId/:decision", async (c) => {
    const decision = param(c, "decision");
    if (decision !== "approve" && decision !== "deny") throw notFound("unknown action");
    const actor = c.get("actor");
    if (!actor) throw unauthorized();
    const store = c.get("approvals");
    const id = param(c, "approvalId");
    const existing = await store?.get(id);
    if (!existing || existing.siteId !== param(c, "siteId")) throw notFound("approval not found");
    if (existing.status === "pending") {
      const check = await canDecide(c, existing, decision);
      if (!check.ok) throw apiError(403, "cannot_decide", check.reason, { code: check.code });
    }
    const elevation =
      decision === "approve" && existing.tool === REQUEST_ELEVATION && existing.status === "pending"
        ? await checkElevation(c, existing)
        : undefined;
    if (elevation instanceof Response) return elevation;
    // A person's own request (cause `role`) runs now, at the state it was filed against.
    const personRequest =
      decision === "approve" &&
      existing.status === "pending" &&
      existing.actor.kind === "human" &&
      existing.cause === "role" &&
      existing.tool === "publish";
    const site = personRequest ? await c.get("store").getSite(existing.siteId ?? "") : undefined;
    if (personRequest && (!site || !(await stillCurrent(c, existing, site)))) {
      await store?.decide(id, "denied", actor, "the site changed after the request");
      throw apiError(
        409,
        "state_changed",
        "the site changed after this request was filed; it was closed. Publish the current state yourself.",
      );
    }
    let decided = await store?.decide(id, decision === "approve" ? "approved" : "denied", actor);
    if (!decided)
      return c.json(
        {
          error: "conflict",
          message: `this request is ${existing.status}; it can no longer be decided`,
        },
        409,
      );
    await c.get("audit")?.record({
      at: new Date().toISOString(),
      actor,
      siteId: existing.siteId,
      tool: existing.tool,
      decision: decision === "approve" ? "allow" : "deny",
      reason: `${decision === "approve" ? "approved" : "denied"} request ${id} from ${existing.actor.name ?? existing.actor.id}`,
      outcome: "ok",
    });
    if (personRequest && site) {
      const published = await publishFor(c, existing, site);
      decided = (await store?.complete(id)) ?? decided;
      return c.json({ ...decided, published });
    }
    if (elevation && decided) {
      // Carry the request out now: the agent's next call runs in the granted mode.
      const keys = c.get("agentKeys") as NonNullable<Env["Variables"]["agentKeys"]>;
      const granted = await keys.elevate({
        headers: c.req.raw.headers,
        id: elevation.input.keyId,
        mode: elevation.input.mode,
        minutes: elevation.minutes,
        reason: `requested by the agent: ${elevation.input.reason ?? ""}`.trim(),
      });
      const until = granted.elevation?.until ?? "";
      decided =
        (await store?.complete(id, {
          from: granted.mode,
          mode: elevation.input.mode,
          minutes: elevation.minutes,
          until,
        })) ?? decided;
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor,
        siteId: existing.siteId,
        tool: "agent-key.elevate",
        decision: "allow",
        outcome: "ok",
        reason: `${granted.name ?? granted.id}: ${granted.mode} → ${granted.effectiveMode} until ${until} (${elevation.minutes} min), requested by the agent (${id})`,
        // Structured for readers: which request this granted, and for how long.
        input: { requestId: id, keyId: elevation.input.keyId, minutes: elevation.minutes },
        mode: granted.effectiveMode,
        elevation: { from: granted.mode, until },
      });
    }
    return c.json(decided);
  });
