# @cloudhal/storage

Storage interfaces and adapters for Cloudhal. The interface is shaped by the most constrained backend, Cloudflare D1: **no interactive transactions**, atomic `batch()` only, and D1's bind/size limits enforced by every adapter so local behaviour matches production (ADR-0002).

| Export | What |
|---|---|
| `@cloudhal/storage` | `SqlDriver`, `BlobStore`, limits, `migrate()`, `migrations`, `MemoryBlobStore` |
| `@cloudhal/storage/sqlite` | `BetterSqlite3Driver` — local files or `:memory:` |
| `@cloudhal/storage/d1` | `D1Driver` — Cloudflare D1 binding |
| `@cloudhal/storage/fs` | `FsBlobStore` — directory on disk |
| `@cloudhal/storage/r2` | `R2BlobStore` — Cloudflare R2 binding |
| `@cloudhal/storage/testing` | conformance suites + Miniflare helpers (`createMiniflareD1`, `createMiniflareR2`) |

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

Every adapter must pass `describeSqlDriverConformance` / `describeBlobStoreConformance`; the D1 and R2 suites run against Miniflare (workerd in-process), so no Cloudflare account is needed.
