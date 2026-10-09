/**
 * Formatting and range helpers shared by the analytics blocks (RFC-0006 §10, DESIGN.md §2v).
 * Everything goes through `Intl` in the Studio locale; times are UTC because the API buckets in
 * UTC (§9.2: `from`/`to` are UTC, `to` exclusive). No user-facing words live here — labels come
 * from the screen (`useT()`), only numbers, dates and region names are formatted.
 */

/** Hourly or daily buckets: hourly for ranges of two days or less (§10.1). */
export type AnalyticsGranularity = "hour" | "day";

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
  const number = cached(() => new Intl.NumberFormat(locale));
  const compact = cached(
    () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
  );
  const pct = (digits: number, signDisplay: "auto" | "exceptZero") =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: digits,
      signDisplay,
    });
  const pct0 = cached(() => pct(0, "auto"));
  const pct1 = cached(() => pct(1, "auto"));
  const delta0 = cached(() => pct(0, "exceptZero"));
  const delta1 = cached(() => pct(1, "exceptZero"));
  const hourTick = cached(
    () => new Intl.DateTimeFormat(locale, { timeZone: "UTC", hour: "numeric", minute: "2-digit" }),
  );
  const dayTick = cached(
    () => new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" }),
  );
  const hourFull = cached(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
  );
  const dayFull = cached(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
  );
  const range = cached(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
  );
  const regions = cached(() => {
    try {
      return new Intl.DisplayNames(locale, { type: "region", fallback: "code" });
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

// ---- Ranges -------------------------------------------------------------------------------

/** The range presets of the Analytics screen and `get_analytics` (§9.3). */
export const ANALYTICS_RANGE_PRESETS = ["today", "7d", "30d", "90d", "12m"] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

/** A preset, or custom UTC days `from` … `to` (ISO dates, `to` exclusive) — the URL's shape. */
export type AnalyticsRange = { preset: AnalyticsRangePreset } | { from: string; to: string };

export interface ResolvedAnalyticsRange {
  /** First day, ISO date (UTC). */
  from: string;
  /** Day after the last, ISO date (UTC, exclusive). */
  to: string;
  days: number;
  granularity: AnalyticsGranularity;
}

/** The longest custom range the API answers (§9.2: at most 2 years). */
export const MAX_RANGE_DAYS = 731;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isAnalyticsRangePreset(value: unknown): value is AnalyticsRangePreset {
  return (ANALYTICS_RANGE_PRESETS as readonly unknown[]).includes(value);
}

/** `2026-10-09` for the UTC day of `ms`. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The calendar day a person picked (local fields of a picker's `Date`), as an ISO date. */
export function pickedDay(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `iso` plus `days` (may be negative). */
export function addDays(iso: string, days: number): string {
  return isoDay(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Is a custom range well formed and answerable (ordered, at most two years)? */
export function isValidCustomRange(from: string, to: string): boolean {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return false;
  const days = daysBetween(from, to);
  return Number.isFinite(days) && days >= 1 && days <= MAX_RANGE_DAYS;
}

/** Concrete UTC days and the bucket size for a range, relative to `now`. */
export function resolveAnalyticsRange(
  range: AnalyticsRange,
  now: Date = new Date(),
): ResolvedAnalyticsRange {
  let from: string;
  let to: string;
  if ("preset" in range) {
    const today = isoDay(now.getTime());
    to = addDays(today, 1);
    switch (range.preset) {
      case "today":
        from = today;
        break;
      case "7d":
        from = addDays(today, -6);
        break;
      case "30d":
        from = addDays(today, -29);
        break;
      case "90d":
        from = addDays(today, -89);
        break;
      case "12m": {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        from = addDays(isoDay(d.getTime()), 1);
        break;
      }
    }
  } else {
    from = range.from;
    to = range.to;
  }
  const days = Math.max(1, daysBetween(from, to));
  return { from, to, days, granularity: days <= 2 ? "hour" : "day" };
}

/** The period of the same length right before a range — what deltas compare against. */
export function previousAnalyticsRange(range: { from: string; to: string }): {
  from: string;
  to: string;
} {
  const days = Math.max(1, daysBetween(range.from, range.to));
  return { from: addDays(range.from, -days), to: range.from };
}

/** Start of the bucket `now` falls in: today's partial bucket is drawn as incomplete. */
export function currentBucketStart(granularity: AnalyticsGranularity, now = Date.now()): number {
  const size = granularity === "hour" ? 3_600_000 : DAY_MS;
  return Math.floor(now / size) * size;
}
