/**
 * Opt-in live suite against a real Cloudflare account (RFC-0006 §7.2–§7.3, S4, invariant A6).
 * Skipped unless `CLOUDHAL_LIVE_CF=1`; never runs in CI (ADR-0012 has no account there).
 *
 *   CLOUDHAL_LIVE_CF=1 \
 *   CLOUDHAL_LIVE_CF_URL=https://cloudhal-analytics-probe.<account>.workers.dev \
 *   CLOUDHAL_LIVE_CF_SECRET=… \
 *   CLOUDHAL_LIVE_CF_DATASET=cloudhal_live_events \
 *   pnpm --filter @cloudhal/analytics exec vitest run test/live.test.ts
 *
 * Deploy `test/live/probe-worker.ts` first (see its header). It writes 10 page views plus vitals
 * and render events under a fresh site id, waits until WAE has them, then asserts:
 * - `COUNT(*) = 10` for the page views: the API weights aggregates itself, and Cloudhal never
 *   multiplies by `"sampleInterval"` (the re-verification S4 asks for);
 * - every compiled query of the model runs in the binding's dialect (including `quantileWeighted`,
 *   `APPROX_MAX`, `countIf`, `sumIf`, `toStartOfDay`/`toStartOfHour`) and agrees with the in-memory
 *   reference on the same events.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { MemoryAnalytics } from "../src/memory.ts";
import type { AnalyticsQuery } from "../src/model.ts";
import { FIXTURE_EVENTS, FIXTURE_SITE } from "../src/testing.ts";
import { WaeReader, type WaeSqlBinding } from "../src/wae/index.ts";

const live = process.env.CLOUDHAL_LIVE_CF === "1";
const url = process.env.CLOUDHAL_LIVE_CF_URL ?? "";
const secret = process.env.CLOUDHAL_LIVE_CF_SECRET ?? "";
const dataset = process.env.CLOUDHAL_LIVE_CF_DATASET ?? "cloudhal_live_events";

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-probe-secret": secret },
    body: JSON.stringify(body),
  });
}

/** The admin Worker's binding, reached through the probe Worker. */
const remote: WaeSqlBinding = {
  async query<T extends Record<string, unknown>>(request: { query: string }) {
    const res = await post("/query", { query: request.query });
    const json = (await res.json()) as {
      data?: T[];
      error?: { name: string; message: string; retryable: boolean };
    };
    if (json.error) throw Object.assign(new Error(json.error.message), json.error);
    return { data: json.data ?? [] };
  },
};

describe.skipIf(!live)("live: Workers Analytics Engine through the Analytics SQL binding", () => {
  it("pins sample weighting and the dialect of every compiled query", async () => {
    expect(url, "CLOUDHAL_LIVE_CF_URL").not.toBe("");
    const siteId = `site_live${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    // WAE stamps points at write time; keep the fixture's shape under a fresh site id
    const events: AnalyticsEvent[] = FIXTURE_EVENTS.filter((e) => e.siteId === FIXTURE_SITE)
      .filter((e) => !e.timestamp.startsWith("2026-10-09"))
      .map((e) => ({ ...e, siteId, timestamp: now.toISOString() }));
    const pageviews = events.filter((e) => e.kind === "pageview").length;
    expect(pageviews).toBe(10);
    expect((await post("/write", { events })).ok).toBe(true);

    const from = new Date(now.getTime() - 15 * 60_000);
    const to = new Date(now.getTime() + 15 * 60_000);
    const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
    const count = `SELECT COUNT(*) AS n, SUM("sampleInterval") AS si FROM events.analyticsEngine."${dataset}" WHERE index1 = '${siteId}' AND blob1 = 'pageview' AND timestamp >= '${iso(from)}' AND timestamp < '${iso(to)}'`;
    let row: Record<string, unknown> | undefined;
    for (let i = 0; i < 36; i++) {
      row = (await remote.query({ query: count })).data[0];
      if (Number(row?.n) >= pageviews) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    // S4: COUNT(*) is already weighted; Cloudhal never touches "sampleInterval" itself
    expect(Number(row?.n)).toBe(10);
    console.info(`live: COUNT(*) = ${row?.n}, SUM("sampleInterval") = ${row?.si}`);

    const reader = new WaeReader(remote, { dataset, cacheTtlMs: 0 });
    const reference = new MemoryAnalytics();
    for (const e of events) reference.write(e);
    const range = { from: from.toISOString(), to: to.toISOString() };
    const queries: AnalyticsQuery[] = [
      { kind: "summary", siteId, range },
      { kind: "top", siteId, range, dimension: "node", limit: 10 },
      { kind: "top", siteId, range, dimension: "channel", limit: 10 },
      { kind: "renders", siteId, range, statuses: "errors", limit: 10 },
      { kind: "renders", siteId, range, statuses: "redirects", limit: 10 },
      { kind: "renders", siteId, range, statuses: "crawlers", limit: 10 },
    ];
    for (const q of queries) {
      const got = (await reader.query(q)).data as unknown as Record<string, unknown>;
      const want = (await reference.query(q)).data as unknown as Record<string, unknown>;
      if (q.kind === "renders" && q.statuses === "errors") {
        const strip = (d: Record<string, unknown>) =>
          (d.rows as { lastSeen: unknown }[]).map((r) => ({ ...r, lastSeen: null }));
        expect(strip(got), q.statuses).toEqual(strip(want));
      } else expect(got, q.kind).toEqual(want);
    }
    const series = await reader.query({ kind: "series", siteId, range, interval: "hour" });
    expect(series.data.points.reduce((n, p) => n + p.pageviews, 0)).toBe(10);
    const vitals = await reader.query({ kind: "vitals", siteId, range });
    const ref = await reference.query({ kind: "vitals", siteId, range });
    for (const m of vitals.data.metrics) {
      const r = ref.data.metrics.find((x) => x.metric === m.metric);
      expect({ ...m, p75: null }, m.metric).toEqual({ ...r, p75: null });
      // the API's quantile is approximate; it must land within the sampled values
      if (r?.p75 !== null) expect(m.p75, m.metric).not.toBeNull();
    }
  }, 300_000);
});
