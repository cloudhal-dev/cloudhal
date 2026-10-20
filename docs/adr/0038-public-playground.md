# ADR-0038: Public playground: one SQLite Durable Object per visitor, store and renderer inside it, deny-list guard with a route walk
- Status: Accepted
- Date: 2026-10-20 (decided by Halil)
- Related: RFC-0036, ADR-0002, ADR-0008, ADR-0012, ADR-0018, ADR-0024, ADR-0036, ADR-0037
- Sources: [Durable Objects SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) · [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) · [Durable Objects alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) · [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) · [Workers limits (script size, startup)](https://developers.cloudflare.com/workers/platform/limits/) · [EmDash playground](https://github.com/emdash-cms/emdash/tree/main/demos/playground)

## Context
Trying Cloudhal needs Node, wrangler and a Cloudflare account. RFC-0036 proposes `try.cloudhal.com` (ADR-0037): every visitor gets a private, disposable Cloudhal (Studio, API and rendered site) with no account. An internal spike on workerd measured the two placements of the store and the bundle size: the first open is 24–41 ms of server work, a fresh database is about 815 KB, 20 concurrent sessions all succeeded, and one Worker holding the API and the site renderer is at most 1.6 MiB gzip. With the store in the Worker and SQL over DO RPC, a publish took 26 sequential RPCs (7 ms locally against 2 ms with the store in the DO, an estimated 25–130 ms more in production). Snapshots and publishes write blobs (`nodes/<hash>.json`, bundle shards), so a read-only blob store breaks every save.

## Decision
1. **One SQLite-backed Durable Object per session**, addressed by `idFromName(<ULID from a __Host- cookie>)`. No shared database, no server-side session table, no signed cookie (the ID is unguessable and a session holds nothing of value).
2. **Store, API and renderer run inside the session's DO.** The Worker serves static files, checks the cookie, applies the guard and the rate limits, and forwards with `stub.fetch`. One hop per request, however chatty the call.
3. **`@cloudhal/storage/do-sqlite`**: `DoSqliteDriver` over `ctx.storage.sql`, `batch` atomic through `transactionSync` and never exposed as a transaction to callers (hard rule 4 holds), D1 limits enforced as on every adapter (ADR-0002). Blobs: `SqlBlobStore` (blobs in the same SQL database, capped), `LayeredBlobStore` (read-only base under a writable upper), `FetcherBlobStore` (static assets). All pass the existing conformance suites on Miniflare; core-ts's behavioural suite gets a DO backend.
4. **Playground mode is defence in depth**: the pure `isBlockedInPlayground(method, path)` deny list runs in the Worker and again as API middleware; `createApi({ playground })` leaves auth, MCP, mail, AI and analytics unconfigured; the fixed `PLAYGROUND_PRINCIPAL` holds Editor scopes plus `site:settings` and nothing installation-wide, so the default-deny scope check sits under both. A test walks every route `createApi` registers and fails on any route that is neither blocked nor on the allow list.
5. **Lifetime**: an alarm deletes everything 60 minutes after the last request, never later than 2 hours after creation; a DO older than 2 hours refuses requests even if the alarm did not run. Reset deletes at once.
6. **Session pages are private**: rendered under `/s/<session>/`, `cache-control: private, no-store`, `x-robots-tag: noindex`, never a `cache-tag`. ADR-0037 rule 2's "no publishing" is read as "no public publishing": a publish is visible only to its own session.
7. **Agents are off in the MVP**; abuse limits, a daily session cap and a `PLAYGROUND_ENABLED` kill switch bound cost (RFC-0036 §7, §9).
8. **Split**: the general pieces (driver, blob stores, playground mode, `@cloudhal/cloudflare/playground`, `withRequestStore`, Studio's session bar) live in the monorepo, versioned and tested in `pnpm check`. The deployable site (wrangler config, landing page, demo pack, domain, secrets) lives in `cloudhal-dev/try` and only composes published packages.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Store in the Worker, SQL over DO RPC | DO only runs SQL; render CPU off the DO | One network hop per query (26 for a publish) | Spike: 1.5–3.5× slower locally; worse with real RTT |
| One shared D1, a site per visitor (ADR-0036) | No new driver | Shared blast radius, cleanup across 30+ tables, noisy neighbours, D1 size cap | Isolation is the point |
| A D1 database per visitor | Real D1 | Creation through the API takes seconds; account database limits | Too slow and too limited for anonymous traffic |
| SQLite WASM in the browser | No server cost | Hides the platform; large download; no Worker rendering | Would not show Cloudhal on Cloudflare |
| Read-only blob store | Simplest | Snapshots and publishes write blobs | Breaks every save |
| Allow list only, no route walk | Smaller | A forgotten route stays reachable or silently breaks | The walk makes every new route a decision |

## Consequences
- **Positive.** Cloudhal runs with no D1 at all (also on Workers Free); isolation is per visitor by construction; first open is tens of milliseconds; idle sessions cost nothing; every new API route is classified for the playground before it ships.
- **Negative.** A third SQL backend to keep in the conformance suites; Studio carries a `features.playground` branch; the DO runs rendering on its single thread.
- **Risks.** Worker startup CPU with a 1.6 MiB bundle (measured on a real deploy in phase 3; lazy-import the renderer if tight); production DO latency from far regions (measured before launch); abuse of compute (rate limits, caps, kill switch).
