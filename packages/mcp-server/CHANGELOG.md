# @cloudhal/mcp-server

## 0.3.10

### Patch Changes

- Updated dependencies [46f59d5]
  - @cloudhal/astro-renderer@0.3.10
  - @cloudhal/agent-runtime@0.3.10
  - @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-contracts@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/schedules@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- Updated dependencies [348a00a]
  - @cloudhal/astro-renderer@0.3.9
  - @cloudhal/agent-runtime@0.3.9
  - @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-contracts@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- da8fe6f: `render_page` and `cloudhal render` gain a `font-fallback` check: text set in a web font with no metric-matched fallback after it in its stack, which moves when the font loads.
- @cloudhal/agent-runtime@0.3.8
  - @cloudhal/analytics@0.3.8
  - @cloudhal/astro-renderer@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-contracts@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/agent-runtime@0.3.7
  - @cloudhal/analytics@0.3.7
  - @cloudhal/astro-renderer@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-contracts@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/agent-runtime@0.3.6
  - @cloudhal/analytics@0.3.6
  - @cloudhal/astro-renderer@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-contracts@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/agent-runtime@0.3.5
  - @cloudhal/analytics@0.3.5
  - @cloudhal/astro-renderer@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-contracts@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- aae143f: The server's instructions point developer agents to the docs at https://cloudhal.dev/llms.txt. The server itself has no docs tools; the docs have their own MCP server at https://cloudhal.dev/mcp.
- @cloudhal/agent-runtime@0.3.4
  - @cloudhal/analytics@0.3.4
  - @cloudhal/astro-renderer@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-contracts@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- @cloudhal/agent-runtime@0.3.3
  - @cloudhal/analytics@0.3.3
  - @cloudhal/astro-renderer@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/schedules@0.3.3
  - @cloudhal/storage@0.3.3

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
