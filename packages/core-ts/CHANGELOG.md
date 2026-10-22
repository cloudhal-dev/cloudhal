# @cloudhal/core-ts

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
