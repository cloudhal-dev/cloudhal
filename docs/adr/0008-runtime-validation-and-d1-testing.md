# ADR-0008: Precompiled schema validators; D1 tested through Miniflare
- Status: Accepted (Miniflare version rationale corrected by ADR-0012)
- Date: 2026-10-07
- Related: ADR-0001, ADR-0002
- Sources: https://ajv.js.org/standalone.html · https://developers.cloudflare.com/workers/runtime-apis/web-standards/#javascript-standards (no `eval`/`new Function`) · https://github.com/cloudflare/workers-sdk/tree/main/packages/miniflare (programmatic `getD1Database`)

## Context
Agent mutations must be validated against the contracts at the write boundary, in Node and on Cloudflare Workers. Ajv compiles schemas with `new Function`, which Workers forbid. Separately, the storage layer must be proven against real D1 semantics (no interactive transactions, `batch()` atomicity, bind limits) without a Cloudflare account.

## Decision
- `@cloudhal/core-contracts` generates **standalone validator modules** with ajv's `standaloneCode` at build time (`pnpm gen`), committed under `src/generated/validators.js` (+ `.d.ts`), and exports the bundled schemas as constants. Runtime code never instantiates Ajv.
- Storage and core-ts tests run **the same suite** against `better-sqlite3` (in-memory) and against a **Miniflare-provided D1 database** (workerd in-process), so CI exercises D1 behaviour offline.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Ajv at runtime | Simple | Fails on Workers (`new Function`) | Hard blocker |
| zod/TypeBox runtime validators | Nice DX | Second source of truth (ADR-0001) | Rejected before |
| `@cloudflare/vitest-pool-workers` for D1 tests | Runs tests inside workerd | Heavier, pool-specific config, slower feedback | Miniflare's D1 handle is enough for storage tests; revisit for Worker-side integration tests |
| Mock D1 in tests | Fast | Does not prove D1 limits/atomicity | The whole point is real semantics |

## Consequences
- Positive: validation works everywhere with zero runtime deps; D1 constraints are enforced by tests from Sprint 2 on.
- Negative: one more generated artefact to drift-check; Miniflare is an alpha line (5.x) tied to wrangler's version.
- Risks: Miniflare API churn → pin to the version wrangler ships.
