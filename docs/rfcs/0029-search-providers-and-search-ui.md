# RFC-0029: Search providers and the search UI
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-18
- Related:
  - RFC-0019 §3 (site search: FTS5 index on publish, `/search`, limits). This RFC builds on it and keeps its invariants;
  - RFC-0025 (site chrome: header `actions`, overlays, the chrome module under `/_cloudhal/`);
  - RFC-0018 (theme kit), RFC-0005 (roles and scopes), ADR-0011 (MCP tools);
  - `docs/design/DESIGN.md` §1 "Top bar" (Studio command palette).
- References (checked 2026-10-18):
  - Cloudflare AI Search, Workers binding: https://developers.cloudflare.com/ai-search/api/search/workers-binding/
  - Cloudflare AI Search, metadata filtering (`$eq`, `$in`, `$gte`/`$lt` folder prefixes, five custom fields, 64-byte string limit): https://developers.cloudflare.com/ai-search/configuration/retrieval/filtering/
  - Cloudflare AI Search, multitenancy by folder: https://developers.cloudflare.com/ai-search/how-to/per-tenant-search/
  - Cloudflare AI Search, R2 data source: https://developers.cloudflare.com/ai-search/configuration/data-source/r2/
  - WAI-ARIA Authoring Practices, combobox pattern: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
  - Kumo `CommandPalette` (`pnpm kumo doc CommandPalette`): `Results`, `Group`, `ResultItem`, `getSelectableItems`, `onSelect(item, {newTab})`.

## Summary
- Site search gets a **provider interface** in `@cloudhal/core-ts`. Today's FTS5 index becomes the default `fts5` provider. A **Cloudflare AI Search** provider is added as an experimental option, and other services can arrive as capabilities. Every provider keeps RFC-0019's promise that readers only find what they can see.
- Readers get a **search modal**: a first-party, progressive-enhancement script that opens a dialog from the header, shows results as the reader types (grouped by kind, with highlighted snippets), and falls back to today's `/search` page without JavaScript.
- Studio's ⌘K palette becomes **Studio search**: commands plus the site's content (drafts included), grouped, from a new admin endpoint. Agents get the same search as an MCP tool.

## Motivation
- **Readers.** The starter offers a header form that loads a full page. Every surveyed theme, and every documentation site readers use daily, opens an overlay with instant results. Results cover articles only: pages, categories, tags and authors cannot be found.
- **Operators.** Search is hard-wired to FTS5 (`GraphSource.search` → `store.search`). Sites that want semantic search ("articles about rising prices" finding "inflation") or a generated answer have no way in. Cloudflare AI Search runs on the same platform and is the natural first option, but it indexes asynchronously and filters by metadata, so it cannot just replace the index.
- **Studio.** The palette searches only a fixed list of navigation labels. It cannot find an article, a page, a file or a tag, so people open the list screens and scroll. (Its selection was broken until the fix that ships with this RFC's first phase.)
- **Agents.** Cloudhal is agent-native, yet an agent cannot ask "which articles mention X?" without listing every entry.

## Proposal

### 1. The provider interface (`@cloudhal/core-ts` `./search`, Worker-safe)
```ts
export type SearchKind = "article" | "page" | "term" | "author";

export interface SearchRequest {
  siteId: string;
  query: string;               // ≤ SEARCH_QUERY_MAX, words only (ftsQuery rules)
  locale: string;
  kinds?: SearchKind[];        // default: all the deployment indexes
  page?: number;
  perPage?: number;            // ≤ 50
  now: number;                 // the reader's instant, for time gates
  snapshotId?: string;         // the live snapshot readers see
  mode?: "keyword" | "semantic" | "hybrid";
}

export interface SearchHit {   // RFC-0019's fields, plus optional ones
  nodeId: string;
  title: string;
  href: string;
  snippet: string;             // MARK_OPEN/MARK_CLOSE markers, unescaped
  publishedAt?: string;
  kind?: SearchKind;           // absent = "article" (RFC-0019 results)
  image?: string;              // media path of the hero or portrait
  context?: string;            // e.g. the category name, shown as a breadcrumb
  provider?: string;
}

export interface SearchProvider {
  readonly id: string;         // "fts5", "cloudflare-ai-search", …
  readonly capabilities: { semantic: boolean; suggest: boolean; answer: boolean };
  search(req: SearchRequest): Promise<SearchResults>;
  /** Up to 8 quick hits for the modal (titles only); default: search() with perPage 8. */
  suggest?(req: SearchRequest): Promise<SearchHit[]>;
  /** Called after a publish, rollback, release or import made `plan.snapshotId` live. */
  sync?(plan: SearchPlan): Promise<void>;
}
```
Invariants:
1. **Readers see only what is live.** A hit is returned only if its node is in the live snapshot and its time gates are open at `now`. A provider that cannot guarantee this at indexing time (see §3) must check each hit against the snapshot before returning it.
2. **FTS5 stays the source of truth for keyword search.** It is written in the publish `batch()` (RFC-0019) whatever provider is selected, so falling back always works.
3. **Fallback.** If a provider throws or takes longer than 1.5 s, the request is answered by `fts5` and the results carry `provider: "fts5"`. No error reaches the reader.
4. **Queries stay words.** Every provider receives the query after `ftsQuery`-style cleaning. Analytics never records queries (RFC-0019).

### 2. FTS5 provider and more kinds
- `searchIndex` and `searchRows` move behind `fts5Provider(sql)` and `memoryProvider(rows)`; their behaviour does not change.
- `searchRowOf` gains pages (title, description, section text), terms (name, description) and authors (name, role, bio). A new `kind` column is added to `search_index` (migration `00xx_search_kind`; existing rows read as `article`). The bm25 weights stay as they are; a `kind` filter is an `IN` on the column.

### 3. Cloudflare AI Search provider (experimental)
- **Indexing.** `sync(plan)` writes one Markdown object per live, searchable node to R2 under `sites/<siteId>/<locale>/<kind>/<nodeId>.md`, with front matter for the title and href, and custom metadata `node_id`, `kind`, `gate_from`, `gate_until` (datetime). That is four of the five custom fields. Removed nodes are deleted. AI Search picks the objects up on its own schedule.
- **Querying.** `search()` calls the instance binding with a folder-prefix filter for `sites/<siteId>/<locale>/` (`$gte` / `$lt`), the `kind` filter and gate filters. Then, by invariant 1, it drops hits whose node is not in the live snapshot.
- **Hybrid.** In `mode: "hybrid"` (the default when this provider is selected), FTS5 and AI Search run in parallel. Results are merged by reciprocal rank, so exact title matches stay on top and semantic matches fill the rest.
- **Answers** (`capabilities.answer`) are out of scope here. A generated answer is new text shown to readers, so it needs its own RFC: policy, budget, citations and a moderation story.
- **Configuration.** `cloudhal.json` `search.provider` plus the `AI_SEARCH` binding and `SEARCH_BUCKET` R2 binding in the Site Worker. Without the bindings the provider is not offered.

### 4. Other providers
Algolia, Typesense, Meilisearch and similar services send content outside the deployment, which RFC-0019 ruled out by default. They are possible as capabilities (`add-capability`) that implement `SearchProvider` and declare the egress in their manifest. Invariant 1 applies to them too.

### 5. Site endpoints
- `GET /search` stays exactly as RFC-0019 defines it. It is the no-JavaScript path and the "all results" page.
- **New:** `GET /search.json?q=&kinds=&page=&mode=` returns `SearchResults` with snippets already escaped and marked up (`snippetHtml`), so the script never builds HTML from raw text. It uses the same caching (`no-store`, `x-robots-tag: noindex`) and the same availability rule (`searchAvailable`).
- **Limits.** Typing produces bursts. The limiter becomes a token bucket per client: 60 tokens, refilled at 1 per second; a `suggest` call costs 1 and a full search costs 2. The modal debounces by 200 ms and cancels requests it no longer needs (`AbortController`). Over the limit the endpoint answers `429` with `Retry-After`, and the modal shows "Too many searches, try again in a moment" with a link to `/search`.

### 6. The reader's search modal (theme kit)
- **Markup without JavaScript.** The header search action renders a link to `/search` styled as a field ("Search… ⌘K"). Without the script it simply opens the page.
- **The script.** `search.1.js` is a versioned file under `/_cloudhal/` (CSP `script-src 'self'`, `connect-src 'self'`), loaded only by pages that show the search action. It turns the link into a button that opens a `<dialog>`. ⌘K / Ctrl+K and `/` also open it, except while typing in a field.
- **Accessibility.** The dialog follows the WAI-ARIA combobox pattern: an input with `role="combobox"` and `aria-controls` pointing at a `listbox`; ↑↓ with `aria-activedescendant`; Enter opens the active hit; Escape closes the dialog and focus returns to the trigger. A polite live region announces "N results". Motion follows the site's motion setting and `prefers-reduced-motion`.
- **Content.**
  - **Before typing:** the last five searches, stored only in this browser (`localStorage`, cleared by a "Clear" button) and never sent anywhere. The theme can add "popular pages" from a menu.
  - **While typing:** hits are grouped by kind (Articles, Pages, Topics, Authors). Each hit shows its title with the match marked, a one-line snippet, the context (category or date) and an optional thumbnail. The last row is always "See all results for '…'" → `/search?q=`.
  - **No results:** a hint ("Try fewer or other words") and the site's primary menu.
  - **The index is catching up** (`stale`): RFC-0019's notice.
- **Layout.** On narrow screens the dialog is a full-screen sheet with the input at the top. On wide screens it is centered, 640 px wide. Colors and radii come from the theme tokens (RFC-0023), so every theme gets it without extra CSS.
- **Chrome.** RFC-0025's `search` header action gets an optional `style: "field" | "icon"`. Both open the modal. The phone menu keeps today's form as the fallback.

### 7. Studio search
- **Endpoint.** `GET /api/sites/:siteId/search?q=&kinds=&limit=` (scope `content:read`) searches the site's **current drafts and live nodes**: entries, pages, terms, media (file name and alt text), menus and redirects. It returns up to `limit` (≤ 10) hits per kind, each with an id, label, kind, status, context and the Studio route. Drafts are not in the FTS5 index (that index mirrors only the live site), so this endpoint scans the site's nodes in memory with `foldName` and prefix rules, as `searchRows` does. Sites past 5,000 nodes get a second FTS5 table, `admin_search`, written with node writes; that is an open question (§ Open questions 2).
- **Palette.** `CommandMenu` uses Kumo's grouped layout: `Results` → `Group` + `GroupLabel` → `ResultItem`, with breadcrumbs and title highlights. The groups are Recent, Go to, Actions, Articles, Pages, Media, Topics and Sites. Commands match locally and instantly; content arrives from the endpoint after a 150 ms debounce, with `CommandPalette.Loading` while waiting.
  - ⌘/Ctrl+Enter opens a content hit in a new tab (`onSelect(item, {newTab})`).
  - The footer shows key hints, and the shortcut hint follows the platform.
- **Command registry.** `useRegisterCommands(commands)` lets a screen add its own commands while it is mounted (e.g. "Save article" in the editor). The 100-line list in `SiteShell` becomes `siteCommands(siteId, …)` in `lib/commands.ts`.
- **Safety.** Commands that change the live site (Publish, Request publish) never run straight from the palette. They open the same `ApprovalDialog` as the top bar.

### 8. MCP
`search_site {siteId, query, kinds?, drafts?: boolean, limit?}` (`content:read`) returns the Studio endpoint's results. With `drafts: false` it returns the reader's results through the provider instead. Agents then find content by meaning or words instead of listing everything.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Replace FTS5 with AI Search | One index; semantic by default | Asynchronous indexing breaks "only what is live"; exact title matches rank worse; needs bindings, so `cloudhal dev` and self-hosted deployments lose search | FTS5 stays the floor; AI Search is an addition |
| Pagefind or a prebuilt JSON index in the browser | Works for static builds; no server | Needs `wasm-unsafe-eval` (Pagefind) or ships the whole index to every reader; drafts and time gates must be resolved at build time | RFC-0019's reasoning still holds; a static-only opt-in can follow |
| Render the modal's results as HTML on the server (`/search?partial=1`) | No JSON contract; snippets already safe | Larger responses; harder for other themes to restyle; still needs a script | JSON with pre-escaped snippets gives themes control |
| Kumo `CommandPalette` on the public site | One component for both | Kumo is the admin design system; sites use the theme system and must stay React-free | The modal is a small vanilla script in the theme kit |
| Studio search on the client (load all entries) | No endpoint | Slow and heavy on large sites; no drafts of other kinds; duplicated per screen | One endpoint, reused by the palette and by MCP |

## Compatibility & migration
- **Contracts.** No JSON Schema changes: `SearchResults` and `SearchHit` are TypeScript types, and every new field is optional. `/search.json` and `/api/sites/:id/search` are new public interfaces, which this RFC defines.
- **Storage.** One migration adds `kind` to `search_index`. Existing rows read as `article`. The next publish, or `cloudhal search reindex`, adds pages, terms and authors.
- **Themes.** Themes that use the RFC-0019 helpers keep working. The modal is opt-in per theme through the kit; the blog starter turns it on.
- **Rollout.** 29a ships alone (bug fix). Each later phase is additive and can be reverted by removing its script, route or binding. With the AI Search bindings removed, the site falls back to FTS5 with no other change.

## Security & policy impact
- **Leaks.** Invariant 1 is enforced in the provider layer and tested per provider: drafts, embargoed, expired and archived nodes never appear in reader results. The Studio endpoint requires `content:read` on the site.
- **XSS.** The JSON carries snippets escaped on the server (`snippetHtml`); the script inserts only those and text nodes.
- **Abuse.** Token-bucket limit per client, query length and word caps, `AbortController` on the client. AI Search calls cost money, so they are counted in RFC-0008 budgets with a per-site daily cap, after which the site answers from FTS5.
- **Privacy.** Queries are not logged or sent to analytics. Recent searches live only in the reader's browser. AI Search receives published content only, which is already public.
- **New scopes.** None. `search_site` uses `content:read`.

## Phases
| Phase | Scope |
|---|---|
| 29a | Studio palette fix: Kumo `Results` + item `onClick` + `getSelectableItems`, Turkish-aware matching, clear on close, key hints, platform shortcut hint, tests |
| 29b | `SearchProvider`, `fts5` / memory providers, `kind` column, pages / terms / authors indexed |
| 29c | `/search.json`, token-bucket limiter, the theme-kit modal (`search.1.js`), header action `style`, starter |
| 29d | Studio search endpoint, grouped palette, command registry, publish through `ApprovalDialog`, `search_site` MCP tool |
| 29e | Cloudflare AI Search provider (experimental): R2 sync, filtered retrieval, hybrid ranking, budgets |

### Status
- **29a shipped.** The palette runs commands on click, Enter and ↑↓ + Enter. Matching is Turkish-aware (`foldName`), the query clears on close, a footer shows the key hints, and the shortcut hint follows the platform.
- **29b shipped.**
  - **Storage.** Migration `0022_search_kinds` rebuilds `search_index` with `kind` and `context`, adds `search_links` (each indexed article's terms with its locale and gates), and clears `search_state`. FTS5 tables cannot gain columns, so existing indexes are written again on the next publish, release, import or `cloudhal search reindex`. This is the one place the "existing rows read as `article`" plan of §2 could not be kept.
  - **Core** (`search-common.ts`, `search-rows.ts`, `search-memory.ts`, `search-provider.ts`, `store/search.ts`):
    - `SearchProvider`, `fts5Provider`, `memoryProvider` and `withFallback` (1.5 s).
    - `SiteGraphStoreOptions.search` sets the store's provider, which is wrapped in a fallback to FTS5 and told about every index update through `sync`.
    - `planSearch` rewrites changed articles, pages and terms, and every archive row when a taxonomy or the site changed.
    - Term and author hits need a `search_links` row in the reader's locale with open gates.
  - **Renderer and starter.**
    - `LiveSource.search` uses `searchDocuments`, so `cloudhal dev` finds pages and terms too.
    - `SourceSearchOptions.kinds` narrows the results.
    - The results page shows a hit's `context`.
- **29c shipped.**
  - **Endpoint.** `GET /search.json?q=&kinds=&page=` (`searchJsonResponse` in `@cloudhal/astro-renderer/search`; the starter's `src/pages/search.json.ts`):
    - 8 hits per request, as `SearchJson`, with snippets escaped and marked on the server and no node ids.
    - Headers: `no-store` and `noindex`.
    - A static build gets an empty `404`, so no file is written.
  - **Limit.** `SearchLimiter` is a token bucket per client and isolate:
    - 60 tokens, refilled at 1 a second; `/search` costs 2, `/search.json` costs 1.
    - That allows a burst of 30 result pages, as before, or 60 modal requests.
    - The endpoint's `429` is JSON.
  - **Module.** `/_cloudhal/search.1.js` (`@cloudhal/astro-renderer/search-client`, under 3 KB gzipped). It is served by `cloudhal dev` and written by Site Worker builds. It wires markup the theme renders:
    - The header field (`[data-ch-search-open]`), ⌘K / Ctrl+K and `/` open the dialog.
    - Queries are debounced (200 ms) and the request a newer query replaces is cancelled.
    - Hits are grouped by kind in a WAI-ARIA combobox and listbox, with an "all results" option.
    - The last five searches stay in `localStorage`, with a button that clears them.
    - It says when the reader must wait (`429`) and when search is unavailable.
    - Escape closes the dialog even inside a search field, and focus returns to the header field without opening the dialog again.
  - **Starter.**
    - `SearchDialog.astro` renders the dialog's markup and words (en/tr, `searchModal` in `theme.ts`).
    - `features/search-dialog.css`: centered on wide screens, a full-height sheet on phones, entrance at the site's motion level.
    - `Base.astro` renders the dialog and loads the module where the deployment answers searches.
- **29d shipped.**
  - **Core.** `searchSiteNodes` (`site-search.ts`) searches articles, pages, terms, media, menu items and redirects, drafts included.
    - It matches words with `foldName` (every word a prefix of a word, title first).
    - A dispatch table holds one reader per kind; media goes through the library's own query.
    - It returns up to 5 hits per kind (at most 10).
  - **API.** `GET /api/sites/:siteId/search?q=&kinds=&limit=` needs `content:read`. Media, menus and redirects appear only for people who hold `site:read`.
    - `createApi` mounts the site areas from a table (`SITE_AREAS`).
  - **Studio.**
    - The palette groups commands and content (DESIGN.md §1 "Top bar") and opens a hit's editor, ⌘/Ctrl in a new tab.
    - `useSitePalette` holds the site's commands; they left `SiteShell`, whose function went from 385 to 255 lines.
    - Publish opens the top bar's `ApprovalDialog` (`SitePublish` takes `open`/`onOpenChange`).
    - The new words are in English; Turkish and German are AI drafts through `pnpm i18n:import`.
  - **MCP.** `search_site {siteId, query, kinds?, published?, limit?}` (`content:read`, read-only):
    - by default the editing view, as Studio's palette;
    - with `published`, what readers find, through the store's provider.
    - The server instructions mention it.
- **29e shipped (experimental).** Operator guide: [docs/guides/search.md](../guides/search.md).
  - **Provider** (`@cloudhal/core-ts` `search-ai.ts`):
    - **Sync.** `cloudflareAiSearchProvider` mirrors each `SearchPlan` into the R2 data source as `sites/<siteId>/<nodeId>/<locale>.md`, with the custom metadata `locale` and `kind`. A full plan clears the site's folder; a kind or node removal deletes its objects.
    - **Search.** One instance call per search (`ai_search_options.retrieval.filters`: the folder range of §3, `locale`, `kind $in`, 50 chunks), keeping the best chunk per node.
    - **Live check.** The nodes then pass `liveHits` against the FTS5 index (invariant 1); titles and links come from the index, and the snippet is the chunk with the query words marked.
  - **Hybrid.** `hybridProvider` merges FTS5 and the semantic side by reciprocal rank (k = 60). FTS5 pages alone past 50 hits, when the semantic side fails, and past the budget.
  - **Quota.** Migration `0024_search_quota` (replacing `0023_search_usage`) keeps one row per UTC month for the deployment; `takeSearchCall` counts and checks atomically (`ON CONFLICT … RETURNING`). The limit is `CLOUDHAL_SEARCH_MONTHLY_LIMIT`, default 1,000: the semantic queries Cloudflare includes per account and month, so Workers Free and the $5 Workers Paid plan pay nothing (billing starts 2026-11-01). Large sites raise `monthlyLimit`.
  - **Wiring.** `searchProviderFromEnv` builds the provider when `CLOUDHAL_SEARCH_PROVIDER=cloudflare-ai-search` and both `AI_SEARCH` and `SEARCH_BUCKET` are bound. It is set on the store of the site Worker, the admin Worker and the scheduler's ticks.
  - **Deploy.**
    - `cloudhal.json` `search {provider, instance, bucket?, monthlyLimit?}` binds both Workers (`ai_search`, a second R2 bucket, the vars).
    - `cloudhal deploy` creates the bucket. The instance, with its data source and the two metadata fields, is made by hand (wrangler needs it to exist).
- **Deviations (29e).**
  - It is not checked against a live AI Search instance in this repository. The tests use a fake instance that applies the documented filters, and the wrangler config key comes from wrangler 4.148's schema.
  - The quota is per deployment and month, not part of the RFC-0008 automation budgets. Deployments sharing a Cloudflare account must split the allowance by hand.
  - The semantic side reads the FTS5 index with a scan of the site's rows (`liveHits` has no `MATCH`), fine for one site per deployment.
  - A full sync writes one object per node in the publishing request. On Workers Free a large first rebuild can pass the subrequest limit (guide: rebuild on Paid, or let publishes fill it).
- **Deviations.**
  - The command registry (`useRegisterCommands`, §7) is not built yet. No screen needs its own commands so far, and the site's commands are a table in one module now.
  - Menu items are found by their own labels; a page item without a label is found as its page.
  - The header action's `style` (§6) is not added: it is a contract change, and the existing field opens the modal. The phone menu keeps its plain form.
  - The modal searches the site's default locale, like `/search` (open question 1).
  - Article hits carry no `context` yet: a category name would go stale when the term is renamed and the article is not.
  - `image` is not indexed yet.
  - Pages with `seo.noindex` are left out of search.

## Open questions
1. **Locales in the modal.** Only the page's locale, like `/search`, or the other locales in their own group? Default: the page's locale only.
2. **Studio search at scale.** At what size does the in-memory scan need the `admin_search` FTS5 table? Default: measure in 29d on a 5,000-entry fixture; add the table only if p95 exceeds 150 ms.
3. **AI Search consistency window.** How long after publish does AI Search reflect a change? Invariant 1 hides removed content immediately, but new content may be missing from semantic results for a while. Is a "semantic results catching up" note needed, or is FTS5 in hybrid mode enough?
4. **Static builds.** Should `cloudhal build` emit a small JSON index for a client-only modal (titles and summaries only)? Default: no, as RFC-0019 open question 4.
