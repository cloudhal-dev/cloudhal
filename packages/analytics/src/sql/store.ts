/**
 * `SqlAnalytics` (RFC-0006 §7.2–§7.3): raw events in `analytics_events` on SQLite (local and Node
 * self-host; D1 only in tests — on Cloudflare raw events go to WAE). Reached only through
 * `SqlDriver`, so it is Worker-safe. Queries compile the model to SQLite with bound parameters:
 * `COUNT(*)`, `SUM(entrance)`, and weighted percentiles through a running-sum window.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlValue } from "@cloudhal/storage";
import {
  type AnalyticsData,
  type AnalyticsQuery,
  type AnalyticsResult,
  type AnalyticsStore,
  assertAnalyticsQuery,
  type Dimension,
  type Filter,
  fillSeries,
  num,
  type ParsedRange,
  parseBucket,
  type RenderCrawlerRow,
  type RenderErrorRow,
  type RenderRedirectRow,
  type RendersData,
  type SeriesQuery,
  type SummaryQuery,
  type TopQuery,
  VITALS_METRICS,
  VITALS_THRESHOLDS,
  type VitalsQuery,
  vitalsMetric,
} from "../model.ts";
import { crawlerClass } from "../ua.ts";

const DIM_COLUMN: Record<Dimension, string> = {
  node: "node_id",
  refHost: "ref_host",
  channel: "channel",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  country: "country",
  device: "device",
  browser: "browser",
  os: "os",
};

const INSERT = `INSERT INTO analytics_events (site_id, ts, kind, path, node_id, node_kind, ref_host,
  ref_path, channel, utm_source, utm_medium, utm_campaign, country, device, browser, os, visitor,
  nav_type, locale, crawler, redirect_to, status, entrance, lcp, inp, cls, ttfb, fcp, render_ms,
  sample_one_in) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?)`;

/** The `analytics_events` row of an event (timestamps normalised to `toISOString()`). */
export function eventParams(e: AnalyticsEvent): SqlValue[] {
  const r = e as unknown as Record<string, unknown>;
  const s = (k: string): string | null => (typeof r[k] === "string" ? (r[k] as string) : null);
  const n = (k: string): number | null => (typeof r[k] === "number" ? (r[k] as number) : null);
  return [
    e.siteId,
    new Date(e.timestamp).toISOString(),
    e.kind,
    e.path,
    s("nodeId"),
    s("nodeKind"),
    s("refHost"),
    s("refPath"),
    s("channel"),
    s("utmSource"),
    s("utmMedium"),
    s("utmCampaign"),
    s("country"),
    e.device,
    s("browser"),
    s("os"),
    s("visitor"),
    s("navType"),
    s("locale"),
    s("crawler"),
    s("redirectTo"),
    n("status"),
    e.kind === "pageview" ? (e.entrance ? 1 : 0) : null,
    n("lcp"),
    n("inp"),
    n("cls"),
    n("ttfb"),
    n("fcp"),
    n("renderMs"),
    n("sampleOneIn") ?? 1,
  ];
}

interface Where {
  readonly sql: string;
  readonly params: SqlValue[];
}

function where(
  siteId: string,
  kind: AnalyticsEvent["kind"],
  range: ParsedRange,
  filter?: Filter,
): Where {
  const parts = ["site_id = ?", "kind = ?", "ts >= ?", "ts < ?"];
  const params: SqlValue[] = [siteId, kind, range.from.toISOString(), range.to.toISOString()];
  if (filter?.node !== undefined) {
    parts.push("node_id = ?");
    params.push(filter.node);
  }
  if (filter?.channel !== undefined) {
    parts.push("channel = ?");
    params.push(filter.channel);
  }
  if (filter?.country !== undefined) {
    parts.push("country = ?");
    params.push(filter.country);
  }
  if (filter?.device !== undefined) {
    parts.push("device = ?");
    params.push(filter.device);
  }
  return { sql: parts.join(" AND "), params };
}

export interface SqlAnalyticsOptions {
  /** Write failures (the event is dropped). */
  readonly onError?: (message: string, error?: unknown) => void;
}

export class SqlAnalytics implements AnalyticsStore {
  readonly kind = "sql" as const;
  readonly #sql: SqlDriver;
  readonly #onError: ((message: string, error?: unknown) => void) | undefined;
  readonly #pending = new Set<Promise<void>>();

  constructor(sql: SqlDriver, options: SqlAnalyticsOptions = {}) {
    this.#sql = sql;
    this.#onError = options.onError;
  }

  /** Queues one insert; never throws. `flush()` waits for queued inserts. */
  write(event: AnalyticsEvent): void {
    const p = this.insert(event)
      .catch((error) => this.#onError?.("analytics insert failed", error))
      .finally(() => this.#pending.delete(p));
    this.#pending.add(p);
  }

  /** One insert, awaited (seeding, tests). */
  async insert(event: AnalyticsEvent): Promise<void> {
    await this.#sql.run(INSERT, eventParams(event));
  }

  /** Inserts many events in batches of 100 statements. */
  async insertMany(events: readonly AnalyticsEvent[]): Promise<void> {
    for (let i = 0; i < events.length; i += 100) {
      const chunk = events.slice(i, i + 100);
      await this.#sql.batch(chunk.map((e) => ({ sql: INSERT, params: eventParams(e) })));
    }
  }

  async flush(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all([...this.#pending]);
  }

  /** Deletes raw events older than `before` (`analytics.rawRetentionDays`). Returns rows removed. */
  async prune(before: Date): Promise<number> {
    const r = await this.#sql.run("DELETE FROM analytics_events WHERE ts < ?", [
      before.toISOString(),
    ]);
    return r.changes;
  }

  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    const range = assertAnalyticsQuery(q);
    const data = await this.#answer(q as AnalyticsQuery, range);
    return { data: data as AnalyticsData<Q>, source: "live", estimated: false };
  }

  async #answer(q: AnalyticsQuery, range: ParsedRange): Promise<unknown> {
    switch (q.kind) {
      case "summary":
        return this.#summary(q, range);
      case "series":
        return this.#series(q, range);
      case "top":
        return this.#top(q, range);
      case "vitals":
        return this.#vitals(q, range);
      case "renders":
        return this.#renders(q.siteId, range, q.statuses, q.limit);
    }
  }

  async #summary(q: SummaryQuery, range: ParsedRange) {
    const w = where(q.siteId, "pageview", range, q.filter);
    const totals = await this.#sql.get(
      `SELECT COUNT(*) AS pageviews, COALESCE(SUM(entrance), 0) AS visits FROM analytics_events WHERE ${w.sql}`,
      w.params,
    );
    const v = await this.#sql.get(
      `SELECT COUNT(*) AS days, COALESCE(SUM(n), 0) AS visitors FROM (SELECT substr(ts, 1, 10) AS d, COUNT(DISTINCT visitor) AS n FROM analytics_events WHERE ${w.sql} AND visitor IS NOT NULL GROUP BY d)`,
      w.params,
    );
    return {
      pageviews: num(totals?.pageviews),
      visits: num(totals?.visits),
      visitors: num(v?.days) > 0 ? num(v?.visitors) : null,
    };
  }

  async #series(q: SeriesQuery, range: ParsedRange) {
    const w = where(q.siteId, "pageview", range, q.filter);
    const len = q.interval === "hour" ? 13 : 10;
    const rows = await this.#sql.all(
      `SELECT substr(ts, 1, ${len}) AS b, COUNT(*) AS pageviews, COALESCE(SUM(entrance), 0) AS visits FROM analytics_events WHERE ${w.sql} GROUP BY b ORDER BY b`,
      w.params,
    );
    const suffix = q.interval === "hour" ? ":00:00Z" : "T00:00:00Z";
    return {
      interval: q.interval,
      points: fillSeries(
        range,
        q.interval,
        rows.map((r) => ({
          t: `${String(r.b)}${suffix}`,
          pageviews: num(r.pageviews),
          visits: num(r.visits),
        })),
      ),
    };
  }

  async #top(q: TopQuery, range: ParsedRange) {
    const w = where(q.siteId, "pageview", range, q.filter);
    const col = DIM_COLUMN[q.dimension];
    const rows = await this.#sql.all(
      `SELECT ${col} AS key, COUNT(*) AS pageviews, COALESCE(SUM(entrance), 0) AS visits FROM analytics_events WHERE ${w.sql} AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY pageviews DESC, key ASC LIMIT ?`,
      [...w.params, q.limit],
    );
    return {
      dimension: q.dimension,
      rows: rows.map((r) => ({
        key: String(r.key),
        pageviews: num(r.pageviews),
        visits: num(r.visits),
      })),
    };
  }

  /** All five metrics in one statement: a running weighted sum per metric gives the p75. */
  async #vitals(q: VitalsQuery, range: ParsedRange) {
    const w = where(q.siteId, "vitals", range, q.filter);
    const union = VITALS_METRICS.map(
      (m) => `SELECT '${m}' AS metric, ${m} AS x, w FROM base WHERE ${m} IS NOT NULL`,
    ).join(" UNION ALL ");
    const threshold = (which: "good" | "poor") =>
      `CASE c.metric ${VITALS_METRICS.map((m) => `WHEN '${m}' THEN ${VITALS_THRESHOLDS[m][which]}`).join(" ")} END`;
    const rows = await this.#sql.all(
      `WITH base AS (SELECT ${VITALS_METRICS.join(", ")}, sample_one_in AS w FROM analytics_events WHERE ${w.sql}),
m AS (${union}),
c AS (SELECT metric, x, w, SUM(w) OVER (PARTITION BY metric ORDER BY x ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum FROM m),
t AS (SELECT metric, SUM(w) AS total FROM m GROUP BY metric)
SELECT c.metric AS metric, t.total AS total,
  MIN(CASE WHEN c.cum * 4 >= t.total * 3 THEN c.x END) AS p75,
  SUM(CASE WHEN c.x <= ${threshold("good")} THEN c.w ELSE 0 END) AS good,
  SUM(CASE WHEN c.x > ${threshold("poor")} THEN c.w ELSE 0 END) AS poor
FROM c JOIN t ON t.metric = c.metric GROUP BY c.metric`,
      w.params,
    );
    const by = new Map(rows.map((r) => [String(r.metric), r]));
    return {
      metrics: VITALS_METRICS.map((metric) => {
        const row = by.get(metric);
        return vitalsMetric(
          metric,
          row?.p75 === null || row?.p75 === undefined ? null : num(row.p75),
          num(row?.total),
          num(row?.good),
          num(row?.poor),
        );
      }),
    };
  }

  async #renders(
    siteId: string,
    range: ParsedRange,
    report: RendersData["report"],
    limit: number,
  ): Promise<RendersData> {
    const w = where(siteId, "render", range);
    if (report === "errors") {
      const rows = await this.#sql.all(
        `SELECT path, status, ref_path AS refPath, SUM(sample_one_in) AS hits, MAX(ts) AS lastSeen FROM analytics_events WHERE ${w.sql} AND status >= 400 GROUP BY path, status, ref_path ORDER BY hits DESC, path ASC, status ASC, ref_path ASC LIMIT ?`,
        [...w.params, limit],
      );
      return {
        report,
        rows: rows.map(
          (r): RenderErrorRow => ({
            path: String(r.path),
            status: num(r.status),
            refPath: r.refPath === null || r.refPath === undefined ? null : String(r.refPath),
            hits: num(r.hits),
            lastSeen: parseBucket(r.lastSeen) ?? null,
          }),
        ),
      };
    }
    if (report === "redirects") {
      const rows = await this.#sql.all(
        `SELECT path, status, redirect_to AS redirectTo, node_id AS nodeId, SUM(sample_one_in) AS hits FROM analytics_events WHERE ${w.sql} AND status >= 300 AND status < 400 AND redirect_to IS NOT NULL GROUP BY path, status, redirect_to, node_id ORDER BY hits DESC, path ASC, status ASC, redirect_to ASC, node_id ASC LIMIT ?`,
        [...w.params, limit],
      );
      return {
        report,
        rows: rows.map(
          (r): RenderRedirectRow => ({
            path: String(r.path),
            status: num(r.status),
            redirectTo: String(r.redirectTo),
            nodeId: r.nodeId === null || r.nodeId === undefined ? null : String(r.nodeId),
            hits: num(r.hits),
          }),
        ),
      };
    }
    const rows = await this.#sql.all(
      `SELECT crawler, SUM(sample_one_in) AS hits FROM analytics_events WHERE ${w.sql} AND crawler IS NOT NULL GROUP BY crawler ORDER BY hits DESC, crawler ASC LIMIT ?`,
      [...w.params, limit],
    );
    return {
      report,
      rows: rows.map(
        (r): RenderCrawlerRow => ({
          crawler: String(r.crawler),
          class: crawlerClass(String(r.crawler)),
          hits: num(r.hits),
        }),
      ),
    };
  }
}
