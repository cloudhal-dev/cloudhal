/**
 * RFC-0040 §4: an entry's editor lives under its collection, `/collections/$collection/$entryId`.
 * A link that does not know the collection uses `posts`; the editor moves the address to the
 * entry's own collection once it has loaded (`useEntryCollectionUrl`).
 */
import { BUILT_IN_COLLECTION } from "@cloudhal/core-ts/collections";

export const ENTRY_EDITOR = "/sites/$siteId/collections/$collection/$entryId" as const;

/** The editor's address as a string (`href`s, tables of links). */
export function entryHref(
  siteId: string,
  entryId: string,
  collection: string = BUILT_IN_COLLECTION,
): string {
  return `/sites/${siteId}/collections/${collection}/${entryId}`;
}

/** The editor as TanStack Router options (`navigate(entryRoute(…))`). */
export function entryRoute(
  siteId: string,
  entryId: string,
  collection: string = BUILT_IN_COLLECTION,
) {
  return { to: ENTRY_EDITOR, params: { siteId, collection, entryId } };
}
