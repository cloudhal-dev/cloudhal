/**
 * @cloudhal/storage — storage interfaces and adapters.
 *
 * Interfaces: `SqlDriver` (get/all/run/atomic batch/exec) and `BlobStore` (get/put/delete/list).
 * Adapters: `@cloudhal/storage/sqlite` (better-sqlite3), `@cloudhal/storage/d1`, `@cloudhal/storage/fs`,
 * `@cloudhal/storage/r2`, `@cloudhal/storage/do-sqlite` (Durable Object SQLite), plus `MemoryBlobStore`,
 * `SqlBlobStore`, `LayeredBlobStore` and `FetcherBlobStore` here. Conformance suites: `@cloudhal/storage/testing`.
 */

export { migrations } from "../migrations/index.ts";
export {
  type BlobFetcher,
  FetcherBlobStore,
  type FetcherBlobStoreOptions,
} from "./blob/fetcher.ts";
export { LayeredBlobStore } from "./blob/layered.ts";
export { MemoryBlobStore } from "./blob/memory.ts";
export { SqlBlobStore, type SqlBlobStoreOptions } from "./blob/sql.ts";
export * from "./migrate.ts";
export * from "./types.ts";
