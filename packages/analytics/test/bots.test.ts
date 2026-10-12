/** The "possible bot traffic" signal (RFC-0006 §5.5): thresholds, window and the service path. */
import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import {
  assessBotTraffic,
  BOT_TRAFFIC_THRESHOLDS,
  classifyBotTraffic,
  findPeakHour,
  type PeakHourEvidence,
  spikeMultiple,
} from "../src/bots.ts";
import { AnalyticsBudgetExceededError } from "../src/errors.ts";
import { MemoryAnalytics } from "../src/memory.ts";
import type { AnalyticsQuery, AnalyticsReader, AnalyticsResult } from "../src/model.ts";
import { CompositeReader } from "../src/reader.ts";
import { RollupReader } from "../src/rollup.ts";
import { AnalyticsService } from "../src/service.ts";
import { SqlAnalytics } from "../src/sql/index.ts";
import {
  BOT_FIXTURE_EVENTS,
  BOT_NOW,
  BOT_PEAK,
  BOT_RANGE,
  BOT_SITE_LIKELY,
  BOT_SITE_VIRAL,
} from "../src/testing.ts";

const hour = "2026-10-11T03:00:00Z";
const evidence = (over: Partial<PeakHourEvidence>): PeakHourEvidence => ({
  hour,
  pageviews: 400,
  baseline: 10,
  visits: 300,
  directVisits: 0,
  ...over,
});
const codes = (r: { reasons: readonly { code: string }[] }) => r.reasons.map((x) => x.code);

describe("classifyBotTraffic", () => {
  it("follows the RFC: 20× the median hour with ≥ 80 % direct entrances is likely", () => {
    const r = classifyBotTraffic(evidence({ pageviews: 400, baseline: 20, directVisits: 240 }));
    expect(r.level).toBe("likely");
    expect(codes(r)).toEqual(["hourly_spike", "direct_entrances"]);
    expect(r.reasons[0]).toMatchObject({ value: 20, threshold: 10 });
    expect(r.reasons[1]).toMatchObject({ value: 0.8, threshold: 0.8 });
  });

  it("is only watch between 10× and 20×, and needs direct entrances or one browser", () => {
    expect(classifyBotTraffic(evidence({ baseline: 30, directVisits: 300 })).level).toBe("watch");
    expect(
      classifyBotTraffic(evidence({ topBrowser: { key: "chrome", pageviews: 390, visits: 0 } })),
    ).toMatchObject({ level: "watch" });
    // 13×, referred, mixed browsers: a busy hour, not a warning
    expect(classifyBotTraffic(evidence({ baseline: 30 }))).toEqual({ level: "none", reasons: [] });
    // below 10×
    expect(classifyBotTraffic(evidence({ baseline: 41, directVisits: 300 })).level).toBe("none");
  });

  it("never warns for one page alone (a post going viral)", () => {
    const viral = evidence({ topNode: { key: "entry_01HZXBOTPAGE1", pageviews: 390, visits: 0 } });
    expect(classifyBotTraffic(viral)).toEqual({ level: "none", reasons: [] });
    // one page and one browser at 20×: likely, with both reasons
    const r = classifyBotTraffic({
      ...viral,
      topBrowser: { key: "chrome", pageviews: 395, visits: 0 },
    });
    expect(r.level).toBe("likely");
    expect(codes(r)).toEqual(["hourly_spike", "single_browser", "single_page"]);
    expect(r.reasons[2]).toMatchObject({ key: "entry_01HZXBOTPAGE1", value: 0.975 });
  });

  it("keeps small sites quiet: minimum page views and entrances", () => {
    const small = evidence({ pageviews: 199, baseline: 0, visits: 199, directVisits: 199 });
    expect(classifyBotTraffic(small).level).toBe("none");
    // 200 views, 40 entrances all direct: the share needs 50 entrances, so no direct reason
    const few = evidence({ pageviews: 200, baseline: 0, visits: 40, directVisits: 40 });
    expect(classifyBotTraffic(few)).toEqual({ level: "none", reasons: [] });
    expect(spikeMultiple(200, 0)).toBe(200);
    expect(spikeMultiple(205, 20.5)).toBe(10);
  });

  it("reasons explain themselves without visitor data", () => {
    const r = classifyBotTraffic(
      evidence({
        pageviews: 500,
        baseline: 2,
        visits: 500,
        directVisits: 450,
        topBrowser: { key: "chrome", pageviews: 500, visits: 500 },
      }),
    );
    expect(r.reasons.map((x) => x.detail)).toEqual([
      `500 page views in the hour from ${hour}, 250 times the median hour of the last 7 days (2)`,
      "90% of the hour's 500 entrances came without a referrer",
      "100% of the hour's page views came from one browser family (chrome)",
    ]);
    expect(BOT_TRAFFIC_THRESHOLDS).toMatchObject({ likelyMultiple: 20, directShare: 0.8 });
  });
});

describe("findPeakHour", () => {
  const p = (t: string, pageviews: number) => ({ t, pageviews, visits: 0 });
  it("picks the busiest hour from `from` on (earliest on a tie); the median leaves it out", () => {
    const points = [
      p("2026-10-01T00:00:00Z", 90),
      p("2026-10-01T01:00:00Z", 2),
      p("2026-10-01T02:00:00Z", 8),
      p("2026-10-01T03:00:00Z", 8),
      p("2026-10-01T04:00:00Z", 4),
    ];
    expect(findPeakHour(points, new Date("2026-10-01T01:00:00Z"))).toEqual({
      peak: points[2],
      baseline: 6,
    });
    expect(findPeakHour(points, new Date("2026-10-01T00:00:00Z"))?.peak).toBe(points[0]);
    expect(findPeakHour([p("2026-10-01T00:00:00Z", 0)], new Date(0))).toBeNull();
  });
});

describe("assessBotTraffic", () => {
  const memory = new MemoryAnalytics();
  for (const e of BOT_FIXTURE_EVENTS) memory.write(e);

  it("checks only the period's hours, never past now", async () => {
    // a period that ends before the burst: the busiest hour is a quiet one
    const before = await assessBotTraffic(memory, {
      siteId: BOT_SITE_LIKELY,
      range: { from: "2026-10-06", to: "2026-10-11" },
      now: BOT_NOW,
    });
    expect(before.signal).toMatchObject({ level: "none", pageviews: 1 });
    expect(before.signal.window).toEqual({
      from: "2026-10-04T00:00:00Z",
      to: "2026-10-11T00:00:00Z",
    });
    expect(before.results).toHaveLength(1);
    // today only: the window is the 7 days up to the current hour, the burst is yesterday
    const today = await assessBotTraffic(memory, {
      siteId: BOT_SITE_LIKELY,
      range: { from: "2026-10-12", to: "2026-10-13" },
      now: BOT_NOW,
    });
    expect(today.signal.level).toBe("none");
    // a period in the future of now has no hours to check
    const future = await assessBotTraffic(memory, {
      siteId: BOT_SITE_LIKELY,
      range: { from: "2026-10-20", to: "2026-10-21" },
      now: BOT_NOW,
    });
    expect(future).toEqual({ signal: expect.objectContaining({ window: null }), results: [] });
  });

  it("finds the burst in a longer period that ends after it", async () => {
    const { signal, results } = await assessBotTraffic(memory, {
      siteId: BOT_SITE_LIKELY,
      range: { from: "2026-09-13", to: "2026-10-13" },
      now: BOT_NOW,
    });
    expect(signal).toMatchObject({ level: "likely", hour: BOT_PEAK, pageviews: 261 });
    expect(results).toHaveLength(4);
  });

  it("says partial instead of failing when the live budget is spent", async () => {
    const spent: AnalyticsReader = {
      kind: "wae",
      query: () => Promise.reject(new AnalyticsBudgetExceededError()),
    };
    const { signal } = await assessBotTraffic(spent, {
      siteId: BOT_SITE_LIKELY,
      range: BOT_RANGE,
      now: BOT_NOW,
    });
    expect(signal).toMatchObject({ level: "none", partial: true });
  });

  it("is partial without a live reader (can't read yet)", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const reader = new CompositeReader({ rollups: new RollupReader(sql), now: () => BOT_NOW });
    const { signal } = await assessBotTraffic(reader, {
      siteId: BOT_SITE_LIKELY,
      range: BOT_RANGE,
      now: BOT_NOW,
    });
    expect(signal).toMatchObject({ level: "none", partial: true });
    await sql.close();
  });
});

describe("AnalyticsService.botTraffic", () => {
  it("reads through the composite path (rolled-up days and live hours)", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SqlAnalytics(sql);
    await store.insertMany(BOT_FIXTURE_EVENTS);
    const queries: AnalyticsQuery["kind"][] = [];
    const live: AnalyticsReader = {
      kind: "sql",
      query: <Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> => {
        queries.push(q.kind);
        return store.query(q);
      },
    };
    const service = new AnalyticsService({ sql, store: "sql", live, now: () => BOT_NOW });
    await service.rollup({ siteIds: [BOT_SITE_LIKELY, BOT_SITE_VIRAL], maxSiteDays: 20 });
    queries.length = 0;
    const likely = await service.botTraffic(BOT_SITE_LIKELY, BOT_RANGE);
    expect(likely.signal.level).toBe("likely");
    expect(queries).toEqual(["series", "top", "top", "top"]);
    expect(likely.results.every((r) => r.source === "live")).toBe(true);
    const viral = await service.botTraffic(BOT_SITE_VIRAL, BOT_RANGE);
    expect(viral.signal).toMatchObject({ level: "none", reasons: [], pageviews: 261 });
    await sql.close();
  });
});
