/**
 * Operator endpoints used by `cloudhal push` / `cloudhal pull`, authenticated with the deployment
 * token (`Authorization: Bearer <CLOUDHAL_DEPLOY_TOKEN>`), not a user session: they exist before
 * any user does and move whole sites.
 *
 * - `GET  /api/admin/sites/:siteId/bundle` → SiteBundle (export)
 * - `PUT  /api/admin/sites/:siteId/bundle?mode=bootstrap|replace` ← SiteBundle (import)
 * - `PUT  /api/admin/sites/:siteId/domains` ← {primary} — the custom domain `cloudhal deploy` just
 *   routed becomes the site's primary hostname (used for preview links); others stay secondary
 * - `POST /api/admin/owner` ← {email} → {from, to, name, email} — `cloudhal owner transfer`: the
 *   member with this email becomes the Owner (404 `not_found` when no such member)
 * - `GET|HEAD /api/admin/sites/:siteId/media/:sha256` → the content's bytes (RFC-0004 §4.7)
 * - `PUT  /api/admin/sites/:siteId/media/:sha256` ← raw bytes, verified against the SHA-256 before
 *   anything is stored; bundles refuse to import until the media they list are here
 * - `POST /api/admin/sites/:siteId/analytics/rollup` ← {days?, maxSiteDays?} → the rollup report:
 *   `cloudhal analytics rollup --remote` backfills missing days from WAE (RFC-0006 §7.5), a few
 *   site-days per call; the CLI repeats while `pending > 0`
 * - `GET  /api/admin/sites/:siteId/analytics/status` and `…/export?from&to` (CSV of the rollups):
 *   `cloudhal analytics status|export --remote`
 */

import { AnalyticsQueryError } from "@cloudhal/analytics";
import { rangeFromParams } from "@cloudhal/analytics/service";
import {
  exportSite,
  importSite,
  isHostname,
  mediaBlobKey,
  normalizeHostname,
  type SiteBundle,
  type StoragePair,
  SyncConflictError,
  withPrimaryDomain,
} from "@cloudhal/core-ts";
import { BlobIntegrityError, readAllBytes } from "@cloudhal/storage";
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

/** Site-days one backfill call rolls up: about 18 WAE queries each, bounded per Worker request. */
export const ROLLUP_MAX_SITE_DAYS_PER_CALL = 3;

/** One media PUT: the Workers request-body limit on Free and Pro (RFC-0004 answer 6). */
const MAX_MEDIA_PUT = 100 * 1024 * 1024;

/** The operator, as audit rows show them. */
export const OPERATOR_ACTOR = { kind: "system" as const, id: "sys_operator01", name: "Operator" };

export function adminRoutes(deployToken: string, storage: StoragePair): Hono<Env> {
  return (
    new Hono<Env>()
      .use("*", async (c, next) => {
        const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!given || !timingSafeEqual(given, deployToken))
          return c.json({ error: "unauthorized", message: "deployment token required" }, 401);
        await next();
      })
      // Owner lockout recovery (RFC-0005 §3, open question 7): the operator, already root for site
      // data, makes an existing member the Owner; the current Owner becomes an Administrator.
      .post("/owner", async (c) => {
        const staff = c.get("staff");
        if (!staff)
          return c.json(
            { error: "not_found", message: "members are not enabled on this server" },
            404,
          );
        const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { email?: unknown };
        if (typeof body.email !== "string" || !body.email.trim())
          throw badRequest("email is required");
        const user = await staff.userByEmail(body.email.trim());
        const member = user ? await staff.store.member(user.id) : undefined;
        if (!user || !member)
          return c.json(
            { error: "not_found", message: `no member with the email ${body.email.trim()}` },
            404,
          );
        const moved = await staff.store.forceOwner(user.id);
        if (!moved)
          return c.json(
            { error: "conflict", message: "the members changed meanwhile; try again" },
            409,
          );
        await c.get("audit")?.record({
          at: new Date().toISOString(),
          actor: OPERATOR_ACTOR,
          tool: "member.transfer-ownership",
          decision: "allow",
          outcome: "ok",
          input: { from: moved.from, to: user.id, via: "deploy-token" },
          reason: `operator made ${member.name} the Owner`,
        });
        return c.json({ from: moved.from, to: user.id, name: member.name, email: user.email });
      })
      // RFC-0006 §7.5 backfill and the operator's view of analytics (deployment token).
      .post("/sites/:siteId/analytics/rollup", async (c) => {
        const analytics = c.get("analytics");
        if (!analytics)
          return c.json({ error: "not_found", message: "analytics are not enabled" }, 404);
        const siteId = param(c, "siteId");
        if (!(await c.get("store").getSite(siteId)))
          return c.json({ error: "not_found", message: "site not found" }, 404);
        const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
          days?: unknown;
          maxSiteDays?: unknown;
        };
        const days = body.days ?? 7;
        if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 92)
          throw new AnalyticsQueryError("days must be an integer from 1 to 92");
        const max = body.maxSiteDays ?? 1;
        if (
          !Number.isInteger(max) ||
          (max as number) < 1 ||
          (max as number) > ROLLUP_MAX_SITE_DAYS_PER_CALL
        )
          throw new AnalyticsQueryError(
            `maxSiteDays must be an integer from 1 to ${ROLLUP_MAX_SITE_DAYS_PER_CALL}`,
          );
        const report = await analytics.rollup({
          siteIds: [siteId],
          lookbackDays: days as number,
          maxSiteDays: max as number,
        });
        return c.json({ ...report, reader: analytics.feature().reader });
      })
      .get("/sites/:siteId/analytics/status", async (c) => {
        const analytics = c.get("analytics");
        if (!analytics)
          return c.json({ error: "not_found", message: "analytics are not enabled" }, 404);
        const siteId = param(c, "siteId");
        if (!(await c.get("store").getSite(siteId)))
          return c.json({ error: "not_found", message: "site not found" }, 404);
        return c.json(await analytics.status(siteId));
      })
      .get("/sites/:siteId/analytics/export", async (c) => {
        const analytics = c.get("analytics");
        if (!analytics)
          return c.json({ error: "not_found", message: "analytics are not enabled" }, 404);
        const siteId = param(c, "siteId");
        if (!(await c.get("store").getSite(siteId)))
          return c.json({ error: "not_found", message: "site not found" }, 404);
        const range = rangeFromParams(
          { range: c.req.query("range"), from: c.req.query("from"), to: c.req.query("to") },
          analytics.now(),
        );
        return new Response(await analytics.exportCsv(siteId, range), {
          headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
        });
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
      .get("/sites/:siteId/media/:sha256", async (c) => {
        const sha256 = param(c, "sha256");
        if (!/^[0-9a-f]{64}$/.test(sha256)) throw badRequest("sha256 must be 64 lower-case hex");
        const key = mediaBlobKey(param(c, "siteId"), sha256);
        const meta = await storage.blobs.head(key);
        if (!meta) return c.json({ error: "not_found", message: "no such media" }, 404);
        const headers = {
          "content-type": "application/octet-stream",
          "content-length": String(meta.size),
          "cache-control": "no-store",
        };
        if (c.req.method === "HEAD") return new Response(null, { status: 200, headers });
        const stream = storage.blobs.getStream ? await storage.blobs.getStream(key) : null;
        const body = stream ? stream.body : await storage.blobs.get(key);
        if (!body) return c.json({ error: "not_found", message: "no such media" }, 404);
        return new Response(body, { status: 200, headers });
      })
      .put("/sites/:siteId/media/:sha256", async (c) => {
        const sha256 = param(c, "sha256");
        if (!/^[0-9a-f]{64}$/.test(sha256)) throw badRequest("sha256 must be 64 lower-case hex");
        const key = mediaBlobKey(param(c, "siteId"), sha256);
        const size = Number(c.req.header("content-length"));
        if (!Number.isInteger(size) || size < 0 || size > MAX_MEDIA_PUT)
          throw badRequest(`content-length must be given and at most ${MAX_MEDIA_PUT} bytes`);
        if (await storage.blobs.head(key)) return c.json({ stored: false, existing: true });
        const body = c.req.raw.body ?? new Response(new Uint8Array(0)).body;
        try {
          if (storage.blobs.putStream && body)
            await storage.blobs.putStream(key, body, { size, sha256 });
          else {
            const bytes = body ? await readAllBytes(body, size) : new Uint8Array(0);
            await storage.blobs.put(key, bytes, { sha256 });
          }
        } catch (e) {
          if (e instanceof BlobIntegrityError) throw badRequest(e.message);
          throw e;
        }
        return c.json({ stored: true, existing: false }, 201);
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
          if (after && after.publishedSnapshotId !== before)
            await store.notifyPublished(after, before);
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
      })
  );
}
