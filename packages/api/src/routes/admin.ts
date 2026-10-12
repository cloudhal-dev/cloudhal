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
 * - `GET  /api/admin/sites/:siteId/comments/status` → counts, the daily cap, the purge queue and
 *   budget (RFC-0007 §15.4): `cloudhal comments status --remote`
 * - `GET  /api/admin/sites/:siteId/comments/export?cursor&personal=1` → one page of the JSON-lines
 *   export (the header on the first page), `cloudhal-next-cursor` while more remain; `personal=1`
 *   appends commenter lines with their email (§9.4: the operator may)
 * - `POST /api/admin/sites/:siteId/comments/import` ← JSON lines (≤ 200 per call) → the import
 *   report: idempotent by id and importer origin, entries and parents checked, audited
 */

import { AnalyticsQueryError } from "@cloudhal/analytics";
import { rangeFromParams } from "@cloudhal/analytics/service";
import {
  CommentImportError,
  commentsStatus,
  exportPage,
  IMPORT_MAX_LINES,
  importLines,
} from "@cloudhal/comments/sql";
import {
  exportSite,
  InvariantError,
  importSite,
  isHostname,
  mediaBlobKey,
  normalizeHostname,
  type SiteBundle,
  type StoragePair,
  SyncConflictError,
  withPrimaryDomain,
} from "@cloudhal/core-ts";
import { type CommentsDeps, commentsAvailable } from "@cloudhal/mcp-server/comments";
import { BlobIntegrityError, readAllBytes } from "@cloudhal/storage";
import { type Context, Hono } from "hono";
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

/** One comments import call: at most this many bytes of JSON lines. */
const MAX_COMMENTS_IMPORT = 8 * 1024 * 1024;

/** The deployment's comments and the route's site, or a 404 answer. */
async function commentsSite(
  c: Context<Env>,
): Promise<{ d: CommentsDeps; siteId: string } | Response> {
  const d = c.get("comments");
  if (!commentsAvailable(d))
    return c.json({ error: "not_found", message: "reader comments are not enabled" }, 404);
  const siteId = param(c, "siteId");
  if (!(await c.get("store").getSite(siteId)))
    return c.json({ error: "not_found", message: "site not found" }, 404);
  return { d, siteId };
}

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
      // RFC-0007 §15.4: the operator's comments status, export and import (deployment token).
      .get("/sites/:siteId/comments/status", async (c) => {
        const s = await commentsSite(c);
        if (s instanceof Response) return s;
        return c.json({
          ...(await commentsStatus(s.d.store, s.siteId, c.get("now")())),
          key: Boolean(s.d.keys),
        });
      })
      .get("/sites/:siteId/comments/export", async (c) => {
        const s = await commentsSite(c);
        if (s instanceof Response) return s;
        const personal = c.req.query("personal") === "1";
        if (personal && !s.d.keys)
          return c.json(
            {
              error: "comments_key_missing",
              message: "this deployment has no CLOUDHAL_COMMENTS_KEY, so emails cannot be read",
            },
            503,
          );
        let page: Awaited<ReturnType<typeof exportPage>>;
        try {
          page = await exportPage(s.d.store, s.siteId, {
            cursor: c.req.query("cursor"),
            personal,
            keys: s.d.keys,
            now: c.get("now")(),
          });
        } catch (e) {
          if (e instanceof CommentImportError) throw badRequest(e.message);
          throw e;
        }
        await c.get("audit")?.record({
          at: c.get("now")().toISOString(),
          actor: OPERATOR_ACTOR,
          siteId: s.siteId,
          tool: "comments.export",
          decision: "allow",
          outcome: "ok",
          input: {
            via: "deploy-token",
            personal,
            comments: page.comments,
            commenters: page.commenters,
            ...(c.req.query("cursor") ? { continued: true } : {}),
          },
        });
        return new Response(page.lines.length ? `${page.lines.join("\n")}\n` : "", {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
            ...(page.next ? { "cloudhal-next-cursor": page.next } : {}),
          },
        });
      })
      .post("/sites/:siteId/comments/import", async (c) => {
        const s = await commentsSite(c);
        if (s instanceof Response) return s;
        const size = Number(c.req.header("content-length") ?? "0");
        if (size > MAX_COMMENTS_IMPORT)
          throw badRequest(`at most ${MAX_COMMENTS_IMPORT} bytes per import call`);
        const text = await c.req.text();
        if (text.length > MAX_COMMENTS_IMPORT)
          throw badRequest(`at most ${MAX_COMMENTS_IMPORT} bytes per import call`);
        const lines = text.split("\n").filter((l) => l.trim() !== "");
        if (lines.length > IMPORT_MAX_LINES)
          throw badRequest(`at most ${IMPORT_MAX_LINES} lines per import call`);
        const store = c.get("store");
        let report: Awaited<ReturnType<typeof importLines>>;
        try {
          report = await importLines(s.d.store, s.siteId, lines, {
            keys: s.d.keys,
            now: c.get("now")(),
            entries: async (ids) => {
              const wanted = new Set(ids);
              const found = new Set<string>();
              if (wanted.size === 0) return found;
              for (const e of await store.listContentEntries(s.siteId))
                if (wanted.has(e.id)) found.add(e.id);
              return found;
            },
          });
        } catch (e) {
          if (e instanceof CommentImportError) throw badRequest(e.message);
          throw e;
        }
        if (report.purged.length > 0) s.d.onQueued?.(s.siteId, "normal");
        await c.get("audit")?.record({
          at: c.get("now")().toISOString(),
          actor: OPERATOR_ACTOR,
          siteId: s.siteId,
          tool: "comments.import",
          decision: "allow",
          outcome: "ok",
          input: {
            via: "deploy-token",
            imported: report.imported,
            skipped: report.skipped,
            commenters: report.commenters,
            invalid: report.invalid.length,
          },
        });
        return c.json(report);
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
      })
  );
}
