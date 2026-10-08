/**
 * `/api/sites/:siteId/approvals` — agents' publish / rollback / delete requests waiting for a
 * person (ADR-0014). People only (agents are refused on /api/sites/**); decisions are audited.
 *
 * - `GET  /?status=pending|approved|denied|consumed|expired`
 * - `POST /:approvalId/approve` · `POST /:approvalId/deny`
 */
import type { ApprovalStatus } from "@cloudhal/agent-runtime";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound, unauthorized } from "../errors.ts";
import { param } from "../params.ts";

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
    const decided = await store?.decide(id, decision === "approve" ? "approved" : "denied", actor);
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
    return c.json(decided);
  });
