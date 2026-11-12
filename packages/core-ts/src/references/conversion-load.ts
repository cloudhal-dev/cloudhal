/**
 * RFC-0045 §7 "Where the graph reads happen", on the store's side: the prefetched maps of a
 * running text ↔ reference conversion, built from one read of the working copy's target
 * collections. Each field-operation pass (the dry run, each phase-B pass, each revert pass) builds
 * them once before it plans, and `EntryEngine.write` builds them before it normalizes a write,
 * only while such a marker is active. The live source reads the same entries
 * (`astro-renderer/src/reference-conversions.ts`), so every converter agrees.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  type ConversionEntries,
  conversionCollections,
  conversionEntries,
} from "./conversion-maps.ts";

/** What the maps read of the store. */
export interface ConversionSource {
  listContentEntries(siteId: string, collection?: string): Promise<ContentEntry[]>;
}

/** The maps `defs`' running conversions read, or `undefined` when none needs any (no read). */
export async function loadConversionEntries(
  store: ConversionSource,
  site: Pick<Site, "id" | "defaultLocale">,
  defs: readonly FieldDefinition[],
): Promise<ConversionEntries | undefined> {
  const needs = conversionCollections(defs);
  if (!needs) return undefined;
  const entries = needs.has("*")
    ? await store.listContentEntries(site.id)
    : (await Promise.all([...needs].map((c) => store.listContentEntries(site.id, c)))).flat();
  return conversionEntries(entries, site.defaultLocale, needs);
}
