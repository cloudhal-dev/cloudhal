# @cloudhal/storage

## 0.3.1

### Patch Changes

- 4a46df0: The CLI ships a freshly built Studio: 0.3.0 shipped one built before Studio's playground mode, so a playground opened at the sign-in page. On a playground, Studio's site sidebar also leaves out Analytics, Activity, Approvals, Agents and Schedules, and a `403 playground` answer reads as a feature that is off (no retries, no error states). `FetcherBlobStore` with `keys` never fetches another key: a static-assets binding with SPA fallback answers 200 for missing files.
- @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- c70d3fa: New `@cloudhal/storage/do-sqlite`: `DoSqliteDriver`, a `SqlDriver` over a SQLite-backed Durable Object's storage, with an atomic `batch` (`transactionSync`) and D1's limits (RFC-0036). New blob stores at the root: `SqlBlobStore` keeps blobs in a table of the same database with per-object and total caps, `LayeredBlobStore` reads a writable store over a read-only one, and `FetcherBlobStore` reads static files through a Worker `ASSETS` binding. `@cloudhal/storage/testing` gains `createMiniflareDoSqlite()`, which runs any `SqlDriver` suite on Durable Object SQLite.

### Patch Changes

- @cloudhal/core-contracts@0.3.0

## 0.2.0

### Patch Changes

- @cloudhal/core-contracts@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/core-contracts@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
