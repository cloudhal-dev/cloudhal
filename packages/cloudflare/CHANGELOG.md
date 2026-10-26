# @cloudhal/cloudflare

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- df8695e: The admin Worker's minute tick gains a `lists.backfill` system job (every five minutes): a budgeted `rebuildListValues` for listed collections that are new, changed, reset by a race or older than migration 0029, sized to the tick plan. Its declared cost (16 statements on the free plan, 150 on paid) is the run's statement budget, which the backfill enforces on every statement, discovery included, and each run starts at another waiting collection. On the paid plan it also removes rows of collections that list no fields any more, never those of a collection listed while it ran.
- Updated dependencies [7223152]
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [f73d05a]
- Updated dependencies [f73d05a]
- Updated dependencies [6cb7945]
- Updated dependencies [f669266]
- Updated dependencies [77fa9e5]
- Updated dependencies [786a455]
- Updated dependencies [8a30e30]
  - @cloudhal/core-ts@0.6.2
  - @cloudhal/api@0.6.2
  - @cloudhal/schedules@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/mcp-server@0.6.2
  - @cloudhal/analytics@0.6.2
  - @cloudhal/comments@0.6.2
  - @cloudhal/agent-runtime@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [40dbfcb]
- Updated dependencies [028f396]
- Updated dependencies [92c3867]
  - @cloudhal/core-ts@0.6.1
  - @cloudhal/mcp-server@0.6.1
  - @cloudhal/api@0.6.1
  - @cloudhal/comments@0.6.1
  - @cloudhal/agent-runtime@0.6.1
  - @cloudhal/analytics@0.6.1
  - @cloudhal/schedules@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.

### Patch Changes

- Updated dependencies [321e8be]
- Updated dependencies [4f3f520]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [2e89658]
- Updated dependencies [84c6d94]
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/mcp-server@0.6.0
  - @cloudhal/agent-runtime@0.6.0
  - @cloudhal/api@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [672b993]
- Updated dependencies [9d04a37]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/mcp-server@0.5.0
  - @cloudhal/api@0.5.0
  - @cloudhal/agent-runtime@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [18a3960]
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/mcp-server@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/api@0.4.0
  - @cloudhal/agent-runtime@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/api@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/mcp-server@0.3.13
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- Updated dependencies [84d1fc3]
- Updated dependencies [bc096b2]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/api@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/mcp-server@0.3.12
  - @cloudhal/agent-runtime@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 25b002c: Fewer D1 round trips per admin API request. The session is cached in a signed cookie for 60 seconds, so a session revoked elsewhere can stay usable that long (ADR-0010 addendum); membership and roles still apply at once. A member and their site roles load in one query. `get-session` is no longer rate limited, since the limiter's D1 read and write landed on every session check. Due comment purges are swept at most every 10 seconds per isolate instead of on every request.
- Updated dependencies [25b002c]
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
- Updated dependencies [1d7998a]
  - @cloudhal/api@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/mcp-server@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- @cloudhal/api@0.3.10
  - @cloudhal/mcp-server@0.3.10
  - @cloudhal/agent-runtime@0.3.10
  - @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/schedules@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- @cloudhal/api@0.3.9
  - @cloudhal/mcp-server@0.3.9
  - @cloudhal/agent-runtime@0.3.9
  - @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- Updated dependencies [da8fe6f]
  - @cloudhal/mcp-server@0.3.8
  - @cloudhal/api@0.3.8
  - @cloudhal/agent-runtime@0.3.8
  - @cloudhal/analytics@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/agent-runtime@0.3.7
  - @cloudhal/analytics@0.3.7
  - @cloudhal/api@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/mcp-server@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/agent-runtime@0.3.6
  - @cloudhal/analytics@0.3.6
  - @cloudhal/api@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/mcp-server@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/agent-runtime@0.3.5
  - @cloudhal/analytics@0.3.5
  - @cloudhal/api@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/mcp-server@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [d6427d5]
- Updated dependencies [aae143f]
  - @cloudhal/api@0.3.4
  - @cloudhal/mcp-server@0.3.4
  - @cloudhal/agent-runtime@0.3.4
  - @cloudhal/analytics@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [54a524c]
  - @cloudhal/api@0.3.3
  - @cloudhal/agent-runtime@0.3.3
  - @cloudhal/analytics@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/mcp-server@0.3.3
  - @cloudhal/schedules@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/agent-runtime@0.3.2
  - @cloudhal/analytics@0.3.2
  - @cloudhal/api@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/mcp-server@0.3.2
  - @cloudhal/schedules@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/agent-runtime@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/api@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/mcp-server@0.3.1
  - @cloudhal/schedules@0.3.1

## 0.3.0

### Minor Changes

- a28c22e: New `@cloudhal/cloudflare/playground` (RFC-0036): `createPlaygroundWorker({ seed, render, deployUrl })` returns the playground Worker and its `PlaygroundSite` Durable Object — one SQLite database per visitor holding the store, the API in playground mode and the rendered site, a signed host-only session cookie, a 60-minute TTL with a 2-hour cap, Reset, size and node caps, per-IP and per-session rate limits, Turnstile after a limit hit, a daily session cap and a kill switch. `@cloudhal/astro-renderer/runtime` gains `withRequestStore(store, siteId, fn)`, which renders a request from a store the entry chooses; such pages are private and never edge-cached.

### Patch Changes

- Updated dependencies [346781b]
- Updated dependencies [c70d3fa]
  - @cloudhal/api@0.3.0
  - @cloudhal/storage@0.3.0
  - @cloudhal/mcp-server@0.3.0
  - @cloudhal/agent-runtime@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/schedules@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
- Updated dependencies [e4b1c83]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/mcp-server@0.2.0
  - @cloudhal/api@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/agent-runtime@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @cloudhal/api@0.1.1
  - @cloudhal/agent-runtime@0.1.1
  - @cloudhal/analytics@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/mcp-server@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
