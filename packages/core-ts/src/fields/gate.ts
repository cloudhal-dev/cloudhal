/**
 * RFC-0042 §3: the time gate an entry derives from a date or datetime field
 * (`CollectionSettings.expiry`). One function for every caller — the renderer's `visible`, the
 * gate index, search rows, Studio — so they agree to the millisecond. Pure, Worker-safe and
 * Temporal-free (RFC-0008 §9.4): zones go through `Intl` only.
 *
 * - a `datetime` value expires at its `at`;
 * - a `date` value expires at the start of the following day in the site's zone (absent: UTC), so
 *   an event "on 5 November" is listed all of 5 November;
 * - plus `afterMinutes`; no value, no derived gate.
 *
 * Never early (RFC-0008 §9.1): an ambiguous wall-clock midnight takes the later instant, a
 * midnight inside a gap takes the instant the wall clock would show it with the offset before the
 * transition (Temporal's `disambiguation: "later"`), and an unknown zone takes the latest start of
 * that day anywhere (UTC−12).
 */
import type { Availability, FieldDefinition } from "@cloudhal/core-contracts";
import { offsetMs } from "./conversions.ts";
import type { ResolvedFields } from "./resolve.ts";
import type { SiteFields } from "./types.ts";
import { isCalendarDay } from "./value-checks.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The span around a wall time in which the zone's possible offsets are sampled. */
const SAMPLE_SPAN = 36 * HOUR;
/** The most negative offset in use (Etc/GMT+12): the latest start of a day anywhere. */
const LATEST_OFFSET = -12 * HOUR;

/** Every offset the zone has within ±36 h of `wall` (as if it were UTC). */
function offsetsNear(zone: string, wall: number): number[] {
  const out = new Set<number>();
  for (const t of [wall - SAMPLE_SPAN, wall, wall + SAMPLE_SPAN]) out.add(offsetMs(zone, t));
  return [...out];
}

/**
 * The instant at which the wall clock in `zone` shows 00:00 of `day` (`YYYY-MM-DD`), in epoch ms.
 * Ambiguous: the later instant; in a gap: shifted forward by the gap (`disambiguation: "later"`).
 */
export function dayStartIn(day: string, zone: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d);
  let offsets: number[];
  try {
    offsets = offsetsNear(zone, wall);
  } catch {
    return wall - LATEST_OFFSET;
  }
  const candidates = offsets.map((o) => wall - o);
  const valid = candidates.filter((at, i) => offsetMs(zone, at) === offsets[i]);
  return Math.max(...(valid.length > 0 ? valid : candidates));
}

/** The calendar day after `day` (`YYYY-MM-DD`). */
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const next = new Date(0);
  next.setUTCFullYear(y, m - 1, d + 1);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The instant (epoch ms) at which a value of `def` ends, plus `afterMinutes`; `undefined` when
 * there is no readable value or the field is neither a date nor a datetime.
 */
export function fieldGateInstant(
  value: unknown,
  def: Pick<FieldDefinition, "type">,
  site: Pick<SiteFields, "timeZone">,
  afterMinutes = 0,
): number | undefined {
  const grace = Number.isFinite(afterMinutes) && afterMinutes > 0 ? afterMinutes * MINUTE : 0;
  if (def.type === "datetime") {
    if (!isRecord(value) || typeof value.at !== "string") return undefined;
    const at = Date.parse(value.at);
    return Number.isFinite(at) ? at + grace : undefined;
  }
  if (def.type === "date") {
    if (typeof value !== "string" || !isCalendarDay(value)) return undefined;
    return dayStartIn(nextDay(value), site.timeZone ?? "UTC") + grace;
  }
  return undefined;
}

/**
 * The derived gate of an entry of `collection` from its resolved values (`resolveFields`, so a
 * translation reads the original's non-localized date): `undefined` without a rule, without a
 * date or datetime field under the rule's key, or without a value.
 */
export function expiryInstant(
  site: SiteFields,
  collection: string,
  resolved: ResolvedFields,
): number | undefined {
  const rule = site.collections?.[collection]?.expiry;
  if (!rule) return undefined;
  const field = resolved[rule.field];
  if (!field || (field.def.type !== "date" && field.def.type !== "datetime")) return undefined;
  return fieldGateInstant(field.value, field.def, site, rule.afterMinutes ?? 0);
}

/**
 * The effective expiry (§3.2): `min(availability.until, derived)`. `NaN` when `until` does not
 * parse, so gates keep failing closed as `gateState` does; `undefined` when neither exists.
 */
export function effectiveUntil(
  availability: Availability | undefined,
  derived: number | undefined,
): number | undefined {
  const until = availability?.until === undefined ? undefined : Date.parse(availability.until);
  if (until === undefined) return derived;
  if (derived === undefined || Number.isNaN(until)) return until;
  return Math.min(until, derived);
}
