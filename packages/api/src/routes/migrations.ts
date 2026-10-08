import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest } from "../errors.ts";
import { actorOf, requireSite } from "../governance.ts";

/**
 * `/api/sites/:siteId/migrations` (RFC-0002, Compatibility & migration). `tags-to-terms` takes its
 * own `before` and `after` snapshots (the before snapshot's id is the migration id); a dry run
 * writes nothing.
 */
export const migrations: Hono<Env> = new Hono<Env>()
  .post("/tags-to-terms", async (c) => {
    const site = await requireSite(c);
    const b = ((await c.req.json().catch(() => ({}))) ?? {}) as { dryRun?: unknown };
    if (b.dryRun !== undefined && typeof b.dryRun !== "boolean")
      throw badRequest("dryRun must be a boolean");
    return c.json(
      await c.get("store").migrateTagsToTerms(site.id, actorOf(c), { dryRun: b.dryRun === true }),
    );
  })
  .post("/tags-to-terms/revert", async (c) => {
    const site = await requireSite(c);
    const b = ((await c.req.json().catch(() => ({}))) ?? {}) as { migrationId?: unknown };
    if (typeof b.migrationId !== "string" || !b.migrationId)
      throw badRequest("migrationId is required");
    try {
      return c.json(
        await c.get("store").revertTagsToTerms(site.id, b.migrationId, { actor: actorOf(c) }),
      );
    } catch (e) {
      // An interrupted run must be completed before it can be reverted.
      if (e instanceof Error && /did not finish/.test(e.message))
        return c.json({ error: "migration_incomplete", message: e.message }, 409);
      throw e;
    }
  });
