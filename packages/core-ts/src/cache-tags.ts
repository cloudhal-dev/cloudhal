/**
 * Edge-cache tags (ADR-0012, RFC-0002 §7): the contract between the site renderer, which tags every
 * published response, and the publisher, which purges the tags a publish touched (`cache-purge.ts`).
 * Both sides import these names from here so they cannot drift.
 *
 * - `cloudhal-site-<siteId>` — every published response. Purging it purges the whole site.
 * - `cloudhal-node-<id>` — the page or entry a response renders, the entries an archive lists and
 *   the related entries an article links to.
 * - `cloudhal-term-<id>` — every term whose name or presentation a response shows: the archive's
 *   term, its ancestors in the breadcrumb, the terms an entry shows, the categories in the header.
 * - `cloudhal-list-<id>` — responses whose *set* of listed entries depends on membership: with a
 *   term id, that term's archive pages and feed (entries filed under it or below it); with the site
 *   id, everything that lists the site's entries as a whole (the site feed, the sitemap, pages with
 *   a `ContentList` section). A new, removed or re-filed entry changes these without changing any
 *   node they already carry a tag for.
 * - `cloudhal-media-<siteId>` and `cloudhal-asset-<id>` — media responses (RFC-0004 §7.4). They never
 *   carry the site tag, so purging pages leaves media cached; a publish purges the asset tags of
 *   media that left the live snapshot or changed slug or status, a takedown purges its asset at
 *   once, and `cloudhal-media-<siteId>` is the operator's "purge all media" lever.
 * - `cloudhal-comments-<nodeId>` — the approved comments rendered into an entry's page and its
 *   comment pages (RFC-0007 §8.1). Separate from the node tag, so moderation purges only that
 *   article, never archives, feeds or lists. `@cloudhal/comments` plans these purges.
 *
 * Tags are plain ASCII and far below Cloudflare's 1024-character limit per tag.
 */
export const CACHE_TAG_PREFIX = "cloudhal-site-";
export const NODE_TAG_PREFIX = "cloudhal-node-";
export const TERM_TAG_PREFIX = "cloudhal-term-";
export const LIST_TAG_PREFIX = "cloudhal-list-";
export const MEDIA_TAG_PREFIX = "cloudhal-media-";
export const ASSET_TAG_PREFIX = "cloudhal-asset-";
export const COMMENTS_TAG_PREFIX = "cloudhal-comments-";

export const siteCacheTag = (siteId: string) => `${CACHE_TAG_PREFIX}${siteId}`;
export const nodeCacheTag = (id: string) => `${NODE_TAG_PREFIX}${id}`;
export const termCacheTag = (id: string) => `${TERM_TAG_PREFIX}${id}`;
/** The listing tag of a term (its archive and feed) or, with the site id, of the whole site. */
export const listCacheTag = (termOrSiteId: string) => `${LIST_TAG_PREFIX}${termOrSiteId}`;
export const mediaCacheTag = (siteId: string) => `${MEDIA_TAG_PREFIX}${siteId}`;
export const assetCacheTag = (assetId: string) => `${ASSET_TAG_PREFIX}${assetId}`;
/** The comments tag of an entry (RFC-0007 §8.1). */
export const commentsCacheTag = (nodeId: string) => `${COMMENTS_TAG_PREFIX}${nodeId}`;

/**
 * Whether a tag is one Cloudhal sets (the purge endpoint refuses anything else): the site, node,
 * term, list, media, asset and comments (RFC-0007 §8.1) prefixes.
 */
export function isCloudhalCacheTag(tag: string): boolean {
  return /^cloudhal-(?:site|node|term|list|media|asset|comments)-[A-Za-z0-9_]{1,64}$/.test(tag);
}
