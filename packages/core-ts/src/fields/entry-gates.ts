/**
 * RFC-0042 §3–§4 on the read side: what an entry's derived gate (`CollectionSettings.expiry`) does
 * to it at an instant, and the instants a published site's gate index adds for derived gates and
 * for `now` conditions on list fields. One module for the renderer's sources (live and snapshot),
 * search rows and the auto-publish check, so they agree to the millisecond. Pure, Worker-safe and
 * Temporal-free; `now` is always passed in.
 *
 * | at `now` | entry URL | listings, feeds, sitemap, search |
 * |---|---|---|
 * | `shown` | 200 | listed |
 * | `unlisted` (`unlist` past its gate) | 200 | left out |
 * | `hidden` (unpublished, `availability` closed, or `hide` past its gate) | 404 | left out |
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { gateState, type Publishable } from "../availability.ts";
import { dayStartIn, expiryInstant, nextDay } from "./gate.ts";
import { type FieldsOriginal, resolveFields } from "./resolve.ts";
import type { SiteFields } from "./types.ts";
import { isCalendarDay } from "./value-checks.ts";

/** What a collection's expiry does once an entry's derived gate passes (RFC-0042 §3.3). */
export type ExpiryAction = "unlist" | "hide";

/** An entry's derived gate: the instant (epoch ms) and what happens from then on. */
export interface DerivedGate {
  readonly at: number;
  readonly action: ExpiryAction;
}

/** How the published site treats an entry at an instant. */
export type EntryVisibility = "shown" | "unlisted" | "hidden";

/** The entry shape the derived gate reads. */
export type GatedEntry = Pick<ContentEntry, "id" | "collection" | "fields"> & {
  translation?: ContentEntry["translation"] | undefined;
};

/** True when some collection of the site derives gates from a field. */
export function hasExpiryRules(site: SiteFields): boolean {
  return Object.values(site.collections ?? {}).some((c) => c?.expiry !== undefined);
}

/**
 * The derived gate of one entry: its collection's rule applied to its resolved values (a
 * translation reads the original's non-localized date). `undefined` without a rule or a value.
 */
export function derivedGate(
  site: SiteFields,
  entry: GatedEntry,
  original?: FieldsOriginal,
): DerivedGate | undefined {
  const rule = site.collections?.[entry.collection]?.expiry;
  if (!rule) return undefined;
  const at = expiryInstant(site, entry.collection, resolveFields(site, entry, original));
  return at === undefined ? undefined : { at, action: rule.action };
}

/**
 * `shown`, `unlisted` or `hidden` at `now`: published with open gates (`availability`, RFC-0008),
 * then the derived gate. `from` (an embargo) is never affected by a derived gate.
 */
export function entryVisibility(
  entry: Publishable,
  derived: DerivedGate | undefined,
  now: number,
): EntryVisibility {
  if (entry.status !== "published" || gateState(entry, now) !== "open") return "hidden";
  if (derived && !(now < derived.at)) return derived.action === "hide" ? "hidden" : "unlisted";
  return "shown";
}

/** The originals of same-site translations among `entries`, by id. */
export function originalsOf<T extends GatedEntry>(
  entries: readonly T[],
): (entry: T) => T | undefined {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return (entry) => {
    const group = entry.translation?.group;
    return group && group !== entry.id ? byId.get(group) : undefined;
  };
}

/**
 * The derived gates of `entries` by entry id (only entries that have one). Originals are looked up
 * among the same entries, so pass every entry a translation may read from.
 */
export function derivedGates(
  site: SiteFields,
  entries: readonly GatedEntry[],
): Map<string, DerivedGate> {
  const out = new Map<string, DerivedGate>();
  if (!hasExpiryRules(site)) return out;
  const originalOf = originalsOf(entries);
  for (const e of entries) {
    const gate = derivedGate(site, e, originalOf(e));
    if (gate) out.set(e.id, gate);
  }
  return out;
}

/**
 * RFC-0042 §4 "`now` and the cache": the instants at which a `now` condition on a list field may
 * change its answer for one of `entries` — a `datetime` value's `at` (and the next millisecond, so
 * `gte`/`lte` flip too), a `date` value's day start and the next day's start in the site's zone.
 * Bounded by the ≤ 4 list fields per collection.
 */
export function listFieldInstants(site: SiteFields, entries: readonly GatedEntry[]): number[] {
  const out = new Set<number>();
  const zone = site.timeZone ?? "UTC";
  const originalOf = originalsOf(entries);
  for (const e of entries) {
    const settings = site.collections?.[e.collection];
    const keys = settings?.listFields;
    if (!keys?.length) continue;
    const wanted = (settings?.fields ?? []).filter(
      (d) => keys.includes(d.key) && (d.type === "date" || d.type === "datetime"),
    );
    if (wanted.length === 0) continue;
    const resolved = resolveFields(site, e, originalOf(e));
    for (const def of wanted) {
      const value = resolved[def.key]?.value;
      if (def.type === "date" && typeof value === "string" && isCalendarDay(value)) {
        out.add(dayStartIn(value, zone));
        out.add(dayStartIn(nextDay(value), zone));
      } else if (def.type === "datetime") {
        const at = (value as { at?: unknown } | undefined)?.at;
        const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
        if (Number.isFinite(ms)) out.add(ms).add(ms + 1);
      }
    }
  }
  return [...out];
}
