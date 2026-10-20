# @cloudhal/mcp-server

## 0.3.2

### Patch Changes

- @cloudhal/agent-runtime@0.3.2
  - @cloudhal/analytics@0.3.2
  - @cloudhal/astro-renderer@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-contracts@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/schedules@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/agent-runtime@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/astro-renderer@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/schedules@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [a28c22e]
- Updated dependencies [c70d3fa]
  - @cloudhal/astro-renderer@0.3.0
  - @cloudhal/storage@0.3.0
  - @cloudhal/agent-runtime@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/schedules@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Minor Changes

- e4b1c83: `update_page` takes an optional `status` (draft, review, published, archived; RFC-0035), so an agent can publish or unpublish one page, such as a finished translation, without a release. The store's checks still apply: a machine translation in a review-required collection, or one with failing checks, is refused. The page goes live with the next site publish.

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/astro-renderer@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/agent-runtime@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/agent-runtime@0.1.1
  - @cloudhal/analytics@0.1.1
  - @cloudhal/astro-renderer@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
