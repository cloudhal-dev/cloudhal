# @cloudhal/storage

Storage interfaces and adapters for Cloudhal. The interface is shaped by the most constrained backend, Cloudflare D1: **no interactive transactions**, atomic `batch()` only, and D1's bind/size limits enforced by every adapter so local behaviour matches production (ADR-0002).

| Export | What |
|---|---|
| `@cloudhal/storage` | `SqlDriver`, `BlobStore`, limits, `migrate()`, `migrations`, `MemoryBlobStore`, `SqlBlobStore` (blobs in a SQL table, capped), `LayeredBlobStore` (read-only base under a writable upper), `FetcherBlobStore` (read-only, over a Worker `ASSETS` binding) |
| `@cloudhal/storage/sqlite` | `BetterSqlite3Driver` — local files or `:memory:` |
| `@cloudhal/storage/d1` | `D1Driver` — Cloudflare D1 binding |
| `@cloudhal/storage/do-sqlite` | `DoSqliteDriver` — a SQLite-backed Durable Object's `ctx.storage` (RFC-0036); `batch` runs in `transactionSync` |
| `@cloudhal/storage/fs` | `FsBlobStore` — directory on disk |
| `@cloudhal/storage/r2` | `R2BlobStore` — Cloudflare R2 binding |
| `@cloudhal/storage/testing` | conformance suites + Miniflare helpers (`createMiniflareD1`, `createMiniflareR2`, `createMiniflareDoSqlite`) |

```ts
import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";

const sql = await BetterSqlite3Driver.open("cloudhal.db");
await migrate(sql, migrations);
await sql.batch([
  { sql: "UPDATE nodes SET rev = rev + 1, body = ? WHERE id = ? AND rev = ?", params: [body, id, rev] },
]);
```

Migrations are TypeScript modules under `migrations/` (plain SQL strings) so they bundle for Workers without filesystem access. Each migration is applied as one atomic batch.

Every adapter must pass `describeSqlDriverConformance` / `describeBlobStoreConformance`; the D1, R2 and Durable Object suites run against Miniflare (workerd in-process), so no Cloudflare account is needed. `createMiniflareDoSqlite()` runs `DoSqliteDriver` inside a test-only Durable Object and hands Node a driver whose every call is one request to it, so any `SqlDriver` suite (core-ts's included) runs on Durable Object SQLite.

A whole site in one Durable Object (the playground's shape):

```ts
import { FetcherBlobStore, LayeredBlobStore, migrate, migrations, SqlBlobStore } from "@cloudhal/storage";
import { DoSqliteDriver } from "@cloudhal/storage/do-sqlite";

const sql = new DoSqliteDriver(ctx.storage);
await migrate(sql, migrations);
const blobs = new LayeredBlobStore(
  new FetcherBlobStore(env.ASSETS, "demo/"),             // read-only demo media
  new SqlBlobStore(sql, { maxBytes: 8 * 1024 * 1024 }), // the session's own blobs
);
```
