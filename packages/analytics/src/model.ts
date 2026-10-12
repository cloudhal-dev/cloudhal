/**
 * The analytics query model (RFC-0006 §7.2). Every Studio screen and MCP tool asks one of these
 * five queries; each store compiles them (SQLite, Workers Analytics Engine, rollups), so no screen
 * ever writes SQL. Everything a query may carry is an id, an enum, a bounded integer or an instant,
 * checked by `assertAnalyticsQuery` before any compiler sees it.
 */
import type { AnalyticsChannel, AnalyticsDevice, AnalyticsEvent } from "@cloudhal/core-contracts";
import { AnalyticsQueryError } from "./errors.ts";

export type Id = string;

/** ISO instants (or `YYYY-MM-DD` dates), UTC, half-open: `[from, to)`. */
export interface Range {
  readonly from: string;
  readonly to: string;
}

export interface Filter {
  readonly node?: Id;
  readonly channel?: AnalyticsChannel;
  readonly country?: string;
  readonly device?: AnalyticsDevice;
}

export const DIMENSIONS = [
  "node",
  "refHost",
  "channel",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "country",
  "device",
  "browser",
  "os",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const RENDER_REPORTS = ["errors", "redirects", "crawlers"] as const;
export type RenderReport = (typeof RENDER_REPORTS)[number];

export interface SummaryQuery {
  readonly kind: "summary";
  readonly siteId: Id;
  readonly range: Range;
  readonly filter?: Filter;
}
export interface SeriesQuery {
  readonly kind: "series";
  readonly siteId: Id;
  readonly range: Range;
  readonly interval: "hour" | "day";
  readonly filter?: Filter;
}
export interface TopQuery {
  readonly kind: "top";
  readonly siteId: Id;
  readonly range: Range;
  readonly dimension: Dimension;
  readonly limit: number;
  readonly filter?: Filter;
}
export interface VitalsQuery {
  readonly kind: "vitals";
  readonly siteId: Id;
  readonly range: Range;
  /** `channel` is refused: vitals events carry no channel. */
  readonly filter?: Filter;
}
export interface RendersQuery {
  readonly kind: "renders";
  readonly siteId: Id;
  readonly range: Range;
  readonly statuses: RenderReport;
  readonly limit: number;
}

export type AnalyticsQuery = SummaryQuery | SeriesQuery | TopQuery | VitalsQuery | RendersQuery;

// ───────────────────────────── results ─────────────────────────────

export interface SummaryData {
  readonly pageviews: number;
  readonly visits: number;
  /** Daily unique visitors, summed over the range's days; `null` when no view carried a hash. */
  readonly visitors: number | null;
  /**
   * Pages the site Worker rendered for people: render events with status `200` (published HTML,
   * which is a cache miss by definition), no known crawler and not a bot, weighted by
   * `sampleOneIn`; the node, country and device filters apply. `null` when unknown: under a
   * `channel` filter (render events carry no channel), and from rollups that do not keep it
   * (filtered summaries, and days rolled up before it was kept). Feeds `estimatedCacheHitRatio`.
   */
  readonly renders: number | null;
}

/**
 * The estimated cache-hit ratio (RFC-0006 §5.4): `1 − renders ÷ page views`, clamped to [0, 1] and
 * rounded to three decimals. An **estimate**: page views come from the script (visitors without
 * JavaScript, or with it blocked, are not counted) while renders are counted by the Worker, and
 * only a zone sees real edge cache statistics. `null` without page views or without a render count.
 * Meaningful only where an edge cache sits in front of the Worker (Cloudflare, `store: "wae"`).
 */
export function estimatedCacheHitRatio(
  summary: Pick<SummaryData, "pageviews" | "renders">,
): number | null {
  if (summary.renders === null || summary.pageviews <= 0) return null;
  const r = 1 - summary.renders / summary.pageviews;
  return Math.round(Math.min(1, Math.max(0, r)) * 1000) / 1000;
}

export interface SeriesPoint {
  /** Bucket start, `YYYY-MM-DDTHH:MM:SSZ` (UTC). Every bucket of the range is present. */
  readonly t: string;
  readonly pageviews: number;
  readonly visits: number;
}
export interface SeriesData {
  readonly interval: "hour" | "day";
  readonly points: readonly SeriesPoint[];
}

export interface TopRow {
  readonly key: string;
  readonly pageviews: number;
  readonly visits: number;
}
export interface TopData {
  readonly dimension: Dimension;
  /** Ordered by page views (descending), then key; rows without a value are left out. */
  readonly rows: readonly TopRow[];
}

export const VITALS_METRICS = ["lcp", "inp", "cls", "ttfb", "fcp"] as const;
export type VitalsMetricName = (typeof VITALS_METRICS)[number];

/** web.dev thresholds: good ≤ `good`, poor > `poor` (ms; CLS unitless). */
export const VITALS_THRESHOLDS: Readonly<Record<VitalsMetricName, { good: number; poor: number }>> =
  {
    lcp: { good: 2500, poor: 4000 },
    inp: { good: 200, poor: 500 },
    cls: { good: 0.1, poor: 0.25 },
    ttfb: { good: 800, poor: 1800 },
    fcp: { good: 1800, poor: 3000 },
  };

export interface VitalsMetric {
  readonly metric: VitalsMetricName;
  /** Weighted 75th percentile (nearest rank); `null` without samples. */
  readonly p75: number | null;
  /** Page views represented (each sample weighs its `sampleOneIn`). */
  readonly samples: number;
  /** Weighted counts per rating; `null` when the source does not keep them. */
  readonly good: number | null;
  readonly needsImprovement: number | null;
  readonly poor: number | null;
}
export interface VitalsData {
  readonly metrics: readonly VitalsMetric[];
}

export interface RenderErrorRow {
  /** Requested path as received: percent-encoded ASCII, visitor-controlled, shown as plain text. */
  readonly path: string;
  readonly status: number;
  /** Same-site page that linked here, when known. */
  readonly refPath: string | null;
  readonly hits: number;
  /** Latest hit; `null` from rollups. */
  readonly lastSeen: string | null;
}
export interface RenderRedirectRow {
  readonly path: string;
  readonly status: number;
  readonly redirectTo: string;
  readonly nodeId: string | null;
  readonly hits: number;
}
export type CrawlerClass = "search" | "ai" | "social" | "monitor" | "other";
export interface RenderCrawlerRow {
  readonly crawler: string;
  readonly class: CrawlerClass;
  readonly hits: number;
}
export type RendersData =
  | { readonly report: "errors"; readonly rows: readonly RenderErrorRow[] }
  | { readonly report: "redirects"; readonly rows: readonly RenderRedirectRow[] }
  | { readonly report: "crawlers"; readonly rows: readonly RenderCrawlerRow[] };

type RendersDataFor<R extends RenderReport> = Extract<RendersData, { report: R }>;

export type AnalyticsData<Q extends AnalyticsQuery> = Q extends SummaryQuery
  ? SummaryData
  : Q extends SeriesQuery
    ? SeriesData
    : Q extends TopQuery
      ? TopData
      : Q extends VitalsQuery
        ? VitalsData
        : Q extends RendersQuery
          ? RendersDataFor<Q["statuses"]>
          : never;

export type AnalyticsSource = "live" | "rollups" | "mixed";

export interface AnalyticsResult<Q extends AnalyticsQuery = AnalyticsQuery> {
  readonly data: AnalyticsData<Q>;
  readonly source: AnalyticsSource;
  /** Approximate: sampled or distinct counts, approximate quantiles, or merged daily percentiles. */
  readonly estimated: boolean;
  /** Part of the range could not be read (budget spent, or older than live data and not rolled up). */
  readonly partial?: boolean;
}

// ───────────────────────────── stores ─────────────────────────────

export interface AnalyticsWriter {
  /** Never throws into the caller; returns at once (WAE) or after queueing one insert (SQL). */
  write(event: AnalyticsEvent): void;
}

export interface AnalyticsReader {
  readonly kind: "wae" | "sql" | "memory" | "rollups" | "composite";
  /** Runs one query of the model; `source` says where the answer came from. */
  query<Q extends AnalyticsQuery>(q: Q): Promise<AnalyticsResult<Q>>;
}

/** A store that both records and answers (SQLite/D1 and the in-memory fake). */
export interface AnalyticsStore extends AnalyticsWriter, AnalyticsReader {
  readonly kind: "wae" | "sql" | "memory";
}

/** The daily budget of uncached live queries (RFC-0006 §7.7). */
export interface QueryBudget {
  /** Spends one query; `false` once the day's budget is spent. */
  take(now: Date): Promise<boolean>;
}

// ───────────────────────────── validation ─────────────────────────────

export const ID_RE = /^[a-z]+_[A-Za-z0-9]{6,32}$/;
export const COUNTRY_RE = /^[A-Z][A-Z0-9]$/;
export const CHANNELS: readonly AnalyticsChannel[] = [
  "direct",
  "internal",
  "search",
  "social",
  "ai",
  "email",
  "paid",
  "referral",
];
export const DEVICES: readonly AnalyticsDevice[] = [
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
];

/** Live data reaches back this far (WAE keeps 3 months); a raw-store query spans at most this. */
export const MAX_LIVE_DAYS = 92;
/** Hourly series cover at most a week (168 buckets). */
export const MAX_HOURLY_DAYS = 7;
/** Rows per top list or render report. */
export const MAX_LIMIT = 1000;

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parses a range bound: an ISO instant with zone, or a `YYYY-MM-DD` date (UTC midnight). */
export function parseInstant(value: unknown, label = "instant"): Date {
  if (typeof value !== "string" || !(DATE_RE.test(value) || INSTANT_RE.test(value)))
    throw new AnalyticsQueryError(`${label} must be an ISO date or instant in UTC`);
  const d = new Date(DATE_RE.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) throw new AnalyticsQueryError(`${label} is not a valid date`);
  return d;
}

export interface ParsedRange {
  readonly from: Date;
  readonly to: Date;
}

export function parseRange(range: unknown, maxDays = MAX_LIVE_DAYS): ParsedRange {
  if (!range || typeof range !== "object") throw new AnalyticsQueryError("range is required");
  const r = range as Record<string, unknown>;
  const from = parseInstant(r.from, "range.from");
  const to = parseInstant(r.to, "range.to");
  if (from.getTime() >= to.getTime())
    throw new AnalyticsQueryError("range.from must be before range.to");
  if (to.getTime() - from.getTime() > maxDays * DAY_MS)
    throw new AnalyticsQueryError(`range spans more than ${maxDays} days`);
  return { from, to };
}

function assertLimit(limit: unknown): void {
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIMIT)
    throw new AnalyticsQueryError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
}

export function assertFilter(filter: unknown, kind: AnalyticsQuery["kind"]): void {
  if (filter === undefined) return;
  if (!filter || typeof filter !== "object" || Array.isArray(filter))
    throw new AnalyticsQueryError("filter must be an object");
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    switch (key) {
      case "node":
        if (typeof value !== "string" || !ID_RE.test(value))
          throw new AnalyticsQueryError("filter.node must be an id");
        break;
      case "channel":
        if (kind === "vitals")
          throw new AnalyticsQueryError("vitals cannot be filtered by channel");
        if (!CHANNELS.includes(value as AnalyticsChannel))
          throw new AnalyticsQueryError("filter.channel is not a channel");
        break;
      case "country":
        if (typeof value !== "string" || !COUNTRY_RE.test(value))
          throw new AnalyticsQueryError("filter.country must be an ISO 3166-1 alpha-2 code");
        break;
      case "device":
        if (!DEVICES.includes(value as AnalyticsDevice))
          throw new AnalyticsQueryError("filter.device is not a device class");
        break;
      default:
        throw new AnalyticsQueryError(`unknown filter "${key.slice(0, 32)}"`);
    }
  }
}

/**
 * Checks a query against the model: ids by the `Id` pattern, enums by the contract, ranges parse and
 * stay within `maxDays`, limits are bounded. Returns the parsed range. Throws `AnalyticsQueryError`.
 */
export function assertAnalyticsQuery(q: unknown, options: { maxDays?: number } = {}): ParsedRange {
  if (!q || typeof q !== "object") throw new AnalyticsQueryError("query must be an object");
  const query = q as AnalyticsQuery;
  if (typeof query.siteId !== "string" || !ID_RE.test(query.siteId))
    throw new AnalyticsQueryError("siteId must be an id");
  const range = parseRange(query.range, options.maxDays ?? MAX_LIVE_DAYS);
  switch (query.kind) {
    case "summary":
      assertFilter(query.filter, query.kind);
      break;
    case "series":
      if (query.interval !== "hour" && query.interval !== "day")
        throw new AnalyticsQueryError("interval must be hour or day");
      if (
        query.interval === "hour" &&
        range.to.getTime() - range.from.getTime() > MAX_HOURLY_DAYS * DAY_MS
      )
        throw new AnalyticsQueryError(`hourly series span at most ${MAX_HOURLY_DAYS} days`);
      assertFilter(query.filter, query.kind);
      break;
    case "top":
      if (!DIMENSIONS.includes(query.dimension))
        throw new AnalyticsQueryError("dimension is not a known dimension");
      assertLimit(query.limit);
      assertFilter(query.filter, query.kind);
      break;
    case "vitals":
      assertFilter(query.filter, query.kind);
      break;
    case "renders":
      if (!RENDER_REPORTS.includes(query.statuses))
        throw new AnalyticsQueryError("statuses must be errors, redirects or crawlers");
      assertLimit(query.limit);
      break;
    default:
      throw new AnalyticsQueryError("unknown query kind");
  }
  return range;
}

/** Stable key for a query (cache keys): sorted fields, range normalised to instants. */
export function queryKey(q: AnalyticsQuery, range: ParsedRange): string {
  const sorted = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, sorted(x)]),
        )
      : v;
  return JSON.stringify(
    sorted({ ...q, range: { from: range.from.toISOString(), to: range.to.toISOString() } }),
  );
}

// ───────────────────────────── time ─────────────────────────────

/** `YYYY-MM-DD` of a UTC day. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** `YYYY-MM-DDTHH:MM:SSZ`, with milliseconds only when they are not zero. */
export function isoInstant(d: Date): string {
  const s = d.toISOString();
  return s.endsWith(".000Z") ? `${s.slice(0, 19)}Z` : s;
}

/** Bucket starts covering `[from, to)`: the first is `from` floored to the interval. */
export function bucketStarts(range: ParsedRange, interval: "hour" | "day"): Date[] {
  const step = interval === "hour" ? 3_600_000 : DAY_MS;
  const out: Date[] = [];
  let t = Math.floor(range.from.getTime() / step) * step;
  while (t < range.to.getTime()) {
    out.push(new Date(t));
    t += step;
  }
  return out;
}

/** Parses a bucket value returned by a store (`YYYY-MM-DD HH:MM:SS`, ISO, or a date) to an instant. */
export function parseBucket(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return isoInstant(new Date(value));
  const s = String(value).trim();
  let d: Date;
  if (DATE_RE.test(s)) d = new Date(`${s}T00:00:00Z`);
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s))
    d = new Date(`${s.replace(" ", "T")}Z`);
  else d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : isoInstant(d);
}

/** Every bucket of the range, zero where the store had no row. */
export function fillSeries(
  range: ParsedRange,
  interval: "hour" | "day",
  rows: readonly { t: string; pageviews: number; visits: number }[],
): SeriesPoint[] {
  const by = new Map<string, { pageviews: number; visits: number }>();
  for (const r of rows) {
    const prev = by.get(r.t);
    by.set(r.t, {
      pageviews: (prev?.pageviews ?? 0) + r.pageviews,
      visits: (prev?.visits ?? 0) + r.visits,
    });
  }
  return bucketStarts(range, interval).map((d) => {
    const t = isoInstant(d);
    const v = by.get(t);
    return { t, pageviews: v?.pageviews ?? 0, visits: v?.visits ?? 0 };
  });
}

/** Coerces a numeric column (some stores answer 64-bit integers as strings). */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Orders top rows: page views descending, then key ascending (code-unit order, as SQLite). */
export function compareTopRows(a: TopRow, b: TopRow): number {
  if (a.pageviews !== b.pageviews) return b.pageviews - a.pageviews;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Ratings and p75 from weighted samples, nearest rank: the smallest value whose cumulative weight
 * reaches three quarters of the total. Shared by the in-memory store and the rollup merge. */
export function weightedP75(samples: readonly { x: number; w: number }[]): number | null {
  const sorted = [...samples].filter((s) => s.w > 0).sort((a, b) => a.x - b.x);
  const total = sorted.reduce((n, s) => n + s.w, 0);
  if (total === 0) return null;
  let cum = 0;
  for (const s of sorted) {
    cum += s.w;
    if (cum * 4 >= total * 3) return s.x;
  }
  return sorted.at(-1)?.x ?? null;
}

export function vitalsMetric(
  metric: VitalsMetricName,
  p75: number | null,
  samples: number,
  good: number | null,
  poor: number | null,
): VitalsMetric {
  return {
    metric,
    p75: samples > 0 ? p75 : null,
    samples,
    good,
    needsImprovement: good === null || poor === null ? null : Math.max(0, samples - good - poor),
    poor,
  };
}
