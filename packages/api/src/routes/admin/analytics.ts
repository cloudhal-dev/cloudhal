/** Analytics rollup backfill, status and CSV export (RFC-0006 §7.5). */

import { AnalyticsQueryError } from "@cloudhal/analytics";
import { rangeFromParams } from "@cloudhal/analytics/service";
import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { param } from "../../params.ts";

/** Site-days one backfill call rolls up: about 18 WAE queries each, bounded per Worker request. */
export const ROLLUP_MAX_SITE_DAYS_PER_CALL = 3;

/** Rollup, status and export. */
export function analyticsAdminRoutes(): Hono<Env> {
  return (
    new Hono<Env>()
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
  );
}
