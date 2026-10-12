/**
 * Time gates on the page (RFC-0008 §7.3): what a preview says about a page or entry the public
 * cannot see right now — "Embargoed until 2 November 2026, 09:00 (Istanbul)" or "Expired on …".
 * The public routes never render a gated node (the published source leaves it out), so this only
 * ever shows in previews and `cloudhal dev`. Pure and Worker-safe: `Intl` formats the instant in
 * the site's zone; no Temporal on the site Worker (§9.4).
 */
import type { Availability, Site } from "@cloudhal/core-contracts";
import { gateState, isTimeZone } from "@cloudhal/core-ts/availability";

export {
  edgeMaxAge,
  type GateState,
  gateState,
  isAvailable,
  MAX_EDGE_AGE,
  nextGate,
} from "@cloudhal/core-ts/availability";

export interface GateNotice {
  readonly state: "embargoed" | "expired";
  /** The gate instant (RFC 3339). */
  readonly at: string;
  /** The instant as a reader of the site reads it: date and time in the site's zone, and the zone. */
  readonly when: string;
}

/** The zone's short place name: `Europe/Istanbul` → `Istanbul`, `UTC` → `UTC`. */
function zoneLabel(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** `2 November 2026, 09:00 (Istanbul)` in the site's language and zone (UTC when it has none). */
export function formatGateTime(at: string, site: Pick<Site, "timeZone">, locale: string): string {
  const zone = site.timeZone && isTimeZone(site.timeZone) ? site.timeZone : "UTC";
  let text: string;
  try {
    text = new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: zone,
    }).format(new Date(at));
  } catch {
    text = new Date(at).toISOString();
  }
  return `${text} (${zoneLabel(zone)})`;
}

/**
 * The notice for a node whose gates are closed at `now`, or `undefined` when it is open. `now`
 * is the caller's clock (the request's instant), never read here.
 */
export function gateNotice(
  node: { readonly availability?: Availability | undefined },
  site: Pick<Site, "timeZone">,
  locale: string,
  now: number,
): GateNotice | undefined {
  const state = gateState(node, now);
  if (state === "open") return undefined;
  const at = (state === "embargoed" ? node.availability?.from : node.availability?.until) as string;
  return { state, at, when: formatGateTime(at, site, locale) };
}
