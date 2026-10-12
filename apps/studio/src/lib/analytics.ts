/**
 * Pure helpers for the analytics screens (RFC-0006 §10, DESIGN.md §2v): the range and filter in the
 * URL, the query each range sends, the Core Web Vitals ratings and their units, and the state the
 * screen is in. No React and no words of their own beyond
 * what the catalogs give them, so they are tested directly.
 */
import {
  type AnalyticsRange,
  type AnalyticsRangePreset,
  isAnalyticsRangePreset,
  isValidCustomRange,
} from "@cloudhal/ui";
import type {
  AnalyticsChannel,
  AnalyticsDevice,
  AnalyticsFeature,
  AnalyticsNode,
  AnalyticsRangeQuery,
  AnalyticsStatus,
  AnalyticsVitalsMetric,
} from "./api.ts";

// ---- the URL ------------------------------------------------------------------------------------

/** `/sites/:id/analytics?range=30d` or `?from=2026-09-01&to=2026-10-01`, `&compare=0`, `&filter=…`. */
export interface AnalyticsSearch {
  range?: AnalyticsRangePreset;
  from?: string;
  to?: string;
  /** `0` turns the comparison with the previous period off (on by default). */
  compare?: "0";
  /** One of `node:<id>`, `channel:<channel>`, `country:<ISO2>`, `device:<device>`. */
  filter?: string;
}

/** The default range of the screen and the API (§9.2 implementation notes). */
export const DEFAULT_PRESET: AnalyticsRangePreset = "30d";

const CHANNELS: readonly AnalyticsChannel[] = [
  "direct",
  "internal",
  "search",
  "social",
  "ai",
  "email",
  "paid",
  "referral",
];
const DEVICES: readonly AnalyticsDevice[] = ["desktop", "mobile", "tablet", "bot", "unknown"];
const ID = /^[a-z]+_[A-Za-z0-9]{6,40}$/;

export type AnalyticsFilter =
  | { kind: "node"; value: string }
  | { kind: "channel"; value: AnalyticsChannel }
  | { kind: "country"; value: string }
  | { kind: "device"; value: AnalyticsDevice };

/** Reads a `filter` the API accepts (one of four kinds); anything else is no filter. */
export function parseAnalyticsFilter(raw: unknown): AnalyticsFilter | undefined {
  if (typeof raw !== "string") return undefined;
  const i = raw.indexOf(":");
  if (i < 1) return undefined;
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  if (kind === "node" && ID.test(value)) return { kind, value };
  if (kind === "channel" && (CHANNELS as readonly string[]).includes(value))
    return { kind, value: value as AnalyticsChannel };
  if (kind === "country" && /^[A-Z][A-Z0-9]$/.test(value)) return { kind, value };
  if (kind === "device" && (DEVICES as readonly string[]).includes(value))
    return { kind, value: value as AnalyticsDevice };
  return undefined;
}

export const filterParam = (f: AnalyticsFilter) => `${f.kind}:${f.value}`;

/** The router's `validateSearch`: keeps only what the screen understands. */
export function validateAnalyticsSearch(search: Record<string, unknown>): AnalyticsSearch {
  const out: AnalyticsSearch = {};
  const { from, to } = search;
  if (typeof from === "string" && typeof to === "string" && isValidCustomRange(from, to)) {
    out.from = from;
    out.to = to;
  } else if (isAnalyticsRangePreset(search.range)) {
    out.range = search.range;
  }
  if (search.compare === "0" || search.compare === 0) out.compare = "0";
  const filter = parseAnalyticsFilter(search.filter);
  if (filter) out.filter = filterParam(filter);
  return out;
}

export function rangeFromSearch(search: AnalyticsSearch): AnalyticsRange {
  if (search.from && search.to) return { from: search.from, to: search.to };
  return { preset: search.range ?? DEFAULT_PRESET };
}

/** The search for a range: the default preset is left out, so the plain URL means 30 days. */
export function searchForRange(
  range: AnalyticsRange,
): Pick<AnalyticsSearch, "range" | "from" | "to"> {
  if ("preset" in range) return range.preset === DEFAULT_PRESET ? {} : { range: range.preset };
  return { from: range.from, to: range.to };
}

/** What a range sends to the API: a preset by name (the server's clock), custom days as `from`/`to`. */
export function rangeQuery(range: AnalyticsRange, filter?: AnalyticsFilter): AnalyticsRangeQuery {
  const base: AnalyticsRangeQuery =
    "preset" in range ? { range: range.preset } : { from: range.from, to: range.to };
  return filter ? { ...base, filter: filterParam(filter) } : base;
}

/** A stable cache key for a range (presets move with the clock; the server resolves them). */
export const rangeKey = (range: AnalyticsRange) =>
  "preset" in range ? range.preset : `${range.from}/${range.to}`;

// ---- what the screen shows ----------------------------------------------------------------------

/**
 * The deployment and the site, as far as analytics go (RFC-0006 §10.1 banners and states):
 * - `deploymentOff`: nothing is recorded on this deployment (`store: "none"`, or switched off);
 * - `cantRead`: visits are recorded, but Studio cannot read live data yet (A1, `reader: "none"`);
 * - `siteOff`: the deployment records, this site does not;
 * - `budgetSpent`: today's live query budget is spent (complete days still show).
 */
export interface AnalyticsSituation {
  deploymentOff: boolean;
  cantRead: boolean;
  siteOff: boolean;
  budgetSpent: boolean;
}

export function analyticsSituation(
  feature: AnalyticsFeature | undefined,
  status: AnalyticsStatus | undefined,
): AnalyticsSituation {
  const f = status?.feature ?? feature;
  const deploymentOff = !f || f.store === "none" || !f.enabled;
  return {
    deploymentOff,
    cantRead: !deploymentOff && f?.reader === "none",
    siteOff: !deploymentOff && status?.settings.enabled === false,
    budgetSpent: status?.budget?.spent === true,
  };
}

/** The editor that edits a node, for links from top content and the errors table. */
export function editorHref(siteId: string, node: AnalyticsNode): string | undefined {
  if (!node.exists) return undefined;
  const id = encodeURIComponent(node.nodeId);
  if (node.kind === "entry") return `/sites/${siteId}/articles/${id}`;
  if (node.kind === "page") return `/sites/${siteId}/pages/${id}`;
  if (node.kind === "archive") return `/sites/${siteId}/taxonomy/${id}`;
  return undefined;
}

export function analyticsHref(siteId: string, filter?: AnalyticsFilter): string {
  const base = `/sites/${siteId}/analytics`;
  return filter ? `${base}?filter=${encodeURIComponent(filterParam(filter))}` : base;
}

// ---- Core Web Vitals ----------------------------------------------------------------------------

/** The three Core Web Vitals the screen shows, in web.dev's order. */
export const CORE_VITALS = ["lcp", "inp", "cls"] as const;
export type CoreVital = (typeof CORE_VITALS)[number];

/** web.dev thresholds (`@cloudhal/analytics` `VITALS_THRESHOLDS`): good ≤ `good`, poor > `poor`. */
export const VITAL_THRESHOLDS: Record<CoreVital, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

export type VitalRating = "good" | "needsImprovement" | "poor";

export function vitalRating(metric: CoreVital, p75: number | null): VitalRating | undefined {
  if (p75 === null || !Number.isFinite(p75)) return undefined;
  const t = VITAL_THRESHOLDS[metric];
  return p75 <= t.good ? "good" : p75 > t.poor ? "poor" : "needsImprovement";
}

/** Share of samples rated good (0–1), from the weighted counts; `null` when unknown. */
export function goodShare(m: AnalyticsVitalsMetric): number | null {
  if (m.good === null) return null;
  const total = (m.good ?? 0) + (m.needsImprovement ?? 0) + (m.poor ?? 0);
  return total > 0 ? m.good / total : null;
}

/** A p75 in its unit: LCP in seconds ("2.1 s"), INP in milliseconds ("180 ms"), CLS unitless ("0.05"). */
export function formatVital(metric: CoreVital, value: number, locale: string): string {
  if (metric === "cls")
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  if (metric === "lcp")
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "second",
      unitDisplay: "short",
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(value / 1000);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "millisecond",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(value);
}
