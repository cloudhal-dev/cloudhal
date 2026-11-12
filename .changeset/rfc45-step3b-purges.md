---
"@cloudhal/core-ts": patch
---

RFC-0045 rollout step 3b: publishes purge the pages that show references. Nothing changes for sites without reference definitions: their purge plans are the same, and no bundle is read.

- **The referrer closure** (`references/purge.ts`, called by `planCachePurge`).
  - The seeds are the groups of every changed, added or removed entry, and of every entry whose shown asset changed.
  - It purges the referrers of those groups, two hops deep, with every language version of each referrer.
  - It also purges every member of each group a changed entry names, before or after ("used by").
  - Values are resolved, so a translation that only inherits counts.
  - It reads only the `from` and `to` snapshots' bodies, never the working copy or `entry_refs`.
- **Reads and budgets.** One hash-keyed cache: one bundle (`to`'s, else `from`'s), streamed and cut down as each shard is parsed, then the missing hashes. A passed budget purges everything:
  - bytes (`maxBodyBytes`, 32 MB);
  - nodes (`maxNodes`, 50,000);
  - reads (`maxReads`, shard reads included);
  - tags (`maxTags`).

  So does any field-operation marker on either snapshot's site node.
- **`readSnapshotBundle`** (`SnapshotReader.readSnapshotBundle`, `SiteGraphStore.readSnapshotBundle`, `readSnapshotBundle` in bundles) takes optional `maxBytes`, `maxNodes` and `keep`. A passed budget throws `BundleBudgetError` before the shard is parsed. No new cache tags.
- **Release runs re-plan their purge at run time**, from the pointer they moved to the snapshot they made, instead of sending the plan stored at pin time (`references/release-purge.ts`). `RELEASE_EXECUTOR_COST` is 18.
