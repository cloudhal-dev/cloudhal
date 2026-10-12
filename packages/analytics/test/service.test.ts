/** AnalyticsService (RFC-0006 §7.7, §8, §9): feature report, settings rule, rollups, export. */
import { assertValid } from "@cloudhal/core-contracts";
import { migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoEvents } from "../src/demo.ts";
import { AnalyticsQueryError, AnalyticsSettingsConflictError } from "../src/errors.ts";
import { estimatedCacheHitRatio } from "../src/model.ts";
import {
  AnalyticsService,
  dailyRowsCsv,
  parseFilterParam,
  presetRange,
  previousRange,
  rangeFromParams,
} from "../src/service.ts";
import { getOrCreateSalt, SqlAnalytics, SqlQueryBudget } from "../src/sql/index.ts";
import { FIXTURE_EVENTS, FIXTURE_SITE, NODE_A } from "../src/testing.ts";

const now = new Date("2026-10-09T05:17:00Z");
const lines0 = (csv: string) => csv.trimEnd().split("\r\n");

describe("estimated cache-hit ratio", () => {
  it("is 1 − renders ÷ page views, clamped, and only on Cloudflare", () => {
    expect(estimatedCacheHitRatio({ pageviews: 10, renders: 4 })).toBe(0.6);
    expect(estimatedCacheHitRatio({ pageviews: 3, renders: 1 })).toBe(0.667);
    expect(estimatedCacheHitRatio({ pageviews: 2, renders: 5 })).toBe(0);
    expect(estimatedCacheHitRatio({ pageviews: 0, renders: 0 })).toBeNull();
    expect(estimatedCacheHitRatio({ pageviews: 10, renders: null })).toBeNull();
    const sql = {} as SqlDriver;
    expect(
      new AnalyticsService({ sql, store: "wae" }).cacheHitRatio({ pageviews: 10, renders: 4 }),
    ).toBe(0.6);
    expect(
      new AnalyticsService({ sql, store: "sql" }).cacheHitRatio({ pageviews: 10, renders: 4 }),
    ).toBeNull();
  });
});

describe("ranges and filters", () => {
  it("presets cover whole UTC days ending with today", () => {
    expect(presetRange("today", now)).toEqual({ from: "2026-10-09", to: "2026-10-10" });
    expect(presetRange("7d", now)).toEqual({ from: "2026-10-03", to: "2026-10-10" });
    expect(presetRange("12m", now)).toEqual({ from: "2025-10-10", to: "2026-10-10" });
    expect(previousRange({ from: "2026-10-03", to: "2026-10-10" })).toEqual({
      from: "2026-09-26",
      to: "2026-10-03",
    });
    expect(previousRange({ from: "2026-10-09T06:00:00Z", to: "2026-10-09T12:00:00Z" })).toEqual({
      from: "2026-10-09",
      to: "2026-10-09T06:00:00.000Z",
    });
  });

  it("reads range parameters, defaulting to 30 days", () => {
    expect(rangeFromParams({}, now)).toEqual(presetRange("30d", now));
    expect(rangeFromParams({ range: "7d" }, now)).toEqual(presetRange("7d", now));
    expect(rangeFromParams({ from: "2026-09-01", to: "2026-10-01" }, now)).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });
    for (const bad of [
      { range: "1y" },
      { from: "2026-09-01" },
      { range: "7d", from: "2026-09-01", to: "2026-10-01" },
      { from: "2026-10-01", to: "2026-09-01" },
      { from: "2020-01-01", to: "2026-10-01" },
      { from: "yesterday", to: "2026-10-01" },
    ])
      expect(() => rangeFromParams(bad, now), JSON.stringify(bad)).toThrow(AnalyticsQueryError);
  });

  it("parses one filter of ids and enums only", () => {
    expect(parseFilterParam(undefined)).toBeUndefined();
    expect(parseFilterParam(`node:${NODE_A}`)).toEqual({ node: NODE_A });
    expect(parseFilterParam("channel:ai")).toEqual({ channel: "ai" });
    expect(parseFilterParam("country:TR")).toEqual({ country: "TR" });
    expect(parseFilterParam("device:mobile")).toEqual({ device: "mobile" });
    for (const bad of ["node", "node:../x", "channel:tv", "country:tr", "device:fridge", "path:/x"])
      expect(() => parseFilterParam(bad), bad).toThrow(AnalyticsQueryError);
  });
});

describe("AnalyticsService", () => {
  let sql: SqlDriver;
  let raw: SqlAnalytics;
  let purged: string[];
  let service: AnalyticsService;

  beforeEach(async () => {
    sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    raw = new SqlAnalytics(sql);
    await raw.insertMany(FIXTURE_EVENTS);
    purged = [];
    service = new AnalyticsService({
      sql,
      store: "sql",
      live: raw,
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
      now: () => now,
      purgeSite: async (siteId) => {
        purged.push(siteId);
      },
    });
  });

  afterEach(async () => {
    await sql.close();
  });

  it("reports the feature: store, reader and the can't-read-yet state", () => {
    expect(service.feature()).toMatchObject({
      enabled: true,
      store: "sql",
      reader: "sql",
      liveDays: 92,
      budget: null,
      rollups: "scheduled",
    });
    const wae = new AnalyticsService({ sql, store: "wae", budget: 8000 });
    expect(wae.feature()).toMatchObject({
      enabled: true,
      store: "wae",
      reader: "none",
      budget: 8000,
    });
    const off = new AnalyticsService({ sql, store: "none", live: raw });
    expect(off.feature()).toMatchObject({ enabled: false, store: "none", reader: "none" });
  });

  it("reads through the composite reader", async () => {
    const r = await service.query({
      kind: "summary",
      siteId: FIXTURE_SITE,
      range: { from: "2026-10-07", to: "2026-10-09" },
    });
    expect(r.data).toEqual({ pageviews: 10, visits: 7, visitors: 5, renders: 4, signals: 1 });
    expect(r.source).toBe("live");
  });

  it("settings: CAS, changes, purge on enabled/vitals/uniques, today's salt deleted when uniques turn off", async () => {
    const first = await service.updateSettings({
      siteId: FIXTURE_SITE,
      rev: 0,
      patch: { uniqueVisitors: true },
      actorId: "user_admin000001",
    });
    expect(first.after.rev).toBe(1);
    expect(first.changes).toEqual({ uniqueVisitors: { from: false, to: true } });
    // the purge also resets the Site Worker's memo of settings and salt
    expect(first.purged).toBe(true);
    expect(purged).toEqual([FIXTURE_SITE]);
    await getOrCreateSalt(sql, "2026-10-09");
    await getOrCreateSalt(sql, "2026-10-08");

    const off = await service.updateSettings({
      siteId: FIXTURE_SITE,
      rev: 1,
      patch: { uniqueVisitors: false, vitalsOneIn: 10 },
      actorId: "user_admin000001",
    });
    expect(off.saltDeleted).toBe(true);
    expect(off.purged).toBe(true);
    expect(purged).toEqual([FIXTURE_SITE, FIXTURE_SITE]);
    const salts = await sql.all<{ day: string }>("SELECT day FROM analytics_salts ORDER BY day");
    expect(salts.map((s) => s.day)).toEqual(["2026-10-08"]);

    await expect(
      service.updateSettings({
        siteId: FIXTURE_SITE,
        rev: 1,
        patch: { enabled: false },
        actorId: "user_admin000001",
      }),
    ).rejects.toBeInstanceOf(AnalyticsSettingsConflictError);
    expect((await service.settings(FIXTURE_SITE)).rev).toBe(2);
  });

  it("a failing purge does not fail the settings write", async () => {
    const failing = new AnalyticsService({
      sql,
      store: "sql",
      live: raw,
      now: () => now,
      purgeSite: async () => {
        throw new Error("site unreachable");
      },
    });
    const r = await failing.updateSettings({
      siteId: FIXTURE_SITE,
      rev: 0,
      patch: { enabled: true },
      actorId: "user_admin000001",
    });
    expect(r.purged).toBe(false);
    expect(r.after.enabled).toBe(true);
  });

  it("rolls up, reports status and exports rollups as CSV", async () => {
    const report = await service.rollup({ siteIds: [FIXTURE_SITE], maxSiteDays: 10 });
    expect(report.done.map((d) => d.day)).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
    const status = await service.status(FIXTURE_SITE);
    expect(status.lastRollup).toMatchObject({ day: "2026-10-08", source: "sql" });
    expect(status.budget).toBeNull();
    // locally there is no edge cache: the render count is reported, the ratio is not
    expect(status.quota).toMatchObject({
      day: "2026-10-08",
      pageviews: 4,
      renders: 2,
      cacheHitRatio: null,
    });
    expect(
      lines0(await service.exportCsv(FIXTURE_SITE, { from: "2026-10-07", to: "2026-10-08" })),
    ).toContain("2026-10-07,renders,all,0,0,,2,,,,");
    const csv = await service.exportCsv(FIXTURE_SITE, { from: "2026-10-07", to: "2026-10-09" });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("day,dim,key,pageviews,visits,visitors,hits,value,samples,good,poor");
    expect(lines).toContain("2026-10-07,total,all,6,5,3,,,,,");
    expect(lines.some((l) => l.startsWith("2026-10-08,node,"))).toBe(true);
    // days without a done run are not exported
    expect(await service.exportCsv(FIXTURE_SITE, { from: "2026-10-09", to: "2026-10-10" })).toBe(
      "day,dim,key,pageviews,visits,visitors,hits,value,samples,good,poor\r\n",
    );
  });

  it("CSV neutralises formulas and quotes separators", () => {
    const csv = dailyRowsCsv([
      {
        day: "2026-10-07",
        dim: "status",
        key: '=HYPERLINK("x"),1',
        pageviews: 0,
        visits: 0,
        visitors: null,
        hits: 3,
        value: null,
        samples: null,
        good: null,
        poor: null,
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe(`2026-10-07,status,"'=HYPERLINK(""x""),1",0,0,,3,,,,`);
  });

  it("budgeted deployments report today's spend", async () => {
    const budgeted = new AnalyticsService({ sql, store: "wae", budget: 2, now: () => now });
    const budget = new SqlQueryBudget(sql, { limit: 2 });
    await budget.take(now);
    const s = await budgeted.status(FIXTURE_SITE);
    expect(s.budget).toEqual({ day: "2026-10-09", used: 1, limit: 2, spent: false });
    // nothing readable: the quota estimate comes from (empty) rollups, never an error
    expect(s.feature.reader).toBe("none");
  });

  it("without a readable store, a rollup run only deletes old salts", async () => {
    await getOrCreateSalt(sql, "2026-10-08");
    const blind = new AnalyticsService({ sql, store: "wae", now: () => now });
    const r = await blind.rollup({ siteIds: [FIXTURE_SITE] });
    expect(r).toEqual({ saltsDeleted: 1, done: [], failed: [], pending: 0, retained: 0 });
  });

  it("on-read rollups run when no scheduled job does", async () => {
    const onRead = new AnalyticsService({
      sql,
      store: "sql",
      live: raw,
      rollups: "on-read",
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
      now: () => now,
    });
    expect(onRead.feature().rollups).toBe("on-read");
    await onRead.query({
      kind: "summary",
      siteId: FIXTURE_SITE,
      range: { from: "2026-10-07", to: "2026-10-09" },
    });
    const runs = await sql.all<{ day: string }>(
      "SELECT day FROM analytics_rollup_runs WHERE state = 'done' ORDER BY day",
    );
    // bounded work per read: the two oldest missing days of the lookback
    expect(runs.map((r) => r.day)).toEqual(["2026-10-02", "2026-10-03"]);
  });
});

describe("demoEvents", () => {
  it("is deterministic and every event matches the stored contract", () => {
    const options = {
      siteId: FIXTURE_SITE,
      nodes: [
        { nodeId: "page_01HZXHOME001", nodeKind: "page" as const, path: "/" },
        { nodeId: NODE_A, nodeKind: "entry" as const, path: "/posts/a", locale: "en" },
        { nodeId: "term_01HZXTERM001", nodeKind: "archive" as const, path: "/category/news" },
      ],
      days: 3,
      now,
      viewsPerDay: 40,
      uniqueVisitors: true,
    };
    const a = demoEvents(options);
    expect(demoEvents(options)).toEqual(a);
    expect(a.length).toBeGreaterThan(60);
    for (const e of a) assertValid("analytics-event", e);
    expect(new Set(a.map((e) => e.kind))).toEqual(new Set(["pageview", "vitals", "render"]));
    expect(a.every((e) => e.timestamp <= now.toISOString())).toBe(true);
    expect(demoEvents({ ...options, nodes: [] })).toEqual([]);
  });
});
