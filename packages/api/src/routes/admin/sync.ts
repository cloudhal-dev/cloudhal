/** `cloudhal push` / `pull`: site bundles, domains and media bytes. */

import {
  exportSite,
  InvariantError,
  importSite,
  isHostname,
  mediaBlobKey,
  normalizeHostname,
  type SiteBundle,
  SyncConflictError,
  withPrimaryDomain,
} from "@cloudhal/core-ts";
import { ReleaseService, releaseSummary } from "@cloudhal/core-ts/releases";
import { BlobIntegrityError, readAllBytes } from "@cloudhal/storage";
import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { badRequest } from "../../errors.ts";
import { param } from "../../params.ts";
import type { AdminDeps } from "./shared.ts";
import { OPERATOR_ACTOR } from "./shared.ts";

/** One media PUT: the Workers request-body limit on Free and Pro (RFC-0004 answer 6). */
const MAX_MEDIA_PUT = 100 * 1024 * 1024;

/** Bundle export/import, primary domain, media blobs. */
export function syncAdminRoutes(deps: AdminDeps): Hono<Env> {
  const { storage } = deps;
  return new Hono<Env>()
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
      // RFC-0008 §16: a replaced graph would invalidate open releases' pins.
      const store = c.get("store");
      if (await store.getSite(bundle.siteId)) {
        const releases = new ReleaseService({ graph: store, sql: storage.sql });
        const open = await releases.openReleases(bundle.siteId);
        if (open.length > 0) {
          if (c.req.query("cancelSchedules") !== "1")
            return c.json(
              {
                error: "schedules_pending",
                message: `the site has ${open.length} open release(s); cancel them first or push with --cancel-schedules`,
                details: { releases: open.map(releaseSummary) },
              },
              409,
            );
          if (open.some((r) => r.state === "running"))
            return c.json(
              {
                error: "schedules_running",
                message: "a release is being published right now; push again in a minute",
              },
              409,
            );
          for (const r of open)
            await releases.cancel(bundle.siteId, r.id, {
              expectedRev: r.rev,
              by: OPERATOR_ACTOR,
            });
        }
      }
      try {
        const before = (await store.getSite(bundle.siteId))?.publishedSnapshotId;
        const result = await importSite(storage, bundle, {
          mode,
          gates: { enforced: (siteId) => store.gatesEnforced(siteId) },
        });
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
        // RFC-0008: refused gates keep their code (409 gates_unsupported, 400 invalid_availability).
        if (
          e instanceof InvariantError &&
          (e.code === "gates_unsupported" || e.code === "invalid_availability")
        )
          throw e;
        if (e instanceof Error) throw badRequest(e.message);
        throw e;
      }
    });
}
