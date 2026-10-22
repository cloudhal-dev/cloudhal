/**
 * RFC-0038 / ADR-0040: where a content entry lives. A collection's `permalink` template
 * (`Site.collections.<key>.permalink`) names the URL, `/<collection>/{slug}` by default. Version 1
 * templates are fixed segments followed by `/{slug}` (the schema's pattern), so the template is a
 * prefix and one slug segment. Every place that links to an entry, and every place that reads a
 * path back, goes through these two functions.
 *
 * Worker-safe: no imports beyond types.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";

/** The part of the site these functions read. */
export type PermalinkSite = Pick<Site, "collections">;

const SLUG_TOKEN = "/{slug}";

/** The collection's template: its own `permalink`, else `/<collection>/{slug}`. */
export function collectionPermalink(site: PermalinkSite | undefined, collection: string): string {
  return site?.collections?.[collection]?.permalink ?? `/${collection}${SLUG_TOKEN}`;
}

/** The fixed part before `/{slug}`: `/blog` for `/blog/{slug}`. */
export function permalinkPrefix(template: string): string {
  return template.endsWith(SLUG_TOKEN) ? template.slice(0, -SLUG_TOKEN.length) : template;
}

/** `/blog/hello-world`: the collection's template with the entry's slug filled in. */
export function entryPath(
  site: PermalinkSite | undefined,
  entry: Pick<ContentEntry, "collection" | "slug">,
): string {
  return `${permalinkPrefix(collectionPermalink(site, entry.collection))}/${entry.slug}`;
}

/**
 * The collection and slug a path names, or undefined. A configured template wins over the
 * default, the longest prefix first; a collection that has its own template is no longer at
 * `/<collection>/…` (its old URLs answer through redirects). Whether such an entry exists is
 * the caller's question.
 */
export function entryAt(
  site: PermalinkSite | undefined,
  path: string,
): { collection: string; slug: string } | undefined {
  const configured = Object.entries(site?.collections ?? {})
    .filter(([, s]) => s?.permalink)
    .map(([collection, s]) => ({ collection, prefix: permalinkPrefix(s?.permalink as string) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { collection, prefix } of configured) {
    if (!path.startsWith(`${prefix}/`)) continue;
    const slug = path.slice(prefix.length + 1);
    if (slug && !slug.includes("/")) return { collection, slug };
  }
  const m = /^\/([^/]+)\/([^/]+)$/.exec(path);
  if (!m) return undefined;
  const [, collection, slug] = m as unknown as [string, string, string];
  if (site?.collections?.[collection]?.permalink) return undefined;
  return { collection, slug };
}
