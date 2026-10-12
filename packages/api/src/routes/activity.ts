/**
 * The audit trail, newest first:
 * - `/api/sites/:siteId/activity` — every tool call and policy decision on a site. With
 *   `audit:read` (Editor+) all rows; otherwise only the caller's own rows and their keys' rows
 *   (RFC-0005 §10.1).
 * - `/api/activity` — deployment rows (membership, invites, keys; `site_id` NULL), `audit:read`.
 */
import { type AuditLog, holds } from "@cloudhal/agent-runtime";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest, notFound } from "../errors.ts";
import { param } from "../params.ts";

function paging(c: Context<Env>) {
  const limit = Number(c.req.query("limit") ?? 50);
  const before = c.req.query("before");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw badRequest("limit must be 1–200");
  if (before !== undefined && !/^\d+$/.test(before)) throw badRequest("before must be an id");
  return { limit, before: before === undefined ? undefined : Number(before) };
}

function page<T extends { id: number }>(rows: T[], limit: number) {
  return { items: rows, nextBefore: rows.length === limit ? (rows.at(-1)?.id ?? null) : null };
}

/** The actor ids a person without `audit:read` may see: themselves and their keys' agents. */
async function ownActorIds(c: Context<Env>): Promise<string[] | undefined> {
  const principal = c.get("principal");
  if (!principal || holds(principal.scopes, "audit:read")) return undefined;
  const staff = c.get("staff");
  const agents =
    staff && principal.person ? await staff.store.agentsOf(principal.person.userId) : [];
  return [principal.actor.id, ...agents];
}

function auditOf(c: Context<Env>): AuditLog {
  const audit = c.get("audit");
  if (!audit) throw notFound("activity is not enabled on this server");
  return audit;
}

export const activity: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const audit = auditOf(c);
  const siteId = param(c, "siteId");
  if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
  const { limit, before } = paging(c);
  const own = await ownActorIds(c);
  const actorId = c.req.query("actorId");
  const rows = await audit.list({
    siteId,
    actorId,
    ...(own ? { actorIds: own } : {}),
    before,
    limit,
  });
  return c.json(page(rows, limit));
});

export const deploymentActivity: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const audit = auditOf(c);
  const { limit, before } = paging(c);
  const rows = await audit.list({
    deployment: true,
    actorId: c.req.query("actorId"),
    before,
    limit,
  });
  return c.json(page(rows, limit));
});
