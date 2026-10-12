/** CompositeReader (RFC-0006 §7.7): rolled-up days from D1, the rest live, budget fallback. */
import { migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsBudgetExceededError } from "../src/errors.ts";
import type { AnalyticsQuery, AnalyticsReader, AnalyticsResult } from "../src/model.ts";
import { CompositeReader } from "../src/reader.ts";
import { RollupReader, runRollups } from "../src/rollup.ts";
import { SqlAnalytics } from "../src/sql/index.ts";
import { CONFORMANCE_CASES, FIXTURE_EVENTS, FIXTURE_SITE, NODE_A } from "../src/testing.ts";

const now = new Date("2026-10-09T05:17:00Z");
const FULL = { from: "2026-10-07", to: "2026-10-09" };

class Spy implements AnalyticsReader {
  readonly kind = "sql" as const;
  readonly ranges: string[] = [];
  readonly inner: AnalyticsReader;
  readonly fail: (() => Error | undefined) | undefined;
  constructor(inner: AnalyticsReader, fail?: () => Error | undefined) {
    this.inner = inner;
    this.fail = fail;
  }
  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    this.ranges.push(`${q.range.from}..${q.range.to}`);
    const err = this.fail?.();
    if (err) throw err;
    return this.inner.query(q);
  }
}

describe("CompositeReader", () => {
  let sql: SqlDriver;
  let raw: SqlAnalytics;
  let rollups: RollupReader;

  beforeEach(async () => {
    sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    raw = new SqlAnalytics(sql);
    await raw.insertMany(FIXTURE_EVENTS);
    rollups = new RollupReader(sql);
  });

  async function rollUp(day: string) {
    // roll exactly one day: now = the day after, lookback 1
    const after = new Date(`${day}T00:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    await runRollups({
      reader: raw,
      sql,
      siteIds: [FIXTURE_SITE],
      now: after,
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
      lookbackDays: 1,
    });
  }

  it("reads live when nothing is rolled up, and mixes once a day is", async () => {
    const live = new Spy(raw);
    const reader = new CompositeReader({ rollups, live, now: () => now });
    const q = { kind: "summary", siteId: FIXTURE_SITE, range: FULL } as const;
    const first = await reader.query(q);
    expect(first).toMatchObject({
      source: "live",
      data: { pageviews: 10, visits: 7, visitors: 5 },
    });
    expect(live.ranges).toEqual(["2026-10-07T00:00:00.000Z..2026-10-09T00:00:00.000Z"]);

    await rollUp("2026-10-07");
    live.ranges.length = 0;
    const mixed = await reader.query(q);
    expect(mixed).toMatchObject({
      source: "mixed",
      data: { pageviews: 10, visits: 7, visitors: 5 },
    });
    expect(live.ranges).toEqual(["2026-10-08T00:00:00.000Z..2026-10-09T00:00:00.000Z"]);

    await rollUp("2026-10-08");
    live.ranges.length = 0;
    const rolled = await reader.query(q);
    expect(rolled.source).toBe("rollups");
    expect(live.ranges).toEqual([]);
  });

  it("agrees with the raw store for every query it can split", async () => {
    await rollUp("2026-10-07");
    const reader = new CompositeReader({ rollups, live: raw, now: () => now });
    for (const kase of CONFORMANCE_CASES) {
      const q = kase.query;
      // rollups drop render referrers and keep only daily p75s; compare those separately
      if (q.kind === "vitals" || (q.kind === "renders" && q.statuses === "errors")) continue;
      const got = await reader.query(q);
      const want = (await raw.query(q)).data;
      if (q.kind === "summary" && q.filter && got.source !== "live")
        expect(got.data, kase.name).toEqual({
          ...want,
          visitors: (got.data as { visitors: unknown }).visitors,
          // rollups keep the render count on the total only
          renders: null,
          signals: null,
        });
      else expect(got.data, kase.name).toEqual(want);
    }
  });

  it("goes live for shapes rollups do not keep", async () => {
    await rollUp("2026-10-07");
    const live = new Spy(raw);
    const reader = new CompositeReader({ rollups, live, now: () => now });
    await reader.query({
      kind: "top",
      siteId: FIXTURE_SITE,
      range: FULL,
      dimension: "refHost",
      limit: 5,
      filter: { node: NODE_A },
    });
    await reader.query({
      kind: "series",
      siteId: FIXTURE_SITE,
      range: { from: "2026-10-07", to: "2026-10-08" },
      interval: "hour",
    });
    expect(live.ranges).toHaveLength(2);
  });

  it("answers from rollups with partial when the live budget is spent", async () => {
    await rollUp("2026-10-07");
    const live = new Spy(raw, () => new AnalyticsBudgetExceededError());
    const reader = new CompositeReader({ rollups, live, now: () => now });
    const r = await reader.query({ kind: "summary", siteId: FIXTURE_SITE, range: FULL });
    expect(r).toMatchObject({
      source: "rollups",
      partial: true,
      data: { pageviews: 6, visits: 5 },
    });
  });

  it("does not read live data older than 92 days, and works without a live reader", async () => {
    await rollUp("2026-10-07");
    const live = new Spy(raw);
    const later = new Date("2027-03-01T00:00:00Z");
    const reader = new CompositeReader({ rollups, live, now: () => later });
    const r = await reader.query({ kind: "summary", siteId: FIXTURE_SITE, range: FULL });
    expect(r).toMatchObject({ source: "rollups", partial: true, data: { pageviews: 6 } });
    expect(live.ranges).toEqual([]);
    const none = new CompositeReader({ rollups, now: () => now });
    expect(await none.query({ kind: "summary", siteId: FIXTURE_SITE, range: FULL })).toMatchObject({
      source: "rollups",
      partial: true,
    });
  });
});
