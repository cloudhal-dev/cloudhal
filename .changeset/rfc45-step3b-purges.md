---
"@cloudhal/core-ts": patch
"@cloudhal/cloudflare": patch
"@cloudhal/mcp-server": patch
---

RFC-0045 rollout step 3b: publishes purge the pages that show references. Nothing changes for sites without reference definitions. Their publish purge plans are the same, with no bundle read. Their release runs send the plan stored at pin time, as before, with no re-plan; the only addition is one read of the published site node, to tell them apart.

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
  - The test is the published site node, which `publishRelease` now returns (`publishedSite`). That costs one blob read per run with a purger, except on a first publish; the read is counted, never refused. If it fails, the working row decides.
  - The re-plan runs over the tick's counting driver.
  - The release graph's blob calls (`refreshSearch`, `labelOf`, the re-plan) are charged to one allowance per invocation, shared by the cron's ticks (`ScheduledTickOptions.releaseBlobs`): 350 on Workers Free, 3,000 on Paid. "Publish now" sizes it from the deployment's tick budget (`ReleaseService` and `SchedulesDeps.tickBudget`).
  - Past the allowance, or if the re-plan fails, the run purges everything. A re-plan with more distinct terms than reads left purges everything before reading anything.
  - The pin-time plan skips the closure (`CachePurgeOptions.references: false`): for these sites it is the expected outcome only.
  - `RELEASE_EXECUTOR_COST` is 26 (it counts `refreshSearch` and `recordPurge` now).
- **`@cloudhal/cloudflare`:** the cron handler passes one `releaseBlobs` allowance to both ticks of its invocation (`cronTick`); the alarm and the request backstop run one tick each, with the default allowance.
