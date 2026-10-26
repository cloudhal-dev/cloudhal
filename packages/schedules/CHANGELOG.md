# @cloudhal/schedules

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- 8a30e30: The `./testing` subpath now ships. The published packages pointed `./testing` at `dist/src/testing.js` and `.d.ts`, but the build left those files out, so importing `@cloudhal/{storage,analytics,comments,schedules}/testing` failed with ERR_MODULE_NOT_FOUND. The suites run on your own vitest, 3 or later, which is an optional peer dependency. `@cloudhal/storage`'s Miniflare helpers also load your own `miniflare`, an optional peer of any version. The ranges are wide on purpose. When a direct dependency's optional peer does not match the copy in your project, npm stops with ERESOLVE, even if nothing imports `./testing`. No semver range matches the prerelease miniflare that wrangler currently brings in, so with a narrower range npm would install a second miniflare beside it.
- Updated dependencies [970c8a1]
- Updated dependencies [6cb7945]
- Updated dependencies [8a30e30]
  - @cloudhal/storage@0.6.2
  - @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- @cloudhal/core-contracts@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [321e8be]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [672b993]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/storage@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [c287a09]
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- @cloudhal/core-contracts@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- @cloudhal/core-contracts@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- Updated dependencies [55deb41]
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- @cloudhal/core-contracts@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- @cloudhal/core-contracts@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- @cloudhal/core-contracts@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/core-contracts@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/core-contracts@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/core-contracts@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- @cloudhal/core-contracts@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- @cloudhal/core-contracts@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/core-contracts@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [c70d3fa]
  - @cloudhal/storage@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Patch Changes

- @cloudhal/core-contracts@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/core-contracts@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
