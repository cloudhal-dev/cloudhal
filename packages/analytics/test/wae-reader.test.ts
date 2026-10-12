import { afterEach, describe, expect, it } from "vitest";
import {
  AnalyticsBudgetExceededError,
  AnalyticsQueryFailedError,
  AnalyticsUnavailableError,
} from "../src/errors.ts";
import type { QueryBudget, SummaryQuery } from "../src/model.ts";
import { FIXTURE_EVENTS, FIXTURE_SITE } from "../src/testing.ts";
import {
  clearWaeCache,
  datasetName,
  type WaeDataset,
  WaeReader,
  type WaeSqlBinding,
} from "../src/wae/index.ts";
import { FakeWae, SqlApiError } from "./helpers/fake-wae.ts";

const dataset = "newsroom_events";

/** A canned binding (rows as the API would send them). */
const canned = (query: () => Promise<{ data: Record<string, unknown>[] }>) =>
  ({ query }) as unknown as WaeSqlBinding;

// the real bindings fit the structural types the package uses
const _sql: WaeSqlBinding = {} as AnalyticsSQLBinding;
const _dataset: WaeDataset = {} as AnalyticsEngineDataset;
void _sql;
void _dataset;
const q: SummaryQuery = {
  kind: "summary",
  siteId: FIXTURE_SITE,
  range: { from: "2026-10-07", to: "2026-10-09" },
};

function counting(limit: number): QueryBudget & { taken: number } {
  return {
    taken: 0,
    async take() {
      this.taken++;
      return this.taken <= limit;
    },
  };
}

afterEach(() => clearWaeCache());

describe("WaeReader", () => {
  it("caches results for 60 s per isolate, keyed by site, query and range", async () => {
    const wae = new FakeWae(dataset);
    wae.load(FIXTURE_EVENTS);
    let now = new Date("2026-10-09T10:00:00Z");
    const budget = counting(100);
    const make = () => new WaeReader(wae, { dataset, budget, now: () => now });
    const first = await make().query(q);
    expect(wae.queries).toHaveLength(3); // totals + daily visitors + people's renders
    const again = await make().query({
      ...q,
      range: { from: "2026-10-07T00:00:00Z", to: "2026-10-09T00:00:00.000Z" },
    });
    expect(again).toEqual(first);
    expect(wae.queries).toHaveLength(3);
    expect(budget.taken).toBe(3);
    now = new Date(now.getTime() + 60_001);
    await make().query(q);
    expect(wae.queries).toHaveLength(6);
    await make().query({ ...q, filter: { device: "mobile" } });
    expect(wae.queries).toHaveLength(9);
    // a channel filter has no render count (renders carry no channel): no third statement
    const channel = await make().query({ ...q, filter: { channel: "social" } });
    expect(channel.data.renders).toBeNull();
    expect(wae.queries).toHaveLength(11);
  });

  it("skips the visitors statement when no view carried a hash", async () => {
    const wae = new FakeWae(dataset);
    const r = await new WaeReader(wae, { dataset, cacheTtlMs: 0 }).query(q);
    expect(r).toEqual({
      data: { pageviews: 0, visits: 0, visitors: null, renders: 0, signals: 0 },
      source: "live",
      estimated: false,
    });
    expect(wae.queries).toHaveLength(2); // totals + renders, no visitors
  });

  it("stops at the daily budget", async () => {
    const wae = new FakeWae(dataset);
    const reader = new WaeReader(wae, { dataset, budget: counting(0), cacheTtlMs: 0 });
    await expect(reader.query(q)).rejects.toBeInstanceOf(AnalyticsBudgetExceededError);
    expect(wae.queries).toHaveLength(0);
  });

  it("retries a retryable error once after 250 ms", async () => {
    const waits: number[] = [];
    let calls = 0;
    const binding = canned(async () => {
      calls++;
      if (calls === 1) throw new SqlApiError("overloaded", true);
      return { data: [{ pageviews: "3", visits: "2", hashed: "0" }] };
    });
    const reader = new WaeReader(binding, {
      dataset,
      cacheTtlMs: 0,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect((await reader.query(q)).data).toEqual({
      pageviews: 3,
      visits: 2,
      visitors: null,
      renders: 0,
      signals: 0,
    });
    expect(waits).toEqual([250]);
  });

  it("maps a retryable error that persists to analytics_unavailable (retryable)", async () => {
    const binding = {
      async query(): Promise<never> {
        throw new SqlApiError("overloaded", true);
      },
    };
    const reader = new WaeReader(binding, { dataset, cacheTtlMs: 0, sleep: async () => {} });
    const err = await reader.query(q).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalyticsUnavailableError);
    expect(err).toMatchObject({ code: "analytics_unavailable", retryable: true });
  });

  it("maps other errors to analytics_query_failed without the dataset name", async () => {
    const logged: string[] = [];
    const binding = {
      async query(): Promise<never> {
        throw new SqlApiError(`Unknown table events.analyticsEngine."${dataset}"`, false);
      },
    };
    const reader = new WaeReader(binding, {
      dataset,
      cacheTtlMs: 0,
      onError: (m) => logged.push(m),
    });
    const err = (await reader.query(q).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(AnalyticsQueryFailedError);
    expect(err).toMatchObject({ code: "analytics_query_failed", retryable: false });
    expect(err.message).not.toContain(dataset);
    expect(logged[0]).toContain(dataset);
  });

  it("parses ISO and ClickHouse-style buckets", async () => {
    const binding = canned(async () => ({
      data: [
        { t: "2026-10-07 00:00:00", pageviews: "2", visits: "1" },
        { t: "2026-10-08T00:00:00Z", pageviews: 3, visits: 0 },
      ],
    }));
    const r = await new WaeReader(binding, { dataset, cacheTtlMs: 0 }).query({
      kind: "series",
      siteId: FIXTURE_SITE,
      range: q.range,
      interval: "day",
    });
    expect(r.data.points).toEqual([
      { t: "2026-10-07T00:00:00Z", pageviews: 2, visits: 1 },
      { t: "2026-10-08T00:00:00Z", pageviews: 3, visits: 0 },
    ]);
  });

  it("names datasets after the deployment", () => {
    expect(datasetName("newsroom")).toBe("newsroom_events");
    expect(datasetName("My-Site 2")).toBe("my_site_2_events");
  });
});
