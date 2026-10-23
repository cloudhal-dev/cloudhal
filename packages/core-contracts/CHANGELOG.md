# @cloudhal/core-contracts

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
