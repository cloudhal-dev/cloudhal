# @cloudhal/core-contracts

## 0.8.0

### Minor Changes

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

## 0.7.3

No changes in this release.

## 0.7.2

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.5

No changes in this release.

## 0.6.4

No changes in this release.

## 0.6.3

No changes in this release.

## 0.6.2

No changes in this release.

## 0.6.1

No changes in this release.

## 0.6.0

### Minor Changes

- 321e8be: Collections stage 3 contract and pure core (RFC-0042 step 1, ADR-0044). `CollectionSettings` gains optional `listFields` (up to 4 field keys), `expiry` (`{ field, action: "unlist" | "hide", afterMinutes? }`) and `structuredData` (`{ type: "Event" | "JobPosting" | "Product" | "Recipe", properties }`, each property sourced by `kind`: `field`, `entry`, `site` or a plain-text `text` constant); `contentList` sections gain `where` (up to 4 `FieldCondition`s) and `orderBy` (`FieldOrder`), both new in `common.schema.json`. New `@cloudhal/core-ts/structured-data`: the closed preset table, `checkStructuredData` (save-time mapping check) and `structuredDataFor` (an entry's JSON-LD, none when a required value is missing, capped at 32 KB). `@cloudhal/core-ts/fields` adds the listing evaluator (`checkFieldQuery`, `parseFieldQuery`, `matchesFieldQuery`, `compareByField`) and the derived expiry gate (`fieldGateInstant`, `expiryInstant`, `effectiveUntil`, `dayStartIn`). Nothing reads them yet: no behaviour change.

## 0.5.0

### Minor Changes

- 672b993: Typed custom fields, step 1 (RFC-0041 / ADR-0043). `Site.collections.<key>.fields` takes an ordered list of 1–30 field definitions in nine types (`text`, `richText`, `number`, `boolean`, `date`, `datetime`, `url`, `image`, `select`), discriminated by `type`, each with per-locale labels, `localized` and (except `boolean`) `requiredToPublish`. The new `@cloudhal/core-ts/fields` subpath (Worker-safe, eval-free) checks definitions (reserved keys, unique keys and options, 30 per collection, 200 per site, 256 KB of collection settings, the plain-edit guard), checks values through ADR-0030's `validateProps` (only changed values; unknown keys refused once a collection has definitions; 256 KB per entry), checks `requiredToPublish`, emits the JSON Schema agents receive (strict-mode safe), and resolves values across translations (`resolveFields`). Nothing reads it yet: the store, API, MCP, Studio and renderer adopt it in later steps, so nothing changes for existing sites.

## 0.4.0

### Minor Changes

- c287a09: First-class collections, step 1 (RFC-0040 / ADR-0042). `Site.collections.<key>` takes optional `labels` (singular and plural per locale), `icon`, `feed`, `sitemap` and `sort` next to `permalink`, with at most 50 collections per site. `SiteGraphStore.listCollections(siteId)` returns the registry: declared collections, those inferred from existing entries, and `posts`, with entry counts per status. The new `@cloudhal/core-ts/collections` subpath adds `collectionLabel` and `collectionSettings` for themes. Nothing changes for existing sites.

## 0.3.13

No changes in this release.

## 0.3.12

No changes in this release.

## 0.3.11

### Patch Changes

- 55deb41: RFC-0038 step 1: `Site.collections.<key>.permalink` in the contracts (a template, `/blog/{slug}`; v1 is fixed segments plus `{slug}`), and `entryPath(site, entry)` / `entryAt(site, path)` in `@cloudhal/core-ts` (also `@cloudhal/core-ts/permalinks`). Every entry URL in the renderer, starter, API, MCP server, CLI and Studio now comes from them; with no `collections` set, every URL is the same as before. The renderer's one-argument `entryPath(entry)` is replaced by core's `entryPath(site, entry)` (re-exported from `@cloudhal/astro-renderer/routing`); themes pass the site, or `MediaContext.permalinks`.

## 0.3.10

No changes in this release.

## 0.3.9

No changes in this release.

## 0.3.8

No changes in this release.

## 0.3.7

No changes in this release.

## 0.3.6

No changes in this release.

## 0.3.5

No changes in this release.

## 0.3.4

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.1

No changes in this release.

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
