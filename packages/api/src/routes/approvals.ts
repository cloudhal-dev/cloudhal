/**
 * `/api/sites/:siteId/approvals` — agents' publish / rollback / delete requests waiting for a
 * person (ADR-0014). People only (agents are refused on /api/sites/**); decisions are audited.
 *
 * - `GET  /?status=pending|approved|denied|consumed|expired`
 * - `POST /:approvalId/approve` · `POST /:approvalId/deny`
 *   409 `conflict`: no longer pending · 409 `elevation_conflict`: still pending, but the agent's key
 *   cannot take the elevation (gone, not yours, or its own mode reached it)
 *
 * An agent's `request_elevation` (ADR-0016) is carried out here when a person approves it: the
 * elevation is granted on the agent's key with the approver's own rights (`{minutes?}` may shorten
 * it), and the request is marked used.
 */
import {
  type AgentMode,
  type Approval,
  type ApprovalStatus,
  elevationProblem,
  isAgentMode,
} from "@cloudhal/agent-runtime";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound, unauthorized } from "../errors.ts";
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
    return c.json({
      items: status ? (items ?? []).filter((a) => a.status === status) : (items ?? []),
    });
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
    const elevation =
      decision === "approve" && existing.tool === REQUEST_ELEVATION && existing.status === "pending"
        ? await checkElevation(c, existing)
        : undefined;
    if (elevation instanceof Response) return elevation;
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
