# @cloudhal/api

## 0.3.4

### Patch Changes

- d6427d5: Agent keys are also accepted as `Authorization: Bearer <key>` (what most MCP clients and Codex's `bearer_token_env_var` send), on `/mcp` and wherever `x-api-key` was. `/api/admin/*` keeps its deployment-token bearer and never reads it as an agent key.
- Updated dependencies [aae143f]
  - @cloudhal/mcp-server@0.3.4
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

- 54a524c: A `CLOUDHAL_DEPLOY_TOKEN` shorter than 32 characters no longer makes every `/api` request fail with 500. Only `/api/admin` is disabled (503 `deploy_token_invalid`): the error is logged once, `/api/health` reports `problems: ["deploy_token_invalid"]`, and sign-in and Studio keep working. The Workers Builds setup steps and the Deploy button guide now say not to edit `CLOUDHAL_DEPLOY_TOKEN`, because every build replaces it.
- @cloudhal/agent-runtime@0.3.3
  - @cloudhal/analytics@0.3.3
  - @cloudhal/astro-renderer@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/mcp-server@0.3.3
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
  - @cloudhal/mcp-server@0.3.2
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
  - @cloudhal/mcp-server@0.3.1
  - @cloudhal/schedules@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- 346781b: Playground mode (RFC-0036): `createApi({ playground: { info } })` answers every request as the fixed `PLAYGROUND_PRINCIPAL` (an Editor with site settings and nothing installation-wide or upload-related), refuses blocked routes with `403 {error: "playground"}` through the pure `isBlockedInPlayground(method, path)` guard (also exported for the playground Worker), limits request bodies, and reports `features.playground` in `/api/instance`. Every declared route is either blocked or allowed, and a route on neither list is refused. Studio shows a session bar (time left, Reset, Deploy to Cloudflare) and leaves out team, agent and account screens on a playground.

### Patch Changes

- Updated dependencies [a28c22e]
- Updated dependencies [c70d3fa]
  - @cloudhal/astro-renderer@0.3.0
  - @cloudhal/storage@0.3.0
  - @cloudhal/mcp-server@0.3.0
  - @cloudhal/agent-runtime@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/schedules@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
- Updated dependencies [e4b1c83]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/astro-renderer@0.2.0
  - @cloudhal/mcp-server@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/agent-runtime@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- `npm create cloudhal` and `npm install @cloudhal/cli` no longer hang. `@better-auth/api-key` names `@better-auth/core`, `@better-auth/utils` and `better-call` as open peers; npm picked newer releases whose peers conflict with better-auth 1.7.7's and backtracked forever (0.1.0). `@cloudhal/api` now depends on exactly the versions better-auth itself uses, so npm resolves the tree in seconds.
- @cloudhal/agent-runtime@0.1.1
  - @cloudhal/analytics@0.1.1
  - @cloudhal/astro-renderer@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/mcp-server@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
