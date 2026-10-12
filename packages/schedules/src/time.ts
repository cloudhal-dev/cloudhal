/**
 * The time model (RFC-0008 §9). Wall-clock time plus an IANA zone, resolved to an instant with
 * `temporal-polyfill/implementation` — the only Temporal entry point in Cloudhal: it never touches
 * a native or global `Temporal`, and nothing here reads a clock. `now` is always injected by the
 * caller (`Date.now()` at the edge of the system), so DST, tzdata and lateness are testable with a
 * fake clock (S16).
 *
 * DST (D2): `disambiguation: "compatible"` — a wall-clock time inside a spring-forward gap moves to
 * the next valid time (02:30 → 03:30 in Berlin on 29 March 2026, `adjusted: "dst-gap"`); a time
 * that occurs twice resolves to the first occurrence (+02:00 on 25 October 2026).
 *
 * Never early (§9.1): `recomputeExecuteAt` re-resolves a stored wall-clock time with the runtime's
 * current tzdata and only ever moves the instant later.
 */
import { Temporal } from "temporal-polyfill/implementation";
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

const zoneCache = new Map<string, boolean>();

/**
 * True when `name` has the contract's shape and the runtime's time-zone data knows it (aliases
 * such as `Europe/Kiev` included). Writers call this before storing a zone (§4.1).
 */
export function isTimeZone(name: unknown): name is string {
  if (typeof name !== "string" || name.length > 64 || !TIME_ZONE_PATTERN.test(name)) return false;
  const cached = zoneCache.get(name);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(name);
    ok = true;
  } catch {
    ok = false;
  }
  zoneCache.set(name, ok);
  return ok;
}

export function assertTimeZone(name: unknown): asserts name is string {
  if (!isTimeZone(name))
    throw new ScheduleError("invalid_time_zone", `unknown time zone: ${String(name)}`);
}

export function isLocalDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !LOCAL_DATE_TIME_PATTERN.test(value)) return false;
  try {
    Temporal.PlainDateTime.from(value, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
}

function plainDateTime(local: string): Temporal.PlainDateTime {
  if (!isLocalDateTime(local))
    throw new ScheduleError(
      "invalid_local_time",
      `not a wall-clock time (YYYY-MM-DDTHH:mm): ${local}`,
    );
  return Temporal.PlainDateTime.from(local, { overflow: "reject" });
}

/** An instant resolved from a wall-clock time. */
export interface ResolvedTime {
  /** The instant, canonical (`2026-11-02T06:00:00.000Z`). */
  at: string;
  /** The zone's UTC offset at that instant (`+03:00`). */
  offset: string;
  /** Present when the wall-clock time did not exist and moved forward (D2). */
  adjusted?: "dst-gap";
}

/** Resolves a Temporal wall-clock value in `zone` with D2 (gap → later, overlap → first). */
export function resolvePlain(plain: Temporal.PlainDateTime, zone: string): ResolvedTime {
  const zdt = plain.toZonedDateTime(zone, { disambiguation: "compatible" });
  const at = new Date(zdt.epochMilliseconds).toISOString();
  const moved = Temporal.PlainDateTime.compare(zdt.toPlainDateTime(), plain) !== 0;
  return { at, offset: zdt.offset, ...(moved ? { adjusted: "dst-gap" as const } : {}) };
}

/** `2026-11-02T09:00` in `Europe/Istanbul` → `{ at: "2026-11-02T06:00:00.000Z", offset: "+03:00" }`. */
export function resolveLocalTime(local: string, zone: string): ResolvedTime {
  assertTimeZone(zone);
  return resolvePlain(plainDateTime(local), zone);
}

/** The wall-clock time (to the minute, seconds dropped) of an instant in `zone`. */
export function toLocalDateTime(instant: string | Date | number, zone: string): string {
  assertTimeZone(zone);
  const zdt = Temporal.Instant.fromEpochMilliseconds(floorToMinute(instant)).toZonedDateTimeISO(
    zone,
  );
  return zdt.toPlainDateTime().toString({ smallestUnit: "minute" });
}

/** The UTC offset (`+03:00`) of `zone` at an instant. */
export function zoneOffset(instant: string | Date | number, zone: string): string {
  assertTimeZone(zone);
  return Temporal.Instant.fromEpochMilliseconds(instantMs(instant)).toZonedDateTimeISO(zone).offset;
}

/** When a release (or any one-off) is due: the contract's `ReleaseAt` without its `kind`. */
export interface WhenAt {
  at: string;
  timeZone: string;
  localTime?: string;
}

export interface RecomputedTime {
  /** The instant to run at: never earlier than the stored one, never earlier than the wall clock. */
  at: string;
  /** True when `at` moved. */
  changed: boolean;
  /** `tzdata`: the zone's rules now put the wall-clock time later than the stored instant. */
  adjusted?: "tzdata";
}

/**
 * Never early (§9.1, S2). With a stored wall-clock time, re-resolve it with the runtime's current
 * tzdata; if that instant is later than the stored `at`, the release moves to it (`tzdata`). If it
 * is earlier, the stored `at` stands (running later than the wall clock is late, not early). An
 * instant without `localTime` is a machine's absolute intent and never moves.
 */
export function recomputeExecuteAt(when: WhenAt): RecomputedTime {
  const stored = canonicalInstant(when.at);
  if (!when.localTime) return { at: stored, changed: false };
  const resolved = resolveLocalTime(when.localTime, when.timeZone);
  if (Date.parse(resolved.at) > Date.parse(stored))
    return { at: resolved.at, changed: true, adjusted: "tzdata" };
  return { at: stored, changed: false };
}

/** Whole seconds `now` is past `at` (0 when not yet due). Lateness round-trips as an integer. */
export function latenessSeconds(at: string | Date | number, now: string | Date | number): number {
  return Math.max(0, Math.floor((instantMs(now) - instantMs(at)) / 1000));
}

/** True when `at` is not in the future of `now` (instants only; no zone needed). */
export function isDue(at: string | Date | number, now: string | Date | number): boolean {
  return instantMs(at) <= instantMs(now);
}
