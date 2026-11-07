# @cloudhal/cli

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- 330b650: New `cloudhal export` (RFC-0039, #47) writes one site of the local project to a single `.cloudhal` file. The file is a gzipped tar holding the site's content graph (nodes, snapshots and the node bodies they reference, as NDJSON parts), its media files and its takedown ledger, with every file's SHA-256 listed in the manifest. The flags:
  
  - `--out <file>` names the file, and replaces a file already there once the new one is complete. By default the file is `<site-slug>-<YYYYMMDD>.cloudhal` in the current folder, dated by the newest timestamp among the rows it holds (deleting content alone does not move that date; the next edit or snapshot does). A file already at the default name is replaced only by the same archive; any other (a later edit the same day, other flags, a deletion) is left alone and the export asks for `--out`.
  - `--site <id>` exports another site listed in `cloudhal.json` `sites`. `--site`, `--no-media` and `--latest-only` are refused on every other command.
  - `--no-media` writes the graph only.
  - `--latest-only` keeps only the published and the latest snapshot, and only the media they and the current content need. It is refused while a field operation is unfinished (`cloudhal fields continue|revert`).
  
  A damaged or missing local media file stops the export (run `cloudhal media verify`); so do Ctrl-C and SIGTERM. Either way no file is written and an existing one is left as it was. Exporting an unchanged site again with the same CLI and Node version gives the same bytes. An archive never contains user accounts, sessions, roles, agent keys, comments, readers, analytics, the audit log, scheduled releases, automations, schedule runs, pending approvals, open edit suggestions, deployment secrets or webhook credentials, and the export prints this list. Its history does name who made each change (the user or agent of each snapshot, upload, block edit, review and takedown).
- 2c18a7c: New `cloudhal import <file> [--dry-run]` (RFC-0039, #47) reads a `.cloudhal` file written by `cloudhal export` into the local project, keeping the site's id.
  
  - It reads the file twice. First it verifies every file's size and SHA-256, every row and every node body (each must be the node its snapshot refs name), and checks the archive against the project. A damaged or edited file, invalid content, an archive of another site, a site whose nodes differ, or missing media is therefore refused before anything is written. Then it reads the file again, refusing it if it changed in between, copies the media the project lacks and imports the graph, keeping the archive's published snapshot as `cloudhal pull` does.
  - By default a bootstrap import. The archive's site must be `cloudhal.json`'s `siteId` or listed in `sites`, and the project must not hold it yet or hold exactly its nodes; missing snapshots, node bodies and media are added. A site whose nodes differ is refused; `--replace` replaces them (see its own note).
  - An archive written with `--no-media` imports only when the project already has its media.
  - Taken-down content stays down: the archive's takedowns are recorded and their bytes never written, a local copy of content the archive's ledger took down is deleted (the summary says how many), and an archive carrying content this project has taken down is refused.
  - `--dry-run` prints the manifest and what the import would add, change or remove (nodes by kind and title, snapshots, media to copy), writes nothing, and exits 1 when the import would be refused.
  - Ctrl-C and SIGTERM stop the import before the graph is written; media already copied stay in the blob store, unreferenced, and the next import reuses them. A storage failure while the graph is written says the import stopped partway; running it again completes it, search index included.
  - Opening an existing local store applies pending migrations, as every command does; a project without one gets none from a dry run or a refused import.
- 33ae911: `cloudhal import <file> --replace [--dry-run]` (RFC-0039 rollout step 4, #47) makes the local site's nodes the archive's, its published snapshot included, as `cloudhal pull --replace` does. `cloudhal push` still keeps a deployment's own published snapshot, so a local replace never moves production. Snapshots are only ever added.
  
  - When it changes a site the project already holds, the current graph is saved first as a snapshot labelled `before import <file>` and the result as `import <file>`; the summary prints `(undo: cloudhal import --revert <id>)`. A new or unchanged site gets no snapshot; a site the plan found unchanged is checked again just before the write, and refused if another process changed it meanwhile. A run that stopped after the first snapshot reuses it the next time.
  - The archive's nodes keep their revs, as with `pull --replace`. A Studio tab or agent still holding a node at the rev the archive gives it can save over it without a conflict, so the summary counts those nodes and says to reload open Studio tabs.
  - New `cloudhal import --revert <snapshot-id> [--dry-run]` brings the site back to a `before import` snapshot, its published snapshot included, saving the current graph first as `before revert import <file>`, so a revert can itself be reverted. Its revs only move forward: a node edited since comes back at the rev after its current one, so a stale editor gets a conflict. Studio's rollback only moves the published pointer to an earlier snapshot, which cannot undo a replace.
  - An archive of a site `cloudhal.json` does not list switches its `siteId`, and the old id's place in `sites`, to the archive's, editing only those values in the file (layout and other keys stay as written), once the import has landed. The old site stays in the local store, unlisted and untouched; writing the old id back by hand undoes the switch (`--revert` restores nodes only), and the summary names `cloudhal site delete` to remove the old site for good. A deployed project is warned that its deployment serves the old site, and that a deployment of the imported site is updated from the project that deployed it.
  - Refused before anything is written: open releases of the site (cancel them in Studio), an unfinished field operation, a hostname another local site serves (now a refusal `--dry-run` reports, for bootstrap imports too), and an archive site id `cloudhal.json` cannot name.
  - `--dry-run` shows the snapshots it would take, the published-snapshot change and the `cloudhal.json` change; it exits 0, or 1 when the import would be refused.
  - `--cancel-schedules` is now refused by every command but `cloudhal push`.
- 68cd5a1: Studio shows **Ended (collection rule)** beside the status of a published entry whose collection's expiry has passed (RFC-0042 §3.3, #113), in the collection list and in the entry editor's header. Until now such an entry looked plainly published while the site had already left it out of lists, or answered "not found". The badge explains itself on hover, from the keyboard and with a tap on touch screens. It names the date field, when the entry ended in the site's time zone, and what the site does: the page keeps its address but leaves lists, feeds, the sitemap and search, or the page answers "not found". Drafts, embargoed entries and entries whose own "Hide after" has passed get no badge (their own dates show in the editor's Schedule card). A translation reads its original's date only while the original is published, as the site does. The badge and its words load only for collections that have an expiry. Translations of the new words are AI drafts awaiting review.
- Updated dependencies [7223152]
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [df8695e]
- Updated dependencies [f73d05a]
- Updated dependencies [f73d05a]
- Updated dependencies [6cb7945]
- Updated dependencies [f669266]
- Updated dependencies [77fa9e5]
- Updated dependencies [786a455]
- Updated dependencies [8a30e30]
  - @cloudhal/core-ts@0.6.2
  - @cloudhal/api@0.6.2
  - @cloudhal/cloudflare@0.6.2
  - @cloudhal/schedules@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/mcp-server@0.6.2
  - @cloudhal/analytics@0.6.2
  - @cloudhal/comments@0.6.2
  - @cloudhal/agent-runtime@0.6.2
  - @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- 40dbfcb: Gaps an agent hit building a site through MCP:
  
  - **Section-only theme blocks in article bodies are refused.** A theme block type with `where: ["section"]` (say `link-cards`) has no component in an article, and drew "unknown component" there. `create_entry`/`update_entry` now refuse it inside a body ```` ```surface ```` fence (`invalid_surface`, with the component's path); primitives, built-in blocks and theme blocks that allow `body` stay. `get_catalog`'s "In article bodies" lists which blocks a body may use and which are page sections only.
  - **`list_entries` lists every collection by default**, not only `posts`: a site whose articles live in `blog` got `[]`. `where`/`orderBy` need the collection whose list fields they use; without one they are refused (`invalid_query` at `collection`) instead of ignored.
  - **`long-line` gives a text column one verdict.** It counted characters over a rounded line count, so how full a paragraph's last line was decided whether it passed, and identical paragraphs in one column disagreed. It now counts the characters on each rendered line, leaves each paragraph's last line out, and pools the paragraphs of one width and font: one example per column, with its width and how many paragraphs it holds.
  - **Blog starter:** a primary surface `Button` in an article body keeps its `on-brand` text; the body's link colour no longer applies to buttons (it failed contrast at 2.5:1 light, 1.3:1 dark).
- 4103a32: Studio on a playground (RFC-0036): the Build page no longer says "This deployment can't reach Workers AI". It says Build with AI is available in your own install, since the playground leaves AI out, and links to deploying Cloudhal. Translations of the new sentence are AI drafts awaiting review.
- 92c3867: Theme scripts work on deployed sites, and `render_page` says when they would not.
  
  - The `cloudhal()` integration no longer lets Astro inline a component's `<script>` (under 4 KB) into the page, where the Site Worker's `script-src 'self'` blocked it: script chunks always ship as files (`build.assetsInlineLimit`), other assets keep the project's own limit. A theme that set `vite.build.assetsInlineLimit` itself for this can drop it.
  - `cloudhal dev` sends the Site Worker's policy as `Content-Security-Policy-Report-Only` on pages without their own, so the browser console shows what a deploy would block without breaking Vite's dev client.
  - `render_page` and `cloudhal render` gain two checks: `surface-broken` (a body ```` ```surface ```` fence the preview cannot draw, or a component with an unknown block type or props that do not fit, named with the problem) and `script-blocked` (a script the page's CSP refused, inline or by URL; under `cloudhal dev`'s report-only policy, what a deploy would block).
- Updated dependencies [40dbfcb]
- Updated dependencies [028f396]
- Updated dependencies [92c3867]
  - @cloudhal/core-ts@0.6.1
  - @cloudhal/mcp-server@0.6.1
  - @cloudhal/api@0.6.1
  - @cloudhal/cloudflare@0.6.1
  - @cloudhal/comments@0.6.1
  - @cloudhal/agent-runtime@0.6.1
  - @cloudhal/analytics@0.6.1
  - @cloudhal/core-contracts@0.6.1
  - @cloudhal/schedules@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 5aced9a: Per-collection feeds (RFC-0042 step 6, ADR-0044). Each collection with a permalink prefix has an RSS feed at `<prefix>/rss.xml` (and `/<locale><prefix>/rss.xml` or the locale's domain): its newest listed entries, so expiry and time gates apply as in the site feed, with the same cache tag and edge-cache cap; `feed: false` answers 404. The `cloudhal()` integration serves it from a middleware on every target, only where the theme's own routes answered 404, so a theme's own route wins and old theme copies gain the feeds; static builds write them because `staticPaths().feeds` now lists every collection feed path for the starter's `[...path]/rss.xml` route. New theme API `collectionFeedLink(site, collection, origin, locale?)` (`./seo`, `./collection-feeds`) gives the `<link rel="alternate">`; the blog starter adds it on entry pages and on pages that list a collection. Previews now list `contentList` sections with `where`/`orderBy` through the same evaluator as the site (`renderSectionHtml`'s new optional `listing` argument, passed by `renderPagePreview`), so an entry without the field's value no longer shows under "upcoming". New guide: `docs/guides/structured-data.md`.
- 3e93878: Collections stage 3 in the renderer (RFC-0042 step 3, ADR-0044). A collection's `expiry` gives every entry a derived gate (`min(availability.until, field date + grace)`; a date ends at the next day's start in the site's zone), applied by both published sources at render time: `unlist` keeps the entry's page but leaves `entries()`, `allEntries()`, term filters and archives, related posts, feeds, the sitemap, `llms.txt` and search (search rows' `gateUntil`); `hide` answers 404 like an expired `availability`. The gate index adds every derived instant and every value instant of date/datetime list fields, so the edge cache expires there without a purge; previews ignore derived gates and say "Ended on …". New theme APIs: `GraphSource.queryEntries` and `queryEntries(source, q)` (`./queries`) list a collection by its list fields (`where`, `orderBy`, `sort`, `filter`, `limit`, `offset`, `includeExpired`) with one evaluator on live and snapshot sources; `contentListEntries`; `GraphSource.routableEntries` (entries with a public URL, unlisted included); `withStructuredData` and `entryStructuredData` (`./seo`) replace the generic `BlogPosting` with the collection's JSON-LD preset when the entry has every required value. `ContentList.astro` honours `where`/`orderBy`, also for theme copies that pass a source's list. `entryHead` is unchanged, so old themes keep today's output; the blog starter calls `withStructuredData` and `contentListEntries`. The site Worker's `GET /__cloudhal/features` answers `{ "gates": 2 }`, and writers (store, API, MCP, bundle import) refuse a new or changed `expiry` with `409 gates_unsupported` until it does (`GateSupport.enforced(siteId, version)`, `EXPIRY_GATES_VERSION`). A live entry whose published change adds a derived gate or moves it earlier is never low risk in `auto` mode (`expiringEntries`, auto-check code `expires`, for publishes and releases). Sites without the new settings render as before.
- 2e89658: Collections stage 3, step 5 (RFC-0042 §7 / ADR-0044): Studio.
  
  - **Collection settings** get three cards, each saved on its own: **Listing fields** (up to four fields, ordered; a field content lists still use names those pages), **Expiry** (a date or date-and-time field, "Leave lists" or "Hide the page" explained in words, a grace in minutes, and how many published entries are already past it; a site Worker that does not apply expiry yet says to deploy first) and **Structured data** (Event, Job posting, Product or Recipe; every property offers only the sources that fit it, required ones are marked, problems show while editing, and a chosen entry's JSON-LD is previewed with a link to Google's Rich Results Test).
  - **Create listing page** makes a draft page at the collection's address with a content list of it (upcoming first for a collection with a date listing field and an expiry) and opens it; when a page already lives there, the action opens that page.
  - **Collection lists** show listing fields as columns, filter by them and sort by number and date fields. Filters and sort live in the URL and ask the API by field, one page at a time.
  - **Page editor**: content list sections get conditions and an order by the collection's listing fields; refused conditions show on their row.
  - Words for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported`, the `preview_structured_data` tool and the expiry auto-publish check. Translations are AI drafts awaiting review.
  - `@cloudhal/api`: new read-only `GET /api/sites/:siteId/entries/:entryId/structured-data` (`content:read`), the REST twin of MCP's `preview_structured_data`: the preset document an entry's page emits, its issues and the preset's warnings.

### Patch Changes

- Updated dependencies [321e8be]
- Updated dependencies [4f3f520]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [2e89658]
- Updated dependencies [84c6d94]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/mcp-server@0.6.0
  - @cloudhal/cloudflare@0.6.0
  - @cloudhal/agent-runtime@0.6.0
  - @cloudhal/api@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Minor Changes

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
- 05274d3: Typed custom fields, step 5 (RFC-0041 §7 / ADR-0043): Studio.
  
  - **Entry editor › Fields:** collections with field definitions get a "Fields" card in the entry editor (loaded only for them), one control per type — text, rich text (the body editor), number, yes/no, date, date and time in its own zone, link, image (the media picker) and choice (one or several). Labels and help follow the Studio language, required fields say "Needed to publish", and the API's issues show on their field. On a translation, shared (non-localized) fields are read-only with the original's value and a link to it; empty per-language fields show the original's value as their placeholder. Values save with the entry.
  - **Collection settings › Fields:** a builder to add fields (the key follows the label until saved), reorder them and edit labels, help, limits and options, saved together. Renaming, changing a type or the languages of a saved field, and removing one open a dialog that runs the dry run first (entries changed, values moved, converted or cleared, per language, examples, a note about themes), needs confirmation — and an explicit opt-in to clear values that cannot be converted — then runs the operation to the end and offers Revert. A running operation shows its progress and can be continued. Only people who may change site settings edit fields; others see them read-only.
  - Activity and Approvals name the collection and field tools, field operations that convert or remove values ask for confirmation before approval, and every field error code reads as a sentence in the Studio language. New words live in a lazy `fields` namespace (drafts in every language, awaiting review).

### Patch Changes

- 0ba1e01: Studio (RFC-0040 §4): a collection's settings get a Comments section (saved in the site's comment settings), the site overview lists recent content across every collection, and entries open at `/sites/<id>/collections/<collection>/<entry>` — the old `/articles/<entry>` links redirect there. The command palette goes to each collection.
- Updated dependencies [672b993]
- Updated dependencies [9d04a37]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/mcp-server@0.5.0
  - @cloudhal/api@0.5.0
  - @cloudhal/agent-runtime@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0
  - @cloudhal/cloudflare@0.5.0

## 0.4.0

### Minor Changes

- 7f88a5a: Studio: first-class collections (RFC-0040 step 3).
  - **Sidebar:** lists every collection of the site, declared ones and those that agents or imports filled. Each shows its name in Studio's language, its icon and its entry count, followed by **Collections**.
  - **Collections screen:** shows each collection's address, entry count and whether it is named. It has a **New collection** dialog with plural and singular name, key, icon and address, and the API checks the address for overlaps.
  - **Collection list:** each collection gets the Articles list (`/collections/<key>`, where `/articles` now redirects). Category and tag columns and filters appear only where those taxonomies apply.
  - **Collection settings:** names in every site language, icon, RSS feed, sitemap, default order, and which categories and tags apply.
  - **Editor:** its breadcrumb leads back to the entry's own collection.
  - **Elsewhere:** the comments queue, the language review options and the taxonomy dialog cover every collection.
  - **Translations:** new strings in all 19 languages; every language except English is an AI draft awaiting review.

### Patch Changes

- f755ce6: `render_page` on Node: a Chrome that hangs or crashes on a cold start is launched once more with a fresh profile instead of failing the render.
- f9062ce: Studio loads about 32 kB (gzip) less before the first screen: the notification panel's items, the agent-mode and elevation views and the taxonomy helpers now load when they are needed.
- Updated dependencies [18a3960]
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/mcp-server@0.4.0
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/api@0.4.0
  - @cloudhal/cloudflare@0.4.0
  - @cloudhal/agent-runtime@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- 6a39c6d: Fix: sites whose theme was copied from the starter before 0.3.11 rendered empty pages (200 with no body). Their `EntryList` calls the renderer's old one-argument `entryPath(entry)` (and `.map(entryPath)`), which became `entryPath(site, entry)` in 0.3.11. `entryPath` accepts the old call again (deprecated; it ignores collection permalinks — pass the site to get them).
- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/api@0.3.13
  - @cloudhal/cloudflare@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/mcp-server@0.3.13
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/core-contracts@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- c2b3f2e: Studio links to the live site: a "View site" button in the top bar (also in the site switcher and the ⌘K palette), "Live at" and "Last published" on the overview, "View live" and "Copy link" on published pages and articles, and the full address under the slug and path fields ("Live at" when the live snapshot serves it, "Will be at" until then). After a site publish the toast offers "View site" and "Copy link", as do rollback and approval toasts. Marking a page or article published now says it goes live with the next site publish, with a "Publish site" action, instead of "Page published".
- bc096b2: Studio shows changes that are not live yet: a badge beside Publish with the count ("2 changes", or "Not published" before the first publish) and a tooltip by kind ("3 changes aren't live yet · 2 articles and 1 page"). It comes from the new `GET /api/sites/:siteId/pending` (`site:read`): counts of what a publish would add, change and remove, by kind; adding or removing a page counts once. Studio refreshes it after every write to the site, on window focus and every 30 s.
- Updated dependencies [84d1fc3]
- Updated dependencies [bc096b2]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/api@0.3.12
  - @cloudhal/cloudflare@0.3.12
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
- 2d0a257: Collection permalinks, step 2 (RFC-0038 §3–§4): changing a collection's permalink in a site update adds a prefix redirect from the old URL prefix to the new one, in every locale and in the same batch as the site update. A template may not overlap another collection, a taxonomy archive, a page or a reserved path (`path_conflict`/`reserved_path`), and pages and archives may not be created inside a configured prefix. The search index rewrites entry links on the next publish.
- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
- 1d7998a: Studio's images load faster and stop re-downloading. Preview URLs carry the file's hash (`?v=`), so the browser keeps them for a day; without it the content route answers `private, no-cache` and a 304 through the ETag, instead of `no-store`. While an image loads, its tile shows the image's own colour and small blurred preview (computed at upload) instead of a spinner.
- bb15690: Studio switches screens faster: the signed-in session is kept between navigations (asked again after five minutes, on sign-out, on revoking sessions and on any 401) instead of being checked with the server on every click, and the pending screen shows after 150 ms instead of the router's one second, so a short wait no longer looks frozen.
- Updated dependencies [25b002c]
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
- Updated dependencies [1d7998a]
  - @cloudhal/api@0.3.11
  - @cloudhal/cloudflare@0.3.11
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/mcp-server@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- 46f59d5: The site Worker's responses carry `Vary: Host`, and redirect-host 301s never enter the edge cache (#62). Workers Cache keys by path, not hostname, so before this every host routed to one site Worker shared a cache entry per path: a `--redirect` host's 301 could be served on the site's own domain (a redirect loop), and the sites of a multi-site Worker could serve each other's cached pages.
- c2cd92e: `cloudhal deploy` retries its post-deploy calls (push check, primary domain) for up to 90 seconds while they get 401: a Workers Builds deploy makes a new deployment token, and the edge can answer from the previous admin Worker version for a few seconds. Such a build used to fail after both Workers had deployed.
- @cloudhal/api@0.3.10
  - @cloudhal/cloudflare@0.3.10
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

- 348a00a: `cloudhal domain set <host> --redirect www.<host>`: hosts that answer with a 301 to the site's domain (path and query kept), routed to the site Worker as Custom Domains on the next deploy (#49). `cloudhal domain remove redirects` drops them.
- 304246e: `cloudhal domain set <host>` also makes the host the local site's primary domain, so canonical links, the sitemap and feeds use it before the first deploy (#48).
- 6f002de: `cloudhal snapshot --publish` makes no new snapshot when nothing changed since the live one; it says "nothing changed since <snapshot>" instead (#51).
- @cloudhal/api@0.3.9
  - @cloudhal/cloudflare@0.3.9
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

- f646b76: Blog starter: pages send their type pairing's font preloads as a `Link` header too, so a Cloudflare zone with Early Hints on starts loading the fonts with a 103 before the page arrives.
- da8fe6f: Blog starter: no more text jumping when the web fonts load. Font files move to `/fonts/v1/` and are cached for a year (`public/_headers`), so reloads draw text in its font from the first paint, and each web font gets a metric-matched fallback face (`font-fallbacks.css`), so a first visit swaps fonts without moving the text.
- da8fe6f: `render_page` and `cloudhal render` gain a `font-fallback` check: text set in a web font with no metric-matched fallback after it in its stack, which moves when the font loads.
- Updated dependencies [da8fe6f]
  - @cloudhal/mcp-server@0.3.8
  - @cloudhal/api@0.3.8
  - @cloudhal/cloudflare@0.3.8
  - @cloudhal/agent-runtime@0.3.8
  - @cloudhal/analytics@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-contracts@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- 0d6b49d: `cloudhal deploy` no longer fails with "Invalid URL" after deploying a site with a custom domain from a fresh checkout (Workers Builds): wrangler lists the domain as `example.com (custom domain)`, and the note is now dropped before the address is used.
- @cloudhal/agent-runtime@0.3.7
  - @cloudhal/analytics@0.3.7
  - @cloudhal/api@0.3.7
  - @cloudhal/cloudflare@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-contracts@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/mcp-server@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- 950fb3d: Studio has a favicon: the Cloudhal mark.
- @cloudhal/agent-runtime@0.3.6
  - @cloudhal/analytics@0.3.6
  - @cloudhal/api@0.3.6
  - @cloudhal/cloudflare@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-contracts@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/mcp-server@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- 0a6ac44: Cloudhal packages are now published from GitHub Actions with npm trusted publishing and provenance: each version on npm links to the commit and workflow run that built it, and `npm audit signatures` verifies it.
- @cloudhal/agent-runtime@0.3.5
  - @cloudhal/analytics@0.3.5
  - @cloudhal/api@0.3.5
  - @cloudhal/cloudflare@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-contracts@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/mcp-server@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- 94ca22c: New projects exempt `@cloudhal/*` and `create-cloudhal` from pnpm's `minimumReleaseAge` in their `pnpm-workspace.yaml`, so pnpm installs a Cloudhal release on the day it ships instead of refusing it for a day.
- Updated dependencies [d6427d5]
- Updated dependencies [aae143f]
  - @cloudhal/api@0.3.4
  - @cloudhal/mcp-server@0.3.4
  - @cloudhal/cloudflare@0.3.4
  - @cloudhal/agent-runtime@0.3.4
  - @cloudhal/analytics@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-contracts@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- 54a524c: A `CLOUDHAL_DEPLOY_TOKEN` shorter than 32 characters no longer makes every `/api` request fail with 500. Only `/api/admin` is disabled (503 `deploy_token_invalid`): the error is logged once, `/api/health` reports `problems: ["deploy_token_invalid"]`, and sign-in and Studio keep working. The Workers Builds setup steps and the Deploy button guide now say not to edit `CLOUDHAL_DEPLOY_TOKEN`, because every build replaces it.
- Updated dependencies [54a524c]
  - @cloudhal/api@0.3.3
  - @cloudhal/cloudflare@0.3.3
  - @cloudhal/agent-runtime@0.3.3
  - @cloudhal/analytics@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/mcp-server@0.3.3
  - @cloudhal/schedules@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- b2dfe81: The Deploy to Cloudflare button deploys the admin Worker under its own name. Workers Builds sets `WRANGLER_CI_OVERRIDE_NAME` to the Worker a build is connected to, and wrangler then deploys every config under that name, so the admin Worker overwrote the site Worker (the site's address served Studio). `cloudhal deploy` no longer passes `WRANGLER_CI_OVERRIDE_NAME` or `WRANGLER_CI_MATCH_TAG` to wrangler; it names each Worker itself.
- @cloudhal/agent-runtime@0.3.2
  - @cloudhal/analytics@0.3.2
  - @cloudhal/api@0.3.2
  - @cloudhal/cloudflare@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-contracts@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/mcp-server@0.3.2
  - @cloudhal/schedules@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- 4a46df0: The CLI ships a freshly built Studio: 0.3.0 shipped one built before Studio's playground mode, so a playground opened at the sign-in page. On a playground, Studio's site sidebar also leaves out Analytics, Activity, Approvals, Agents and Schedules, and a `403 playground` answer reads as a feature that is off (no retries, no error states). `FetcherBlobStore` with `keys` never fetches another key: a static-assets binding with SPA fallback answers 200 for missing files.
- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/agent-runtime@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/api@0.3.1
  - @cloudhal/cloudflare@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/mcp-server@0.3.1
  - @cloudhal/schedules@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- 346781b: Playground mode (RFC-0036): `createApi({ playground: { info } })` answers every request as the fixed `PLAYGROUND_PRINCIPAL` (an Editor with site settings and nothing installation-wide or upload-related), refuses blocked routes with `403 {error: "playground"}` through the pure `isBlockedInPlayground(method, path)` guard (also exported for the playground Worker), limits request bodies, and reports `features.playground` in `/api/instance`. Every declared route is either blocked or allowed, and a route on neither list is refused. Studio shows a session bar (time left, Reset, Deploy to Cloudflare) and leaves out team, agent and account screens on a playground.

### Patch Changes

- Updated dependencies [346781b]
- Updated dependencies [a28c22e]
- Updated dependencies [c70d3fa]
  - @cloudhal/api@0.3.0
  - @cloudhal/cloudflare@0.3.0
  - @cloudhal/storage@0.3.0
  - @cloudhal/mcp-server@0.3.0
  - @cloudhal/agent-runtime@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/schedules@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Minor Changes

- 6612f2c: `cloudhal deploy` runs in Cloudflare Workers Builds (`WORKERS_CI=1`), so a Deploy to Cloudflare button can set up a whole installation (docs/guides/deploy-button.md). Names come from the committed `wrangler.jsonc`, and a database id there is used without any D1 call. The starter site is seeded under `cloudhal.json`'s `siteId` when the checkout has none. Secrets stay on the Workers: only missing ones are generated, and the deployment token is new on every build. The setup link is never printed; the first build explains how the owner sets their own setup token. `seedStarterSite` takes an optional `siteId`.

### Patch Changes

- 01e3ccd: `cloudhal render` and the MCP `render_page` tool give a local Chrome 30 seconds to start instead of 10. A cold start on a busy machine or CI runner could exceed 10 seconds and fail with "Chrome did not start".
- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
- Updated dependencies [e4b1c83]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/mcp-server@0.2.0
  - @cloudhal/api@0.2.0
  - @cloudhal/cloudflare@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/agent-runtime@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @cloudhal/api@0.1.1
  - @cloudhal/cloudflare@0.1.1
  - @cloudhal/agent-runtime@0.1.1
  - @cloudhal/analytics@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/mcp-server@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
