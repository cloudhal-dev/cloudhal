# @cloudhal/storage

## 0.6.2

### Patch Changes

- 970c8a1: createMiniflareDoSqlite() sends its Durable Object calls over kept-alive connections instead of opening a new TCP connection per call through Miniflare 4's dispatchFetch, so long suites no longer exhaust local ports on macOS (#116).
- 6cb7945: Migration `0029_entry_list_values` (RFC-0042 §4, #110): `entry_list_values`, the indexed list-field values of entries (field, presence, number, text, collection-sort key, creation time, node, locale and status) with a query index and a per-node index, and `entry_list_state`, each listed collection's readiness (definition fingerprint, ready flag, backfill epoch and cursor). DDL only; existing data is untouched.
- 8a30e30: The `./testing` subpath now ships. The published packages pointed `./testing` at `dist/src/testing.js` and `.d.ts`, but the build left those files out, so importing `@cloudhal/{storage,analytics,comments,schedules}/testing` failed with ERR_MODULE_NOT_FOUND. The suites run on your own vitest, 3 or later, which is an optional peer dependency. `@cloudhal/storage`'s Miniflare helpers also load your own `miniflare`, an optional peer of any version. The ranges are wide on purpose. When a direct dependency's optional peer does not match the copy in your project, npm stops with ERESOLVE, even if nothing imports `./testing`. No semver range matches the prerelease miniflare that wrangler currently brings in, so with a narrower range npm would install a second miniflare beside it.
- @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- @cloudhal/core-contracts@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [321e8be]
  - @cloudhal/core-contracts@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [672b993]
  - @cloudhal/core-contracts@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [c287a09]
  - @cloudhal/core-contracts@0.4.0

## 0.3.13

### Patch Changes

- @cloudhal/core-contracts@0.3.13

## 0.3.12

### Patch Changes

- @cloudhal/core-contracts@0.3.12

## 0.3.11

### Patch Changes

- Updated dependencies [55deb41]
  - @cloudhal/core-contracts@0.3.11

## 0.3.10

### Patch Changes

- @cloudhal/core-contracts@0.3.10

## 0.3.9

### Patch Changes

- @cloudhal/core-contracts@0.3.9

## 0.3.8

### Patch Changes

- @cloudhal/core-contracts@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/core-contracts@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/core-contracts@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/core-contracts@0.3.5

## 0.3.4

### Patch Changes

- @cloudhal/core-contracts@0.3.4

## 0.3.3

### Patch Changes

- @cloudhal/core-contracts@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/core-contracts@0.3.2

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
