/** `/api/sites/:siteId/activity` — the audit trail: every tool call and policy decision, newest first. */
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

export const activity: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const audit = c.get("audit");
  if (!audit) throw notFound("activity is not enabled on this server");
  const siteId = param(c, "siteId");
  if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
  const limit = Number(c.req.query("limit") ?? 50);
  const before = c.req.query("before");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw badRequest("limit must be 1–200");
  if (before !== undefined && !/^\d+$/.test(before)) throw badRequest("before must be an id");
  const rows = await audit.list({
    siteId,
    actorId: c.req.query("actorId"),
    before: before === undefined ? undefined : Number(before),
    limit,
  });
  return c.json({
    items: rows,
    nextBefore: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
  });
});
