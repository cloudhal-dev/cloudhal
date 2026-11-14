# @cloudhal/cloudflare

## 0.9.1

### Patch Changes

- 74d7098: RFC-0045 rollout step 7b: **reference and repeater fields are now enabled.** Sites can define `reference` fields (entries of one to five collections of the same site, one or several, with optional conditions) and `repeater` fields (ordered lists of items with up to ten flat sub-fields) wherever the renderer serving them reads the two types. See [docs/guides/fields.md](https://github.com/cloudhal-dev/cloudhal/blob/main/docs/guides/fields.md).
  
  - **Where.** On Cloudflare, once the site Worker serving the site answers `GET /__cloudhal/features` with `fields: 2` (0.9.0 and later): the admin Worker asks the Worker each site is routed to (`SITE`, or an attached `SITE_n`), as it asks for time gates, and remembers a yes for that Worker only. Time gates are now confirmed per site Worker too, so a site on an older attached Worker no longer inherits the installation Worker's answer. Deploy the site Worker first; until it reports `fields: 2`, the types stay refused with `fields_unsupported` on every path. On Node (`cloudhal dev`, `studio`, self-host, Docker) and in the playground, always, since the renderer runs in the same process (`openLocalStore` passes `FIELDS_SUPPORTED`).
  - **Every write path follows the capability:** Studio, MCP, the API, field operations and their dry runs, and every bundle: `cloudhal push` (the admin route passes the store's capability), `pull`, `cloudhal import` (dry runs included), `--replace` and `--revert`. A bundle that defines either type is still refused whole where the capability does not hold, and a site's new snapshot cannot point at another site's held site body to bring the types in.
  - **MCP and Studio.** `update_collection` and `change_field_type` list both types, and `/api/instance` answers `features.referenceFields: true`, on servers that have the capability. The store still decides per site.
  - **A one-time `entry_refs` check per site** (`rebuildEntryRefs`, new core-ts export): the admin Worker's new `refs.rebuild` system job (every five minutes, offset from `lists.backfill`, until every site is done; then two reads a run), and `openLocalStore` at start-up. Rows are written per entry, anchored on the hash each entry was read with, so a concurrent edit keeps its own rows; each chunk is anchored on the site node's hash, so no statement grows with the site's settings; it leaves a site alone while a text ↔ reference type change runs there; progress is in the new `entry_refs_state` table (storage migration `0034_entry_refs_state`), so a run stopped anywhere resumes. It is a safety net and should find nothing to change.
- Updated dependencies [74d7098]
  - @cloudhal/core-ts@0.9.1
  - @cloudhal/storage@0.9.1
  - @cloudhal/api@0.9.1
  - @cloudhal/mcp-server@0.9.1
  - @cloudhal/comments@0.9.1
  - @cloudhal/agent-runtime@0.9.1
  - @cloudhal/analytics@0.9.1
  - @cloudhal/schedules@0.9.1

## 0.9.0

### Patch Changes

- 9aa67d3: RFC-0045 rollout step 3b: publishes purge the pages that show references. Nothing changes for sites without reference definitions. Their publish purge plans are the same, with no bundle read. Their release runs send the plan stored at pin time, as before, with no re-plan; the only addition is one read of the published site node, to tell them apart.
  
  - **The referrer closure** (`references/purge.ts`, called by `planCachePurge`).
    - The seeds are the groups of every changed, added or removed entry, and of every entry whose shown asset changed.
    - It purges the referrers of those groups, two hops deep, with every language version of each referrer.
    - It also purges every member of each group a changed entry names, before or after ("used by").
    - Values are resolved, so a translation that only inherits counts.
    - It reads only the `from` and `to` snapshots' bodies, never the working copy or `entry_refs`.
  - **Reads and budgets.** A publish that changes no entry and no shown asset reads nothing. Otherwise the closure keeps one hash-keyed cache:
    - one bundle (`to`'s, else `from`'s), streamed and cut down as each shard is parsed;
    - then the missing hashes, read by the closure itself, six at a time, and cut down the same way.
  
    A passed budget purges everything:
    - bytes (`maxBodyBytes`, 32 MB);
    - nodes (`maxNodes`, 50,000);
    - reads (`maxReads`, shard reads included);
    - tags (`maxTags`).
  
    So does any field-operation marker on either snapshot's site node, for sites that hold references or convert from them.
  - **`readSnapshotBundle`** (`SnapshotReader.readSnapshotBundle`, `SiteGraphStore.readSnapshotBundle`, `readSnapshotBundle` in bundles) takes optional `maxBytes`, `maxNodes`, `keep`, `only` (bodies node by node) and `spent` (a shared byte total). A passed budget throws `BundleBudgetError` before the shard is parsed. No new cache tags.
  - **Release runs on sites with references re-plan their purge at run time** (`references/release-purge.ts`), from the pointer they moved to the snapshot they made, instead of sending the plan stored at pin time.
    - The test is the published site node, which `publishRelease` now returns (`publishedSite`). That costs one blob read per run with a purger, except on a first publish; the read is counted, never refused. If it fails, the working row decides.
    - The re-plan runs over the tick's counting driver.
    - The release graph's blob calls (`refreshSearch`, `labelOf`, the re-plan) are charged to one allowance per invocation, shared by the cron's ticks (`ScheduledTickOptions.releaseBlobs`): 350 on Workers Free, 3,000 on Paid. "Publish now" sizes it from the deployment's tick budget (`ReleaseService` and `SchedulesDeps.tickBudget`).
    - Past the allowance, or if the re-plan fails, the run purges everything. A re-plan with more distinct terms than reads left purges everything before reading anything.
    - The pin-time plan skips the closure (`CachePurgeOptions.references: false`): for these sites it is the expected outcome only.
    - `RELEASE_EXECUTOR_COST` is 26 (it counts `refreshSearch` and `recordPurge` now).
  - **`@cloudhal/cloudflare`:** the cron handler passes one `releaseBlobs` allowance to both ticks of its invocation (`cronTick`); the alarm and the request backstop run one tick each, with the default allowance.
- Updated dependencies [41d783a]
- Updated dependencies [9aa67d3]
- Updated dependencies [bb43a16]
- Updated dependencies [dda55ee]
- Updated dependencies [3678855]
- Updated dependencies [b7ac2e9]
- Updated dependencies [4a5633d]
  - @cloudhal/core-ts@0.9.0
  - @cloudhal/mcp-server@0.9.0
  - @cloudhal/api@0.9.0
  - @cloudhal/agent-runtime@0.9.0
  - @cloudhal/analytics@0.9.0
  - @cloudhal/comments@0.9.0
  - @cloudhal/schedules@0.9.0
  - @cloudhal/storage@0.9.0

## 0.8.0

### Patch Changes

- dc519c0: The consumers of reference fields (RFC-0045 §2, rollout step 2b, #114). Both new field types stay refused on every write path in production, so none of this is reachable before rollout step 7. The shared suites run it through `SiteGraphStoreOptions.fieldTypes`.
  
  - **Assets inside repeater items.** `fieldAssetRefs` walks items and records `fields.<key>.<sub>` with each use's item path. `fieldAssetIssues` checks sub-field types (a PDF in an image sub-field is refused) and reports at every item that uses the file. Skips match issue paths by prefix, in the store and in the MCP precheck alike, so top-level behaviour is unchanged.
  - **Field-operation rewrites** write their entries' `entry_refs` rows. A rewrite that changes a reference value is guarded on its target, and every rewrite in a site with reference fields is guarded on the collection's definitions.
  - **Releases** no longer treat reference values as dependencies, so a referenced entry is neither locked nor required live.
  - **Language editions** (`forEdition`) keep only what the edition's own write accepts. A reference needs a member of its group in an allowed collection that meets the field's `where`. A single-target field keeps one id, and a multiple field keeps at most `maxItems`. An entry holds at most 100 references, and a repeater at most `maxItems` items. Values are read through a running rename's old key. Everything not carried, including repeater items left empty, is reported with its reason through `onDropped`. A re-save keeps the values the edition entry already holds, as its own write would.
  - **CLI.** `cloudhal import --dry-run` warns about references that will show nothing, and about originals relinked into another group.
  - **Cloudflare.** `siteFieldTypeSupport` reads the site Worker's `fields` feature. `FIELDS_FEATURE_VERSION` and `FIELDS_SUPPORTED` are exported from `@cloudhal/core-ts/fields`. Nothing passes them to a store before step 7.
  - **API.** `GET /sites/:siteId/entries/pick` is the entry picker. Its search folds case and diacritics on both sides with `foldName`, Turkish İ and ı included, and reads at most 1,000 entries per request. When that runs out before 20 matches, it answers `truncated: true` with a `cursor` to continue from. `GET /sites/:siteId/entries/:entryId/references` lists an entry's referrers, each with the language versions that show it. Both need `content:read`.
- Updated dependencies [dc519c0]
- Updated dependencies [b6cf70f]
- Updated dependencies [d107895]
  - @cloudhal/core-ts@0.8.0
  - @cloudhal/api@0.8.0
  - @cloudhal/mcp-server@0.8.0
  - @cloudhal/storage@0.8.0
  - @cloudhal/comments@0.8.0
  - @cloudhal/agent-runtime@0.8.0
  - @cloudhal/analytics@0.8.0
  - @cloudhal/schedules@0.8.0

## 0.7.3

### Patch Changes

- Updated dependencies [5cb0a5d]
  - @cloudhal/core-ts@0.7.3
  - @cloudhal/api@0.7.3
  - @cloudhal/comments@0.7.3
  - @cloudhal/mcp-server@0.7.3
  - @cloudhal/agent-runtime@0.7.3
  - @cloudhal/analytics@0.7.3
  - @cloudhal/schedules@0.7.3
  - @cloudhal/storage@0.7.3

## 0.7.2

### Patch Changes

- Updated dependencies [060a9c8]
  - @cloudhal/api@0.7.2
  - @cloudhal/core-ts@0.7.2
  - @cloudhal/mcp-server@0.7.2
  - @cloudhal/comments@0.7.2
  - @cloudhal/agent-runtime@0.7.2
  - @cloudhal/analytics@0.7.2
  - @cloudhal/schedules@0.7.2
  - @cloudhal/storage@0.7.2

## 0.7.1

### Patch Changes

- 24fe76b: Security fixes from the CodeQL backlog on `main`.
  
  - **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only; an input whose component id is one of those keys gets the data key `<id>-value`. Surface pointers the page writes through (an input's `value`/`checked`, a Scrolly's `step`, a Button action's `path`) may not name those keys (a `checkSurface` issue); read bindings still may. The Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
  - **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) is plain text: `&lt;script&gt;` in markdown is the text `<script>`, as before, and every place it goes escapes it (now tested sink by sink). Tags are dropped with a linear scan, and entities are decoded once (`&amp;#60;` is the text `&#60;`, no longer `<`).
  - **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers; one intended difference: an svg comment ends at its first `-->`.
- Updated dependencies [24fe76b]
  - @cloudhal/core-ts@0.7.1
  - @cloudhal/api@0.7.1
  - @cloudhal/mcp-server@0.7.1
  - @cloudhal/comments@0.7.1
  - @cloudhal/agent-runtime@0.7.1
  - @cloudhal/analytics@0.7.1
  - @cloudhal/schedules@0.7.1
  - @cloudhal/storage@0.7.1

## 0.7.0

### Minor Changes

- 6057871: Remote MCP clients can now authorize with OAuth 2.1 against the deployment itself (RFC-0044 Phase 2, ADR-0045). Better Auth's `mcp()` and `jwt()` plugins run in the Studio's auth instance when the runtime has a stable public origin: the admin Worker uses its origin, `cloudhal studio` needs `--base-url` / `CLOUDHAL_BASE_URL` (it logs why OAuth is off otherwise), and `CLOUDHAL_MCP_OAUTH=off` turns it off. Access tokens are Ed25519 JWTs bound to `/mcp` for one hour, refresh tokens rotate with a 30-second reuse window, and each connection is approved on Studio's new consent screen (`/oauth/consent`), which narrows the requested scopes by the member's role and records an `agent_grants` row (migration `0031_oauth`). A token resolves to the same principal an agent key does; revoking a connection (`DELETE /api/agent-grants/:id`) or removing the member refuses it on its next call. The Better Auth family moves to 1.7.18. Client registration (CIMD, DCR) and the "Connected agents" screen follow in Phase 3.

### Patch Changes

- d363160: Remote MCP clients can now register themselves (RFC-0044 Phase 3a, ADR-0045). Clients that name an HTTPS Client ID Metadata Document as their `client_id` (Claude Code, Codex, VS Code) are accepted through `@better-auth/cimd`, fetched with the media import's SSRF-safe transport (pinned on Node, DoH-checked on Workers; https only, public addresses only, no redirects, 5 KB, 5 s). Clients without one (Cursor) use dynamic client registration at `/api/auth/oauth2/register`: public clients only, rate-limited per address and per day, capped at 5,000, and pruned by the scheduler after 30 unused days. Document clients are fetched at most hourly per client, with budgets in Cloudhal's own counters that never lock out stored clients, a cap of 5,000 that evicts unused clients (the well-known clients' hosts are exempt), pruning after three hours unused, and a failed refetch that refuses the client; migration `0032_oauth_client_kind_index` indexes them. Redirect URIs must be https, loopback http (any port) or a native app's private-use scheme (`cursor`, `vscode`, reverse-domain, `CLOUDHAL_MCP_REDIRECT_SCHEMES`), and the client host list applies at every authorization. With DCR off, the clients it registered earlier cannot start new authorizations. The consent screen shows client names plain and short, a document client's host first, and marks self-registered clients as unverified. `CLOUDHAL_MCP_CIMD=off`, `CLOUDHAL_MCP_DCR=off`, `CLOUDHAL_MCP_CLIENT_HOSTS` and `CLOUDHAL_MCP_REDIRECT_SCHEMES` control it on both runtimes, and the Docker compose file passes them through. The Phase 2 server-side test client (`OauthServer.createClient`) is removed. `set_embargo` through an OAuth connection now files the gate for a person's approval instead of leaving it unapplied, and the request is notified while it waits. `safeFetch` results carry the response headers.
- Updated dependencies [6057871]
- Updated dependencies [d363160]
- Updated dependencies [e6fe6eb]
  - @cloudhal/storage@0.7.0
  - @cloudhal/api@0.7.0
  - @cloudhal/mcp-server@0.7.0
  - @cloudhal/core-ts@0.7.0
  - @cloudhal/agent-runtime@0.7.0
  - @cloudhal/analytics@0.7.0
  - @cloudhal/comments@0.7.0
  - @cloudhal/schedules@0.7.0

## 0.6.5

### Patch Changes

- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [c15218e]
  - @cloudhal/core-ts@0.6.5
  - @cloudhal/analytics@0.6.5
  - @cloudhal/comments@0.6.5
  - @cloudhal/agent-runtime@0.6.5
  - @cloudhal/api@0.6.5
  - @cloudhal/storage@0.6.5
  - @cloudhal/schedules@0.6.5
  - @cloudhal/mcp-server@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [471087a]
  - @cloudhal/api@0.6.4
  - @cloudhal/mcp-server@0.6.4
  - @cloudhal/agent-runtime@0.6.4
  - @cloudhal/analytics@0.6.4
  - @cloudhal/comments@0.6.4
  - @cloudhal/core-ts@0.6.4
  - @cloudhal/schedules@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- 1dd79c2: Dependency updates from the November 2026 Dependabot sweep. `@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.152.0 (its `createTestHarness` runs Miniflare 5.20261019.2-beta, and `wrangler deploy` uploads source maps by default since 4.150). The Studio shipped in `@cloudhal/cli` is built with Tiptap 3.32.0 and `@codemirror/language` 6.13.1. The Rust crate validates with jsonschema 0.60.2, and the monorepo lints and formats with Biome 2.6.2 (Markdown and YAML formatting stay off).
- 7dddd88: `@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.158.0, and `@cloudhal/astro-renderer` uses `@astrojs/cloudflare` 14.4.4, which brings `@cloudflare/vite-plugin` 1.67 (its peer range is wrangler ^4.156.1, so the two move together). `@astrojs/cloudflare` 14.4 needs Astro 7.4, so projects move to Astro 7.4.7: the blog starter asks for it, and the `astro` peer range of `@cloudhal/astro-renderer` and `@cloudhal/cli` is now ^7.4.0 (was ^7.3.0). The blog starter asks for wrangler ^4.158.0.
- Updated dependencies [bf20e64]
- Updated dependencies [28e9406]
  - @cloudhal/api@0.6.3
  - @cloudhal/agent-runtime@0.6.3
  - @cloudhal/mcp-server@0.6.3
  - @cloudhal/analytics@0.6.3
  - @cloudhal/comments@0.6.3
  - @cloudhal/core-ts@0.6.3
  - @cloudhal/schedules@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- df8695e: The admin Worker's minute tick gains a `lists.backfill` system job (every five minutes): a budgeted `rebuildListValues` for listed collections that are new, changed, reset by a race or older than migration 0029, sized to the tick plan. Its declared cost (16 statements on the free plan, 150 on paid) is the run's statement budget, which the backfill enforces on every statement, discovery included, and each run starts at another waiting collection. On the paid plan it also removes rows of collections that list no fields any more, never those of a collection listed while it ran.
- Updated dependencies [7223152]
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [f73d05a]
- Updated dependencies [f73d05a]
- Updated dependencies [6cb7945]
- Updated dependencies [f669266]
- Updated dependencies [77fa9e5]
- Updated dependencies [786a455]
- Updated dependencies [8a30e30]
  - @cloudhal/core-ts@0.6.2
  - @cloudhal/api@0.6.2
  - @cloudhal/schedules@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/mcp-server@0.6.2
  - @cloudhal/analytics@0.6.2
  - @cloudhal/comments@0.6.2
  - @cloudhal/agent-runtime@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [40dbfcb]
- Updated dependencies [028f396]
- Updated dependencies [92c3867]
  - @cloudhal/core-ts@0.6.1
  - @cloudhal/mcp-server@0.6.1
  - @cloudhal/api@0.6.1
  - @cloudhal/comments@0.6.1
  - @cloudhal/agent-runtime@0.6.1
  - @cloudhal/analytics@0.6.1
  - @cloudhal/schedules@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.

### Patch Changes

- Updated dependencies [321e8be]
- Updated dependencies [4f3f520]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [2e89658]
- Updated dependencies [84c6d94]
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/mcp-server@0.6.0
  - @cloudhal/agent-runtime@0.6.0
  - @cloudhal/api@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [672b993]
- Updated dependencies [9d04a37]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/mcp-server@0.5.0
  - @cloudhal/api@0.5.0
  - @cloudhal/agent-runtime@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [18a3960]
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/mcp-server@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/api@0.4.0
  - @cloudhal/agent-runtime@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/api@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/mcp-server@0.3.13
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- Updated dependencies [84d1fc3]
- Updated dependencies [bc096b2]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/api@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/mcp-server@0.3.12
  - @cloudhal/agent-runtime@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 25b002c: Fewer D1 round trips per admin API request. The session is cached in a signed cookie for 60 seconds, so a session revoked elsewhere can stay usable that long (ADR-0010 addendum); membership and roles still apply at once. A member and their site roles load in one query. `get-session` is no longer rate limited, since the limiter's D1 read and write landed on every session check. Due comment purges are swept at most every 10 seconds per isolate instead of on every request.
- Updated dependencies [25b002c]
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
- Updated dependencies [1d7998a]
  - @cloudhal/api@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/mcp-server@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- @cloudhal/api@0.3.10
  - @cloudhal/mcp-server@0.3.10
  - @cloudhal/agent-runtime@0.3.10
  - @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/schedules@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- @cloudhal/api@0.3.9
  - @cloudhal/mcp-server@0.3.9
  - @cloudhal/agent-runtime@0.3.9
  - @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- Updated dependencies [da8fe6f]
  - @cloudhal/mcp-server@0.3.8
  - @cloudhal/api@0.3.8
  - @cloudhal/agent-runtime@0.3.8
  - @cloudhal/analytics@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/agent-runtime@0.3.7
  - @cloudhal/analytics@0.3.7
  - @cloudhal/api@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/mcp-server@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/agent-runtime@0.3.6
  - @cloudhal/analytics@0.3.6
  - @cloudhal/api@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/mcp-server@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/agent-runtime@0.3.5
  - @cloudhal/analytics@0.3.5
  - @cloudhal/api@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/mcp-server@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [d6427d5]
- Updated dependencies [aae143f]
  - @cloudhal/api@0.3.4
  - @cloudhal/mcp-server@0.3.4
  - @cloudhal/agent-runtime@0.3.4
  - @cloudhal/analytics@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

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
