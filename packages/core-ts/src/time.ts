/**
 * Wall-clock times in a site's zone (RFC-0008 §9): what a person enters ("2 November, 09:00" in
 * `Site.timeZone`, absent = UTC) resolved to the instant a gate or a release stores, and back for
 * display.
 *
 * One time model: everything here is `@cloudhal/schedules/time` (the never-early recomputation,
 * D2's gap and overlap rules, the zone check), plus the site-zone helpers. The dependency runs
 * core-ts → schedules, never back. `temporal-polyfill/implementation` comes with it, so this stays
 * a subpath outside the package index: the site Worker compares instants only and never bundles
 * the polyfill.
 */
import type { LocalDateTime, TimeZone } from "@cloudhal/core-contracts";
import { resolveLocalTime, toLocalDateTime, UTC } from "@cloudhal/schedules/time";

export * from "@cloudhal/schedules/time";

/** The zone a site's wall-clock times are in: its `timeZone`, or UTC (D1). */
export function siteZone(site: { readonly timeZone?: TimeZone | undefined }): TimeZone {
  return site.timeZone ?? UTC;
}

/**
 * The instant (canonical `Date#toISOString()` form, UTC) of a wall-clock time in `zone`: a time in
 * a spring-forward gap moves to the next valid time, a repeated one resolves to the first (D2).
 * Throws `ScheduleError` (`invalid_time_zone`, `invalid_local_time`) for an unknown zone or a
 * malformed time.
 */
export function resolveWallClock(local: LocalDateTime, zone: TimeZone): string {
  return resolveLocalTime(local, zone).at;
}

/** The wall-clock time (`YYYY-MM-DDTHH:mm`) of an instant in `zone`, seconds dropped. */
export function wallClockOf(at: string, zone: TimeZone): LocalDateTime {
  return toLocalDateTime(at, zone);
}
