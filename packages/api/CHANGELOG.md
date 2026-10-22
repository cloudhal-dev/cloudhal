# @cloudhal/api

## 0.4.0

### Minor Changes

- 3c4453e: First-class collections, step 2 (RFC-0040 / ADR-0042).
  - **Store:** the first entry of a new collection is refused (`path_conflict`, `reserved_path`) when its default prefix `/<collection>` overlaps another collection's permalink, a taxonomy archive, `/search` or a locale prefix. This closes the gap RFC-0038 left. A site update that declares a new collection runs the same check, and a declared collection that still has entries, or that a taxonomy names, cannot be undeclared (`collection_in_use`).
  - **API:** new routes under `/api/sites/:id/collections`:
    - `GET` (`content:read`) lists the registry;
    - `PUT /:key { settings, rev }` declares or changes a collection (`site:settings`), with `?dryRun=1`;
    - `DELETE /:key?rev=` undeclares an empty one.
  
    Creating an entry in a collection outside the registry is refused with `collection_undeclared` (422).
  - **Renderer:** RSS feeds leave out collections with `feed: false`, and `sitemap.xml` leaves out those with `sitemap: false`. The defaults are unchanged. `collectionLabel` and `collectionSettings` are re-exported from `./routing` for themes.
  - **MCP:** resetting a permalink with `set_collection_permalink` keeps the collection declared. Agents get hints for the new error codes.

### Patch Changes

- Updated dependencies [18a3960]
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/mcp-server@0.4.0
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/astro-renderer@0.4.0
  - @cloudhal/agent-runtime@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/astro-renderer@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/mcp-server@0.3.13
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/core-contracts@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- bc096b2: Studio shows changes that are not live yet: a badge beside Publish with the count ("2 changes", or "Not published" before the first publish) and a tooltip by kind ("3 changes aren't live yet · 2 articles and 1 page"). It comes from the new `GET /api/sites/:siteId/pending` (`site:read`): counts of what a publish would add, change and remove, by kind; adding or removing a page counts once. Studio refreshes it after every write to the site, on window focus and every 30 s.
- Updated dependencies [84d1fc3]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/astro-renderer@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/mcp-server@0.3.12
  - @cloudhal/agent-runtime@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/core-contracts@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 25b002c: Fewer D1 round trips per admin API request. The session is cached in a signed cookie for 60 seconds, so a session revoked elsewhere can stay usable that long (ADR-0010 addendum); membership and roles still apply at once. A member and their site roles load in one query. `get-session` is no longer rate limited, since the limiter's D1 read and write landed on every session check. Due comment purges are swept at most every 10 seconds per isolate instead of on every request.
- 55deb41: RFC-0038 step 1: `Site.collections.<key>.permalink` in the contracts (a template, `/blog/{slug}`; v1 is fixed segments plus `{slug}`), and `entryPath(site, entry)` / `entryAt(site, path)` in `@cloudhal/core-ts` (also `@cloudhal/core-ts/permalinks`). Every entry URL in the renderer, starter, API, MCP server, CLI and Studio now comes from them; with no `collections` set, every URL is the same as before. The renderer's one-argument `entryPath(entry)` is replaced by core's `entryPath(site, entry)` (re-exported from `@cloudhal/astro-renderer/routing`); themes pass the site, or `MediaContext.permalinks`.
- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
- 1d7998a: Studio's images load faster and stop re-downloading. Preview URLs carry the file's hash (`?v=`), so the browser keeps them for a day; without it the content route answers `private, no-cache` and a 304 through the ETag, instead of `no-store`. While an image loads, its tile shows the image's own colour and small blurred preview (computed at upload) instead of a spinner.
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/astro-renderer@0.3.11
  - @cloudhal/mcp-server@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- Updated dependencies [46f59d5]
  - @cloudhal/astro-renderer@0.3.10
  - @cloudhal/mcp-server@0.3.10
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
  - @cloudhal/mcp-server@0.3.9
  - @cloudhal/agent-runtime@0.3.9
  - @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-contracts@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- Updated dependencies [da8fe6f]
  - @cloudhal/mcp-server@0.3.8
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
  - @cloudhal/mcp-server@0.3.7
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
  - @cloudhal/mcp-server@0.3.6
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
  - @cloudhal/mcp-server@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

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
