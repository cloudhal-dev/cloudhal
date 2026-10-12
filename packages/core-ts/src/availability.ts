/**
 * Time gates (RFC-0008 §7): `availability.from` (an embargo, inclusive) and `availability.until`
 * (an expiry, exclusive) on pages and content entries. One helper decides, everywhere: the
 * published renderer, the gate index that caps the edge cache, the writer rules.
 *
 * Gates are instants (`Timestamp`, RFC 3339), so checking one is a comparison of milliseconds and
 * needs no time-zone code: wall-clock input is resolved to an instant when it is written
 * (`@cloudhal/core-ts/time`). `now` is always passed in (invariant S16: never Temporal's clock,
 * never a clock read inside the helper). Worker-safe, no dependencies.
 */
import type { Availability, PublishStatus } from "@cloudhal/core-contracts";
import { InvariantError } from "./errors.ts";

/** What a node's gates say at an instant. */
export type GateState = "open" | "embargoed" | "expired";

/** Anything with gates: a page, an entry, or an asset that inherits a gate. */
export interface Gated {
  readonly availability?: Availability | undefined;
}

/** A page or entry as the renderer sees it. */
export interface Publishable extends Gated {
  readonly status: PublishStatus;
}

/** An instant in ms, or `NaN` for a value that does not parse (gates then fail closed). */
const instant = (t: string): number => Date.parse(t);

/**
 * `open`, `embargoed` (before `from`) or `expired` (from `until` on). A gate that does not parse
 * keeps the node closed: an unreadable embargo must never open early.
 */
export function gateState(node: Gated, now: number): GateState {
  const a = node.availability;
  if (a?.from !== undefined && !(instant(a.from) <= now)) return "embargoed";
  if (a?.until !== undefined && !(now < instant(a.until))) return "expired";
  return "open";
}

/** True when the published site may show the node at `now`: published, and its gates open. */
export function isAvailable(node: Publishable, now: number): boolean {
  return node.status === "published" && gateState(node, now) === "open";
}

/** True when the node has a gate at all (the cheap check before any filtering). */
export function hasGates(node: Gated): boolean {
  const a = node.availability;
  return a !== undefined && (a.from !== undefined || a.until !== undefined);
}

/**
 * The instants at which any of these nodes' gates change, sorted and unique. A snapshot is
 * immutable, so this is computed once per snapshot (§7.4); unparsable gates contribute nothing.
 */
export function gateInstants(nodes: Iterable<Gated>): number[] {
  const out = new Set<number>();
  for (const n of nodes) {
    const a = n.availability;
    for (const t of [a?.from, a?.until]) {
      if (t === undefined) continue;
      const ms = instant(t);
      if (Number.isFinite(ms)) out.add(ms);
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** The first of the sorted `instants` after `now` (binary search), if any. */
export function nextInstant(instants: readonly number[], now: number): number | undefined {
  let lo = 0;
  let hi = instants.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((instants[mid] as number) <= now) lo = mid + 1;
    else hi = mid;
  }
  return instants[lo];
}

/** The next instant after `now` at which any of these nodes' gates change. */
export function nextGate(nodes: Iterable<Gated>, now: number): number | undefined {
  return nextInstant(gateInstants(nodes), now);
}

/** The edge cache's lifetime without gates (one year; what published pages always had). */
export const MAX_EDGE_AGE = 31_536_000;

/**
 * `max-age` (seconds) for a published response at `now` when the next gate is `next` (§7.4):
 * `min(31536000, ceil((next − now) / 1 s))`, at least 1. No gate ahead: one year, as before.
 */
export function edgeMaxAge(next: number | undefined, now: number): number {
  if (next === undefined) return MAX_EDGE_AGE;
  return Math.min(MAX_EDGE_AGE, Math.max(1, Math.ceil((next - now) / 1000)));
}

/**
 * The gate an asset inherits from the nodes that use it (§7.2): when every live referrer has an
 * embargo, the asset is embargoed until the earliest one opens, so an embargoed article's cover
 * image is not served early. One referrer without an embargo (or none at all) leaves it ungated.
 * Expiries are not inherited: an asset that was public stays servable.
 */
export function inheritedGate(referrers: readonly Gated[]): Availability | undefined {
  if (referrers.length === 0) return undefined;
  let earliest: { ms: number; at: string } | undefined;
  for (const r of referrers) {
    const from = r.availability?.from;
    if (from === undefined) return undefined;
    const ms = instant(from);
    if (!Number.isFinite(ms)) continue;
    if (!earliest || ms < earliest.ms) earliest = { ms, at: from };
  }
  return earliest ? { from: earliest.at } : undefined;
}

/** True when two gate values are the same (absent and `{}` alike). */
export function sameAvailability(
  a: Availability | undefined,
  b: Availability | undefined,
): boolean {
  return a?.from === b?.from && a?.until === b?.until;
}

/**
 * The cross-field rules the schema cannot express (§4.1): both gates are instants that parse, and
 * `from` is before `until`. Throws `InvariantError("invalid_availability")`.
 */
export function checkAvailability(a: Availability | undefined): void {
  if (!a) return;
  const from = a.from === undefined ? undefined : instant(a.from);
  const until = a.until === undefined ? undefined : instant(a.until);
  if (from === undefined && until === undefined)
    throw new InvariantError("invalid_availability", "availability needs `from` or `until`");
  if (
    (from !== undefined && !Number.isFinite(from)) ||
    (until !== undefined && !Number.isFinite(until))
  )
    throw new InvariantError(
      "invalid_availability",
      "availability gates must be RFC 3339 instants",
    );
  if (from !== undefined && until !== undefined && !(from < until))
    throw new InvariantError("invalid_availability", "availability.from must be before until", {
      from: a.from,
      until: a.until,
    });
}

/**
 * What a write does to a node's gates at `now`, for the policy layer (RFC-0008 §10.8, D8): lifting
 * an embargo (removing a future `from`, or moving it earlier) is a person's act, Editor and above,
 * with a reason; setting or moving an embargo later and setting an expiry only reduce visibility.
 */
export type GateChange =
  | "none"
  /** A future `from` removed or moved earlier: the content appears sooner. */
  | "lift-embargo"
  /** A `from` set, or moved later: the content appears later (or disappears until then). */
  | "embargo"
  /** An `until` set or moved earlier: the content disappears sooner. */
  | "expire"
  /** An `until` removed or moved later: the content stays longer. */
  | "extend";

/** Every change a write makes to the gates (several when both move). */
export function gateChanges(
  before: Availability | undefined,
  after: Availability | undefined,
  now: number,
): GateChange[] {
  if (sameAvailability(before, after)) return ["none"];
  const out: GateChange[] = [];
  const bf = before?.from === undefined ? undefined : instant(before.from);
  const af = after?.from === undefined ? undefined : instant(after.from);
  if (bf !== af) {
    // Only an embargo still in force can be lifted; one that has passed changes nothing visible.
    const inForce = bf !== undefined && !(bf <= now);
    if (inForce && (af === undefined || af < (bf as number))) out.push("lift-embargo");
    else if (af !== undefined && (bf === undefined || af > bf) && af > now) out.push("embargo");
  }
  const bu = before?.until === undefined ? undefined : instant(before.until);
  const au = after?.until === undefined ? undefined : instant(after.until);
  if (bu !== au) {
    if (au !== undefined && (bu === undefined || au < bu)) out.push("expire");
    else out.push("extend");
  }
  return out.length > 0 ? out : ["none"];
}

/**
 * Whether the runtime knows this IANA zone (`Site.timeZone`, §4.1: the schema bounds the shape;
 * the writer checks the name). `UTC` is always accepted.
 */
export function isTimeZone(zone: string): boolean {
  if (zone === "UTC") return true;
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported?.includes(zone)) return true;
    // Aliases (`Europe/Kiev`) are valid zone names the list leaves out; Intl resolves them.
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The writer's check of `Site.timeZone` (§4.1): the schema bounds the shape, this checks the name
 * against the writing runtime's zones (`isTimeZone`). A zone that is unchanged from `previous` is
 * accepted, so a site saved under older time-zone data can still be edited. Throws
 * `InvariantError("invalid_time_zone")`.
 */
export function checkTimeZone(zone: string | undefined, previous?: string): void {
  if (zone === undefined || zone === previous || isTimeZone(zone)) return;
  throw new InvariantError(
    "invalid_time_zone",
    `unknown time zone "${zone}": use an IANA zone name this runtime knows, such as Europe/Istanbul, or UTC`,
    { timeZone: zone },
  );
}

/**
 * The writer guard (invariant S15): a capability the store asks before it accepts `availability`.
 * An older site Worker ignores gates and would show embargoed content, so writes that set or change
 * gates are refused (`gates_unsupported`) until the renderer that serves the site confirms it
 * enforces them: the admin Worker asks the site Worker's `GET /__cloudhal/features`; on Node the
 * renderer and the writer are one process (`GATES_ENFORCED`).
 */
export interface GateSupport {
  enforced(siteId: string): boolean | Promise<boolean>;
}

/** The renderer in this process enforces gates (Node: `cloudhal dev`, `studio`, self-host). */
export const GATES_ENFORCED: GateSupport = { enforced: () => true };

/** The value `GET /__cloudhal/features` answers with (and the admin side checks). */
export const GATES_FEATURE_VERSION = 1;
