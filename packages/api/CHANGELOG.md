# @cloudhal/api

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
