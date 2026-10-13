---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
---

Snapshot bundles (RFC-0010): a published site loads its node bodies in one round of reads instead of one R2 read per node.

- **Publish** writes the published snapshot's bodies as shards of 256 nodes under `bundles/<siteId>/<snapshotId>/`, a few at a time. Previews and history snapshots never get one.
- **Site Worker** reads the bundle first and checks every shard against the snapshot (version, snapshot id, hashes); on any doubt it reads per node as before. When the published snapshot has no bundle (a release run, a rollback, `cloudhal push`, an expired bundle), it writes one after the response with `waitUntil`.
- **`cloudhal deploy`** adds an R2 lifecycle rule, `cloudhal-bundles`, that expires `bundles/` after 30 days. It is added once per bucket; if wrangler cannot set it, the deploy warns and goes on.
- New in `@cloudhal/core-ts`: `writeSnapshotBundle`, `readSnapshotBundle`, `bundleKey`, `BUNDLE_SHARD_NODES`, and `SiteGraphStore#readSnapshotBundle`/`#writeSnapshotBundle`. New in `@cloudhal/astro-renderer`: `SnapshotSource#persistBundle` and the resolver's `persistBundle` option.
