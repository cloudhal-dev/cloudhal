/**
 * Operator endpoints used by `cloudhal push` / `cloudhal pull`, authenticated with the deployment
 * token (`Authorization: Bearer <CLOUDHAL_DEPLOY_TOKEN>`), not a user session: they exist before
 * any user does and move whole sites.
 *
 * - `GET  /api/admin/sites/:siteId/bundle` → SiteBundle (export)
 * - `PUT  /api/admin/sites/:siteId/bundle?mode=bootstrap|replace` ← SiteBundle (import)
 */
import {
  exportSite,
  importSite,
  type SiteBundle,
  type StoragePair,
  SyncConflictError,
} from "@cloudhal/core-ts";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { badRequest } from "../errors.ts";
import { param } from "../params.ts";

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}

export function adminRoutes(deployToken: string, storage: StoragePair): Hono<Env> {
  return new Hono<Env>()
    .use("*", async (c, next) => {
      const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!given || !timingSafeEqual(given, deployToken))
        return c.json({ error: "unauthorized", message: "deployment token required" }, 401);
      await next();
    })
    .get("/sites/:siteId/bundle", async (c) => {
      const siteId = param(c, "siteId");
      if (!(await c.get("store").getSite(siteId)))
        return c.json({ error: "not_found", message: "site not found" }, 404);
      return c.json(await exportSite(storage, siteId));
    })
    .put("/sites/:siteId/bundle", async (c) => {
      const mode = c.req.query("mode") ?? "bootstrap";
      if (mode !== "bootstrap" && mode !== "replace")
        throw badRequest("mode must be bootstrap or replace");
      const bundle = (await c.req.json()) as SiteBundle;
      if (bundle.siteId !== param(c, "siteId"))
        throw badRequest("bundle.siteId must match the URL");
      try {
        const result = await importSite(storage, bundle, { mode });
        return c.json(result);
      } catch (e) {
        if (e instanceof SyncConflictError)
          return c.json(
            { error: "conflict", message: e.message, details: { differing: e.differing } },
            409,
          );
        if (e instanceof Error) throw badRequest(e.message);
        throw e;
      }
    });
}
