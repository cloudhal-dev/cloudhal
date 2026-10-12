/**
 * The query model compiled to the Analytics SQL API dialect (RFC-0006 §7.3), as read through the
 * `AnalyticsSQLBinding`: table `events.analyticsEngine."<dataset>"`, columns `index1`, `timestamp`,
 * `blob1…20`, `double1…20` (and `"sampleInterval"`, which Cloudhal never uses).
 *
 * Rules:
 * - Bounded: every statement has `index1 = <siteId>`, `blob1 = <kind>` and a time range ≤ 92 days.
 * - No manual weighting: the API already weights `COUNT`, `SUM`, `countIf` and `sumIf` by the
 *   sample interval; Cloudhal adds only its own `sampleOneIn` (`double9`) for vitals and renders.
 * - Exact `MIN`/`MAX` are refused on sampled datasets: `APPROX_MAX` is used.
 * - Literals are inlined only after validation (ids by the `Id` pattern, enums, ISO instants
 *   re-formatted from a parsed `Date`, the dataset by `^[a-z0-9_]+$`); nothing a visitor wrote is
 *   ever compiled into SQL.
 */
import { AnalyticsQueryError } from "../errors.ts";
import {
  type AnalyticsQuery,
  assertAnalyticsQuery,
  COUNTRY_RE,
  type Dimension,
  type Filter,
  ID_RE,
  isoInstant,
  type ParsedRange,
  VITALS_METRICS,
  VITALS_THRESHOLDS,
  type VitalsMetricName,
} from "../model.ts";
import { BLOB, DOUBLE } from "./layout.ts";

export const DATASET_RE = /^[a-z0-9_]+$/;

/**
 * The column of each dimension. Dimension columns are selected **without an alias**: the Analytics
 * SQL API answers "column `<alias>` not found" when a grouped column is aliased and then used in
 * ORDER BY (verified live 2026-10-12), so rows come back keyed by the column name itself.
 */
export const DIM_SLOT: Record<Dimension, string> = {
  node: `blob${BLOB.nodeId}`,
  refHost: `blob${BLOB.refHost}`,
  channel: `blob${BLOB.channel}`,
  utmSource: `blob${BLOB.utmSource}`,
  utmMedium: `blob${BLOB.utmMedium}`,
  utmCampaign: `blob${BLOB.utmCampaign}`,
  country: `blob${BLOB.country}`,
  device: `blob${BLOB.device}`,
  browser: `blob${BLOB.browser}`,
  os: `blob${BLOB.os}`,
};

const VITALS_SLOT: Record<VitalsMetricName, number> = {
  lcp: DOUBLE.lcp,
  inp: DOUBLE.inp,
  cls: DOUBLE.cls,
  ttfb: DOUBLE.ttfb,
  fcp: DOUBLE.fcp,
};

/** Thresholds in slot units (CLS is stored × 1000). */
function slotThreshold(metric: VitalsMetricName, which: "good" | "poor"): number {
  const v = VITALS_THRESHOLDS[metric][which];
  return metric === "cls" ? Math.round(v * 1000) : v;
}

const SAFE_LITERAL = /^[A-Za-z0-9_.:\-+]*$/;

/** A string literal, only for values already validated; refuses anything with a quote. */
function lit(value: string): string {
  if (!SAFE_LITERAL.test(value)) throw new AnalyticsQueryError("unsafe literal");
  return `'${value}'`;
}

export interface WaeCompileOptions {
  readonly dataset: string;
}

export interface CompiledWaeQuery {
  /** Main statement. */
  readonly query: string;
  /** Summary only: daily distinct visitors, run when the main statement found hashed views. */
  readonly visitors?: string;
  readonly range: ParsedRange;
}

function table(dataset: string): string {
  if (!DATASET_RE.test(dataset)) throw new AnalyticsQueryError("dataset must match ^[a-z0-9_]+$");
  return `events.analyticsEngine."${dataset}"`;
}

function where(siteId: string, kind: string, range: ParsedRange, filter?: Filter): string[] {
  if (!ID_RE.test(siteId)) throw new AnalyticsQueryError("siteId must be an id");
  const lines = [
    `WHERE index1 = ${lit(siteId)} AND blob${BLOB.kind} = ${lit(kind)}`,
    `  AND timestamp >= ${lit(isoInstant(range.from))} AND timestamp < ${lit(isoInstant(range.to))}`,
  ];
  if (filter?.node !== undefined) lines.push(`  AND blob${BLOB.nodeId} = ${lit(filter.node)}`);
  if (filter?.channel !== undefined)
    lines.push(`  AND blob${BLOB.channel} = ${lit(filter.channel)}`);
  if (filter?.country !== undefined) {
    if (!COUNTRY_RE.test(filter.country)) throw new AnalyticsQueryError("bad country");
    lines.push(`  AND blob${BLOB.country} = ${lit(filter.country)}`);
  }
  if (filter?.device !== undefined) lines.push(`  AND blob${BLOB.device} = ${lit(filter.device)}`);
  return lines;
}

/** Compiles one query of the model; throws `AnalyticsQueryError` for anything out of bounds. */
export function compileWae(q: AnalyticsQuery, options: WaeCompileOptions): CompiledWaeQuery {
  const range = assertAnalyticsQuery(q);
  const from = `FROM ${table(options.dataset)}`;
  const visits = `SUM(double${DOUBLE.entrance}) AS visits`;
  switch (q.kind) {
    case "summary": {
      const w = where(q.siteId, "pageview", range, q.filter);
      return {
        range,
        query: [
          `SELECT COUNT(*) AS pageviews, ${visits}, countIf(blob${BLOB.visitor} != '') AS hashed`,
          from,
          ...w,
        ].join("\n"),
        visitors: [
          `SELECT toStartOfDay(timestamp) AS day, COUNT(DISTINCT blob${BLOB.visitor}) AS visitors`,
          from,
          ...w,
          `  AND blob${BLOB.visitor} != ''`,
          "GROUP BY day",
          "ORDER BY day",
        ].join("\n"),
      };
    }
    case "series": {
      const fn = q.interval === "hour" ? "toStartOfHour" : "toStartOfDay";
      return {
        range,
        query: [
          `SELECT ${fn}(timestamp) AS t, COUNT(*) AS pageviews, ${visits}`,
          from,
          ...where(q.siteId, "pageview", range, q.filter),
          "GROUP BY t",
          "ORDER BY t",
        ].join("\n"),
      };
    }
    case "top": {
      const col = DIM_SLOT[q.dimension];
      return {
        range,
        query: [
          `SELECT ${col}, COUNT(*) AS pageviews, ${visits}`,
          from,
          ...where(q.siteId, "pageview", range, q.filter),
          `  AND ${col} != ''`,
          `GROUP BY ${col}`,
          `ORDER BY pageviews DESC, ${col} ASC`,
          `LIMIT ${q.limit}`,
        ].join("\n"),
      };
    }
    case "vitals": {
      const w9 = `double${DOUBLE.sampleOneIn}`;
      const cols = VITALS_METRICS.flatMap((metric) => {
        const x = `double${VITALS_SLOT[metric]}`;
        return [
          // The weight must be an integer: a Float64 weight next to the literal 0 is a type error there.
          `  quantileWeighted(0.75, ${x}, if(${x} >= 0, toUInt32(${w9}), 0)) AS ${metric}_p75`,
          `  sumIf(${w9}, ${x} >= 0) AS ${metric}_samples`,
          `  sumIf(${w9}, ${x} >= 0 AND ${x} <= ${slotThreshold(metric, "good")}) AS ${metric}_good`,
          `  sumIf(${w9}, ${x} > ${slotThreshold(metric, "poor")}) AS ${metric}_poor`,
        ];
      });
      return {
        range,
        query: [
          "SELECT",
          cols.join(",\n"),
          from,
          ...where(q.siteId, "vitals", range, q.filter),
        ].join("\n"),
      };
    }
    case "renders": {
      const w = where(q.siteId, "render", range);
      const status = `double${DOUBLE.status}`;
      const hits = `SUM(double${DOUBLE.sampleOneIn}) AS hits`;
      if (q.statuses === "errors")
        return {
          range,
          query: [
            `SELECT blob${BLOB.path}, ${status}, blob${BLOB.refPath}, ${hits}, APPROX_MAX(timestamp) AS lastSeen`,
            from,
            ...w,
            `  AND ${status} >= 400`,
            `GROUP BY blob${BLOB.path}, ${status}, blob${BLOB.refPath}`,
            `ORDER BY hits DESC, blob${BLOB.path} ASC, ${status} ASC, blob${BLOB.refPath} ASC`,
            `LIMIT ${q.limit}`,
          ].join("\n"),
        };
      if (q.statuses === "redirects")
        return {
          range,
          query: [
            `SELECT blob${BLOB.path}, ${status}, blob${BLOB.redirectTo}, blob${BLOB.nodeId}, ${hits}`,
            from,
            ...w,
            `  AND ${status} >= 300 AND ${status} < 400 AND blob${BLOB.redirectTo} != ''`,
            `GROUP BY blob${BLOB.path}, ${status}, blob${BLOB.redirectTo}, blob${BLOB.nodeId}`,
            `ORDER BY hits DESC, blob${BLOB.path} ASC, ${status} ASC, blob${BLOB.redirectTo} ASC, blob${BLOB.nodeId} ASC`,
            `LIMIT ${q.limit}`,
          ].join("\n"),
        };
      return {
        range,
        query: [
          `SELECT blob${BLOB.crawler}, ${hits}`,
          from,
          ...w,
          `  AND blob${BLOB.crawler} != ''`,
          `GROUP BY blob${BLOB.crawler}`,
          `ORDER BY hits DESC, blob${BLOB.crawler} ASC`,
          `LIMIT ${q.limit}`,
        ].join("\n"),
      };
    }
  }
}
