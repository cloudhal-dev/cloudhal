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
 * - `GET  /api/admin/schedules/status` → the scheduler's health, the schedules level, and per site
 *   the open releases and gated nodes (RFC-0008 §8.7, §13): `cloudhal schedules status --remote`
 *   and `cloudhal deploy`'s downgrade guard
 * - `GET  /api/admin/sites/:siteId/schedules/releases?state&limit` → release summaries
 *   (`cloudhal schedules list --remote`)
 * - `POST /api/admin/schedules/run-due` → one tick now, the operator's (`cloudhal schedules
 *   run-due --remote`)
 * - `POST /api/admin/sites/:siteId/ai/build-eval` ← {models?, briefs?} → NDJSON: one line per
 *   run, then the summary (RFC-0020 open question 7, `cloudhal ai build-eval --remote`); in memory
 * - `POST /api/admin/sites/:siteId/search/reindex` → rebuilds the search index from the live
 *   snapshot (RFC-0019 §3, `cloudhal search reindex --remote`)
 * - `GET  /api/admin/sites/:siteId/media-placeholders?all=1` → images without a placeholder, and
 *   `PUT …/media-placeholders/:assetId` ← {rev, lqip?, color?}: `cloudhal media placeholders
 *   --remote` draws them in a local Chrome (RFC-0028 §5)
 * - `GET|POST /api/admin/sites`, `DELETE /api/admin/sites/:siteId` ← {confirm}: the installation's
 *   sites (RFC-0034 §2–3, `cloudhal site list|create|delete`), see `admin/sites.ts`
 * - The bundle import refuses while the site has open releases (409 `schedules_pending`, their
 *   pins would point into a replaced graph) unless `?cancelSchedules=1` cancels them first
 *   (`cloudhal push --cancel-schedules`).
 */

import type { StoragePair } from "@cloudhal/core-ts";
import type { RenderDeps } from "@cloudhal/mcp-server/tools";
import { Hono } from "hono";
import type { AiTransport } from "../ai/client.ts";
import type { Env } from "../context.ts";
import { aiAdminRoutes } from "./admin/ai.ts";
import { analyticsAdminRoutes } from "./admin/analytics.ts";
import { commentsAdminRoutes } from "./admin/comments.ts";
import { ownerAdminRoutes } from "./admin/owner.ts";
import { schedulesAdminRoutes } from "./admin/schedules.ts";
import { timingSafeEqual } from "./admin/shared.ts";
import { siteOpsAdminRoutes } from "./admin/site-ops.ts";
import { sitesAdminRoutes } from "./admin/sites.ts";
import { syncAdminRoutes } from "./admin/sync.ts";

export { ROLLUP_MAX_SITE_DAYS_PER_CALL } from "./admin/analytics.ts";
export { OPERATOR_ACTOR, timingSafeEqual } from "./admin/shared.ts";

export function adminRoutes(
  deployToken: string,
  storage: StoragePair,
  aiTransport?: AiTransport,
  /** A browser for the eval's design pass (RFC-0021 21c). */
  render?: RenderDeps,
): Hono<Env> {
  const deps = { storage, aiTransport, render };
  return (
    new Hono<Env>()
      .use("*", async (c, next) => {
        const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!given || !timingSafeEqual(given, deployToken))
          return c.json({ error: "unauthorized", message: "deployment token required" }, 401);
        await next();
      })
      // Mounted after the token check, so every area needs the deployment token.
      .route("/", ownerAdminRoutes())
      .route("/", analyticsAdminRoutes())
      .route("/", commentsAdminRoutes())
      .route("/", schedulesAdminRoutes(deps))
      .route("/", aiAdminRoutes(deps))
      .route("/", sitesAdminRoutes(deps))
      .route("/", siteOpsAdminRoutes())
      .route("/", syncAdminRoutes(deps))
  );
}
