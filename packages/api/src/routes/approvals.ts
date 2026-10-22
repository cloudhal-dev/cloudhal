/**
 * `/api/sites/:siteId/approvals` — requests waiting for a person (ADR-0014): agents' publish /
 * rollback / delete / elevation requests, and people's publishes their role cannot make alone
 * (cause `role`, RFC-0005 §6). People only; decisions are audited.
 *
 * - `GET  /?status=pending|approved|denied|consumed|expired` → `{items: (Approval & {canDecide,
 *   changes?})[]}`. With `audit:read` (Editor+) every request; otherwise requests from the
 *   caller's own keys, their own requests, and those they can decide. Pending requests of tools
 *   that describe their effect carry `changes` (RFC-0014 §5: `edit_body`'s block diff, now).
 * - `POST /:approvalId/approve` · `POST /:approvalId/deny`
 *   403 `cannot_decide` (details.code: own_request | not_key_creator | mode_above_role |
 *   missing_scope | not_own): only someone who could make the same call right now decides (I8);
 *   nobody approves their own request; the key's creator may always deny their agent's requests.
 *   409 `conflict`: no longer pending · 409 `elevation_conflict`: still pending, but the agent's key
 *   cannot take the elevation · 409 `state_changed`: a person's request no longer matches the site
 *   (it is denied; publish the current state yourself)
 *
 * An agent's `request_elevation` (ADR-0016) is carried out here when its key's creator approves it.
 * Comment tools (RFC-0007 §10.3) are carried out here too: approving recomputes the request's
 * `cm1:` binding (a mismatch denies it and answers 409 `state_changed`), then runs the call as the
 * approving person — `requestedBy` the agent, the approval id on the comment events — and marks
 * the request used. The agent sees the outcome through `list_comments`.
 * A person's `role` request is carried out here too: approving it publishes with the approver's
 * rights at the approved state, and the request is marked used.
 * Release tools (RFC-0008 §10.4) are carried out the same way: approving recomputes the request's
 * `rl1:` binding (and checks the release's time is the one asked about), then schedules the
 * release with the approver's own approval; only someone who may approve it now decides
 * (`releases:publish`, or `:own` with own-only items; lifting an embargo: Editors and above, D8).
 * Denying a release request returns the release to a draft.
 */
import {
  type AgentMode,
  type Approval,
  type ApprovalStatus,
  checkEntryLimit,
  elevationProblem,
  forSite,
  holds,
  isAgentMode,
  isMoreAutonomous,
  modeCap,
  type OwnLimit,
  OwnLimitError,
  type Principal,
} from "@cloudhal/agent-runtime";
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { commentEntries, isBoundState, ownedNodeIds } from "@cloudhal/mcp-server/comments";
import { approvalProblem, schedulesAvailable } from "@cloudhal/mcp-server/schedules";
import {
  type ApprovalChanges,
  defineTools,
  type ToolContext,
  type ToolDefinition,
  toToolError,
} from "@cloudhal/mcp-server/tools";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound, unauthorized } from "../errors.ts";
import { ownOnlyPending, ownOnlySnapshot, snapshotPublishState } from "../own.ts";
import { param } from "../params.ts";

const REQUEST_ELEVATION = "request_elevation";

let toolDefs: Map<string, ToolDefinition> | undefined;
/** A tool that Studio carries out on approval (RFC-0007 §10.3), or undefined. */
function carriedOut(tool: string): ToolDefinition | undefined {
  toolDefs ??= new Map(defineTools().map((t) => [t.name, t]));
  const def = toolDefs.get(tool);
  return def?.carryOutOnApproval ? def : undefined;
}

/**
 * What a pending request would change now (RFC-0014 §5: `edit_body`'s block diff), for the person
 * deciding; undefined for tools that do not say, or when it no longer applies.
 */
async function changesOf(c: Context<Env>, a: Approval): Promise<ApprovalChanges | undefined> {
  toolDefs ??= new Map(defineTools().map((t) => [t.name, t]));
  const def = toolDefs.get(a.tool);
  if (!def?.changes || a.status !== "pending") return undefined;
  const principal = c.get("principal") ?? { actor: a.actor, scopes: [] };
  try {
    return await def.changes((a.input ?? {}) as Record<string, unknown>, {
      store: c.get("store"),
      principal,
      ownership: c.get("ownership"),
    });
  } catch {
    // The body moved on or the node is gone: the request will not apply as asked anyway.
    return undefined;
  }
}

/** The entries a comment request touches: its comments' entries, or the thread's entry. */
async function commentTargets(c: Context<Env>, siteId: string, input: Record<string, unknown>) {
  const deps = c.get("comments");
  const ids = Array.isArray(input.ids)
    ? (input.ids as string[])
    : Array.isArray(input.items)
      ? (input.items as { commentId: string }[]).map((i) => i.commentId)
      : typeof input.commentId === "string"
        ? [input.commentId]
        : [];
  const nodeIds =
    typeof input.nodeId === "string"
      ? [input.nodeId]
      : deps
        ? (await deps.store.getMany(siteId, ids.slice(0, 50))).map((x) => x.nodeId)
        : [];
  return [...(await commentEntries(c.get("store"), siteId, nodeIds)).values()];
}

/** The context a carried-out comment request runs in: the approving person, confirmed. */
function carryContext(
  c: Context<Env>,
  request: Approval,
  limit: OwnLimit | undefined,
): ToolContext {
  const principal = c.get("principal") as Principal;
  return {
    store: c.get("store"),
    principal: { actor: principal.actor, scopes: principal.scopes, person: principal.person },
    ownership: c.get("ownership"),
    comments: c.get("comments"),
    schedules: c.get("schedules"),
    approvals: c.get("approvals"),
    now: c.get("now"),
    confirmed: true,
    approval: { id: request.id, requestedBy: request.actor },
    ...(limit ? { limit } : {}),
  };
}

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

/** Release tools whose requests are carried out on approval (RFC-0008 §10.4). */
const RELEASE_TOOLS = new Set([
  "schedule_release",
  "reschedule",
  "cancel_schedule",
  "lift_embargo",
  "schedule_unpublish",
]);

/** Who may decide a release request (§10.4, §10.6, D8): someone who may approve it now. */
async function releaseDecideCheck(
  c: Context<Env>,
  request: Approval,
  person: Principal,
): Promise<DecideCheck> {
  const deps = c.get("schedules");
  if (!schedulesAvailable(deps)) return NO("not_found", "schedules are not enabled on this server");
  const input = (request.input ?? {}) as { releaseId?: unknown; nodeId?: unknown };
  if (request.tool === "lift_embargo")
    return holds(person.scopes, "releases:publish") && holds(person.scopes, "schedules:write")
      ? { ok: true }
      : NO("missing_scope", "lifting an embargo is for Editors and above");
  if (request.tool === "schedule_unpublish") {
    if (holds(person.scopes, "releases:publish")) return { ok: true };
    const entry =
      typeof input.nodeId === "string"
        ? await c.get("store").getContentEntry(input.nodeId)
        : undefined;
    const own =
      entry !== undefined &&
      holds(person.scopes, "releases:publish:own") &&
      (await c.get("ownership").personOf((entry as ContentEntry).author)) === person.person?.id;
    return own ? { ok: true } : NO("not_own", "taking this content down is for an Editor");
  }
  if (typeof input.releaseId !== "string" || !request.siteId)
    return NO("not_found", "the release no longer exists");
  const rec = await deps.store.getReleaseRecord(request.siteId, input.releaseId);
  if (!rec) return NO("not_found", "the release no longer exists");
  const problem = await approvalProblem(c.get("store"), c.get("ownership"), person, rec.items);
  return problem ? NO("cannot_approve", problem) : { ok: true };
}

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
  const signedIn = c.get("principal");
  if (!signedIn) return NO("unauthorized", "sign in");
  // Without a membership source every person may decide (auth-less servers, tests).
  if (!c.get("staff") || !signedIn.person) return { ok: true };
  // RFC-0034 A2: decided with the person's role on the request's site.
  const principal = request.siteId ? forSite(signedIn, request.siteId) : signedIn;
  if (!principal?.person) return NO("not_found", "not found: site");
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
  const input = (request.input ?? {}) as Record<string, unknown>;
  const verdict = c
    .get("policy")()
    .evaluate(asPerson, request.tool, { confirmed: true, args: input });
  if (verdict.kind === "deny")
    return NO("missing_scope", `your role cannot ${request.tool}: ${verdict.reason}`);
  // Some calls need more of the person deciding than of the agent asking (`approverScopes`).
  const extra = c.get("policy")().tool(request.tool)?.approverScopes ?? [];
  const lacking = extra.filter((s) => !holds(principal.scopes, s));
  if (lacking.length > 0)
    return NO(
      "missing_scope",
      `your role cannot approve ${request.tool}: needs ${lacking.join(", ")}`,
    );
  if (RELEASE_TOOLS.has(request.tool)) return releaseDecideCheck(c, request, asPerson);
  const limit = verdict.limit;
  if (!limit) return { ok: true };
  const store = c.get("store");
  if (limit.target === "comment") {
    // RFC-0007 §10.3: an Author decides comment requests on their own entries only.
    const entries = request.siteId ? await commentTargets(c, request.siteId, input) : [];
    const own = await ownedNodeIds(c.get("ownership"), person.id, entries);
    return entries.every((e) => own.includes(e.nodeId))
      ? { ok: true }
      : NO("not_own", "these comments are on articles that are not yours; an Editor decides them");
  }
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
    const out: (Approval & { canDecide: boolean; changes?: ApprovalChanges })[] = [];
    for (const a of listed) {
      const decidable = a.status === "pending" && (await canDecide(c, a, "approve")).ok;
      const mine =
        a.actor.id === principal?.actor.id ||
        (principal?.person !== undefined &&
          (await c.get("ownership").personOf(a.actor)) === principal.person.id);
      if (!(seesAll || mine || decidable)) continue;
      const changes = await changesOf(c, a);
      out.push({ ...a, canDecide: decidable, ...(changes ? { changes } : {}) });
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
    // A comment tool runs now, as the approving person, if the comments are as the agent saw them.
    const carry =
      decision === "approve" && existing.status === "pending"
        ? carriedOut(existing.tool)
        : undefined;
    let carryCtx: ToolContext | undefined;
    if (carry) {
      const principal = c.get("principal") as Principal;
      const input = (existing.input ?? {}) as Record<string, unknown>;
      const verdict = c
        .get("policy")()
        .evaluate(
          { actor: principal.actor, scopes: principal.scopes, person: principal.person },
          existing.tool,
          { confirmed: true, args: input },
        );
      carryCtx = carryContext(c, existing, verdict.kind === "allow" ? verdict.limit : undefined);
      // Fail closed (threat-model review of 2026-10-12, item 3): a request filed without a
      // computed binding, or a binding that cannot be computed now, is never carried out — two
      // failures must not compare equal.
      if (!isBoundState(existing.stateHash)) {
        await store?.decide(id, "denied", actor, "the request is not bound to the comments' state");
        throw apiError(
          409,
          "state_changed",
          "This request is not tied to the comments as the agent saw them, so it cannot be carried out; it was closed. Ask the agent again.",
        );
      }
      const binding = carry.bindState
        ? await carry.bindState(input, carryCtx).catch(() => null)
        : null;
      if (!isBoundState(binding)) {
        await store?.decide(id, "denied", actor, "the comments' current state could not be read");
        throw apiError(
          409,
          "state_changed",
          "The comments' current state could not be read, so the request cannot be checked; it was closed. Look at them again.",
        );
      }
      if (binding !== existing.stateHash) {
        const release = RELEASE_TOOLS.has(existing.tool);
        await store?.decide(
          id,
          "denied",
          actor,
          release
            ? "the release changed after the agent asked"
            : "the comments changed after the agent asked",
        );
        throw apiError(
          409,
          "state_changed",
          release
            ? "The release changed after the agent asked (its items or their versions); the request was closed. Look at it again."
            : "These comments changed after the agent asked; the request was closed. Look at them again.",
        );
      }
    }
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
    // A denied release request leaves the release a draft (§5.2: awaiting_approval → draft).
    if (decided && decision === "deny" && existing.releaseId && existing.siteId) {
      const deps = c.get("schedules");
      const rec = schedulesAvailable(deps)
        ? await deps.store.getReleaseRecord(existing.siteId, existing.releaseId)
        : undefined;
      if (deps && rec?.release.state === "awaiting_approval" && rec.requestId === id)
        await deps.store
          .transitionRelease(existing.siteId, existing.releaseId, {
            expectedRev: rec.release.rev,
            to: "draft",
            requestId: null,
          })
          .catch(() => undefined);
    }
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
    if (carry && carryCtx && decided) {
      const input = (existing.input ?? {}) as Record<string, unknown>;
      const audited = carry.auditArgs ? carry.auditArgs(input) : input;
      let result: unknown;
      try {
        result = await carry.handler(input, carryCtx);
      } catch (raw) {
        const e = toToolError(raw);
        const message = e instanceof Error ? e.message : String(e);
        decided = (await store?.complete(id)) ?? decided;
        await c.get("audit")?.record({
          at: new Date().toISOString(),
          actor,
          siteId: existing.siteId,
          tool: existing.tool,
          decision: "allow",
          outcome: "error",
          reason: `carrying out request ${id} failed: ${message}`,
          input: audited,
        });
        return c.json({ error: "carry_out_failed", message, approval: decided }, 409);
      }
      decided = (await store?.complete(id)) ?? decided;
      await c.get("audit")?.record({
        at: new Date().toISOString(),
        actor,
        siteId: existing.siteId,
        tool: existing.tool,
        decision: "allow",
        outcome: "ok",
        reason: `carried out request ${id} from ${existing.actor.name ?? existing.actor.id}`,
        input: { ...audited, requestId: id },
      });
      return c.json({ ...decided, result });
    }
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
