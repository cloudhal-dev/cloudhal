# @cloudhal/astro-renderer

## 0.7.2

### Patch Changes

- 6de8d67: Corrections to the machine-drafted translations of collections, typed fields, listings, the OAuth consent screen, Connected agents, the setup-link sign-up text and the site status pages (#112), in all 18 non-English languages. The fixes cover changed meaning, security wording that had softened, mixed terms and mixed register. Examples: Indonesian said "not yet verified" for a self-registered agent, Polish dropped "you" from the loopback warning, and Japanese and Korean lost "never" in "never beyond your role". Korean used a formal register in the new screens while the rest of Studio uses its polite-informal one. Nothing else changes, and the languages remain AI drafts awaiting review by people who speak them.
- Updated dependencies [060a9c8]
  - @cloudhal/core-ts@0.7.2
  - @cloudhal/comments@0.7.2
  - @cloudhal/analytics@0.7.2
  - @cloudhal/core-contracts@0.7.2
  - @cloudhal/storage@0.7.2

## 0.7.1

### Patch Changes

- 24fe76b: Security fixes from the CodeQL backlog on `main`.
  
  - **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only; an input whose component id is one of those keys gets the data key `<id>-value`. Surface pointers the page writes through (an input's `value`/`checked`, a Scrolly's `step`, a Button action's `path`) may not name those keys (a `checkSurface` issue); read bindings still may. The Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
  - **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) is plain text: `&lt;script&gt;` in markdown is the text `<script>`, as before, and every place it goes escapes it (now tested sink by sink). Tags are dropped with a linear scan, and entities are decoded once (`&amp;#60;` is the text `&#60;`, no longer `<`).
  - **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers; one intended difference: an svg comment ends at its first `-->`.
- Updated dependencies [24fe76b]
  - @cloudhal/core-ts@0.7.1
  - @cloudhal/comments@0.7.1
  - @cloudhal/analytics@0.7.1
  - @cloudhal/core-contracts@0.7.1
  - @cloudhal/storage@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [6057871]
- Updated dependencies [d363160]
  - @cloudhal/storage@0.7.0
  - @cloudhal/core-ts@0.7.0
  - @cloudhal/analytics@0.7.0
  - @cloudhal/comments@0.7.0
  - @cloudhal/core-contracts@0.7.0

## 0.6.5

### Patch Changes

- b0ebd95: Slug and name trims run in one linear pass instead of `/^-+|-+$/g` (CodeQL js/polynomial-redos, #168). This covers `slugify`, `foldName` and `slugifyFilename` in core-ts (the new `trimChar` is exported from `@cloudhal/core-ts/names`), heading ids in astro-renderer, and Studio's option, media and entry slugs. Results are unchanged. These trims were already linear in practice, because a run of other characters was collapsed to one `-` first. These inputs were quadratic and are linear now: analytics' `datasetName` on a long run of `_` inside a deployment name; json-render component keys in `fromJsonRender` (`./interop`); trailing whitespace in directive blocks and on comment lines; trailing `/` in request paths (the playground guard and route matching in api, analytics paths, the renderer's link localizing and redirect splats, the docs Worker). The new `trimEndChar` is exported from `@cloudhal/core-ts/names` too.
  
  Also in 0.6.3, with no changeset at the time (#161): Studio's "Not published" badges and its "unknown" scheduler state show their status dot again. They used a Badge variant without a dot colour and rendered no dot.
- f4a1ee3: Status page fixes after RFC-0043 PR 1 (#167). The Site Worker no longer turns a 5xx the renderer or the theme answers on purpose into the `error` page: the starter's own `not-published` 503 for a request that reaches Astro (a `POST`, say) passes unchanged and logs nothing; only Astro's own 500 page (HTML, or its empty fallback when no 500 page renders) and thrown errors become the `error` page. A theme page that throws now gets that page with a reference and a `cloudhal: request failed` log line: the blog starter's catch-all route rethrows when Astro renders it as the error route, instead of answering its own 404 for the page's path (theme copies made from an earlier starter can add the same two lines at the top of `[...path].astro`). A store that cannot be read before rendering answers 503 `unavailable` with `Retry-After: 300`, as `/__cloudhal/health` reports it, instead of a 500; so does a multi-site Worker whose hostname map cannot be read (health `503 { ok: false }`, pages the English `unavailable` page). The `error` page uses the site's language and name when the request has already read the site, taken from the published snapshot (an unpublished rename never shows). An invalid preview token on a feed, sitemap, `llms.txt` or JSON path answers 410 instead of the published content, and no response says why a token failed any more (`x-cloudhal-preview-error` is now always `invalid`).
- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [c15218e]
  - @cloudhal/core-ts@0.6.5
  - @cloudhal/analytics@0.6.5
  - @cloudhal/comments@0.6.5
  - @cloudhal/storage@0.6.5
  - @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- b073595: Status pages (RFC-0043 §1, #117). A site that cannot show its pages answers with one small, translated, self-contained page instead of plain text: `not-published` (503, `Retry-After: 3600`, `noindex`) before the first publish, `preview-expired` (410) for a preview link that does not verify, `unavailable` (503) for a Worker that serves no site, and `error` (500, with the `cf-ray` as a reference) when a render fails. The Site Worker answers them before Astro runs, every one `no-store` with its own CSP; `GET /__cloudhal/health` answers `{ "ok": true, "state": "published" | "not-published" }` in the admin's `/api/health` shape. The page is in the request's locale (host or path prefix, then the site default, then English) for every language Studio speaks, right to left where needed, through the same `pnpm i18n:export/import` flow as Studio's catalogs. A theme may restyle it with an optional `statusPage` export in `src/theme.ts` (`@cloudhal/astro-renderer/status-page`), which falls back to the built-in page on a throw, a slow answer or an oversized document and never runs for `error`; `cloudhal dev` draws each state at `/__cloudhal/status/<state>`. The blog starter's routes use `statusPage`/`statusPlain` as their own fallback. **Behaviour change:** an invalid or expired preview link now answers 410 instead of silently showing the published page.
- @cloudhal/analytics@0.6.4
  - @cloudhal/comments@0.6.4
  - @cloudhal/core-contracts@0.6.4
  - @cloudhal/core-ts@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- 1dd79c2: Dependency updates from the November 2026 Dependabot sweep. `@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.152.0 (its `createTestHarness` runs Miniflare 5.20261019.2-beta, and `wrangler deploy` uploads source maps by default since 4.150). The Studio shipped in `@cloudhal/cli` is built with Tiptap 3.32.0 and `@codemirror/language` 6.13.1. The Rust crate validates with jsonschema 0.60.2, and the monorepo lints and formats with Biome 2.6.2 (Markdown and YAML formatting stay off).
- 7dddd88: `@cloudhal/astro-renderer`, `@cloudhal/cli` and `@cloudhal/cloudflare` use wrangler 4.158.0, and `@cloudhal/astro-renderer` uses `@astrojs/cloudflare` 14.4.4, which brings `@cloudflare/vite-plugin` 1.67 (its peer range is wrangler ^4.156.1, so the two move together). `@astrojs/cloudflare` 14.4 needs Astro 7.4, so projects move to Astro 7.4.7: the blog starter asks for it, and the `astro` peer range of `@cloudhal/astro-renderer` and `@cloudhal/cli` is now ^7.4.0 (was ^7.3.0). The blog starter asks for wrangler ^4.158.0.
- @cloudhal/analytics@0.6.3
  - @cloudhal/comments@0.6.3
  - @cloudhal/core-contracts@0.6.3
  - @cloudhal/core-ts@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- Updated dependencies [7223152]
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [f73d05a]
- Updated dependencies [6cb7945]
- Updated dependencies [f669266]
- Updated dependencies [786a455]
- Updated dependencies [8a30e30]
  - @cloudhal/core-ts@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/analytics@0.6.2
  - @cloudhal/comments@0.6.2
  - @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- 92c3867: Theme scripts work on deployed sites, and `render_page` says when they would not.
  
  - The `cloudhal()` integration no longer lets Astro inline a component's `<script>` (under 4 KB) into the page, where the Site Worker's `script-src 'self'` blocked it: script chunks always ship as files (`build.assetsInlineLimit`), other assets keep the project's own limit. A theme that set `vite.build.assetsInlineLimit` itself for this can drop it.
  - `cloudhal dev` sends the Site Worker's policy as `Content-Security-Policy-Report-Only` on pages without their own, so the browser console shows what a deploy would block without breaking Vite's dev client.
  - `render_page` and `cloudhal render` gain two checks: `surface-broken` (a body ```` ```surface ```` fence the preview cannot draw, or a component with an unknown block type or props that do not fit, named with the problem) and `script-blocked` (a script the page's CSP refused, inline or by URL; under `cloudhal dev`'s report-only policy, what a deploy would block).
- Updated dependencies [40dbfcb]
- Updated dependencies [028f396]
  - @cloudhal/core-ts@0.6.1
  - @cloudhal/comments@0.6.1
  - @cloudhal/analytics@0.6.1
  - @cloudhal/core-contracts@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 5aced9a: Per-collection feeds (RFC-0042 step 6, ADR-0044). Each collection with a permalink prefix has an RSS feed at `<prefix>/rss.xml` (and `/<locale><prefix>/rss.xml` or the locale's domain): its newest listed entries, so expiry and time gates apply as in the site feed, with the same cache tag and edge-cache cap; `feed: false` answers 404. The `cloudhal()` integration serves it from a middleware on every target, only where the theme's own routes answered 404, so a theme's own route wins and old theme copies gain the feeds; static builds write them because `staticPaths().feeds` now lists every collection feed path for the starter's `[...path]/rss.xml` route. New theme API `collectionFeedLink(site, collection, origin, locale?)` (`./seo`, `./collection-feeds`) gives the `<link rel="alternate">`; the blog starter adds it on entry pages and on pages that list a collection. Previews now list `contentList` sections with `where`/`orderBy` through the same evaluator as the site (`renderSectionHtml`'s new optional `listing` argument, passed by `renderPagePreview`), so an entry without the field's value no longer shows under "upcoming". New guide: `docs/guides/structured-data.md`.
- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.

### Patch Changes

- 4f3f520: Collections stage 3, step 4 (RFC-0042 §7 / ADR-0044): MCP.
  
  - **`list_collections`** returns, per collection, its `listFields` with each field's type, operators (`ops`) and whether it sorts, and, for a collection with a JSON-LD preset, `structuredData`: the type, every path it offers (required ones, "at least one of" groups, defaults, the field types, entry and site properties, constants and vocabulary each takes) and the preset's warnings.
  - **`update_collection`** takes `listFields`, `expiry` and `structuredData` (`null` removes one). The store's dry run checks them in `precheck`, so `unknown_field`, `invalid_expiry`, `structured_data_invalid`, `list_field_in_use` and `gates_unsupported` refuse the call, with paths, before a person is asked. The approval says what changes in words ("Events leave listings, feeds, the sitemap and search (their pages stay) 1 hour after "Ends at" (endsAt); 2 published entries are already past it", "structured data: Event, maps startDate ← field startsAt, …", vocabulary warnings), and the answer lists the preset's warnings. Policy is unchanged (`site:write`, a person holding `site:settings` approves in every mode).
  - **`list_entries`** takes `where`, `orderBy`, `limit` and `cursor`, run by core-ts's shared evaluator (`queryContentEntries`); with `limit` it answers `total` and `nextCursor`. Invalid queries are refused as `invalid_query` with their paths.
  - **`create_page` / `update_page`** check a changed `contentList` section's `where`/`orderBy` in `precheck` (`invalid_query`, `sections/0/where/1/value`).
  - **New read-only tool `preview_structured_data`** (`content:read`): the JSON-LD an entry's page emits under its collection's preset, built by the renderer's `entryStructuredData`, with the issues (no preset, a required value missing, over 32 KB) and the preset's warnings. 109 → 110 tools.
  - Hints for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported` (expiry and `availability` alike), and a "Listings, expiry and structured data" paragraph in the server instructions.
  - `@cloudhal/astro-renderer`: new subpath `./structured-data` (`entryStructuredData`, `withStructuredData`), so tools use it without the package root.
- Updated dependencies [321e8be]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [84c6d94]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Minor Changes

- 92d3362: Typed custom fields, step 6 (RFC-0041 §9 / ADR-0043): renderer and themes. Additive only: `entry.fields` still means exactly what is stored, and themes copied before this release build and render as before (a frozen 0.4.0 theme joins the compat test).
  
  - **`GraphSource.entryFields(entry, options?)`** on live and snapshot sources (and `entryFields(source, entry, options?)` from `@cloudhal/astro-renderer/fields` for any source): an entry's typed fields as a theme draws them, by key in definition order. Values are resolved by the language rules (a translation's empty localized field reads the original's, `fromOriginal`; non-localized fields come from the translation group's original; language editions own their values), labelled in the page's language and made safe: rich text as HTML from the article body's markdown pipeline (raw HTML escaped, `safeHref` on links), URLs through `safeHref` (dropped when unsafe), images as `<img>` attributes with the asset's alt in the page's language, everything else as formatted text. Also `renderFields`, `hasShownFields`, and `resolveFields`, `formatFieldValue`, `fieldLabel`, `fieldHelp`, `optionLabel` re-exported.
  - **`formatFieldValue(value, def, { locale, defaultLocale?, timeZone?, words? })`** in `@cloudhal/core-ts/fields`: a value as plain text with `Intl` (numbers, dates that never shift a day, instants in their own zone, option labels as a list, yes/no words).
  - **`EntryFields.astro`** in `@cloudhal/astro-renderer/components`: a plain, unstyled `<dl class="ch-fields">` of the fields that have a value, with `data-field` / `data-type` hooks for themes; nothing at all when none has one.
  - **Blog starter:** articles of collections with fields show a "Details" list under the cover (English, Turkish and Japanese words). Entries of collections without definitions render byte for byte as before.
  - New guide: `docs/guides/fields.md` (defining fields in Studio, MCP, the API and the CLI; operations; languages; theme API; security).

### Patch Changes

- Updated dependencies [672b993]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/storage@0.5.0

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

- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- 6a39c6d: Fix: sites whose theme was copied from the starter before 0.3.11 rendered empty pages (200 with no body). Their `EntryList` calls the renderer's old one-argument `entryPath(entry)` (and `.map(entryPath)`), which became `entryPath(site, entry)` in 0.3.11. `entryPath` accepts the old call again (deprecated; it ignores collection permalinks — pass the site to get them).
- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/core-contracts@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- 84d1fc3: `@cloudhal/core-ts/locale-paths`: the locale URL helpers (`localeRouting`, `localizedPath`, `localeUrl`) move from the renderer into core-ts, browser-safe, with `itemUrl(site, origin, item)` for a page's or entry's public URL. `@cloudhal/astro-renderer/locales` re-exports them unchanged.
- Updated dependencies [84d1fc3]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/core-contracts@0.3.12
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
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- 46f59d5: The site Worker's responses carry `Vary: Host`, and redirect-host 301s never enter the edge cache (#62). Workers Cache keys by path, not hostname, so before this every host routed to one site Worker shared a cache entry per path: a `--redirect` host's 301 could be served on the site's own domain (a redirect loop), and the sites of a multi-site Worker could serve each other's cached pages.
- @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-contracts@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- 348a00a: `cloudhal domain set <host> --redirect www.<host>`: hosts that answer with a 301 to the site's domain (path and query kept), routed to the site Worker as Custom Domains on the next deploy (#49). `cloudhal domain remove redirects` drops them.
- @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-contracts@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- @cloudhal/analytics@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-contracts@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/analytics@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-contracts@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/analytics@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-contracts@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/analytics@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-contracts@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- @cloudhal/analytics@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-contracts@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- @cloudhal/analytics@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/analytics@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-contracts@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- a28c22e: New `@cloudhal/cloudflare/playground` (RFC-0036): `createPlaygroundWorker({ seed, render, deployUrl })` returns the playground Worker and its `PlaygroundSite` Durable Object — one SQLite database per visitor holding the store, the API in playground mode and the rendered site, a signed host-only session cookie, a 60-minute TTL with a 2-hour cap, Reset, size and node caps, per-IP and per-session rate limits, Turnstile after a limit hit, a daily session cap and a kill switch. `@cloudhal/astro-renderer/runtime` gains `withRequestStore(store, siteId, fn)`, which renders a request from a store the entry chooses; such pages are private and never edge-cached.

### Patch Changes

- Updated dependencies [c70d3fa]
  - @cloudhal/storage@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Minor Changes

- 82fa917: Four surface gaps found while building interactive articles (RFC-0022, after 22e).
  - **Computed comparisons:** a `visible` condition or `if`'s `cond` takes a call as an operand, e.g. `{"lt": [{"call": "calculate", …}, {"call": "calculate", …}]}`, within the same nesting and call limits. `evaluateCondition` takes an optional `ResolveContext`.
  - **`Toggle` label:** a labelled Toggle shows its label as a `<legend>`, as RadioGroup does.
  - **`Table` columns:** `hideOnPhone: true` keeps a column (never the first) out of the phone card.
  - **`formatNumber`:** `minDigits` keeps trailing zeros (9.60).
  - **Runtime:** it is now `surface.11.js`; the earlier names keep working.

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/analytics@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
