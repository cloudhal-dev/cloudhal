# @cloudhal/analytics

## 0.9.1

### Patch Changes

- Updated dependencies [74d7098]
  - @cloudhal/storage@0.9.1
  - @cloudhal/core-contracts@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [3b8e846]
  - @cloudhal/core-contracts@0.9.0
  - @cloudhal/storage@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [b6cf70f]
- Updated dependencies [d107895]
  - @cloudhal/core-contracts@0.8.0
  - @cloudhal/storage@0.8.0

## 0.7.3

### Patch Changes

- @cloudhal/core-contracts@0.7.3
  - @cloudhal/storage@0.7.3

## 0.7.2

### Patch Changes

- @cloudhal/core-contracts@0.7.2
  - @cloudhal/storage@0.7.2

## 0.7.1

### Patch Changes

- @cloudhal/core-contracts@0.7.1
  - @cloudhal/storage@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [6057871]
- Updated dependencies [d363160]
  - @cloudhal/storage@0.7.0
  - @cloudhal/core-contracts@0.7.0

## 0.6.5

### Patch Changes

- b0ebd95: Slug and name trims run in one linear pass instead of `/^-+|-+$/g` (CodeQL js/polynomial-redos, #168). This covers `slugify`, `foldName` and `slugifyFilename` in core-ts (the new `trimChar` is exported from `@cloudhal/core-ts/names`), heading ids in astro-renderer, and Studio's option, media and entry slugs. Results are unchanged. These trims were already linear in practice, because a run of other characters was collapsed to one `-` first. These inputs were quadratic and are linear now: analytics' `datasetName` on a long run of `_` inside a deployment name; json-render component keys in `fromJsonRender` (`./interop`); trailing whitespace in directive blocks and on comment lines; trailing `/` in request paths (the playground guard and route matching in api, analytics paths, the renderer's link localizing and redirect splats, the docs Worker). The new `trimEndChar` is exported from `@cloudhal/core-ts/names` too.
  
  Also in 0.6.3, with no changeset at the time (#161): Studio's "Not published" badges and its "unknown" scheduler state show their status dot again. They used a Badge variant without a dot colour and rendered no dot.
- Updated dependencies [b0ebd95]
  - @cloudhal/storage@0.6.5
  - @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- @cloudhal/core-contracts@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- @cloudhal/core-contracts@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

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
