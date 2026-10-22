/**
 * RFC-0040 / ADR-0042: the site's collection registry. `Site.collections` declares collections; a
 * collection with entries but no key there is inferred, and `posts` is always present (every
 * starter and `create_entry`'s default assume it). Nothing here writes: existing sites keep working
 * without a migration, and a collection becomes declared when a person or an approved agent saves
 * its settings.
 *
 * Worker-safe: no imports beyond types. Themes may use `collectionLabel` and `collectionSettings`.
 */
import type {
  CollectionLabel,
  CollectionSettings,
  ContentEntry,
  Site,
} from "@cloudhal/core-contracts";

/** The collection every site has, declared or not. */
export const BUILT_IN_COLLECTION = "posts";

/** `Site.collections`' `maxProperties`. */
export const MAX_COLLECTIONS = 50;

export type CollectionSort = NonNullable<CollectionSettings["sort"]>;

export interface CollectionInfo {
  key: string;
  /** Has a key in `Site.collections`. False: inferred from its entries, or the built-in `posts`. */
  declared: boolean;
  /** The stored settings; `{}` when inferred. */
  settings: CollectionSettings;
  /** Entries per status, every locale. */
  counts: Partial<Record<ContentEntry["status"], number>>;
}

/** One row of the store's per-collection, per-status count. */
export type CollectionCount = {
  collection: string;
  status: ContentEntry["status"];
  count: number;
};

type RegistrySite = Pick<Site, "collections">;

/** Declared collections first, then inferred ones, each in key order. */
export function collectionRegistry(
  site: RegistrySite,
  counts: readonly CollectionCount[],
): CollectionInfo[] {
  const declared = site.collections ?? {};
  const byKey = new Map<string, CollectionInfo>();
  const info = (key: string): CollectionInfo => {
    let found = byKey.get(key);
    if (!found) {
      const settings = declared[key];
      found = { key, declared: settings !== undefined, settings: settings ?? {}, counts: {} };
      byKey.set(key, found);
    }
    return found;
  };
  for (const key of Object.keys(declared)) info(key);
  info(BUILT_IN_COLLECTION);
  for (const c of counts) {
    const row = info(c.collection);
    row.counts[c.status] = (row.counts[c.status] ?? 0) + c.count;
  }
  return [...byKey.values()].sort(
    (a, b) => Number(b.declared) - Number(a.declared) || a.key.localeCompare(b.key),
  );
}

/** Whether entries may be created in `key`: declared, inferred from entries, or `posts`. */
export function isRegistered(registry: readonly CollectionInfo[], key: string): boolean {
  return registry.some((c) => c.key === key);
}

/** The labels for `locale`: that locale's, then the default locale's, then the key. */
export function collectionLabel(
  site: RegistrySite & Pick<Site, "defaultLocale">,
  key: string,
  locale: string,
): CollectionLabel {
  const labels = site.collections?.[key]?.labels;
  return labels?.[locale] ?? labels?.[site.defaultLocale] ?? { singular: key, plural: key };
}

/** The collection's settings with `feed`, `sitemap` and `sort` defaults filled in. */
export function collectionSettings(
  site: RegistrySite | undefined,
  key: string,
): CollectionSettings & { feed: boolean; sitemap: boolean; sort: CollectionSort } {
  const s = site?.collections?.[key] ?? {};
  return { ...s, feed: s.feed ?? true, sitemap: s.sitemap ?? true, sort: s.sort ?? "newest" };
}
