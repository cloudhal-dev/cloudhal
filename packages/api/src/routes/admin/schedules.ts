/** Scheduler health, run-due and release summaries (RFC-0008 §8.7, §13). */

import {
  gatedNodeCount,
  ReleaseService,
  releaseSummary,
  SCHEDULES_ENGINE_LEVEL,
  schedulerHealthReport,
} from "@cloudhal/core-ts/releases";
import { Hono } from "hono";
import type { Env } from "../../context.ts";
import { param } from "../../params.ts";
import type { AdminDeps } from "./shared.ts";
import { NO_STORE } from "./shared.ts";

const RELEASE_STATES = new Set([
  "draft",
  "awaiting_approval",
  "scheduled",
  "running",
  "published",
  "conflict",
  "missed",
  "expired",
  "failed",
  "canceled",
]);

/** Status, run-due and releases. */
export function schedulesAdminRoutes(deps: AdminDeps): Hono<Env> {
  const { storage } = deps;
  return new Hono<Env>()
    .get("/schedules/status", async (c) => {
      const store = c.get("store");
      const now = c.get("now")();
      const releases = new ReleaseService({ graph: store, sql: storage.sql });
      const sites = [];
      for (const site of await store.listSites())
        sites.push({
          siteId: site.id,
          name: site.name,
          ...(site.timeZone ? { timeZone: site.timeZone } : {}),
          openReleases: (await releases.openReleases(site.id)).map(releaseSummary),
          gatedNodes: await gatedNodeCount(storage.sql, site.id, now),
        });
      return c.json(
        {
          engine: { schedulesLevel: SCHEDULES_ENGINE_LEVEL },
          scheduler: await schedulerHealthReport(storage.sql, {
            now,
            mode: c.get("scheduler")?.mode ?? "request",
          }),
          sites,
        },
        200,
        NO_STORE,
      );
    })
    .post("/schedules/run-due", async (c) => {
      const run = c.get("scheduler")?.runDue;
      if (!run)
        return c.json(
          { error: "not_found", message: "this server has no scheduler to run" },
          404,
          NO_STORE,
        );
      return c.json(await run("manual"), 200, NO_STORE);
    })
    .get("/sites/:siteId/schedules/releases", async (c) => {
      const siteId = param(c, "siteId");
      if (!(await c.get("store").getSite(siteId)))
        return c.json({ error: "not_found", message: "site not found" }, 404, NO_STORE);
      const state = c.req.query("state");
      const states = state ? state.split(",").filter((s) => RELEASE_STATES.has(s)) : [];
      const limit = Number(c.req.query("limit") ?? 50);
      const list = await new ReleaseService({
        graph: c.get("store"),
        sql: storage.sql,
      }).list(siteId, {
        ...(states.length ? { states: states as never } : {}),
        limit: Number.isInteger(limit) ? limit : 50,
      });
      return c.json({ releases: list.map(releaseSummary) }, 200, NO_STORE);
    });
}
