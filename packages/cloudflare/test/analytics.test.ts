/**
 * The admin Worker's analytics (RFC-0006 rollout step 6): `features.analytics` from bindings and
 * vars, and the hourly `scheduled` handler (salts, one site-day rolled up from WAE, never a crash
 * without the binding). D1 is Miniflare's; the Analytics SQL binding is a recording fake.
 */
import { getOrCreateSalt, putAnalyticsSettings } from "@cloudhal/analytics/sql";
import { clearWaeCache } from "@cloudhal/analytics/wae";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AdminEnv, adminAnalytics, createAdminWorker } from "../src/admin-worker.ts";

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;
const NOW = Date.parse("2026-10-09T05:17:00Z");

class FakeSql {
  readonly queries: string[] = [];
  async query<T extends Record<string, unknown>>(request: { query: string }) {
    this.queries.push(request.query);
    return { data: [] as T[], rows: 0, statistics: { elapsed_ms: 0, rows_read: 0, bytes_read: 0 } };
  }
}

let d1: Awaited<ReturnType<typeof createMiniflareD1>>;
let sql: D1Driver;
let siteId: string;

beforeAll(async () => {
  d1 = await createMiniflareD1();
});

afterAll(async () => {
  await d1.dispose();
});

beforeEach(async () => {
  clearWaeCache();
  sql = new D1Driver(d1.db);
  await dropAllTables(sql);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  siteId = (await seedStarterSite(store, { name: "Analytics", slug: "analytics" })).id;
});

const baseEnv = (extra: Partial<AdminEnv> = {}): AdminEnv =>
  ({
    DB: d1.db,
    BLOBS: {} as R2Bucket,
    BETTER_AUTH_SECRET: "x".repeat(32),
    MCP_STATE_KEY: "y".repeat(32),
    ...extra,
  }) as AdminEnv;

describe("admin Worker analytics", () => {
  it("reports what the deployment can do from its bindings and vars", () => {
    const off = adminAnalytics(baseEnv(), sql).feature();
    expect(off).toMatchObject({ enabled: false, store: "none", reader: "none", budget: null });

    // Recorded but not readable: the Analytics SQL binding is missing (A1, "can't read yet").
    const blind = adminAnalytics(
      baseEnv({ CLOUDHAL_ANALYTICS_DATASET: "newsroom_events" }),
      sql,
    ).feature();
    expect(blind).toMatchObject({ enabled: true, store: "wae", reader: "none", budget: 8000 });

    const full = adminAnalytics(
      baseEnv({
        CLOUDHAL_ANALYTICS_DATASET: "newsroom_events",
        CLOUDHAL_ANALYTICS_BUDGET: "1200",
        CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify({ enabled: true, vitalsOneIn: 10 }),
        CLOUDHAL_ANALYTICS_CRON: "off",
        ANALYTICS_SQL: new FakeSql() as unknown as AnalyticsSQLBinding,
      }),
      sql,
    ).feature();
    expect(full).toMatchObject({
      enabled: true,
      store: "wae",
      reader: "binding",
      budget: 1200,
      rollups: "on-read",
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 10 },
    });

    // A dataset name outside ^[a-z0-9_]+$ is never compiled into SQL: analytics stay off.
    const bad = adminAnalytics(baseEnv({ CLOUDHAL_ANALYTICS_DATASET: 'x"; DROP' }), sql).feature();
    expect(bad.store).toBe("none");
  });

  it("scheduled: deletes old salts and rolls up one finished site-day from WAE", async () => {
    await getOrCreateSalt(sql, "2026-10-08");
    await getOrCreateSalt(sql, "2026-10-09");
    const binding = new FakeSql();
    const lines: string[] = [];
    const worker = createAdminWorker({ log: (l) => lines.push(l) });
    const env = baseEnv({
      CLOUDHAL_ANALYTICS_DATASET: "newsroom_events",
      CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify({ enabled: true }),
      ANALYTICS_SQL: binding as unknown as AnalyticsSQLBinding,
    });
    await worker.scheduled(
      { scheduledTime: NOW, cron: "17 * * * *" } as ScheduledController,
      env,
      ctx,
    );

    const salts = await sql.all<{ day: string }>("SELECT day FROM analytics_salts");
    expect(salts.map((s) => s.day)).toEqual(["2026-10-09"]);
    const runs = await sql.all<{ site_id: string; day: string; state: string; source: string }>(
      "SELECT site_id, day, state, source FROM analytics_rollup_runs",
    );
    // the oldest missing day of the 7-day lookback, one per run
    expect(runs).toEqual([{ site_id: siteId, day: "2026-10-02", state: "done", source: "wae" }]);
    expect(binding.queries.length).toBeGreaterThan(5);
    for (const q of binding.queries) {
      expect(q).toContain(`index1 = '${siteId}'`);
      expect(q).toContain('events.analyticsEngine."newsroom_events"');
    }
    // the cron's reads are exempt from the budget
    expect(await sql.all("SELECT * FROM analytics_query_budget")).toEqual([]);
    expect(lines.at(-1)).toMatch(/analytics rollup \(binding\): 1 site-day\(s\) done, 6 pending/);
  });

  it("scheduled: sites whose analytics are off are skipped", async () => {
    await putAnalyticsSettings(sql, {
      siteId,
      rev: 0,
      patch: { enabled: false },
      actorId: "user_admin000001",
      now: new Date(NOW),
    });
    const binding = new FakeSql();
    const worker = createAdminWorker({ log: () => {} });
    await worker.scheduled(
      { scheduledTime: NOW, cron: "17 * * * *" } as ScheduledController,
      baseEnv({
        CLOUDHAL_ANALYTICS_DATASET: "newsroom_events",
        CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify({ enabled: true }),
        ANALYTICS_SQL: binding as unknown as AnalyticsSQLBinding,
      }),
      ctx,
    );
    expect(binding.queries).toEqual([]);
    expect(await sql.all("SELECT * FROM analytics_rollup_runs")).toEqual([]);
  });

  it("scheduled: without the binding (or without analytics) only salts are handled, never a crash", async () => {
    await getOrCreateSalt(sql, "2026-10-01");
    const lines: string[] = [];
    const worker = createAdminWorker({ log: (l) => lines.push(l) });
    await worker.scheduled(
      { scheduledTime: NOW, cron: "17 * * * *" } as ScheduledController,
      baseEnv({ CLOUDHAL_ANALYTICS_DATASET: "newsroom_events" }),
      ctx,
    );
    expect(await sql.all("SELECT * FROM analytics_salts")).toEqual([]);
    expect(await sql.all("SELECT * FROM analytics_rollup_runs")).toEqual([]);
    expect(lines.at(-1)).toMatch(/analytics rollup \(none\): 0 site-day\(s\) done/);
    await worker.scheduled(
      { scheduledTime: NOW, cron: "17 * * * *" } as ScheduledController,
      baseEnv(),
      ctx,
    );
  });

  it("a settings change purges the site's whole cache through the SITE binding", async () => {
    const calls: { url: string; auth: string | null; body: unknown }[] = [];
    const env = baseEnv({
      CLOUDHAL_ANALYTICS_DATASET: "newsroom_events",
      CLOUDHAL_PURGE_TOKEN: "p".repeat(32),
      SITE: {
        fetch: async (url: string, init: RequestInit) => {
          calls.push({
            url,
            auth: new Headers(init.headers).get("authorization"),
            body: init.body ?? null,
          });
          return new Response("ok");
        },
      } as unknown as Fetcher,
    });
    const analytics = adminAnalytics(env, sql, { log: () => {} });
    const r = await analytics.updateSettings({
      siteId,
      rev: 0,
      patch: { vitalsOneIn: 20 },
      actorId: "user_admin000001",
    });
    expect(r.purged).toBe(true);
    expect(calls).toEqual([
      {
        url: "https://site.internal/__cloudhal/purge",
        auth: `Bearer ${"p".repeat(32)}`,
        body: null,
      },
    ]);
  });
});
