/**
 * Path overlap between collection prefixes (RFC-0038 §4 invariant 1), taxonomy archives and pages
 * (RFC-0002 invariant 13): the JS checks that give the message, and the SQL race guards that
 * hold them inside a write's batch. Worker-safe.
 */
import type { Cond } from "./node-sql.ts";
import { collectionPermalink, type PermalinkSite, permalinkPrefix } from "./permalinks.ts";

/** `a` equals `b` or one lies under the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** `path` equals `base` or lies under it. */
export function pathWithin(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

export interface CollectionPrefix {
  readonly collection: string;
  /** `/blog` for `/blog/{slug}`. */
  readonly prefix: string;
  /** From the collection's own `permalink`, not the default `/<collection>`. */
  readonly configured: boolean;
}

/**
 * The prefixes entries answer under: every collection with its own template, and the default
 * `/<collection>` of each name in `used` (collections that have entries) that has none.
 */
export function collectionPrefixes(
  site: PermalinkSite | undefined,
  used: Iterable<string>,
): CollectionPrefix[] {
  const configured = Object.keys(site?.collections ?? {}).filter(
    (c) => site?.collections?.[c]?.permalink,
  );
  const out = configured.map((collection) => ({
    collection,
    prefix: permalinkPrefix(collectionPermalink(site, collection)),
    configured: true,
  }));
  for (const collection of new Set(used))
    if (!configured.includes(collection))
      out.push({ collection, prefix: `/${collection}`, configured: false });
  return out;
}

const PERMALINK = "json_extract(c.value, '$.permalink')";
/** The template minus its 7-character `/{slug}` tail. */
const PREFIX = `substr(${PERMALINK}, 1, length(${PERMALINK}) - 7)`;

/**
 * Holds while no configured collection prefix in the site row's `collections` contains `path`
 * (`within`: a page path) or overlaps it either way (`overlap`: an archive base path).
 */
export function configuredPrefixFree(
  siteId: string,
  path: string,
  mode: "within" | "overlap",
): Cond {
  const within = `${PREFIX} = ? OR substr(?, 1, length(${PREFIX}) + 1) = ${PREFIX} || '/'`;
  const cond = mode === "within" ? within : `${within} OR substr(${PREFIX}, 1, ?) = ?`;
  const extra = mode === "within" ? [] : [path.length + 1, `${path}/`];
  return {
    sql: `NOT EXISTS (SELECT 1 FROM nodes s, json_each(s.body, '$.collections') c WHERE s.id = ? AND s.kind = 'site' AND ${PERMALINK} IS NOT NULL AND (${cond}))`,
    params: [siteId, path, path, ...extra],
  };
}

/** Holds while no page of the site sits at `base` or under it. */
export function noPageWithin(siteId: string, base: string): Cond {
  const path = "json_extract(body, '$.path')";
  return {
    sql: `NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'page' AND (${path} = ? OR substr(${path}, 1, ?) = ?))`,
    params: [siteId, base, base.length + 1, `${base}/`],
  };
}

/** Holds while no taxonomy archive base path of the site overlaps `base`. */
export function noArchiveOverlapping(siteId: string, base: string): Cond {
  const b = "json_extract(body, '$.archive.basePath')";
  return {
    sql: `NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'taxonomy' AND (${b} = ? OR substr(${b}, 1, ?) = ? OR substr(?, 1, length(${b}) + 1) = ${b} || '/'))`,
    params: [siteId, base, base.length + 1, `${base}/`, base],
  };
}
