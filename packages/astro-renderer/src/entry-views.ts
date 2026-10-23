/**
 * RFC-0042 §3 in the published sources: an entry's derived gate (its collection's `expiry`) next to
 * its own `availability` (RFC-0008). `unlist` keeps the entry's page (and comments, menus,
 * alternates) but leaves it out of every listing, feed, the sitemap and search; `hide` answers 404
 * like an expired `availability`. The gate index gets every derived instant and, for `now`
 * conditions on list fields (§4), every value instant, so the edge cache expires at each one.
 * Pure helpers shared by the live and snapshot sources; previews never call them.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { gateInstants } from "@cloudhal/core-ts/availability";
import {
  type DerivedGate,
  derivedGates,
  entryVisibility,
  listFieldInstants,
} from "@cloudhal/core-ts/fields";
import type { GraphSource } from "./source.ts";

/** What the public sees of a set of entries at one instant. */
export interface EntrySplit {
  /** Shown entries: every listing, feed, sitemap and search. */
  readonly listed: ContentEntry[];
  /** Shown and unlisted entries: everything with a public URL (routes, comments, menus). */
  readonly reachable: ContentEntry[];
}

/**
 * Splits `entries` at `now` by status, `availability` and their derived gates (`derivedGates` over
 * every published entry a translation may read from; a snapshot computes it once). The snapshot
 * and the live source pass the same sets, so they agree.
 */
export function splitEntries(
  entries: readonly ContentEntry[],
  now: number,
  derived: ReadonlyMap<string, DerivedGate>,
): EntrySplit {
  const listed: ContentEntry[] = [];
  const reachable: ContentEntry[] = [];
  for (const e of entries) {
    const v = entryVisibility(e, derived.get(e.id), now);
    if (v === "hidden") continue;
    reachable.push(e);
    if (v === "shown") listed.push(e);
  }
  return { listed, reachable };
}

/**
 * The gate index of published nodes (RFC-0008 §7.4, RFC-0042 §3.4 and §4): every `from`/`until`,
 * every derived gate, and every instant a `now` condition on a list field may flip at; sorted,
 * unique. Empty for a site that schedules nothing and has no such settings.
 */
export function gateIndex(
  site: Site,
  pages: readonly Page[],
  entries: readonly ContentEntry[],
  gates: ReadonlyMap<string, DerivedGate> = derivedGates(site, entries),
): number[] {
  const own = gateInstants([...pages, ...entries]);
  const derived = [...gates.values()].map((g) => g.at);
  const lists = listFieldInstants(site, entries);
  if (derived.length === 0 && lists.length === 0) return own;
  return [...new Set([...own, ...derived, ...lists])].sort((a, b) => a - b);
}

/**
 * Every entry of a locale with a public URL (unlisted ones included), newest first: what routes,
 * static builds and language alternates need. Sources from before RFC-0042 list all of them in
 * `allEntries`.
 */
export function routableEntries(source: GraphSource, locale?: string): Promise<ContentEntry[]> {
  return source.routableEntries ? source.routableEntries(locale) : source.allEntries(locale);
}
