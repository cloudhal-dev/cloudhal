/**
 * Operator endpoints used by `cloudhal push` / `cloudhal pull`, authenticated with the deployment
 * token (`Authorization: Bearer <CLOUDHAL_DEPLOY_TOKEN>`), not a user session: they exist before
 * any user does and move whole sites.
 *
 * - `GET  /api/admin/sites/:siteId/bundle` → SiteBundle (export)
 * - `PUT  /api/admin/sites/:siteId/bundle?mode=bootstrap|replace` ← SiteBundle (import)
 * - `PUT  /api/admin/sites/:siteId/domains` ← {primary} — the custom domain `cloudhal deploy` just
 *   routed becomes the site's primary hostname (preview links, canonical URLs); others stay secondary
 */
import {
  exportSite,
  importSite,
  isHostname,
  normalizeHostname,
  type SiteBundle,
  type StoragePair,
  SyncConflictError,
  withPrimaryDomain,
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
    .put("/sites/:siteId/domains", async (c) => {
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { primary?: unknown };
      if (typeof body.primary !== "string") throw badRequest("primary is required");
      const hostname = normalizeHostname(body.primary);
      if (!isHostname(hostname)) throw badRequest(`"${body.primary}" is not a hostname`);
      const store = c.get("store");
      const site = await store.getSite(param(c, "siteId"));
      if (!site) return c.json({ error: "not_found", message: "site not found" }, 404);
      const current = site.domains.find((d) => d.primary)?.hostname;
      if (current === hostname) return c.json({ domains: site.domains, changed: false });
      const updated = await store.updateSite({
        ...site,
        domains: withPrimaryDomain(site.domains, hostname),
      });
      return c.json({ domains: updated.domains, changed: true });
    })
    .put("/sites/:siteId/bundle", async (c) => {
      const mode = c.req.query("mode") ?? "bootstrap";
      if (mode !== "bootstrap" && mode !== "replace")
        throw badRequest("mode must be bootstrap or replace");
      const bundle = (await c.req.json()) as SiteBundle;
      if (bundle.siteId !== param(c, "siteId"))
        throw badRequest("bundle.siteId must match the URL");
      try {
        const store = c.get("store");
        const before = (await store.getSite(bundle.siteId))?.publishedSnapshotId;
        const result = await importSite(storage, bundle, { mode });
        const after = await store.getSite(bundle.siteId);
        // A replaced site may point production elsewhere: purge the edge cache like a publish.
        if (after && after.publishedSnapshotId !== before) await store.notifyPublished(after);
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
