---
"@cloudhal/storage": minor
---

New `@cloudhal/storage/do-sqlite`: `DoSqliteDriver`, a `SqlDriver` over a SQLite-backed Durable Object's storage, with an atomic `batch` (`transactionSync`) and D1's limits (RFC-0036). New blob stores at the root: `SqlBlobStore` keeps blobs in a table of the same database with per-object and total caps, `LayeredBlobStore` reads a writable store over a read-only one, and `FetcherBlobStore` reads static files through a Worker `ASSETS` binding. `@cloudhal/storage/testing` gains `createMiniflareDoSqlite()`, which runs any `SqlDriver` suite on Durable Object SQLite.
