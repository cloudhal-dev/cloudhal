# @cloudhal/core-ts

The Site Graph core in TypeScript (the Rust port replaces it later, ADR-0001). `SiteGraphStore` is the only way application code touches nodes:

- **Typed CRUD** for Project, Site, Page, ContentEntry, validated against the contracts before any write.
- **Optimistic locking**: every update is a compare-and-swap on `rev`; a stale write raises `ConflictError` and changes nothing. Composite writes (create/delete page + `Site.pageIds`) are one atomic batch.
- **Uniqueness**: `(site, locale, path)` for pages, `(site, collection, locale, slug)` for entries → `UniqueConstraintError`.
- **Snapshots**: `createSnapshot` records every node's id/rev/content hash, copies bodies to the blob store (`nodes/<hash>.json`) and summarises the change against the previous snapshot. `diffSnapshots` lists added/changed/removed nodes.
- **Publish / rollback**: `publish` points `Site.publishedSnapshotId` at a snapshot; `rollback` only accepts an ancestor of the published snapshot and records a `rollback` snapshot.

```ts
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";

const store = new SiteGraphStore({ sql: await BetterSqlite3Driver.open(":memory:"), blobs: new MemoryBlobStore() });
await store.init();
```

`describeSiteGraphStore` in `src/testing.ts` is the behavioural suite; it runs against better-sqlite3 and against D1 (Miniflare) in CI.
