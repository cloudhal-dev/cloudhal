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

## Open questions
1. **Locales in the modal.** Only the page's locale, like `/search`, or the other locales in their own group? Default: the page's locale only.
2. **Studio search at scale.** At what size does the in-memory scan need the `admin_search` FTS5 table? Default: measure in 29d on a 5,000-entry fixture; add the table only if p95 exceeds 150 ms.
3. **AI Search consistency window.** How long after publish does AI Search reflect a change? Invariant 1 hides removed content immediately, but new content may be missing from semantic results for a while. Is a "semantic results catching up" note needed, or is FTS5 in hybrid mode enough?
4. **Static builds.** Should `cloudhal build` emit a small JSON index for a client-only modal (titles and summaries only)? Default: no, as RFC-0019 open question 4.
