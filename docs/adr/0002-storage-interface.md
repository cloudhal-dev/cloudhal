# ADR-0002: Thin SQL/blob driver interface, batch-only, two backends
- Status: Accepted
- Date: 2026-10-07
- Related: RFC-0001
- Sources: https://developers.cloudflare.com/d1/platform/limits/ · https://developers.cloudflare.com/d1/worker-api/d1-database/ · https://orm.drizzle.team/docs/sqlite/batch-api · https://github.com/drizzle-team/drizzle-orm/issues/2463 · https://nodejs.org/docs/latest-v24.x/api/sqlite.html · https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/

## Context
The self-host promise is real only if the same code runs on Cloudflare (D1/R2/KV) and on a laptop (SQLite + filesystem). D1 has no interactive transactions, only atomic `batch()` (≤1000 statements, 100 bind params, 100 KB per statement). Node's built-in `node:sqlite` is still release-candidate.

## Decision
`packages/storage` exposes a ~50-line `SqlDriver` (`get`, `all`, `run`, atomic `batch`) and a `BlobStore` (`get/put/delete/list`). Adapters: `d1` and `better-sqlite3` now; `durable-sqlite` and `bun-sqlite` later; filesystem and R2 for blobs. **Interactive transactions are forbidden project-wide**; every multi-statement write is a `batch()`. Drizzle ORM provides schema + `drizzle-kit generate` SQL migrations shared by both backends; application code calls only `batch()`, never `transaction()`. Optimistic locking is a single `UPDATE … SET rev = rev + 1 WHERE id = ? AND rev = ?` with `changes === 1` as success. The same test suite runs against both adapters in CI.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Kysely + kysely-d1 | Type-safe SQL builder | `kysely-d1` community-maintained, last release Apr 2025 | Maintenance risk |
| Raw SQL only | Zero deps | Hand-written migrations diverge per backend | Drizzle's migration generation is the value |
| SQLite Durable Object as the only hosted store | Per-site isolation, sync SQL | No dashboard/CLI tooling, single-location | Keep as option behind the same interface |

## Consequences
- Positive: adapters are tiny; D1's constraints become everyone's constraints early, so nothing "works locally but not on Cloudflare".
- Negative: no long transactions means careful batch design for multi-node mutations (a snapshot write is one batch).
- Risks: D1 100-param limit on bulk upserts (chunk ≤100 binds); stale reads with D1 replication (use first-primary sessions for CAS reads).
