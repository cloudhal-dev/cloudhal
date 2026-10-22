/**
 * Pure helpers for the analytics screens (RFC-0006 §10, DESIGN.md §2v): the range and filter in the
 * URL (parsed in `analytics-search.ts`, which the router imports), the query each range sends,
 * the Core Web Vitals ratings and their units, and the state the screen is in. No React and no
 * words of their own beyond what the catalogs give them, so they are tested directly.
 */
import { numberFormat } from "@cloudhal/messages/format";
import type { AnalyticsRange } from "@cloudhal/ui";
import {
  type AnalyticsFilter,
  type AnalyticsSearch,
  DEFAULT_PRESET,
  filterParam,
} from "./analytics-search.ts";
import type {
  AnalyticsFeature,
  AnalyticsNode,
  AnalyticsRangeQuery,
  AnalyticsStatus,
  AnalyticsVitalsMetric,
} from "./api.ts";

export {
  type AnalyticsFilter,
  type AnalyticsSearch,
  DEFAULT_PRESET,
  filterParam,
  parseAnalyticsFilter,
  validateAnalyticsSearch,
} from "./analytics-search.ts";

import { entryHref } from "./entry-href.ts";

// ---- the range ----------------------------------------------------------------------------------

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
  if (node.kind === "entry") return entryHref(siteId, id);
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
    return numberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  if (metric === "lcp")
    return numberFormat(locale, {
      style: "unit",
      unit: "second",
      unitDisplay: "short",
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(value / 1000);
  return numberFormat(locale, {
    style: "unit",
    unit: "millisecond",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(value);
}
