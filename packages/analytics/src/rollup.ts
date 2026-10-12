/**
 * Daily rollups (RFC-0006 §7.5): the hourly job (admin Worker `scheduled`, or a timer in
 * `cloudhal studio` and the Node server) rolls one finished UTC site-day at a time from the raw
 * store (WAE or SQLite) into `analytics_daily`, and `RollupReader` answers the query model from
 * those rows for complete, rolled-up days.
 *
 * Writes are idempotent upserts in `batch()`es of at most 100 statements; the first batch marks
 * the run `running` and clears the day, and the `done` run row is written last, so a batch that
 * fails leaves the day "not done" and the next run repeats it. No interactive transaction and no
 * CAS guard are needed (AGENTS.md rule 4).
 */
import type { SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import { AnalyticsUnsupportedError } from "./errors.ts";
import {
  type AnalyticsData,
  type AnalyticsQuery,
  type AnalyticsReader,
  type AnalyticsResult,
  addDays,
  assertAnalyticsQuery,
  compareTopRows,
  DIMENSIONS,
  type Dimension,
  type Filter,
  fillSeries,
  num,
  type ParsedRange,
  type RenderCrawlerRow,
  type RenderErrorRow,
  type RenderRedirectRow,
  type RendersData,
  startOfUtcDay,
  utcDay,
  VITALS_METRICS,
  type VitalsMetric,
  vitalsMetric,
} from "./model.ts";
import type { AnalyticsDefaults } from "./settings.ts";
import {
  deleteSaltsBefore,
  getRollupRuns,
  listEffectiveSettings,
  pruneQueryBudget,
} from "./sql/state.ts";
import { crawlerClass } from "./ua.ts";

export const OTHER_KEY = "(other)";
/** Rows kept per day: content (node) and every other top-N dimension. */
export const ROLLUP_TOP_NODES = 1000;
export const ROLLUP_TOP = 100;
const VITALS_KEYS = ["all", "desktop", "mobile", "tablet"] as const;
const BATCH = 100;

export interface DailyRow {
  readonly dim: string;
  readonly key: string;
  readonly pageviews: number;
  readonly visits: number;
  readonly visitors: number | null;
  readonly hits: number | null;
  readonly value: number | null;
  readonly samples: number | null;
  readonly good: number | null;
  readonly poor: number | null;
}

function row(dim: string, key: string, values: Partial<DailyRow> = {}): DailyRow {
  return {
    dim,
    key,
    pageviews: values.pageviews ?? 0,
    visits: values.visits ?? 0,
    visitors: values.visitors ?? null,
    hits: values.hits ?? null,
    value: values.value ?? null,
    samples: values.samples ?? null,
    good: values.good ?? null,
    poor: values.poor ?? null,
  };
}

type ReportData<R extends RendersData["report"]> = Extract<RendersData, { report: R }>;

/** Reads one site-day from a raw store and turns it into rollup rows (about 18 queries). */
export async function collectDailyRows(
  reader: AnalyticsReader,
  siteId: string,
  day: string,
): Promise<DailyRow[]> {
  const from = new Date(`${day}T00:00:00Z`);
  const range = { from: from.toISOString(), to: addDays(from, 1).toISOString() };
  const rows: DailyRow[] = [];
  const total = (await reader.query({ kind: "summary", siteId, range })).data;
  rows.push(
    row("total", "all", {
      pageviews: total.pageviews,
      visits: total.visits,
      visitors: total.visitors,
    }),
  );
  // Written for every day (also 0), so a missing row means "rolled up before it was kept".
  if (total.renders !== null) rows.push(row("renders", "all", { hits: total.renders }));
  if (total.signals !== null) rows.push(row("signals", "all", { pageviews: total.signals }));
  for (const dimension of DIMENSIONS) {
    const limit = dimension === "node" ? ROLLUP_TOP_NODES : ROLLUP_TOP;
    const top = (await reader.query({ kind: "top", siteId, range, dimension, limit })).data;
    let pv = 0;
    let vi = 0;
    for (const r of top.rows) {
      if (r.key === OTHER_KEY) continue;
      rows.push(row(dimension, r.key, { pageviews: r.pageviews, visits: r.visits }));
      pv += r.pageviews;
      vi += r.visits;
    }
    const otherPv = total.pageviews - pv;
    const otherVi = total.visits - vi;
    if (otherPv > 0 || otherVi > 0)
      rows.push(
        row(dimension, OTHER_KEY, {
          pageviews: Math.max(0, otherPv),
          visits: Math.max(0, otherVi),
        }),
      );
  }
  const errors = (
    await reader.query({ kind: "renders", siteId, range, statuses: "errors", limit: ROLLUP_TOP })
  ).data as ReportData<"errors">;
  const byStatus = new Map<string, number>();
  for (const r of errors.rows) {
    const key = `${r.status} ${r.path}`;
    byStatus.set(key, (byStatus.get(key) ?? 0) + r.hits);
  }
  for (const [key, hits] of byStatus) rows.push(row("status", key, { hits }));
  const redirects = (
    await reader.query({
      kind: "renders",
      siteId,
      range,
      statuses: "redirects",
      limit: ROLLUP_TOP,
    })
  ).data as ReportData<"redirects">;
  for (const r of redirects.rows)
    rows.push(
      row("redirect", `${r.status} ${r.path} ${r.redirectTo} ${r.nodeId ?? "-"}`, {
        hits: r.hits,
      }),
    );
  const crawlers = (
    await reader.query({ kind: "renders", siteId, range, statuses: "crawlers", limit: ROLLUP_TOP })
  ).data as ReportData<"crawlers">;
  for (const r of crawlers.rows) rows.push(row("crawler", r.crawler, { hits: r.hits }));
  for (const key of VITALS_KEYS) {
    const filter: Filter | undefined = key === "all" ? undefined : { device: key };
    const vitals = (
      await reader.query({ kind: "vitals", siteId, range, ...(filter ? { filter } : {}) })
    ).data;
    for (const m of vitals.metrics) {
      if (m.samples <= 0) continue;
      rows.push(
        row(`vitals.${m.metric}`, key, {
          value: m.p75,
          samples: m.samples,
          good: m.good,
          poor: m.poor,
        }),
      );
    }
  }
  return rows;
}

const UPSERT = `INSERT INTO analytics_daily (site_id, day, dim, key, pageviews, visits, visitors, hits, value, samples, good, poor)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (site_id, day, dim, key) DO UPDATE SET pageviews = excluded.pageviews, visits = excluded.visits,
visitors = excluded.visitors, hits = excluded.hits, value = excluded.value, samples = excluded.samples,
good = excluded.good, poor = excluded.poor`;

const RUN = `INSERT INTO analytics_rollup_runs (site_id, day, state, rows, source, error, finished_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (site_id, day) DO UPDATE SET state = excluded.state, rows = excluded.rows,
source = excluded.source, error = excluded.error, finished_at = excluded.finished_at`;

/** Writes one site-day: run `running` + clear, upserts, run `done` last. */
export async function writeDailyRows(
  sql: SqlDriver,
  siteId: string,
  day: string,
  rows: readonly DailyRow[],
  options: { source: string; now: Date },
): Promise<void> {
  const statements: SqlStatement[] = [
    { sql: RUN, params: [siteId, day, "running", null, options.source, null, null] },
    { sql: "DELETE FROM analytics_daily WHERE site_id = ? AND day = ?", params: [siteId, day] },
    ...rows.map((r) => ({
      sql: UPSERT,
      params: [
        siteId,
        day,
        r.dim,
        r.key,
        r.pageviews,
        r.visits,
        r.visitors,
        r.hits,
        r.value,
        r.samples,
        r.good,
        r.poor,
      ] as SqlValue[],
    })),
    {
      sql: RUN,
      params: [siteId, day, "done", rows.length, options.source, null, options.now.toISOString()],
    },
  ];
  for (let i = 0; i < statements.length; i += BATCH)
    await sql.batch(statements.slice(i, i + BATCH));
}

export interface RunRollupsOptions {
  /** The raw store: `WaeReader` without a budget (the cron is exempt), or `SqlAnalytics`. */
  readonly reader: AnalyticsReader;
  /** The database holding the analytics tables (D1 or SQLite). */
  readonly sql: SqlDriver;
  readonly siteIds: readonly string[];
  readonly now: Date;
  /** Deployment defaults; only sites whose effective setting is on are rolled up. */
  readonly defaults?: AnalyticsDefaults;
  /** Days back from yesterday that are considered (default 7; a backfill passes up to 90). */
  readonly lookbackDays?: number;
  /** Site-days rolled per call (default 1, the cron's bounded work). */
  readonly maxSiteDays?: number;
  /** Also redo days already done (backfill). */
  readonly redo?: boolean;
  /** Recorded in the run row (default: the reader's kind). */
  readonly source?: string;
}

export interface RollupReport {
  readonly saltsDeleted: number;
  readonly done: readonly { siteId: string; day: string; rows: number }[];
  readonly failed: readonly { siteId: string; day: string; error: string }[];
  /** Site-days still waiting after this call. */
  readonly pending: number;
  /** Rollup rows removed by `rollupRetentionDays`. */
  readonly retained: number;
}

/**
 * One invocation of the job (§7.5): delete old salts, pick at most `maxSiteDays` site-days without a
 * `done` run (never-attempted before failed, oldest first), roll each up, then apply retention.
 * Failures are recorded on the run row and reported, never thrown.
 */
export async function runRollups(options: RunRollupsOptions): Promise<RollupReport> {
  const { sql, now } = options;
  const today = startOfUtcDay(now);
  const saltsDeleted = await deleteSaltsBefore(sql, utcDay(today));
  await pruneQueryBudget(sql, utcDay(addDays(today, -7)));
  const lookback = Math.max(1, Math.min(options.lookbackDays ?? 7, 92));
  const oldest = utcDay(addDays(today, -lookback));
  const yesterday = utcDay(addDays(today, -1));
  const settings = await listEffectiveSettings(sql, options.siteIds, options.defaults);
  const candidates: { siteId: string; day: string; failed: boolean }[] = [];
  for (const s of settings) {
    if (!s.enabled) continue;
    const runs = new Map(
      (await getRollupRuns(sql, s.siteId, oldest, yesterday)).map((r) => [r.day, r]),
    );
    // never roll up a day that retention would delete again
    const keepFrom =
      s.rollupRetentionDays === null ? "" : utcDay(addDays(today, -s.rollupRetentionDays));
    for (let d = lookback; d >= 1; d--) {
      const day = utcDay(addDays(today, -d));
      if (day < keepFrom) continue;
      const run = runs.get(day);
      if (run?.state === "done" && !options.redo) continue;
      candidates.push({ siteId: s.siteId, day, failed: run?.state === "failed" });
    }
  }
  candidates.sort(
    (a, b) =>
      Number(a.failed) - Number(b.failed) ||
      (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
      (a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0),
  );
  const take = candidates.slice(0, Math.max(0, options.maxSiteDays ?? 1));
  const source = options.source ?? options.reader.kind;
  const done: { siteId: string; day: string; rows: number }[] = [];
  const failed: { siteId: string; day: string; error: string }[] = [];
  for (const c of take) {
    try {
      const rows = await collectDailyRows(options.reader, c.siteId, c.day);
      await writeDailyRows(sql, c.siteId, c.day, rows, { source, now });
      done.push({ siteId: c.siteId, day: c.day, rows: rows.length });
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 500);
      failed.push({ siteId: c.siteId, day: c.day, error: message });
      await sql
        .run(RUN, [c.siteId, c.day, "failed", null, source, message, now.toISOString()])
        .catch(() => {});
    }
  }
  let retained = 0;
  for (const s of settings) {
    if (s.rollupRetentionDays === null) continue;
    const cutoff = utcDay(addDays(today, -s.rollupRetentionDays));
    const [daily] = await sql.batch([
      {
        sql: "DELETE FROM analytics_daily WHERE site_id = ? AND day < ?",
        params: [s.siteId, cutoff],
      },
      {
        sql: "DELETE FROM analytics_rollup_runs WHERE site_id = ? AND day < ?",
        params: [s.siteId, cutoff],
      },
    ]);
    retained += daily?.changes ?? 0;
  }
  return {
    saltsDeleted,
    done,
    failed,
    pending: candidates.length - done.length,
    retained,
  };
}

// ───────────────────────────── reading rollups ─────────────────────────────

/** Rollups cover two years by default (the API's maximum range). */
export const MAX_ROLLUP_DAYS = 731;

/** Complete UTC days inside a range: `[firstDay, endDay)` as `YYYY-MM-DD`. */
export function completeDays(range: ParsedRange): { from: string; to: string } {
  const start = startOfUtcDay(range.from);
  const first = start.getTime() === range.from.getTime() ? start : addDays(start, 1);
  const end = startOfUtcDay(range.to);
  return { from: utcDay(first), to: utcDay(end > first ? end : first) };
}

function singleFilter(filter: Filter | undefined): [Dimension, string] | undefined | false {
  const entries = Object.entries(filter ?? {}).filter(([, v]) => v !== undefined) as [
    keyof Filter,
    string,
  ][];
  if (entries.length === 0) return undefined;
  if (entries.length > 1) return false;
  const [k, v] = entries[0] as [keyof Filter, string];
  return [k === "node" ? "node" : k, v];
}

const str = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Answers the query model from `analytics_daily` for complete, rolled-up days (runs `done`) inside
 * the range. Supports: summary and daily series unfiltered or with one filter; top lists
 * unfiltered; vitals unfiltered or by device; every render report. Anything else raises
 * `AnalyticsUnsupportedError`, and the composite reader goes live.
 */
export class RollupReader implements AnalyticsReader {
  readonly kind = "rollups" as const;
  readonly #sql: SqlDriver;

  constructor(sql: SqlDriver) {
    this.#sql = sql;
  }

  /** Whether this reader can answer the query's shape. */
  supports(q: AnalyticsQuery): boolean {
    switch (q.kind) {
      case "summary":
        return singleFilter(q.filter) !== false;
      case "series":
        return q.interval === "day" && singleFilter(q.filter) !== false;
      case "top":
        return singleFilter(q.filter) === undefined;
      case "vitals": {
        const f = singleFilter(q.filter);
        return (
          f === undefined ||
          (f !== false && f[0] === "device" && VITALS_KEYS.includes(f[1] as "all"))
        );
      }
      case "renders":
        return true;
    }
  }

  /** Days in `[from, to)` (`YYYY-MM-DD`) whose rollup is done. */
  async doneDays(siteId: string, from: string, to: string): Promise<Set<string>> {
    const rows = await this.#sql.all<{ day: string }>(
      "SELECT day FROM analytics_rollup_runs WHERE site_id = ? AND state = 'done' AND day >= ? AND day < ?",
      [siteId, from, to],
    );
    return new Set(rows.map((r) => r.day));
  }

  #rows(siteId: string, days: { from: string; to: string }, dim: string, key?: string) {
    const params: SqlValue[] = [siteId, dim, days.from, days.to, siteId, days.from, days.to];
    let keySql = "";
    if (key !== undefined) {
      keySql = " AND key = ?";
      params.splice(2, 0, key);
    }
    return {
      where: `site_id = ? AND dim = ?${keySql} AND day >= ? AND day < ? AND day IN (SELECT day FROM analytics_rollup_runs WHERE site_id = ? AND state = 'done' AND day >= ? AND day < ?)`,
      params,
    };
  }

  async query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>> {
    const range = assertAnalyticsQuery(q, { maxDays: MAX_ROLLUP_DAYS });
    if (!this.supports(q)) throw new AnalyticsUnsupportedError("rollups cannot answer this query");
    const days = completeDays(range);
    const data = await this.#answer(q as AnalyticsQuery, range, days);
    return {
      data: data as AnalyticsData<Q>,
      source: "rollups",
      estimated: q.kind === "vitals",
    };
  }

  async #answer(
    q: AnalyticsQuery,
    range: ParsedRange,
    days: { from: string; to: string },
  ): Promise<unknown> {
    switch (q.kind) {
      case "summary":
      case "series": {
        const f = singleFilter(q.filter) || undefined;
        const w = f
          ? this.#rows(q.siteId, days, f[0], f[1])
          : this.#rows(q.siteId, days, "total", "all");
        if (q.kind === "summary") {
          const r = await this.#sql.get(
            `SELECT COALESCE(SUM(pageviews), 0) AS pageviews, COALESCE(SUM(visits), 0) AS visits, SUM(visitors) AS visitors, COUNT(visitors) AS vdays, COUNT(*) AS days FROM analytics_daily WHERE ${w.where}`,
            w.params,
          );
          return {
            pageviews: num(r?.pageviews),
            visits: num(r?.visits),
            visitors: num(r?.vdays) > 0 ? num(r?.visitors) : null,
            // kept on the total only; known when every rolled-up day has its row
            renders: f
              ? null
              : await this.#companion(q.siteId, days, "renders", "hits", num(r?.days)),
            signals: f
              ? null
              : await this.#companion(q.siteId, days, "signals", "pageviews", num(r?.days)),
          };
        }
        const rows = await this.#sql.all(
          `SELECT day, SUM(pageviews) AS pageviews, SUM(visits) AS visits FROM analytics_daily WHERE ${w.where} GROUP BY day`,
          w.params,
        );
        return {
          interval: "day",
          points: fillSeries(
            range,
            "day",
            rows.map((r) => ({
              t: `${String(r.day)}T00:00:00Z`,
              pageviews: num(r.pageviews),
              visits: num(r.visits),
            })),
          ),
        };
      }
      case "top": {
        const w = this.#rows(q.siteId, days, q.dimension);
        const rows = await this.#sql.all(
          `SELECT key, SUM(pageviews) AS pageviews, SUM(visits) AS visits FROM analytics_daily WHERE ${w.where} AND key != ? GROUP BY key ORDER BY pageviews DESC, key ASC LIMIT ?`,
          [...w.params, OTHER_KEY, q.limit],
        );
        return {
          dimension: q.dimension,
          rows: rows
            .map((r) => ({
              key: String(r.key),
              pageviews: num(r.pageviews),
              visits: num(r.visits),
            }))
            .sort(compareTopRows),
        };
      }
      case "vitals": {
        const f = singleFilter(q.filter);
        const key = f ? f[1] : "all";
        const metrics: VitalsMetric[] = [];
        for (const metric of VITALS_METRICS) {
          const w = this.#rows(q.siteId, days, `vitals.${metric}`, key);
          const r = await this.#sql.get(
            `SELECT COALESCE(SUM(samples), 0) AS samples, SUM(value * samples) AS weighted, SUM(good) AS good, SUM(poor) AS poor, COUNT(*) AS n, COUNT(good) AS ng FROM analytics_daily WHERE ${w.where} AND value IS NOT NULL`,
            w.params,
          );
          const samples = num(r?.samples);
          const complete = num(r?.n) === num(r?.ng);
          metrics.push(
            vitalsMetric(
              metric,
              samples > 0 ? num(r?.weighted) / samples : null,
              samples,
              complete ? num(r?.good) : null,
              complete ? num(r?.poor) : null,
            ),
          );
        }
        return { metrics };
      }
      case "renders":
        return this.#renders(q.siteId, days, q.statuses, q.limit);
    }
  }

  /**
   * A per-day companion of the `total` row (`renders`, `signals`), summed over the days; `null` unless every
   * rolled-up day (`days` total rows) has one — days rolled up before it was kept do not.
   */
  async #companion(
    siteId: string,
    days: { from: string; to: string },
    dim: string,
    column: "hits" | "pageviews",
    totalDays: number,
  ): Promise<number | null> {
    const w = this.#rows(siteId, days, dim, "all");
    const r = await this.#sql.get(
      `SELECT COALESCE(SUM(${column}), 0) AS n, COUNT(*) AS days FROM analytics_daily WHERE ${w.where}`,
      w.params,
    );
    return num(r?.days) === totalDays ? num(r?.n) : null;
  }

  async #renders(
    siteId: string,
    days: { from: string; to: string },
    report: RendersData["report"],
    limit: number,
  ): Promise<RendersData> {
    const dim = report === "errors" ? "status" : report === "redirects" ? "redirect" : "crawler";
    const w = this.#rows(siteId, days, dim);
    const rows = await this.#sql.all(
      `SELECT key, SUM(hits) AS hits FROM analytics_daily WHERE ${w.where} AND key != ? GROUP BY key`,
      [...w.params, OTHER_KEY],
    );
    if (report === "errors") {
      const out: RenderErrorRow[] = rows.flatMap((r) => {
        const [status, path] = String(r.key).split(" ");
        return path === undefined
          ? []
          : [{ path, status: num(status), refPath: null, hits: num(r.hits), lastSeen: null }];
      });
      out.sort((a, b) => b.hits - a.hits || str(a.path, b.path) || a.status - b.status);
      return { report, rows: out.slice(0, limit) };
    }
    if (report === "redirects") {
      const out: RenderRedirectRow[] = rows.flatMap((r) => {
        const [status, path, redirectTo, nodeId] = String(r.key).split(" ");
        return path === undefined || redirectTo === undefined
          ? []
          : [
              {
                path,
                status: num(status),
                redirectTo,
                nodeId: nodeId === undefined || nodeId === "-" ? null : nodeId,
                hits: num(r.hits),
              },
            ];
      });
      out.sort(
        (a, b) =>
          b.hits - a.hits ||
          str(a.path, b.path) ||
          a.status - b.status ||
          str(a.redirectTo, b.redirectTo) ||
          str(a.nodeId ?? "", b.nodeId ?? ""),
      );
      return { report, rows: out.slice(0, limit) };
    }
    const out: RenderCrawlerRow[] = rows.map((r) => ({
      crawler: String(r.key),
      class: crawlerClass(String(r.key)),
      hits: num(r.hits),
    }));
    out.sort((a, b) => b.hits - a.hits || str(a.crawler, b.crawler));
    return { report, rows: out.slice(0, limit) };
  }
}
