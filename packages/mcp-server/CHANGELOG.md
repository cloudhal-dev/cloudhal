# @cloudhal/mcp-server

## 0.6.0

### Minor Changes

- 4f3f520: Collections stage 3, step 4 (RFC-0042 §7 / ADR-0044): MCP.
  
  - **`list_collections`** returns, per collection, its `listFields` with each field's type, operators (`ops`) and whether it sorts, and, for a collection with a JSON-LD preset, `structuredData`: the type, every path it offers (required ones, "at least one of" groups, defaults, the field types, entry and site properties, constants and vocabulary each takes) and the preset's warnings.
  - **`update_collection`** takes `listFields`, `expiry` and `structuredData` (`null` removes one). The store's dry run checks them in `precheck`, so `unknown_field`, `invalid_expiry`, `structured_data_invalid`, `list_field_in_use` and `gates_unsupported` refuse the call, with paths, before a person is asked. The approval says what changes in words ("Events leave listings, feeds, the sitemap and search (their pages stay) 1 hour after "Ends at" (endsAt); 2 published entries are already past it", "structured data: Event, maps startDate ← field startsAt, …", vocabulary warnings), and the answer lists the preset's warnings. Policy is unchanged (`site:write`, a person holding `site:settings` approves in every mode).
  - **`list_entries`** takes `where`, `orderBy`, `limit` and `cursor`, run by core-ts's shared evaluator (`queryContentEntries`); with `limit` it answers `total` and `nextCursor`. Invalid queries are refused as `invalid_query` with their paths.
  - **`create_page` / `update_page`** check a changed `contentList` section's `where`/`orderBy` in `precheck` (`invalid_query`, `sections/0/where/1/value`).
  - **New read-only tool `preview_structured_data`** (`content:read`): the JSON-LD an entry's page emits under its collection's preset, built by the renderer's `entryStructuredData`, with the issues (no preset, a required value missing, over 32 KB) and the preset's warnings. 109 → 110 tools.
  - Hints for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported` (expiry and `availability` alike), and a "Listings, expiry and structured data" paragraph in the server instructions.
  - `@cloudhal/astro-renderer`: new subpath `./structured-data` (`entryStructuredData`, `withStructuredData`), so tools use it without the package root.
- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.

### Patch Changes

- 84c6d94: Typed fields follow-ups (RFC-0041). One asset check for field values, `fieldAssetIssues` in `@cloudhal/core-ts/media` (with `fieldAssetRefs` and `newFieldAssetRefs`), now used by both the store's entry write and MCP's `create_entry`/`update_entry` precheck; same codes and messages. Machine translation now follows §5: `get_translation_source` returns only the localized text and rich-text field values to translate (`fields`) and names the shared ones (`sharedFields`); `save_translation` takes translated `fields`, refuses shared ones in precheck with `field_not_localized` (paths in `details.issues`), and no longer copies the source's field values into a new translation in the same site. New helpers in `@cloudhal/core-ts/fields`: `localizedFieldValues`, `translatableFieldValues`, `sharedFieldKeys`, `sharedFieldIssues`. Studio's "write by hand" draft copies only localized field values.
- Updated dependencies [321e8be]
- Updated dependencies [5aced9a]
- Updated dependencies [4f3f520]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [84c6d94]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/astro-renderer@0.6.0
  - @cloudhal/agent-runtime@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Minor Changes

- 9d04a37: Typed custom fields, step 4 (RFC-0041 §8 / ADR-0043): MCP.
  
  - **`list_collections`** returns each collection's field definitions (`fields`) and `fieldsSchema`, the JSON Schema of an entry's values with labels and help in the asked `locale` (default: the site's).
  - **`create_entry` / `update_entry`** check field values in `precheck` with the store's checker (changed keys only, unknown keys, a translation's copy of a non-localized value, `requiredToPublish` for review and published, image and `asset:` references), so a refused call never reaches a person; each issue keeps its path (`fields/startsAt/at`). `update_entry` takes `fields` as a merge patch (`null` removes a key), and its approval names typed changes readably ("Starts at (startsAt) → 5 Nov 2026 19:30 Istanbul", option labels, values quoted and truncated).
  - **`update_collection`** takes `fields` (the whole list) for free definition edits; changes that could lose values are refused with `field_change_needs_operation`, naming the operation tool.
  - **New tools `rename_field`, `change_field_type`, `set_field_localized`, `remove_field`** (`site:write` + `content:write`): always a person holding `site:settings`, in every mode including `bypass`; the approval shows the dry run (entries touched, values moved, converted or cleared, samples), `dryRun: true` reports without asking, and a call that would clear values without `onInvalid: "clear"` is refused before anyone is asked. A run that stops at its budget answers `done: false` with an `operationId`; calling the same tool again with it continues the operation after a new approval.
  - Hints for every field error code, and server instructions telling agents to read `fieldsSchema` before writing entries and to use the operation tools for risky changes.

### Patch Changes

- Updated dependencies [672b993]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/astro-renderer@0.5.0
  - @cloudhal/agent-runtime@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0

## 0.4.0

### Minor Changes

- 18a3960: MCP collection tools (RFC-0040 step 4):
  - `list_collections` (`content:read`) lists every collection with its names, icon, entry counts by status, permalink, feed, sitemap and sort settings, and the taxonomies that apply.
  - `create_collection` declares a collection. It needs names in the default locale and optionally takes an icon, permalink, feed, sitemap and sort.
  - `update_collection` changes a collection's names (merged by locale), icon, feed, sitemap or sort.
  - Both write tools need `site:write` and wait for a person in every mode, and that person must hold `site:settings`. Overlaps, duplicates and missing names are refused before anyone is asked; `dryRun` checks without asking.
  - `create_entry` now refuses a collection outside the registry (`collection_undeclared`) and points to `create_collection`. Collections that already have entries keep working.

### Patch Changes

- 3c4453e: First-class collections, step 2 (RFC-0040 / ADR-0042).
  - **Store:** the first entry of a new collection is refused (`path_conflict`, `reserved_path`) when its default prefix `/<collection>` overlaps another collection's permalink, a taxonomy archive, `/search` or a locale prefix. This closes the gap RFC-0038 left. A site update that declares a new collection runs the same check, and a declared collection that still has entries, or that a taxonomy names, cannot be undeclared (`collection_in_use`).
  - **API:** new routes under `/api/sites/:id/collections`:
    - `GET` (`content:read`) lists the registry;
    - `PUT /:key { settings, rev }` declares or changes a collection (`site:settings`), with `?dryRun=1`;
    - `DELETE /:key?rev=` undeclares an empty one.
  
    Creating an entry in a collection outside the registry is refused with `collection_undeclared` (422).
  - **Renderer:** RSS feeds leave out collections with `feed: false`, and `sitemap.xml` leaves out those with `sitemap: false`. The defaults are unchanged. `collectionLabel` and `collectionSettings` are re-exported from `./routing` for themes.
  - **MCP:** resetting a permalink with `set_collection_permalink` keeps the collection declared. Agents get hints for the new error codes.
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
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
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/core-contracts@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- Updated dependencies [84d1fc3]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/astro-renderer@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/agent-runtime@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/core-contracts@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 55deb41: RFC-0038 step 1: `Site.collections.<key>.permalink` in the contracts (a template, `/blog/{slug}`; v1 is fixed segments plus `{slug}`), and `entryPath(site, entry)` / `entryAt(site, path)` in `@cloudhal/core-ts` (also `@cloudhal/core-ts/permalinks`). Every entry URL in the renderer, starter, API, MCP server, CLI and Studio now comes from them; with no `collections` set, every URL is the same as before. The renderer's one-argument `entryPath(entry)` is replaced by core's `entryPath(site, entry)` (re-exported from `@cloudhal/astro-renderer/routing`); themes pass the site, or `MediaContext.permalinks`.
- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/astro-renderer@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

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
