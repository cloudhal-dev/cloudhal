/**
 * Edge-cache tags (ADR-0012, RFC-0002 §7). Every published response carries the site tag; pages
 * add a tag per node and term they render and per list they show, so a publish purges only what
 * changed (`planCachePurge` in core-ts, called by the admin Worker):
 *
 * - `cloudhal-site-<siteId>` — every published response (set by the runtime);
 * - `cloudhal-node-<id>` — the page or entry a response renders, the entries an archive lists and
 *   the related entries an article links to;
 * - `cloudhal-term-<id>` — the term an archive is about, its ancestors in the breadcrumb, the terms
 *   an entry shows and the header categories;
 * - `cloudhal-list-<termId>` — a term's archive pages and feed; `cloudhal-list-<siteId>` — the site
 *   feed, the sitemap and pages with a `ContentList` section.
 *
 * The names live in `@cloudhal/core-ts/cache-tags`, shared with the purge planner. Tags are only
 * added where the runtime already set `cache-tag` (published responses on Cloudflare); previews and
 * Node builds have no edge cache and stay untouched.
 */
export {
  ASSET_TAG_PREFIX,
  assetCacheTag,
  CACHE_TAG_PREFIX,
  isCloudhalCacheTag,
  LIST_TAG_PREFIX,
  listCacheTag,
  MEDIA_TAG_PREFIX,
  mediaCacheTag,
  NODE_TAG_PREFIX,
  nodeCacheTag,
  siteCacheTag,
  TERM_TAG_PREFIX,
  termCacheTag,
} from "@cloudhal/core-ts/cache-tags";

/** Cloudflare accepts up to 16 KB of tags per response; stay well below it. */
const MAX_HEADER_LENGTH = 8 * 1024;

/**
 * Appends tags to an existing `cache-tag` header (deduplicated, bounded); no header, no change.
 * Put the tags a purge must be able to reach first: once the header is full the rest are dropped.
 */
export function addCacheTags(headers: Headers, tags: readonly string[]): void {
  const current = headers.get("cache-tag");
  if (!current) return;
  const all = current.split(",").map((t) => t.trim());
  const seen = new Set(all);
  let length = current.length;
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    if (length + tag.length + 1 > MAX_HEADER_LENGTH) break;
    seen.add(tag);
    all.push(tag);
    length += tag.length + 1;
  }
  headers.set("cache-tag", all.join(","));
}
