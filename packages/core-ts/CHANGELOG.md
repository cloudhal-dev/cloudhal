# @cloudhal/core-ts

## 0.8.0

### Minor Changes

- dc519c0: The consumers of reference fields (RFC-0045 §2, rollout step 2b, #114). Both new field types stay refused on every write path in production, so none of this is reachable before rollout step 7. The shared suites run it through `SiteGraphStoreOptions.fieldTypes`.
  
  - **Assets inside repeater items.** `fieldAssetRefs` walks items and records `fields.<key>.<sub>` with each use's item path. `fieldAssetIssues` checks sub-field types (a PDF in an image sub-field is refused) and reports at every item that uses the file. Skips match issue paths by prefix, in the store and in the MCP precheck alike, so top-level behaviour is unchanged.
  - **Field-operation rewrites** write their entries' `entry_refs` rows. A rewrite that changes a reference value is guarded on its target, and every rewrite in a site with reference fields is guarded on the collection's definitions.
  - **Releases** no longer treat reference values as dependencies, so a referenced entry is neither locked nor required live.
  - **Language editions** (`forEdition`) keep only what the edition's own write accepts. A reference needs a member of its group in an allowed collection that meets the field's `where`. A single-target field keeps one id, and a multiple field keeps at most `maxItems`. An entry holds at most 100 references, and a repeater at most `maxItems` items. Values are read through a running rename's old key. Everything not carried, including repeater items left empty, is reported with its reason through `onDropped`. A re-save keeps the values the edition entry already holds, as its own write would.
  - **CLI.** `cloudhal import --dry-run` warns about references that will show nothing, and about originals relinked into another group.
  - **Cloudflare.** `siteFieldTypeSupport` reads the site Worker's `fields` feature. `FIELDS_FEATURE_VERSION` and `FIELDS_SUPPORTED` are exported from `@cloudhal/core-ts/fields`. Nothing passes them to a store before step 7.
  - **API.** `GET /sites/:siteId/entries/pick` is the entry picker. Its search folds case and diacritics on both sides with `foldName`, Turkish İ and ı included, and reads at most 1,000 entries per request. When that runs out before 20 matches, it answers `truncated: true` with a `cursor` to continue from. `GET /sites/:siteId/entries/:entryId/references` lists an entry's referrers, each with the language versions that show it. Both need `content:read`.
- d107895: Reference fields get their index and integrity rules (RFC-0045 §2, rollout step 2a, #114). Both new field types stay refused on every write path in production, so no reference value can exist yet; the store and the shared suites run them through `SiteGraphStoreOptions.fieldTypes` and `CopySiteOptions.fieldTypes`.
  
  - **Storage.** Migration `0033_entry_refs` adds `entry_refs`, one row per stored reference value, removed with its site.
  - **Store.** Entry writes keep the rows in their own batch and check their targets at batch time (`unknown_entry`, `reference_target_moved`). Deletes, moves and group changes are refused while a published entry shows a reference to the group's last usable member (`entry_referenced`, `reference_target_moved`, `field_operation_running`). Imports rebuild the rows beside a written node set. Field operations naming a reference or repeater field answer `field_operation_unsupported`. Definition changes that would strand values are refused (`field_key_in_use`, removed target collections or sub-fields, `multiple`).
  - **API and MCP.** The new refusals answer 409 or 422, with MCP hints.
  
  **Behaviour changes on existing sites** (RFC-0045 decision 3):
  
  - relinking a node that other nodes use as their translation group is refused (`translation_group_in_use`, 409);
  - `resolveFields` and the store read an original's non-localized values only when the original's own group is its id: a node relinked into another group lends them to nobody (OQ 14). The list-values fingerprint format moves to 2, so every listed collection's `entry_list_values` rebuild once (`lists.backfill`); listings scan until they are ready;
  - a change of `translation.group` alone gets the same source-group check as a source change, and a write joining a group checks that its node is still that group's original;
  - imports store node bodies in canonical form (the hash is unchanged);
  - deletes, moves and group changes of entries carry the collections anchor, and entry writes that change `fields` or `collection` carry the definitions anchor: a concurrent change of the collections' settings makes them answer 409, and a retry succeeds. The anchors compare the stored text read when the write is planned, so site rows stored with any key order work;
  - field operations that would turn a field into a reference or repeater answer `field_operation_unsupported` (409) instead of `fields_unsupported`.

### Patch Changes

- b6cf70f: The contract gains two field types for collections, `reference` and `repeater` (RFC-0045 §1, rollout step 1, #114). Every write path still refuses them, so existing sites behave exactly as before.
  
  - **Contract.** `FieldDefinition` gains `ReferenceField` and `RepeaterField`. A new `SubFieldDefinition` union holds a repeater's sub-fields: scalar values only, so a repeater cannot contain a repeater. `FieldMigration.fromType` gains both types, and `FieldMigration` gains an optional `sub`. There is no `schemaVersion` bump, and existing documents stay valid.
  - **The gate.** Until rollout step 7 enables them, a reference or repeater definition, or a migration marker that names one, is refused with `fields_unsupported`: API status 409, with an MCP hint. The refusal covers:
    - site creates and updates, so Studio, MCP and the API;
    - field operations;
    - every bundle `importSite` takes: import, pull, push, `cloudhal import --replace` and `--revert`, snapshot restores and edition copies.
  
    `checkBundle` gained `assertFieldTypes`. It checks the working site row, and `prepareImport` checks every snapshot site body the import writes once it has been verified (bodies the target already holds are its own), and refuses the types when no capability is given. A push answers `409 fields_unsupported` with its issues, not `400 bad_request`.
  - **Pure core** (`@cloudhal/core-ts/fields`), with no effect on stored data yet:
    - the definition rules: `reference_target_unknown`, `where`, `itemLabel`, and caps on sub-fields and leaves;
    - value checks for both types, the per-item `requiredToPublish`, and `too_many_references`;
    - `resolveFields` skips types it does not know;
    - `fieldsJsonSchema(…, { strict: true })` and `strictSchemaCost`;
    - `pickMember`, `referenceIssues`, and `FIELD_QUERY_OPS` and structured-data entries that make neither type listable or mappable.
  
    `FIELD_TYPES` keeps the nine enabled types (`EnabledFieldType`). `ALL_FIELD_TYPES` lists all eleven.
  - **MCP.** `update_collection`'s input now builds its `$defs` with `defsClosure` and offers only the enabled types. A test checks that every `$ref` in every tool's input and output schema resolves. Before this change, `pnpm gen` alone would have left the input pointing at `$defs` it did not carry.
  - **Fix, existing sites:** block props and typed-field objects no longer accept keys named after `Object.prototype` members (`constructor`, `toString`, `__proto__`, …) as known props. The props interpreter (`validateProps`) now checks and reads own keys only. Such keys are refused as unknown, and a prop the value leaves out is absent, not the prototype's function. `toLocaleString`, `isPrototypeOf` and `propertyIsEnumerable` join the reserved field keys, beside `toString`, `valueOf` and `hasOwnProperty`.
- Updated dependencies [b6cf70f]
- Updated dependencies [d107895]
  - @cloudhal/core-contracts@0.8.0
  - @cloudhal/storage@0.8.0
  - @cloudhal/schedules@0.8.0

## 0.7.3

### Patch Changes

- 5cb0a5d: `asset_refs` is scoped by site (RFC-0045 §2.5, rollout step 0), and an unchanged import no longer rebuilds it (#196).
  
  - An import, push or pull planned `unchanged` used to rebuild the site's `asset_refs` from rows read at plan time. An edit that committed in between could lose its new row, so the asset it started using could be deleted and showed as unused. The rebuild now runs only in a batch that also writes the node set.
  - The rebuild records only references to assets of the same site, and splits its `INSERT` so each statement stays below 90 KB (large sites could exceed D1's statement limit). Its statements count against the import's 1,000-statement cap.
  - Deleting an asset and the media library's "unused" filter look only at references from the asset's own site, so a foreign archive naming another site's asset no longer blocks its delete or hides it.
  - A publish that changes an asset now also purges the pages that show it through a typed `image` or `richText` field (RFC-0041), not only through covers, bodies and sections.
  - While a field rename runs, entries not rewritten yet still hold the old key. Both the rebuild and the purge planner now read those entries through the definition's `migration.fromKey`, as the renderer does. An archive exported mid-rename keeps those entries' rows, and an asset change purges their pages.
- @cloudhal/core-contracts@0.7.3
  - @cloudhal/schedules@0.7.3
  - @cloudhal/storage@0.7.3

## 0.7.2

### Patch Changes

- 060a9c8: A self-hosted site rebuilds itself on publish (#150). With `CLOUDHAL_SITE_BUILD=on`, which is the Docker image's default, `cloudhal studio` runs the image's `site-build` in a child process after every publish: a publish in Studio or through MCP, an approval, a rollback, or a release that goes live (at its time or through "Publish now"). It also runs it once at start.
  
  - **One build per burst.** A burst of publishes builds once (3 seconds after the last one, at most a minute after the first).
  - **One build at a time.** Studio's builds, a cron `site-build` and a hand-started one share one lock.
  - **Failures keep the last good site.** A failed build keeps the previous site and is tried again on the next publish.
  - **Bounded.** A build has a deadline (`CLOUDHAL_SITE_BUILD_TIMEOUT`, 30 minutes by default). Stopping Studio during a build ends it within 5 seconds, with everything it started, and records it as stopped.
  
  Every build is recorded in the site's Activity as "Build public site", with its duration, snapshot and output on failure. The site's overview shows a new "Public site build" card with the same details, and what visitors see now from `/data/site/current.json`, which `site-build` writes after each swap, so builds from cron or by hand show there too. The failure's output is shown only to roles with `audit:read`. `CLOUDHAL_SITE_BUILD=off` turns both off for sites built elsewhere, and a plain `cloudhal studio` keeps it off. For other integrations, `ScheduledTickOptions.onReleasePublished` (core-ts) reports releases that went live, `ReleaseServiceOptions.onReleasePublished` (and the API's `SchedulesDeps.onReleasePublished`) reports a release published now, `openLocalStore` takes `onPublished`, and `GET /api/sites/:id/site-build` reports the queue, the last build and what is served.
- @cloudhal/core-contracts@0.7.2
  - @cloudhal/schedules@0.7.2
  - @cloudhal/storage@0.7.2

## 0.7.1

### Patch Changes

- 24fe76b: Security fixes from the CodeQL backlog on `main`.
  
  - **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only; an input whose component id is one of those keys gets the data key `<id>-value`. Surface pointers the page writes through (an input's `value`/`checked`, a Scrolly's `step`, a Button action's `path`) may not name those keys (a `checkSurface` issue); read bindings still may. The Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
  - **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) is plain text: `&lt;script&gt;` in markdown is the text `<script>`, as before, and every place it goes escapes it (now tested sink by sink). Tags are dropped with a linear scan, and entities are decoded once (`&amp;#60;` is the text `&#60;`, no longer `<`).
  - **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers; one intended difference: an svg comment ends at its first `-->`.
- @cloudhal/core-contracts@0.7.1
  - @cloudhal/schedules@0.7.1
  - @cloudhal/storage@0.7.1

## 0.7.0

### Patch Changes

- d363160: Remote MCP clients can now register themselves (RFC-0044 Phase 3a, ADR-0045). Clients that name an HTTPS Client ID Metadata Document as their `client_id` (Claude Code, Codex, VS Code) are accepted through `@better-auth/cimd`, fetched with the media import's SSRF-safe transport (pinned on Node, DoH-checked on Workers; https only, public addresses only, no redirects, 5 KB, 5 s). Clients without one (Cursor) use dynamic client registration at `/api/auth/oauth2/register`: public clients only, rate-limited per address and per day, capped at 5,000, and pruned by the scheduler after 30 unused days. Document clients are fetched at most hourly per client, with budgets in Cloudhal's own counters that never lock out stored clients, a cap of 5,000 that evicts unused clients (the well-known clients' hosts are exempt), pruning after three hours unused, and a failed refetch that refuses the client; migration `0032_oauth_client_kind_index` indexes them. Redirect URIs must be https, loopback http (any port) or a native app's private-use scheme (`cursor`, `vscode`, reverse-domain, `CLOUDHAL_MCP_REDIRECT_SCHEMES`), and the client host list applies at every authorization. With DCR off, the clients it registered earlier cannot start new authorizations. The consent screen shows client names plain and short, a document client's host first, and marks self-registered clients as unverified. `CLOUDHAL_MCP_CIMD=off`, `CLOUDHAL_MCP_DCR=off`, `CLOUDHAL_MCP_CLIENT_HOSTS` and `CLOUDHAL_MCP_REDIRECT_SCHEMES` control it on both runtimes, and the Docker compose file passes them through. The Phase 2 server-side test client (`OauthServer.createClient`) is removed. `set_embargo` through an OAuth connection now files the gate for a person's approval instead of leaving it unapplied, and the request is notified while it waits. `safeFetch` results carry the response headers.
- Updated dependencies [6057871]
- Updated dependencies [d363160]
  - @cloudhal/storage@0.7.0
  - @cloudhal/schedules@0.7.0
  - @cloudhal/core-contracts@0.7.0

## 0.6.5

### Patch Changes

- b0ebd95: Slug and name trims run in one linear pass instead of `/^-+|-+$/g` (CodeQL js/polynomial-redos, #168). This covers `slugify`, `foldName` and `slugifyFilename` in core-ts (the new `trimChar` is exported from `@cloudhal/core-ts/names`), heading ids in astro-renderer, and Studio's option, media and entry slugs. Results are unchanged. These trims were already linear in practice, because a run of other characters was collapsed to one `-` first. These inputs were quadratic and are linear now: analytics' `datasetName` on a long run of `_` inside a deployment name; json-render component keys in `fromJsonRender` (`./interop`); trailing whitespace in directive blocks and on comment lines; trailing `/` in request paths (the playground guard and route matching in api, analytics paths, the renderer's link localizing and redirect splats, the docs Worker). The new `trimEndChar` is exported from `@cloudhal/core-ts/names` too.
  
  Also in 0.6.3, with no changeset at the time (#161): Studio's "Not published" badges and its "unknown" scheduler state show their status dot again. They used a Badge variant without a dot colour and rendered no dot.
- c15218e: Second ReDoS sweep (#174). Input that made a regex backtrack is now handled in linear time; results are unchanged.
  
  - **Unauthenticated password-reset request.** `POST /api/password-reset/request` (and invite creation) checks the address length before anything else, and the address check no longer backtracks: `a@` followed by many dots used to cost seconds of CPU per request. Public token endpoints (`/api/password-reset/*`, invite acceptance) refuse a JSON body over 64 KiB with `413 payload_too_large`, whether or not it declares a `content-length`.
  - **core-ts.** Redirect path normalising and matching (on every site request): `normalisePath`, `joinTarget`, and `ancestorPaths`, which no longer lists ancestors that no redirect can match: those longer than a `from` may be (1024 code points) or holding `//`. Directive lines in search text keep their braces on one line, so a directive whose `{…}` spans a lone `\r` is no longer read as one. Search text built at publish time: fenced code, links, images and tags. SVG upload checks: CSS comments, `url(…)` references (about cubic on `url(` followed by spaces) and width/height lengths (new `css-scan.ts`).
  - **schedules.** The feed check's CDATA, element and `<enclosure>`/`<media:content>` url scans, and `urlPath`.
  - **agent-runtime.** SKILL.md frontmatter lines (a line of spaces was quadratic).
  - **Studio** (in `@cloudhal/cli`): the markdown body editor's trailing-newline trims.
- Updated dependencies [b0ebd95]
- Updated dependencies [c15218e]
  - @cloudhal/storage@0.6.5
  - @cloudhal/schedules@0.6.5
  - @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- @cloudhal/core-contracts@0.6.4
  - @cloudhal/schedules@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- @cloudhal/core-contracts@0.6.3
  - @cloudhal/schedules@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

- 7223152: `importSite` (behind `cloudhal pull`, the admin bundle route `cloudhal push` uses, and `cloudhal import`) now checks a bundle's project row before inserting it: it must be the site node's project (`projectId`), a valid Project, with its `id` and `rev` columns matching its body. Before, a bundle could plant any projects row.
- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- f73d05a: RFC-0042 §4, #110: `queryContentEntries` (the API's `GET /entries?where=…`, Studio's lists, MCP `list_entries`) answers `where`, `orderBy`, status, locale, `limit` and `offset` in SQL from the new `entry_list_values` side table once a collection is ready, instead of reading and evaluating the whole collection; results are the shared evaluator's, which stays the fallback (term filters, collections not ready, operands SQL cannot compare exactly) and the oracle of a seeded property suite on SQLite, D1 and Durable Object SQLite. On the 10,000-entry benchmark the store path drops from 124 ms CPU / 10,001 rows (SQLite) and 176 ms / 10,003 rows read (D1) to 0.6 ms / 22 rows and 5.3 ms / 5,068 rows read; a page at offset 4,980 costs about the same as the first.
  
  The store keeps the table exact. Entry creates, updates, moves and deletes write an entry's rows (its `listFields` values as `resolveFields` reads them) in their own batch, and an original's write rewrites its same-site translations' rows; site writes and field operations that change a collection's list definitions reset its readiness in the same batch, and imports reset the site's. A race never refuses a write: it marks the collection not ready. New `rebuildListValues(sql, options)` is the resumable, budgeted backfill (guarded per chunk, safe to run concurrently; `budget.statements` bounds every statement it issues, `start` rotates where a run begins, `tidy` removes rows of unlisted collections); `updateSite`, finished field operations and `importSite` run it for what they reset, and `openLocalStore` runs it on open. A field operation's revert resets every listed collection whose values its restored bodies change. `deleteContentEntry` behaves as before.
  
  `revertTagsToTerms` now leaves an entry that was edited after the migration's before-snapshot (by a concurrent write, or before a resumed run) as it is and reports it in `edited`, instead of restoring its earlier fields, status or collection.
- f669266: `importSite`, used by `cloudhal pull`, by the admin bundle route `cloudhal push` uses, and by `cloudhal import`, now runs every check before it writes anything, the bootstrap conflict and the 1000-statement limit included, and plans the media ledger with them. A refused bundle leaves the target as it was; before, node bodies could land ahead of a conflict and snapshots ahead of the size limit. Only a storage failure can stop it between its writes, and importing the bundle again completes it. New checks, each before the first write:
  
  - Every node body the target lacks must be a valid contract document of the kind of each snapshot ref that points to it, with that ref's id and rev, of the bundle's site (precompiled validators). A body no snapshot references is refused. Before, a body was only checked against its hash, so a crafted bundle could put invalid content behind the published snapshot.
  - Node and snapshot ids may not belong to another site of the target, each appears once, and no two nodes share a kind and key or a translation group and locale (the node batch's unique keys).
  - Every takedown entry has its fields with their types (`reason`, `legal`, `by`, `at`).
  - The media ledger (`snapshot_blobs`) reads the target's own asset bodies, never the bundle's text for a body the target already holds.
  
  New `planImport(to, bundle, options)` returns what an import would change, without writing:
  
  - the nodes added, changed and removed;
  - the snapshots and node bodies to add;
  - whether the project row is new;
  - the listed media that are present, missing, of another size or taken down on the target;
  - the bundle's takedowns, those whose bytes the target holds (an import deletes them) and those its ledger does not hold yet.
  
  With `report: true` it returns a bootstrap conflict and missing media instead of throwing them. A node body that is not JSON is refused as `blob <hash> is not JSON` instead of with the parser's message.
- 786a455: New `restoreBundle(from, snapshot)`: a site bundle of one snapshot's nodes, rebuilt from the stored node bodies, for `importSite(…, { mode: "replace" })`, which checks it like any bundle. The site's working copy and published pointer become that snapshot's again (`cloudhal import --revert`, RFC-0039). Revs only move forward: a node the site holds at the snapshot's rev or a later one, with other content, comes back at the rev after its current one, so a Studio tab or agent still holding a rev that node had gets a conflict instead of saving over it; a node whose content already is the snapshot's is left as it is. It lists the media those nodes need and carries the store's takedowns among them, so taken-down content stays down; a missing node body, or one that is not the node its snapshot ref names, is refused before anything is written. `exportSite`'s output is unchanged.
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [6cb7945]
- Updated dependencies [8a30e30]
  - @cloudhal/schedules@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- 40dbfcb: Gaps an agent hit building a site through MCP:
  
  - **Section-only theme blocks in article bodies are refused.** A theme block type with `where: ["section"]` (say `link-cards`) has no component in an article, and drew "unknown component" there. `create_entry`/`update_entry` now refuse it inside a body ```` ```surface ```` fence (`invalid_surface`, with the component's path); primitives, built-in blocks and theme blocks that allow `body` stay. `get_catalog`'s "In article bodies" lists which blocks a body may use and which are page sections only.
  - **`list_entries` lists every collection by default**, not only `posts`: a site whose articles live in `blog` got `[]`. `where`/`orderBy` need the collection whose list fields they use; without one they are refused (`invalid_query` at `collection`) instead of ignored.
  - **`long-line` gives a text column one verdict.** It counted characters over a rounded line count, so how full a paragraph's last line was decided whether it passed, and identical paragraphs in one column disagreed. It now counts the characters on each rendered line, leaves each paragraph's last line out, and pools the paragraphs of one width and font: one example per column, with its width and how many paragraphs it holds.
  - **Blog starter:** a primary surface `Button` in an article body keeps its `on-brand` text; the body's link colour no longer applies to buttons (it failed contrast at 2.5:1 light, 1.3:1 dark).
- 028f396: A collection's template may now sit on top of a page at its prefix: `set_collection_permalink` with `posts` → `/blog/{slug}` no longer fails with `path_conflict` because a page lives at `/blog`. That page is the collection's index page (RFC-0038), so only pages strictly under the prefix conflict, in the template check, its SQL race guard (`noPageUnder`) and the reverse check on page writes. Studio's "Create listing page" now works for a collection with its own permalink too.
- @cloudhal/core-contracts@0.6.1
  - @cloudhal/schedules@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 321e8be: Collections stage 3 contract and pure core (RFC-0042 step 1, ADR-0044). `CollectionSettings` gains optional `listFields` (up to 4 field keys), `expiry` (`{ field, action: "unlist" | "hide", afterMinutes? }`) and `structuredData` (`{ type: "Event" | "JobPosting" | "Product" | "Recipe", properties }`, each property sourced by `kind`: `field`, `entry`, `site` or a plain-text `text` constant); `contentList` sections gain `where` (up to 4 `FieldCondition`s) and `orderBy` (`FieldOrder`), both new in `common.schema.json`. New `@cloudhal/core-ts/structured-data`: the closed preset table, `checkStructuredData` (save-time mapping check) and `structuredDataFor` (an entry's JSON-LD, none when a required value is missing, capped at 32 KB). `@cloudhal/core-ts/fields` adds the listing evaluator (`checkFieldQuery`, `parseFieldQuery`, `matchesFieldQuery`, `compareByField`) and the derived expiry gate (`fieldGateInstant`, `expiryInstant`, `effectiveUntil`, `dayStartIn`). Nothing reads them yet: no behaviour change.
- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.
- 90d0828: Collections stage 3 in the store and the API (RFC-0042 step 2, ADR-0044). `updateSite` checks the new collection settings when they change: `listFields` and `expiry.field` name fields of the collection (`unknown_field`), the expiry field is a date or datetime field (`invalid_expiry`), and a structured-data preset passes `checkStructuredData` (`structured_data_invalid`; warnings are not refused). Unlisting, dropping or retyping a list field, or dropping a select option, that `contentList` sections still filter or sort by is refused as `list_field_in_use` naming the pages, kept true by a guard on the site CAS. Page writes check changed `contentList` `where`/`orderBy` against the collection's list fields (`invalid_query`, with `sections/<i>/…` paths). Field operations follow: `rename_field` renames the field in `listFields`, `expiry`, structured-data sources and sections' queries in phase A's batch (and back on revert); `remove_field` refuses while any of them names the field; `change_field_type` refuses when the new type would break them. New `queryContentEntries` (and `applyFieldQuery`) filters and orders a collection's entries by list fields with the shared evaluator over resolved values. `GET /api/sites/:id/entries` takes `where` (JSON), `orderBy` (JSON), `limit` (1–100) and `cursor`; with `limit` it answers `{ entries, total, nextCursor? }`, without it the plain array as before. New error codes `invalid_query`, `structured_data_invalid`, `invalid_expiry` (422) and `list_field_in_use` (409). Sites without the new settings behave as before.

### Patch Changes

- 84c6d94: Typed fields follow-ups (RFC-0041). One asset check for field values, `fieldAssetIssues` in `@cloudhal/core-ts/media` (with `fieldAssetRefs` and `newFieldAssetRefs`), now used by both the store's entry write and MCP's `create_entry`/`update_entry` precheck; same codes and messages. Machine translation now follows §5: `get_translation_source` returns only the localized text and rich-text field values to translate (`fields`) and names the shared ones (`sharedFields`); `save_translation` takes translated `fields`, refuses shared ones in precheck with `field_not_localized` (paths in `details.issues`), and no longer copies the source's field values into a new translation in the same site. New helpers in `@cloudhal/core-ts/fields`: `localizedFieldValues`, `translatableFieldValues`, `sharedFieldKeys`, `sharedFieldIssues`. Studio's "write by hand" draft copies only localized field values.
- Updated dependencies [321e8be]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Minor Changes

- 672b993: Typed custom fields, step 1 (RFC-0041 / ADR-0043). `Site.collections.<key>.fields` takes an ordered list of 1–30 field definitions in nine types (`text`, `richText`, `number`, `boolean`, `date`, `datetime`, `url`, `image`, `select`), discriminated by `type`, each with per-locale labels, `localized` and (except `boolean`) `requiredToPublish`. The new `@cloudhal/core-ts/fields` subpath (Worker-safe, eval-free) checks definitions (reserved keys, unique keys and options, 30 per collection, 200 per site, 256 KB of collection settings, the plain-edit guard), checks values through ADR-0030's `validateProps` (only changed values; unknown keys refused once a collection has definitions; 256 KB per entry), checks `requiredToPublish`, emits the JSON Schema agents receive (strict-mode safe), and resolves values across translations (`resolveFields`). Nothing reads it yet: the store, API, MCP, Studio and renderer adopt it in later steps, so nothing changes for existing sites.
- cc263c3: Typed custom fields, step 3 (RFC-0041 §6 / ADR-0043): field operations.
  
  - **`runFieldOperation` / `continueFieldOperation` / `revertFieldOperation` / `fieldOperationStatus`** in `@cloudhal/core-ts` run `rename_field`, `change_field_type`, `set_field_localized` and `remove_field`: a dry run (entries touched, values moved, converted, cleared, removed, unchanged and unconvertible, per locale, with samples), a `before …` snapshot whose id is the operation id, the new definition with its `migration` marker (phase A), entries rewritten in guarded batches of 200 that resume after an interruption (phase B), the marker dropped once nothing is pending (phase C) and an `after` snapshot. Only the draft graph changes. A type change follows a closed conversion table (`convertFieldValue`, exported from `@cloudhal/core-ts/fields`) and refuses values it cannot convert (`field_values_unconvertible`) unless `onInvalid: "clear"`. One operation per collection at a time (`operation_in_progress`). Reverting restores the earlier definition and the entries nobody edited since, and converts edited ones back.
  - **Readers stay consistent mid-run:** `resolveFields` converts values still in the old type, and a field being removed reads as gone; a person's entry write during an operation goes through the marker, so edits and the operation converge.
  - **Translations:** changing only non-localized field values of an original no longer marks its translations stale (their recorded source hash follows, in the same batch); operations keep fresh translations fresh.
  - **API:** `POST /api/sites/:id/collections/:key/fields/operations` (`dryRun`, `?continue=<id>`), `GET …/:operationId`, `POST …/:operationId/revert` (`site:settings` and `content:write`), and the same under `/api/admin` with the deployment token.
  - **CLI:** `cloudhal fields rename|retype|localize|remove|continue|revert [--dry-run] [--remote]`; the dry run also lists theme files that read the field directly.
- 92d3362: Typed custom fields, step 6 (RFC-0041 §9 / ADR-0043): renderer and themes. Additive only: `entry.fields` still means exactly what is stored, and themes copied before this release build and render as before (a frozen 0.4.0 theme joins the compat test).
  
  - **`GraphSource.entryFields(entry, options?)`** on live and snapshot sources (and `entryFields(source, entry, options?)` from `@cloudhal/astro-renderer/fields` for any source): an entry's typed fields as a theme draws them, by key in definition order. Values are resolved by the language rules (a translation's empty localized field reads the original's, `fromOriginal`; non-localized fields come from the translation group's original; language editions own their values), labelled in the page's language and made safe: rich text as HTML from the article body's markdown pipeline (raw HTML escaped, `safeHref` on links), URLs through `safeHref` (dropped when unsafe), images as `<img>` attributes with the asset's alt in the page's language, everything else as formatted text. Also `renderFields`, `hasShownFields`, and `resolveFields`, `formatFieldValue`, `fieldLabel`, `fieldHelp`, `optionLabel` re-exported.
  - **`formatFieldValue(value, def, { locale, defaultLocale?, timeZone?, words? })`** in `@cloudhal/core-ts/fields`: a value as plain text with `Intl` (numbers, dates that never shift a day, instants in their own zone, option labels as a list, yes/no words).
  - **`EntryFields.astro`** in `@cloudhal/astro-renderer/components`: a plain, unstyled `<dl class="ch-fields">` of the fields that have a value, with `data-field` / `data-type` hooks for themes; nothing at all when none has one.
  - **Blog starter:** articles of collections with fields show a "Details" list under the cover (English, Turkish and Japanese words). Entries of collections without definitions render byte for byte as before.
  - New guide: `docs/guides/fields.md` (defining fields in Studio, MCP, the API and the CLI; operations; languages; theme API; security).
- bd5af88: Typed custom fields, step 2 (RFC-0041 / ADR-0043): the store and the API enforce field definitions.
  
  - **Site writes** (`updateSite`, `createSite`, `PUT /api/sites/:id/collections/:key`, dry run included) check definitions: reserved (`field_key_reserved`) and duplicate keys or options, `minimum` above `maximum`, 30 fields per collection and 200 per site (`too_many_fields`), 256 KB of collection settings (`too_large`). A plain edit never loses a value: changing a field's `type`, `localized` or `multiple`, or dropping a key or a select option that an entry still holds, is refused with `409 field_change_needs_operation`, naming the field operation to use. Other site writes do not re-run the checks.
  - **Entry writes** check only the field values that changed: `422 invalid_fields`, `unknown_field` (a new key without a definition, once the collection has definitions; stored unknown keys are kept), `field_not_localized` (a translation's own copy of a non-localized value) and `required_field` (review or published without a `requiredToPublish` value; drafts save freely). `fields` is capped at 256 KB per entry in every collection when it changes (`too_large`). Image values must be image assets of the site, and image and rich-text asset references are recorded in `asset_refs` under `fields.<key>`, so a used file cannot be deleted. Every refusal lists its problems with paths in `details.issues` (`fields/startsAt/at`).
  - **API inputs** remove a key with `null` in a collection that has definitions. Collections without definitions keep `fields` as any JSON, exactly as before.
  - **Search**: `text` and `richText` fields marked `searchable` add their words to the entry's search text at the next publish (off by default; sites without searchable fields index byte for byte as before).
  - `refuseFieldIssues` and `fieldRefusalCode` are exported from `@cloudhal/core-ts/fields`.

### Patch Changes

- Updated dependencies [672b993]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0

## 0.4.0

### Minor Changes

- c287a09: First-class collections, step 1 (RFC-0040 / ADR-0042). `Site.collections.<key>` takes optional `labels` (singular and plural per locale), `icon`, `feed`, `sitemap` and `sort` next to `permalink`, with at most 50 collections per site. `SiteGraphStore.listCollections(siteId)` returns the registry: declared collections, those inferred from existing entries, and `posts`, with entry counts per status. The new `@cloudhal/core-ts/collections` subpath adds `collectionLabel` and `collectionSettings` for themes. Nothing changes for existing sites.
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

- Updated dependencies [c287a09]
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- 6a39c6d: Fix: sites whose theme was copied from the starter before 0.3.11 rendered empty pages (200 with no body). Their `EntryList` calls the renderer's old one-argument `entryPath(entry)` (and `.map(entryPath)`), which became `entryPath(site, entry)` in 0.3.11. `entryPath` accepts the old call again (deprecated; it ignores collection permalinks — pass the site to get them).
- @cloudhal/core-contracts@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- 84d1fc3: `@cloudhal/core-ts/locale-paths`: the locale URL helpers (`localeRouting`, `localizedPath`, `localeUrl`) move from the renderer into core-ts, browser-safe, with `itemUrl(site, origin, item)` for a page's or entry's public URL. `@cloudhal/astro-renderer/locales` re-exports them unchanged.
- @cloudhal/core-contracts@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 55deb41: RFC-0038 step 1: `Site.collections.<key>.permalink` in the contracts (a template, `/blog/{slug}`; v1 is fixed segments plus `{slug}`), and `entryPath(site, entry)` / `entryAt(site, path)` in `@cloudhal/core-ts` (also `@cloudhal/core-ts/permalinks`). Every entry URL in the renderer, starter, API, MCP server, CLI and Studio now comes from them; with no `collections` set, every URL is the same as before. The renderer's one-argument `entryPath(entry)` is replaced by core's `entryPath(site, entry)` (re-exported from `@cloudhal/astro-renderer/routing`); themes pass the site, or `MediaContext.permalinks`.
- 2d0a257: Collection permalinks, step 2 (RFC-0038 §3–§4): changing a collection's permalink in a site update adds a prefix redirect from the old URL prefix to the new one, in every locale and in the same batch as the site update. A template may not overlap another collection, a taxonomy archive, a page or a reserved path (`path_conflict`/`reserved_path`), and pages and archives may not be created inside a configured prefix. The search index rewrites entry links on the next publish.
- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
- Updated dependencies [55deb41]
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- @cloudhal/core-contracts@0.3.10
  - @cloudhal/schedules@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- @cloudhal/core-contracts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- @cloudhal/core-contracts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/core-contracts@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/core-contracts@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/core-contracts@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- @cloudhal/core-contracts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- @cloudhal/core-contracts@0.3.3
  - @cloudhal/schedules@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/core-contracts@0.3.2
  - @cloudhal/schedules@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/schedules@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [c70d3fa]
  - @cloudhal/storage@0.3.0
  - @cloudhal/schedules@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Minor Changes

- 6612f2c: `cloudhal deploy` runs in Cloudflare Workers Builds (`WORKERS_CI=1`), so a Deploy to Cloudflare button can set up a whole installation (docs/guides/deploy-button.md). Names come from the committed `wrangler.jsonc`, and a database id there is used without any D1 call. The starter site is seeded under `cloudhal.json`'s `siteId` when the checkout has none. Secrets stay on the Workers: only missing ones are generated, and the deployment token is new on every build. The setup link is never printed; the first build explains how the owner sets their own setup token. `seedStarterSite` takes an optional `siteId`.
- 82fa917: Four surface gaps found while building interactive articles (RFC-0022, after 22e).
  - **Computed comparisons:** a `visible` condition or `if`'s `cond` takes a call as an operand, e.g. `{"lt": [{"call": "calculate", …}, {"call": "calculate", …}]}`, within the same nesting and call limits. `evaluateCondition` takes an optional `ResolveContext`.
  - **`Toggle` label:** a labelled Toggle shows its label as a `<legend>`, as RadioGroup does.
  - **`Table` columns:** `hideOnPhone: true` keeps a column (never the first) out of the phone card.
  - **`formatNumber`:** `minDigits` keeps trailing zeros (9.60).
  - **Runtime:** it is now `surface.11.js`; the earlier names keep working.

### Patch Changes

- @cloudhal/core-contracts@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/core-contracts@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
