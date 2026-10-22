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
type EntryRef = Pick<ContentEntry, "collection" | "slug">;

export function entryPath(site: PermalinkSite | undefined, entry: EntryRef): string;
/**
 * @deprecated The one-argument form of the renderer's old `entryPath(entry)`, kept because themes
 * copied from the starter before 0.3.11 call it (also as `entries.map(entryPath)`, which passes
 * the index second). It ignores collection permalinks; pass the site.
 */
export function entryPath(entry: EntryRef, index?: number): string;
export function entryPath(
  siteOrEntry: PermalinkSite | EntryRef | undefined,
  entry?: EntryRef | number,
): string {
  // Old call: no second argument, or a `map` index; the first argument is the entry.
  if (typeof entry !== "object" || entry === null) {
    const old = siteOrEntry as EntryRef;
    return `/${old.collection}/${old.slug}`;
  }
  const site = siteOrEntry as PermalinkSite | undefined;
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

/** One collection whose effective template differs between two versions of a site. */
export interface PermalinkChange {
  readonly collection: string;
  /** The old fixed prefix (`/posts`). */
  readonly from: string;
  /** The new fixed prefix (`/blog`). */
  readonly to: string;
  /** The new template is the collection's own (`permalink` set), not the default. */
  readonly configured: boolean;
}

/**
 * The collections whose effective template differs between `before` and `after`, for every key
 * in either site's `collections` (RFC-0038 §3). Empty when nothing moved.
 */
export function changedPermalinks(
  before: PermalinkSite | undefined,
  after: PermalinkSite | undefined,
): PermalinkChange[] {
  const keys = new Set([
    ...Object.keys(before?.collections ?? {}),
    ...Object.keys(after?.collections ?? {}),
  ]);
  const out: PermalinkChange[] = [];
  for (const collection of [...keys].sort()) {
    const from = collectionPermalink(before, collection);
    const to = collectionPermalink(after, collection);
    if (from === to) continue;
    out.push({
      collection,
      from: permalinkPrefix(from),
      to: permalinkPrefix(to),
      configured: Boolean(after?.collections?.[collection]?.permalink),
    });
  }
  return out;
}
