/**
 * RFC-0045 §7 in the renderer: the entry maps a running text ↔ reference conversion reads
 * (`ConvertContext.entries`), so `resolveFields` converts an entry phase B has not rewritten yet
 * exactly as the writers and the operation will.
 *
 * - The snapshot source builds them from the snapshot's own entries (every one not archived,
 *   drafts included: the graph it renders), lazily, once per snapshot, isolate and collection,
 *   and only while the collection carries such a marker.
 * - The live source builds them from the working copy (the graph phase B reads) before resolving
 *   an entry of a collection that carries one.
 *
 * Without such a marker neither reads anything. Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  type ConversionEntries,
  conversionCollections,
  conversionEntries,
  fieldDefinitions,
} from "@cloudhal/core-ts/fields";

/** The collections a collection's running conversions read, or `undefined` (nothing to build). */
export function conversionNeeds(site: Site, collection: string): ReadonlySet<string> | undefined {
  return conversionCollections(fieldDefinitions(site, collection));
}

/**
 * The maps `source` builds for an entry of `collection`, asked only while the collection runs a
 * conversion (`entryFields` and depth-2 cards call this, so no source reads anything otherwise).
 */
export function conversionsFor(
  source: { conversionEntries?(collection: string): Promise<ConversionEntries | undefined> },
  site: Site,
  collection: string,
): Promise<ConversionEntries | undefined> {
  return conversionNeeds(site, collection) && source.conversionEntries
    ? source.conversionEntries(collection)
    : Promise.resolve(undefined);
}

/** True when some collection of the site runs a text ↔ reference conversion. */
export function siteConverts(site: Site): boolean {
  return Object.keys(site.collections ?? {}).some((c) => conversionNeeds(site, c) !== undefined);
}

/** The maps for `collection` over the entries `load` returns, or `undefined` without a conversion. */
export async function conversionMaps(
  site: Site,
  collection: string,
  load: () => Promise<Iterable<ContentEntry>> | Iterable<ContentEntry>,
): Promise<ConversionEntries | undefined> {
  const needs = conversionNeeds(site, collection);
  if (!needs) return undefined;
  return conversionEntries(await load(), site.defaultLocale, needs);
}

/** A per-snapshot cache of `conversionMaps` by collection (the snapshot is immutable). */
export function cachedConversionMaps(
  cache: Map<string, Promise<ConversionEntries | undefined>>,
  site: Site,
  collection: string,
  entries: () => Iterable<ContentEntry>,
): Promise<ConversionEntries | undefined> {
  if (!conversionNeeds(site, collection)) return Promise.resolve(undefined);
  let hit = cache.get(collection);
  if (!hit) {
    hit = conversionMaps(site, collection, entries);
    cache.set(collection, hit);
  }
  return hit;
}

/** The maps of every collection in `collections` that runs a conversion, by collection. */
export async function conversionMapsOf(
  site: Site,
  collections: Iterable<string>,
  get: (collection: string) => Promise<ConversionEntries | undefined>,
): Promise<Map<string, ConversionEntries>> {
  const out = new Map<string, ConversionEntries>();
  for (const c of new Set(collections)) {
    if (!conversionNeeds(site, c)) continue;
    const maps = await get(c);
    if (maps) out.set(c, maps);
  }
  return out;
}
