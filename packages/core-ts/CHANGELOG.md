# @cloudhal/core-ts

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
