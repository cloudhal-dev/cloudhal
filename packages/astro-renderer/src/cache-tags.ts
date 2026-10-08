/**
 * Edge-cache tags (ADR-0012, RFC-0002 §7). Every published response carries the site tag; pages
 * add a tag per node they render, so a purge can later target one term's archive and the entries
 * that show it instead of the whole site:
 *
 * - `cloudhal-site-<siteId>` — every published response (set by the runtime);
 * - `cloudhal-node-<id>` — the page or entry a response renders, and the entries an archive lists;
 * - `cloudhal-term-<id>` — the term an archive is about, its ancestors in the breadcrumb, and the
 *   terms an entry shows.
 *
 * Tags are only added where the runtime already set `cache-tag` (published responses on
 * Cloudflare); previews and Node builds have no edge cache and stay untouched.
 */
export const CACHE_TAG_PREFIX = "cloudhal-site-";
export const NODE_TAG_PREFIX = "cloudhal-node-";
export const TERM_TAG_PREFIX = "cloudhal-term-";

/** Cloudflare accepts up to 16 KB of tags per response; stay well below it. */
const MAX_HEADER_LENGTH = 8 * 1024;

export const siteCacheTag = (siteId: string) => `${CACHE_TAG_PREFIX}${siteId}`;
export const nodeCacheTag = (id: string) => `${NODE_TAG_PREFIX}${id}`;
export const termCacheTag = (id: string) => `${TERM_TAG_PREFIX}${id}`;

/** Appends tags to an existing `cache-tag` header (deduplicated, bounded); no header, no change. */
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

/** Whether a tag is one Cloudhal sets (the purge endpoint refuses anything else). */
export function isCloudhalCacheTag(tag: string): boolean {
  return /^cloudhal-(?:site|node|term)-[A-Za-z0-9_]{1,64}$/.test(tag);
}
