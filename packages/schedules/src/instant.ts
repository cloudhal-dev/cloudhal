/**
 * Instants without time zones (RFC-0008 §9): the stored form, lateness, minute arithmetic and the
 * contract's patterns. No Temporal and no clock, so the Temporal-free `./engine` entry (what
 * `@cloudhal/core-ts` imports, and so the site Worker bundle) can use them; `time.ts` adds zones.
 */
import { ScheduleError } from "./errors.ts";

/** Absent site zone means UTC (D1). */
export const UTC = "UTC";

/** The contract's shape for zone names (`common.schema.json#/$defs/TimeZone`). */
export const TIME_ZONE_PATTERN = /^(?:UTC|[A-Z][A-Za-z_-]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;

/** The contract's wall-clock shape (`common.schema.json#/$defs/LocalDateTime`), to the minute. */
export const LOCAL_DATE_TIME_PATTERN =
  /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Milliseconds since the epoch of an instant given as a string, a `Date` or a number. */
export function instantMs(value: string | Date | number): number {
  const ms =
    typeof value === "number" ? value : value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms))
    throw new ScheduleError("invalid_timestamp", `not an instant: ${String(value)}`);
  return ms;
}

/** The canonical stored form of an instant: `Date#toISOString()` (UTC, milliseconds, `Z`). */
export function canonicalInstant(value: string | Date | number): string {
  return new Date(instantMs(value)).toISOString();
}

/** The instant truncated to its minute (seconds dropped, §9.5). */
export function floorToMinute(value: string | Date | number): number {
  const ms = instantMs(value);
  return ms - (((ms % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);
}

/** Whole seconds `now` is past `at` (0 when not yet due). Lateness round-trips as an integer. */
export function latenessSeconds(at: string | Date | number, now: string | Date | number): number {
  return Math.max(0, Math.floor((instantMs(now) - instantMs(at)) / 1000));
}

/** True when `at` is not in the future of `now` (instants only; no zone needed). */
export function isDue(at: string | Date | number, now: string | Date | number): boolean {
  return instantMs(at) <= instantMs(now);
}
