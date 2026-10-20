# @cloudhal/cloudflare

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
