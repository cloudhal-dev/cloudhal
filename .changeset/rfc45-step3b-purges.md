---
"@cloudhal/core-ts": patch
---

RFC-0045 rollout step 3b: publishes purge the pages that show references. Nothing changes for sites without reference definitions. Their publish purge plans are the same, with no bundle read. Their release runs send the plan stored at pin time, as before, with no extra read, re-plan or bundle write.

- **The referrer closure** (`references/purge.ts`, called by `planCachePurge`).
  - The seeds are the groups of every changed, added or removed entry, and of every entry whose shown asset changed.
  - It purges the referrers of those groups, two hops deep, with every language version of each referrer.
  - It also purges every member of each group a changed entry names, before or after ("used by").
  - Values are resolved, so a translation that only inherits counts.
  - It reads only the `from` and `to` snapshots' bodies, never the working copy or `entry_refs`.
- **Reads and budgets.** A publish that changes no entry and no shown asset reads nothing. Otherwise the closure keeps one hash-keyed cache:
  - one bundle (`to`'s, else `from`'s), streamed and cut down as each shard is parsed;
  - then the missing hashes, read by the closure itself, six at a time, and cut down the same way.

  A passed budget purges everything:
  - bytes (`maxBodyBytes`, 32 MB);
  - nodes (`maxNodes`, 50,000);
  - reads (`maxReads`, shard reads included);
  - tags (`maxTags`).

  So does any field-operation marker on either snapshot's site node, for sites that hold references or convert from them.
- **`readSnapshotBundle`** (`SnapshotReader.readSnapshotBundle`, `SiteGraphStore.readSnapshotBundle`, `readSnapshotBundle` in bundles) takes optional `maxBytes`, `maxNodes`, `keep`, `only` (bodies node by node) and `spent` (a shared byte total). A passed budget throws `BundleBudgetError` before the shard is parsed. No new cache tags.
- **Release runs on sites with references re-plan their purge at run time** (`references/release-purge.ts`), from the pointer they moved to the snapshot they made, instead of sending the plan stored at pin time.
  - The re-plan runs over the tick's counting driver, within the tick's blob allowance (400 on Workers Free, 4,000 on Paid; at most 250 reads per re-plan). If it fails, the run purges everything.
  - After the purge, the run writes its snapshot's bundle, best effort, when `from` has one: from `from`'s bodies plus at most 100 changed nodes, for snapshots of at most 1,000 nodes.
  - The pin-time plan skips the closure (`CachePurgeOptions.references: false`): for these sites it is the expected outcome only.
  - `RELEASE_EXECUTOR_COST` is 26 (it counts `refreshSearch` and `recordPurge` now).
