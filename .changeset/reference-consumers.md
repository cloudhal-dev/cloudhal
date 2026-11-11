---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/cli": patch
"@cloudhal/cloudflare": patch
---

The consumers of reference fields (RFC-0045 §2, rollout step 2b, #114). Both new field types stay refused on every write path in production, so none of this is reachable before rollout step 7. The shared suites run it through `SiteGraphStoreOptions.fieldTypes`.

- **Assets inside repeater items.** `fieldAssetRefs` walks items and records `fields.<key>.<sub>` with each use's item path. `fieldAssetIssues` checks sub-field types (a PDF in an image sub-field is refused) and reports at item paths. Skips match issue paths by prefix, so top-level behaviour is unchanged.
- **Field-operation rewrites** write their entries' `entry_refs` rows. A rewrite that changes a reference value is guarded on its target, and every rewrite in a site with reference fields is guarded on the collection's definitions.
- **Releases** no longer treat reference values as dependencies, so a referenced entry is neither locked nor required live.
- **Language editions** (`forEdition`) keep a reference only when the edition site has a member of its group in an allowed collection. Other references, and repeater items left empty, are dropped and reported through `onDropped`.
- **CLI.** `cloudhal import --dry-run` warns about references that will show nothing, and about originals relinked into another group.
- **Cloudflare.** `siteFieldTypeSupport` reads the site Worker's `fields` feature. `FIELDS_FEATURE_VERSION` and `FIELDS_SUPPORTED` are exported from `@cloudhal/core-ts/fields`. Nothing passes them to a store before step 7.
- **API.** `GET /sites/:siteId/entries/pick` (the entry picker) and `GET /sites/:siteId/entries/:entryId/references` (an entry's referrers), both `content:read`.
