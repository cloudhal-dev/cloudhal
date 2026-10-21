# @cloudhal/astro-renderer

## 0.3.10

### Patch Changes

- 46f59d5: The site Worker's responses carry `Vary: Host`, and redirect-host 301s never enter the edge cache (#62). Workers Cache keys by path, not hostname, so before this every host routed to one site Worker shared a cache entry per path: a `--redirect` host's 301 could be served on the site's own domain (a redirect loop), and the sites of a multi-site Worker could serve each other's cached pages.
- @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-contracts@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- 348a00a: `cloudhal domain set <host> --redirect www.<host>`: hosts that answer with a 301 to the site's domain (path and query kept), routed to the site Worker as Custom Domains on the next deploy (#49). `cloudhal domain remove redirects` drops them.
- @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-contracts@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- @cloudhal/analytics@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-contracts@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/analytics@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-contracts@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/analytics@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-contracts@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/analytics@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-contracts@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- @cloudhal/analytics@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-contracts@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- @cloudhal/analytics@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/analytics@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-contracts@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- a28c22e: New `@cloudhal/cloudflare/playground` (RFC-0036): `createPlaygroundWorker({ seed, render, deployUrl })` returns the playground Worker and its `PlaygroundSite` Durable Object — one SQLite database per visitor holding the store, the API in playground mode and the rendered site, a signed host-only session cookie, a 60-minute TTL with a 2-hour cap, Reset, size and node caps, per-IP and per-session rate limits, Turnstile after a limit hit, a daily session cap and a kill switch. `@cloudhal/astro-renderer/runtime` gains `withRequestStore(store, siteId, fn)`, which renders a request from a store the entry chooses; such pages are private and never edge-cached.

### Patch Changes

- Updated dependencies [c70d3fa]
  - @cloudhal/storage@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Minor Changes

- 82fa917: Four surface gaps found while building interactive articles (RFC-0022, after 22e).
  - **Computed comparisons:** a `visible` condition or `if`'s `cond` takes a call as an operand, e.g. `{"lt": [{"call": "calculate", …}, {"call": "calculate", …}]}`, within the same nesting and call limits. `evaluateCondition` takes an optional `ResolveContext`.
  - **`Toggle` label:** a labelled Toggle shows its label as a `<legend>`, as RadioGroup does.
  - **`Table` columns:** `hideOnPhone: true` keeps a column (never the first) out of the phone card.
  - **`formatNumber`:** `minDigits` keeps trailing zeros (9.60).
  - **Runtime:** it is now `surface.11.js`; the earlier names keep working.

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/analytics@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
