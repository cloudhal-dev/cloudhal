# @cloudhal/storage

## 0.7.1

### Patch Changes

- @cloudhal/core-contracts@0.7.1

## 0.7.0

### Minor Changes

- 6057871: Remote MCP clients can now authorize with OAuth 2.1 against the deployment itself (RFC-0044 Phase 2, ADR-0045). Better Auth's `mcp()` and `jwt()` plugins run in the Studio's auth instance when the runtime has a stable public origin: the admin Worker uses its origin, `cloudhal studio` needs `--base-url` / `CLOUDHAL_BASE_URL` (it logs why OAuth is off otherwise), and `CLOUDHAL_MCP_OAUTH=off` turns it off. Access tokens are Ed25519 JWTs bound to `/mcp` for one hour, refresh tokens rotate with a 30-second reuse window, and each connection is approved on Studio's new consent screen (`/oauth/consent`), which narrows the requested scopes by the member's role and records an `agent_grants` row (migration `0031_oauth`). A token resolves to the same principal an agent key does; revoking a connection (`DELETE /api/agent-grants/:id`) or removing the member refuses it on its next call. The Better Auth family moves to 1.7.18. Client registration (CIMD, DCR) and the "Connected agents" screen follow in Phase 3.

### Patch Changes

- d363160: Remote MCP clients can now register themselves (RFC-0044 Phase 3a, ADR-0045). Clients that name an HTTPS Client ID Metadata Document as their `client_id` (Claude Code, Codex, VS Code) are accepted through `@better-auth/cimd`, fetched with the media import's SSRF-safe transport (pinned on Node, DoH-checked on Workers; https only, public addresses only, no redirects, 5 KB, 5 s). Clients without one (Cursor) use dynamic client registration at `/api/auth/oauth2/register`: public clients only, rate-limited per address and per day, capped at 5,000, and pruned by the scheduler after 30 unused days. Document clients are fetched at most hourly per client, with budgets in Cloudhal's own counters that never lock out stored clients, a cap of 5,000 that evicts unused clients (the well-known clients' hosts are exempt), pruning after three hours unused, and a failed refetch that refuses the client; migration `0032_oauth_client_kind_index` indexes them. Redirect URIs must be https, loopback http (any port) or a native app's private-use scheme (`cursor`, `vscode`, reverse-domain, `CLOUDHAL_MCP_REDIRECT_SCHEMES`), and the client host list applies at every authorization. With DCR off, the clients it registered earlier cannot start new authorizations. The consent screen shows client names plain and short, a document client's host first, and marks self-registered clients as unverified. `CLOUDHAL_MCP_CIMD=off`, `CLOUDHAL_MCP_DCR=off`, `CLOUDHAL_MCP_CLIENT_HOSTS` and `CLOUDHAL_MCP_REDIRECT_SCHEMES` control it on both runtimes, and the Docker compose file passes them through. The Phase 2 server-side test client (`OauthServer.createClient`) is removed. `set_embargo` through an OAuth connection now files the gate for a person's approval instead of leaving it unapplied, and the request is notified while it waits. `safeFetch` results carry the response headers.
- @cloudhal/core-contracts@0.7.0

## 0.6.5

### Patch Changes

- b0ebd95: Cloudhal's own rate-limit counters move out of Better Auth's `rateLimit` table into `rate_limits` (migration `0030_rate_limits`, #168). This covers the hourly cap of 3 reset mails per address, the per-minute buckets of the public token endpoints and each agent key's window. Better Auth prunes `rateLimit` by its own 60 s window, so the hourly reset-mail cap used to restart about a minute after any sign-in from the same address. Each hit counts in one statement (an upsert with `RETURNING`). Because the keys come from client addresses and submitted email addresses, about one hit in 32 also deletes up to 500 expired counters through an `expires_at` index. The migration deletes the old `cloudhal:` rows from `rateLimit`, so each counter starts over once at upgrade.
- @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- @cloudhal/core-contracts@0.6.4

## 0.6.3

### Patch Changes

- @cloudhal/core-contracts@0.6.3

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
