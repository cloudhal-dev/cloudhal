---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
---

First-class collections, step 1 (RFC-0040 / ADR-0042). `Site.collections.<key>` takes optional `labels` (singular and plural per locale), `icon`, `feed`, `sitemap` and `sort` next to `permalink`, with at most 50 collections per site. `SiteGraphStore.listCollections(siteId)` returns the registry: declared collections, those inferred from existing entries, and `posts`, with entry counts per status. The new `@cloudhal/core-ts/collections` subpath adds `collectionLabel` and `collectionSettings` for themes. Nothing changes for existing sites.
