---
"@cloudhal/core-ts": minor
"@cloudhal/cloudflare": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/api": patch
"@cloudhal/cli": minor
---

Publish and rollback purge only what changed (RFC-0002 §7).

- `@cloudhal/core-ts`: `onPublished(site, { from, to })` says where the published pointer moved; `planCachePurge` / `SiteGraphStore.planCachePurge(change)` turns the diff of the two snapshots into cache tags (node tags of changed entries, list tags of their terms and of the site, term tags of retitled terms, the site tag for structure) or "everything" when it cannot. The tag names moved here (`@cloudhal/core-ts/cache-tags`) and gained `cloudhal-list-<id>`. `notifyPublished(site, previousSnapshotId)`.
- `@cloudhal/cloudflare`: the admin Worker purges through `purgeSiteCache` (`@cloudhal/cloudflare/purge`): batches of 100 tags (Cloudflare's limit), at most three, otherwise or on failure one full purge.
- `@cloudhal/astro-renderer`: `cache-tags` re-exports the core names, adds `listCacheTag`; the site Worker's purge endpoint accepts `cloudhal-list-` tags.
- `@cloudhal/api`: a replacing bundle import passes the previously live snapshot to the purge.
- `@cloudhal/cli` (blog starter): archives and term feeds carry their term's list tag, the site feed, the sitemap and pages with a `ContentList` the site's, and articles the node tags of their related posts.
