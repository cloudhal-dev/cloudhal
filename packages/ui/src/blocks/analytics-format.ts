/**
 * Formatting helpers shared by the analytics blocks (RFC-0006 §10, DESIGN.md §2v).
 * Everything goes through `Intl` in the Studio locale; times are UTC because the API buckets in
 * UTC (§9.2: `from`/`to` are UTC, `to` exclusive). No user-facing words live here — labels come
 * from the screen (`useT()`), only numbers, dates and region names are formatted.
 * Ranges live in `analytics-range.ts`.
 */

import { dateTimeFormat, displayNames, numberFormat } from "@cloudhal/messages/format";
import type { AnalyticsGranularity } from "./analytics-range.ts";

/** How a value moved against the previous period. `flat` is within ±2 % (§10.1). */
export type DeltaTone = "up" | "down" | "flat";

export interface StatDelta {
  /** Relative change, `0.12` for +12 %. */
  ratio: number;
  tone: DeltaTone;
}

/** Below this relative change a delta reads as "no change" (neutral badge). */
export const FLAT_WITHIN = 0.02;

/**
 * The change from `previous` to `current`. `undefined` when there is nothing to compare with
 * (no previous period, or it was zero: a percentage of nothing says nothing).
 */
export function compareValues(
  current: number,
  previous: number | null | undefined,
  flatWithin = FLAT_WITHIN,
): StatDelta | undefined {
  if (previous === null || previous === undefined) return undefined;
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) return undefined;
  const ratio = (current - previous) / previous;
  const tone: DeltaTone = Math.abs(ratio) <= flatWithin ? "flat" : ratio > 0 ? "up" : "down";
  return { ratio, tone };
}

/** Words for the two region codes `Intl.DisplayNames` cannot name (RFC-0006 §10.1). */
export interface CountryNameLabels {
  /** `XX`: the country was not known ("Unknown"). */
  unknown: string;
  /** `T1`: Tor exit nodes ("Tor"). */
  tor: string;
}

export interface AnalyticsFormatter {
  locale: string;
  /** "12,400" */
  number: (value: number) => string;
  /** "12K" — axis ticks and tight spaces. */
  compact: (value: number) => string;
  /** A ratio as a percentage: `0.124` → "12%" (one decimal below 10 %). */
  percent: (ratio: number) => string;
  /** A signed change: `0.124` → "+12%", `-0.08` → "-8%", `0` → "0%". */
  delta: (ratio: number) => string;
  /** Share of a total, as a percentage; "0%" when the total is zero. */
  share: (part: number, total: number) => string;
  /** Axis tick for a bucket start (UTC): "14:00" hourly, "Oct 9" daily. */
  tick: (ms: number, granularity: AnalyticsGranularity) => string;
  /** A bucket in full (UTC), for tooltips and the data table: "Oct 9, 14:00" / "Thu, Oct 9, 2026". */
  bucket: (ms: number, granularity: AnalyticsGranularity) => string;
  /** A day range, `to` exclusive (ISO dates): "Sep 10 – Oct 9, 2026". */
  dayRange: (from: string, to: string) => string;
  /** A country's name in the locale from its ISO 3166-1 alpha-2 code (`XX`, `T1` from labels). */
  country: (code: string, labels: CountryNameLabels) => string;
}

const DAY_MS = 86_400_000;

function cached<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => {
    value ??= make();
    return value;
  };
}

/** Builds the formatters for one locale. Cheap to call; memoise per locale in components. */
export function createAnalyticsFormatter(locale: string): AnalyticsFormatter {
  const number = cached(() => numberFormat(locale));
  const compact = cached(() =>
    numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
  );
  const pct = (digits: number, signDisplay: "auto" | "exceptZero") =>
    numberFormat(locale, {
      style: "percent",
      maximumFractionDigits: digits,
      signDisplay,
    });
  const pct0 = cached(() => pct(0, "auto"));
  const pct1 = cached(() => pct(1, "auto"));
  const delta0 = cached(() => pct(0, "exceptZero"));
  const delta1 = cached(() => pct(1, "exceptZero"));
  const hourTick = cached(() =>
    dateTimeFormat(locale, { timeZone: "UTC", hour: "numeric", minute: "2-digit" }),
  );
  const dayTick = cached(() =>
    dateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" }),
  );
  const hourFull = cached(() =>
    dateTimeFormat(locale, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
  const dayFull = cached(() =>
    dateTimeFormat(locale, {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  );
  const range = cached(() =>
    dateTimeFormat(locale, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  );
  const regions = cached(() => {
    try {
      return displayNames(locale, { type: "region", fallback: "code" });
    } catch {
      return undefined;
    }
  });
  const percent = (ratio: number) => (Math.abs(ratio) < 0.1 ? pct1() : pct0()).format(ratio);
  return {
    locale,
    number: (v) => number().format(v),
    compact: (v) => compact().format(v),
    percent,
    delta: (ratio) => (Math.abs(ratio) < 0.1 ? delta1() : delta0()).format(ratio),
    share: (part, total) => percent(total > 0 ? part / total : 0),
    tick: (ms, g) => (g === "hour" ? hourTick() : dayTick()).format(ms),
    bucket: (ms, g) => (g === "hour" ? hourFull() : dayFull()).format(ms),
    dayRange: (from, to) => {
      const start = Date.parse(`${from}T00:00:00Z`);
      const end = Date.parse(`${to}T00:00:00Z`) - DAY_MS;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return `${from} – ${to}`;
      return end <= start ? range().format(start) : range().formatRange(start, end);
    },
    country: (code, labels) => {
      if (code === "XX") return labels.unknown;
      if (code === "T1") return labels.tor;
      try {
        return regions()?.of(code) ?? code;
      } catch {
        return code;
      }
    },
  };
}
