/**
 * Wall-clock times in a site's zone (RFC-0008 §9): what a person enters ("2 November, 09:00" in
 * `Site.timeZone`, absent = UTC) resolved to the instant a gate stores, and back for display.
 *
 * `temporal-polyfill/implementation` is the only Temporal entry point (§9.4: it never uses a native
 * `Temporal`); `now` is never read here. A time in a spring-forward gap moves to the next valid
 * time, a time that occurs twice resolves to the first (`disambiguation: "compatible"`, D2).
 *
 * Deliberately tiny: `@cloudhal/schedules` owns the full time model (never-early recomputation,
 * recurrence). These two functions are the same resolution and should become re-exports of it
 * when both land. Kept out of the package index so the site Worker never bundles the polyfill
 * (the renderer compares instants only).
 */
import type { LocalDateTime, TimeZone } from "@cloudhal/core-contracts";
import { Temporal } from "temporal-polyfill/implementation";

/** The zone a site's wall-clock times are in: its `timeZone`, or UTC. */
export function siteZone(site: { readonly timeZone?: TimeZone | undefined }): TimeZone {
  return site.timeZone ?? "UTC";
}

/**
 * The instant (RFC 3339, UTC, `Z`) of a wall-clock time in `zone`. Throws a `RangeError` for an
 * unknown zone or a malformed time.
 */
export function resolveWallClock(local: LocalDateTime, zone: TimeZone): string {
  return Temporal.PlainDateTime.from(local)
    .toZonedDateTime(zone, { disambiguation: "compatible" })
    .toInstant()
    .toString();
}

/** The wall-clock time (`YYYY-MM-DDTHH:mm`) of an instant in `zone`, seconds dropped. */
export function wallClockOf(at: string, zone: TimeZone): LocalDateTime {
  return Temporal.Instant.from(at)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
