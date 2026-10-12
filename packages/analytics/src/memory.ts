/**
 * In-memory `AnalyticsStore` (RFC-0006 §7.2): the fake for Worker tests (Miniflare's
 * `writeDataPoint` is a no-op) and the reference semantics every compiler is checked against.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import {
  type AnalyticsData,
  type AnalyticsQuery,
  type AnalyticsResult,
  type AnalyticsStore,
  assertAnalyticsQuery,
  compareTopRows,
  type Dimension,
  type Filter,
  fillSeries,
  isoInstant,
  type ParsedRange,
  type RenderCrawlerRow,
  type RenderErrorRow,
  type RenderRedirectRow,
  type RendersData,
  type TopRow,
  utcDay,
  VITALS_METRICS,
  VITALS_THRESHOLDS,
  type VitalsMetric,
  vitalsMetric,
  weightedP75,
} from "./model.ts";
import { crawlerClass } from "./ua.ts";

interface Stored {
  readonly event: AnalyticsEvent;
  readonly t: number;
}

const DIM_FIELD: Record<Dimension, string> = {
  node: "nodeId",
  refHost: "refHost",
  channel: "channel",
  utmSource: "utmSource",
  utmMedium: "utmMedium",
  utmCampaign: "utmCampaign",
  country: "country",
  device: "device",
  browser: "browser",
  os: "os",
};

function field(e: AnalyticsEvent, name: string): string | undefined {
  const v = (e as unknown as Record<string, unknown>)[name];
  return typeof v === "string" && v !== "" ? v : undefined;
}

function matches(e: AnalyticsEvent, filter: Filter | undefined): boolean {
  if (!filter) return true;
  if (filter.node !== undefined && field(e, "nodeId") !== filter.node) return false;
  if (filter.channel !== undefined && field(e, "channel") !== filter.channel) return false;
  if (filter.country !== undefined && field(e, "country") !== filter.country) return false;
  if (filter.device !== undefined && field(e, "device") !== filter.device) return false;
  return true;
}

const str = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A render a person caused that the edge cache could have answered: HTML `200`, no crawler, no bot. */
function isPeopleRender(e: AnalyticsEvent): boolean {
  return e.kind === "render" && e.status === 200 && !e.crawler && e.device !== "bot";
}

/** Answers queries over a list of events with the model's reference semantics. */
export function answerQuery<Q extends AnalyticsQuery>(
  events: readonly AnalyticsEvent[],
  q: Q,
  range: ParsedRange,
): AnalyticsData<Q> {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const inRange: Stored[] = [];
  for (const event of events) {
    if (event.siteId !== q.siteId) continue;
    const t = new Date(event.timestamp).getTime();
    if (t >= from && t < to) inRange.push({ event, t });
  }
  const of = (kind: AnalyticsEvent["kind"], filter?: Filter) =>
    inRange.filter((s) => s.event.kind === kind && matches(s.event, filter));
  const entrance = (s: Stored) => (s.event.kind === "pageview" && s.event.entrance ? 1 : 0);
  const weight = (s: Stored) =>
    s.event.kind === "pageview" ? 1 : ((s.event as { sampleOneIn?: number }).sampleOneIn ?? 1);

  switch (q.kind) {
    case "summary": {
      const views = of("pageview", q.filter);
      const days = new Map<string, Set<string>>();
      for (const s of views) {
        const v = field(s.event, "visitor");
        if (!v) continue;
        const d = utcDay(new Date(s.t));
        const set = days.get(d) ?? new Set<string>();
        set.add(v);
        days.set(d, set);
      }
      let visitors: number | null = null;
      for (const set of days.values()) visitors = (visitors ?? 0) + set.size;
      const { channel, ...renderFilter } = q.filter ?? {};
      const renders =
        channel !== undefined
          ? null
          : of("render", renderFilter)
              .filter((s) => isPeopleRender(s.event))
              .reduce((n, s) => n + weight(s), 0);
      return {
        pageviews: views.length,
        visits: views.reduce((n, s) => n + entrance(s), 0),
        visitors,
        renders,
        signals: views.filter((s) => s.event.kind === "pageview" && s.event.privacySignal).length,
      } as unknown as AnalyticsData<Q>;
    }
    case "series": {
      const step = q.interval === "hour" ? 3_600_000 : 86_400_000;
      const rows = of("pageview", q.filter).map((s) => ({
        t: isoInstant(new Date(Math.floor(s.t / step) * step)),
        pageviews: 1,
        visits: entrance(s),
      }));
      return {
        interval: q.interval,
        points: fillSeries(range, q.interval, rows),
      } as unknown as AnalyticsData<Q>;
    }
    case "top": {
      const name = DIM_FIELD[q.dimension];
      const by = new Map<string, { pageviews: number; visits: number }>();
      for (const s of of("pageview", q.filter)) {
        const key = field(s.event, name);
        if (key === undefined) continue;
        const prev = by.get(key) ?? { pageviews: 0, visits: 0 };
        by.set(key, { pageviews: prev.pageviews + 1, visits: prev.visits + entrance(s) });
      }
      const rows: TopRow[] = [...by].map(([key, v]) => ({ key, ...v }));
      rows.sort(compareTopRows);
      return {
        dimension: q.dimension,
        rows: rows.slice(0, q.limit),
      } as unknown as AnalyticsData<Q>;
    }
    case "vitals": {
      const samples = of("vitals", q.filter);
      const metrics: VitalsMetric[] = VITALS_METRICS.map((metric) => {
        const xs: { x: number; w: number }[] = [];
        for (const s of samples) {
          const x = (s.event as unknown as Record<string, unknown>)[metric];
          if (typeof x === "number") xs.push({ x, w: weight(s) });
        }
        const th = VITALS_THRESHOLDS[metric];
        const total = xs.reduce((n, s) => n + s.w, 0);
        const good = xs.filter((s) => s.x <= th.good).reduce((n, s) => n + s.w, 0);
        const poor = xs.filter((s) => s.x > th.poor).reduce((n, s) => n + s.w, 0);
        return vitalsMetric(metric, weightedP75(xs), total, good, poor);
      });
      return { metrics } as unknown as AnalyticsData<Q>;
    }
    case "renders": {
      const renders = of("render").map((s) => ({
        s,
        e: s.event as AnalyticsEvent & { kind: "render" },
      }));
      let data: RendersData;
      if (q.statuses === "errors") {
        const by = new Map<string, RenderErrorRow>();
        for (const { s, e } of renders) {
          if (e.status < 400) continue;
          const refPath = e.refPath ?? null;
          const key = JSON.stringify([e.path, e.status, refPath]);
          const prev = by.get(key);
          const last = isoInstant(new Date(s.t));
          by.set(key, {
            path: e.path,
            status: e.status,
            refPath,
            hits: (prev?.hits ?? 0) + weight(s),
            lastSeen: prev?.lastSeen && prev.lastSeen > last ? prev.lastSeen : last,
          });
        }
        const rows = [...by.values()].sort(
          (a, b) =>
            b.hits - a.hits ||
            str(a.path, b.path) ||
            a.status - b.status ||
            str(a.refPath ?? "", b.refPath ?? ""),
        );
        data = { report: "errors", rows: rows.slice(0, q.limit) };
      } else if (q.statuses === "redirects") {
        const by = new Map<string, RenderRedirectRow>();
        for (const { s, e } of renders) {
          if (e.status < 300 || e.status >= 400 || !e.redirectTo) continue;
          const nodeId = e.nodeId ?? null;
          const key = JSON.stringify([e.path, e.status, e.redirectTo, nodeId]);
          const prev = by.get(key);
          by.set(key, {
            path: e.path,
            status: e.status,
            redirectTo: e.redirectTo,
            nodeId,
            hits: (prev?.hits ?? 0) + weight(s),
          });
        }
        const rows = [...by.values()].sort(
          (a, b) =>
            b.hits - a.hits ||
            str(a.path, b.path) ||
            a.status - b.status ||
            str(a.redirectTo, b.redirectTo) ||
            str(a.nodeId ?? "", b.nodeId ?? ""),
        );
        data = { report: "redirects", rows: rows.slice(0, q.limit) };
      } else {
        const by = new Map<string, number>();
        for (const { s, e } of renders) {
          if (!e.crawler) continue;
          by.set(e.crawler, (by.get(e.crawler) ?? 0) + weight(s));
        }
        const rows: RenderCrawlerRow[] = [...by]
          .map(([crawler, hits]) => ({ crawler, class: crawlerClass(crawler), hits }))
          .sort((a, b) => b.hits - a.hits || str(a.crawler, b.crawler));
        data = { report: "crawlers", rows: rows.slice(0, q.limit) };
      }
      return data as unknown as AnalyticsData<Q>;
    }
  }
}

export class MemoryAnalytics implements AnalyticsStore {
  readonly kind = "memory" as const;
  readonly events: AnalyticsEvent[] = [];

  write(event: AnalyticsEvent): void {
    this.events.push(event);
  }

  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    const range = assertAnalyticsQuery(q);
    return { data: answerQuery(this.events, q, range), source: "live", estimated: false };
  }
}
