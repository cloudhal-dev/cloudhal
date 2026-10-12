/**
 * Analytics ranges (RFC-0006 §9.2, §10.1): the presets, custom UTC days and their validation, and
 * the bucket size of a range. Kept apart from the formatters in `analytics-format.ts` because the
 * Studio router validates the Analytics URL with these: what the router imports is in every page's
 * entry chunk, and the formatters (Intl, country names) are only for the analytics surfaces.
 */

/** Hourly or daily buckets: hourly for ranges of two days or less (§10.1). */
export type AnalyticsGranularity = "hour" | "day";

const DAY_MS = 86_400_000;

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
