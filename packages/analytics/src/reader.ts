/**
 * `CompositeReader` (RFC-0006 §7.7): the read path of Studio and MCP. Complete UTC days that are
 * rolled up come from `analytics_daily` (cheap D1 reads); today, days not rolled up yet, hourly
 * series and shapes the rollups do not keep are read live (WAE through `WaeReader`, or SQLite).
 * When the live budget is spent, answers come from rollups alone with `partial: true`; ranges older
 * than live data (92 days) come from rollups only.
 */
import { AnalyticsBudgetExceededError } from "./errors.ts";
import {
  type AnalyticsData,
  type AnalyticsQuery,
  type AnalyticsReader,
  type AnalyticsResult,
  type AnalyticsSource,
  addDays,
  assertAnalyticsQuery,
  compareTopRows,
  fillSeries,
  MAX_LIVE_DAYS,
  type ParsedRange,
  type RenderCrawlerRow,
  type RenderErrorRow,
  type RenderRedirectRow,
  type RendersData,
  type SeriesData,
  type SummaryData,
  startOfUtcDay,
  type TopData,
  type TopRow,
  utcDay,
  type VitalsData,
  type VitalsMetric,
  vitalsMetric,
} from "./model.ts";
import { MAX_ROLLUP_DAYS, type RollupReader } from "./rollup.ts";

export interface CompositeReaderOptions {
  readonly rollups: RollupReader;
  /** The live store; omit when the deployment cannot read it (`reader: "none"`, A1). */
  readonly live?: AnalyticsReader;
  readonly now?: () => Date;
  /** How far back live data reaches (default 92 days). */
  readonly liveDays?: number;
}

interface Segment {
  readonly from: Date;
  readonly to: Date;
}

const str = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class CompositeReader implements AnalyticsReader {
  readonly kind = "composite" as const;
  readonly #o: CompositeReaderOptions;

  constructor(options: CompositeReaderOptions) {
    this.#o = options;
  }

  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    const range = assertAnalyticsQuery(q, { maxDays: MAX_ROLLUP_DAYS });
    const { rollups, live } = this.#o;
    const now = this.#o.now?.() ?? new Date();
    const liveFrom = addDays(startOfUtcDay(now), -(this.#o.liveDays ?? MAX_LIVE_DAYS) + 1);

    if (!rollups.supports(q)) {
      if (!live) return { ...(await rollupsEmpty(q, range)), partial: true } as AnalyticsResult<Q>;
      return live.query(q);
    }

    // Days: rolled up (done) days come from rollups, every other piece of the range is live.
    const firstDay = startOfUtcDay(range.from);
    const done = await rollups.doneDays(
      q.siteId,
      utcDay(firstDay),
      utcDay(addDays(startOfUtcDay(range.to), 1)),
    );
    const segments: Segment[] = [];
    let usedRollups = false;
    for (let d = firstDay; d < range.to; d = addDays(d, 1)) {
      const end = addDays(d, 1);
      const complete = d >= range.from && end <= range.to;
      if (complete && done.has(utcDay(d))) {
        usedRollups = true;
        continue;
      }
      const from = d < range.from ? range.from : d;
      const to = end > range.to ? range.to : end;
      const last = segments.at(-1);
      if (last && last.to.getTime() === from.getTime())
        segments[segments.length - 1] = { from: last.from, to };
      else segments.push({ from, to });
    }

    let partial = false;
    const parts: AnalyticsResult[] = [];
    if (usedRollups) parts.push(await rollups.query(q));
    let usedLive = false;
    for (const seg of segments) {
      if (seg.to <= liveFrom || !live) {
        partial = true;
        continue;
      }
      const from = seg.from < liveFrom ? liveFrom : seg.from;
      if (from > seg.from) partial = true;
      try {
        parts.push(
          await live.query({
            ...q,
            range: { from: from.toISOString(), to: seg.to.toISOString() },
          } as AnalyticsQuery),
        );
        usedLive = true;
      } catch (error) {
        if (!(error instanceof AnalyticsBudgetExceededError)) throw error;
        partial = true;
        break;
      }
    }
    if (parts.length === 0)
      return { ...(await rollupsEmpty(q, range)), partial } as AnalyticsResult<Q>;
    const source: AnalyticsSource =
      usedRollups && usedLive ? "mixed" : usedLive ? "live" : "rollups";
    const merged = mergeResults(q, range, parts);
    return { ...merged, source, ...(partial ? { partial: true } : {}) } as AnalyticsResult<Q>;
  }
}

async function rollupsEmpty(q: AnalyticsQuery, range: ParsedRange): Promise<AnalyticsResult> {
  return { ...mergeResults(q, range, []), source: "rollups" };
}

/** Merges answers for disjoint parts of one range into one answer. */
export function mergeResults(
  q: AnalyticsQuery,
  range: ParsedRange,
  parts: readonly AnalyticsResult[],
): { data: AnalyticsData<AnalyticsQuery>; estimated: boolean } {
  let estimated = parts.some((p) => p.estimated);
  const datas = parts.map((p) => p.data);
  switch (q.kind) {
    case "summary": {
      const ds = datas as SummaryData[];
      const withVisitors = ds.filter((d) => d.visitors !== null);
      return {
        data: {
          pageviews: ds.reduce((n, d) => n + d.pageviews, 0),
          visits: ds.reduce((n, d) => n + d.visits, 0),
          visitors:
            withVisitors.length === 0
              ? null
              : withVisitors.reduce((n, d) => n + (d.visitors ?? 0), 0),
        },
        estimated,
      };
    }
    case "series":
      return {
        data: {
          interval: q.interval,
          points: fillSeries(
            range,
            q.interval,
            (datas as SeriesData[]).flatMap((d) => d.points),
          ),
        },
        estimated,
      };
    case "top": {
      const by = new Map<string, TopRow>();
      for (const d of datas as TopData[])
        for (const r of d.rows) {
          const prev = by.get(r.key);
          by.set(r.key, {
            key: r.key,
            pageviews: (prev?.pageviews ?? 0) + r.pageviews,
            visits: (prev?.visits ?? 0) + r.visits,
          });
        }
      return {
        data: {
          dimension: q.dimension,
          rows: [...by.values()].sort(compareTopRows).slice(0, q.limit),
        },
        estimated,
      };
    }
    case "vitals": {
      const ds = datas as VitalsData[];
      if (ds.length === 1 && ds[0]) return { data: ds[0], estimated };
      const metrics = (["lcp", "inp", "cls", "ttfb", "fcp"] as const).map((metric) => {
        const ms = ds
          .map((d) => d.metrics.find((m) => m.metric === metric))
          .filter((m): m is VitalsMetric => !!m && m.samples > 0);
        const samples = ms.reduce((n, m) => n + m.samples, 0);
        const withP = ms.filter((m) => m.p75 !== null);
        const pw = withP.reduce((n, m) => n + m.samples, 0);
        const p75 = pw > 0 ? withP.reduce((n, m) => n + (m.p75 ?? 0) * m.samples, 0) / pw : null;
        if (ms.length > 1) estimated = true;
        const sum = (k: "good" | "poor") =>
          ms.some((m) => m[k] === null) ? null : ms.reduce((n, m) => n + (m[k] ?? 0), 0);
        return vitalsMetric(metric, p75, samples, sum("good"), sum("poor"));
      });
      return { data: { metrics }, estimated };
    }
    case "renders": {
      const ds = datas as RendersData[];
      if (q.statuses === "errors") {
        const by = new Map<string, RenderErrorRow>();
        for (const d of ds)
          if (d.report === "errors")
            for (const r of d.rows) {
              const k = JSON.stringify([r.path, r.status, r.refPath]);
              const prev = by.get(k);
              const lastSeen =
                prev?.lastSeen && (!r.lastSeen || prev.lastSeen > r.lastSeen)
                  ? prev.lastSeen
                  : r.lastSeen;
              by.set(k, { ...r, hits: (prev?.hits ?? 0) + r.hits, lastSeen });
            }
        const rows = [...by.values()].sort(
          (a, b) =>
            b.hits - a.hits ||
            str(a.path, b.path) ||
            a.status - b.status ||
            str(a.refPath ?? "", b.refPath ?? ""),
        );
        return { data: { report: "errors", rows: rows.slice(0, q.limit) }, estimated };
      }
      if (q.statuses === "redirects") {
        const by = new Map<string, RenderRedirectRow>();
        for (const d of ds)
          if (d.report === "redirects")
            for (const r of d.rows) {
              const k = JSON.stringify([r.path, r.status, r.redirectTo, r.nodeId]);
              by.set(k, { ...r, hits: (by.get(k)?.hits ?? 0) + r.hits });
            }
        const rows = [...by.values()].sort(
          (a, b) =>
            b.hits - a.hits ||
            str(a.path, b.path) ||
            a.status - b.status ||
            str(a.redirectTo, b.redirectTo) ||
            str(a.nodeId ?? "", b.nodeId ?? ""),
        );
        return { data: { report: "redirects", rows: rows.slice(0, q.limit) }, estimated };
      }
      const by = new Map<string, RenderCrawlerRow>();
      for (const d of ds)
        if (d.report === "crawlers")
          for (const r of d.rows)
            by.set(r.crawler, { ...r, hits: (by.get(r.crawler)?.hits ?? 0) + r.hits });
      const rows = [...by.values()].sort((a, b) => b.hits - a.hits || str(a.crawler, b.crawler));
      return { data: { report: "crawlers", rows: rows.slice(0, q.limit) }, estimated };
    }
  }
}
