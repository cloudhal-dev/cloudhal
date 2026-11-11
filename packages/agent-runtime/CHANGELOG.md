# @cloudhal/agent-runtime

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

- b0ebd95: MCP OAuth step-up follow-ups (RFC-0044 phase 1, #168). These stay latent until phase 2 gives connections a `grantId`. A policy denial for missing scopes now carries `missing`, the required scopes that neither the caller's scopes nor an own variant satisfy. The new `stepUpScopes(policy, principal, tool, args)` turns that into the scopes a token should ask for, using the same rules as the handler: a propose call's `proposeScopes`, the own variant the member's role holds (`content:write:own` for an Author, `content:draft:own` for a Contributor, `site:publish:own` for an Author's publish) and the member's role on the call's site (RFC-0034 A2), capped by their installation role as consent caps a token (an installation Contributor who is an Editor on one site is asked for `content:draft:own` there). A call that would still be denied with those scopes, such as a write in plan mode or a tool outside the declared skill, is not challenged. The `/mcp` step-up 403 asks for exactly that set and now leaves an audit row, like other denials. `createApi` throws when `mcp.oauth.resource` is not the public URL of `/mcp`. A playground refuses both OAuth protected-resource documents (`403 {error: "playground", block: "mcp"}`), as its route table already said.
- c15218e: Second ReDoS sweep (#174). Input that made a regex backtrack is now handled in linear time; results are unchanged.
  
  - **Unauthenticated password-reset request.** `POST /api/password-reset/request` (and invite creation) checks the address length before anything else, and the address check no longer backtracks: `a@` followed by many dots used to cost seconds of CPU per request. Public token endpoints (`/api/password-reset/*`, invite acceptance) refuse a JSON body over 64 KiB with `413 payload_too_large`, whether or not it declares a `content-length`.
  - **core-ts.** Redirect path normalising and matching (on every site request): `normalisePath`, `joinTarget`, and `ancestorPaths`, which no longer lists ancestors that no redirect can match: those longer than a `from` may be (1024 code points) or holding `//`. Directive lines in search text keep their braces on one line, so a directive whose `{…}` spans a lone `\r` is no longer read as one. Search text built at publish time: fenced code, links, images and tags. SVG upload checks: CSS comments, `url(…)` references (about cubic on `url(` followed by spaces) and width/height lengths (new `css-scan.ts`).
  - **schedules.** The feed check's CDATA, element and `<enclosure>`/`<media:content>` url scans, and `urlPath`.
  - **agent-runtime.** SKILL.md frontmatter lines (a line of spaces was quadratic).
  - **Studio** (in `@cloudhal/cli`): the markdown body editor's trailing-newline trims.
- Updated dependencies [b0ebd95]
  - @cloudhal/storage@0.6.5
  - @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- @cloudhal/core-contracts@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- bf20e64: MCP OAuth discovery (RFC-0044 §1, phase 1 of #144): with `mcp.oauth` set, the 401 of `/mcp` carries a `WWW-Authenticate` challenge naming the RFC 9728 protected resource metadata and the scopes to request, the metadata is served at both well-known forms, and a token principal calling a tool without a scope its member's role holds gets a `403 insufficient_scope` step-up challenge. Deployments do not set the option yet: the authorization server is phase 2.
- @cloudhal/core-contracts@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

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

### Minor Changes

- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.

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

- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
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
