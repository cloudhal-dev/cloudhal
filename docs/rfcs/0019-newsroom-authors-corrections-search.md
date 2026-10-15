# RFC-0019: Newsroom features — bylines, corrections and search
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-15
- Related:
  - RFC-0002 / ADR-0017 (taxonomies, archives, feeds, redirects: bylines reuse them);
  - RFC-0018 (theme kit: the article view that shows bylines and corrections);
  - RFC-0010 / ADR-0024 (snapshot bundles), ADR-0021 (analytics), RFC-0005 (roles and scopes);
  - `docs/design/starter-references.md` (the competitor survey behind this RFC).
- References (checked 2026-10-15):
  - Google Search Central, Article structured data (`author.url`, `datePublished`, `dateModified`): https://developers.google.com/search/docs/appearance/structured-data/article
  - Google Search Central, byline dates: https://developers.google.com/search/docs/appearance/publication-dates
  - Newspack corrections and clarifications: https://help.newspack.com/?p=15444
  - Ghost author and tag archives: https://docs.ghost.org/themes/structure
  - WordPress Co-Authors Plus (guest authors stored as a taxonomy): https://github.com/Automattic/Co-Authors-Plus
  - schema.org `CreativeWork.correction`: https://schema.org/correction
  - Cloudflare D1 compatible SQLite extensions (FTS5): https://developers.cloudflare.com/d1/sql-api/sql-statements/

## Summary
- **Bylines** are an `author` taxonomy. An author is a term with a bio, a portrait and profile links, and gets the archive, feed, sitemap entry, redirects and Studio screens that categories already have. The byline is separate from `ContentEntry.author`, which records who *wrote the data*, often an agent.
- **Corrections** are an append-only list on each entry. Each item is a correction, a clarification or an update with a short note and a time. It shows on the article and in its structured data, and it needs a person's approval when the entry is published.
- **Search** is a server-rendered `/search?q=` page on the Site Worker and `cloudhal dev`, answered from an SQLite FTS5 index of the published version. It has no client script.

## Motivation
- **News sites are judged on trust signals.** Every newsroom theme we surveyed shows bylines with author pages. Google asks for `author.url` and for visible dates that match the structured data. Cloudhal shows neither today. `entryHead` emits a `Person` only when the acting human has a name, and agents have none.
- **The actor is not the byline.** `ContentEntry.author` is the `Actor` that created the entry: a person, an agent or the system. An agent drafting a reporter's story must not become its byline, and a story may have two reporters.
- **Corrections are the newsroom's audit trail for readers.** Cloudhal already keeps every version as a snapshot, but nothing tells a reader "this article was corrected on …, here is what changed". Newspack ships this as a first-class feature, and no other theme in the survey does.
- **Readers cannot find old stories.** Every surveyed theme has search. Pagefind and similar tools need a client script and `wasm-unsafe-eval`, which the site CSP forbids (threat model, promise 4).
- **Why now.** The newsroom demo and the theme kit (RFC-0018) need these. They are also the first features a second theme would otherwise reinvent.

## Proposal

### 1. Bylines: the `author` taxonomy (D1)
`createDefaultTaxonomies` gains an optional third taxonomy, created by `cloudhal init`, by presets that ask for it (RFC-0018 §4), or in Studio:
```jsonc
{ "key": "author", "hierarchical": false, "allowNewTerms": "none", "required": false,
  "maxPerEntry": 5, "collections": ["posts"],
  "archive": { "basePath": "/author" }, "feed": true }
```
- **An author is a term.**
  - `labels[locale].name` holds the display name.
  - `labels[locale].description` is the bio, in markdown.
  - `image` is the portrait.
  - `slug` is the URL (`/author/ayse-yilmaz`). The archive, its pages, its feed, slug history and redirects and a 410 for a retired author all come from RFC-0002 unchanged.
- **Contract change (additive):** `TermLabel` gains `role?` (string, ≤ 120: "Senior reporter") and `Term` gains `links?` (≤ 10 `Link`s for profiles, rendered as `sameAs`). Both are optional and both apply to any taxonomy.
- **Order.** `entry.terms.author.ids` is the byline in order. `primary` is the lead author, used where only one name fits.
- **Rendering (renderer, additive):**
  - `entryTaxonomy` exposes `authors` (name, role, href, image).
  - `entryHead` emits `author` as one `Person` per byline, each with `name`, `url` (the archive) and `sameAs`. Without bylines it falls back to today's `ContentEntry.author` name.
  - `archiveHead` for an author archive emits `ProfilePage` with a `Person` `mainEntity`.
- **Agents.** Entries take bylines through the existing `terms` input of `create_entry` / `update_entry` (`author: { ids, primary }`). With `allowNewTerms: "none"`, an agent cannot invent a reporter (`propose_term` answers "ask instead"): people add authors in Studio.
- **Members are not authors.** A Studio member *may* be linked to an author term (`metadata["cloudhal.memberId"]`) so "my articles" can be filtered, but bylines never require an account. Guest writers and wire services are terms too.

### 2. Corrections (D2)
**Contract change (additive):** `ContentEntry` gains
```jsonc
"corrections": {
  "type": "array", "maxItems": 100,
  "items": {
    "type": "object", "additionalProperties": false,
    "required": ["id", "kind", "at", "note"],
    "properties": {
      "id":   { "$ref": "common.schema.json#/$defs/Id" },          // crx_…
      "kind": { "type": "string", "enum": ["correction", "clarification", "update"] },
      "at":   { "$ref": "common.schema.json#/$defs/Timestamp" },
      "note": { "type": "string", "minLength": 1, "maxLength": 2000 },  // markdown, inline profile
      "snapshotId": { "$ref": "common.schema.json#/$defs/Id" }     // the version it was published in
    }
  }
}
```
Invariants:
1. **Append-only once published.** After an entry's version with a correction is published, that item can no longer be removed or edited by an agent. A person with `site:publish` may edit its note, and the edit is audited. Removal is not offered, because a retracted correction is itself a correction.
2. **Time is the server's.** The store sets `at` on write. An agent cannot backdate a correction.
3. **`dateModified` follows.** The latest correction's `at` is the visible "Updated" date and `dateModified`. Ordinary edits that add no correction leave the visible date alone. `article:modified_time` keeps tracking `updatedAt`, as today.
4. **Publishing a version that adds a correction waits for a person** in every agent mode below `bypass`, like a publish (ADR-0015).

**Rendering.**
- Under the byline: "Updated <date> · Correction appended", linking to the list.
- At the end of the article: the list, newest first, with the kind as a label.
- Structured data: `correction` as `CorrectionComment` items (`text`, `datePublished`).
- The theme kit's article view (RFC-0018 §3) hands both to the theme.

**Tools.** `add_correction {entryId, kind, note}` (`content:write`) appends to the draft. The correction goes live with the next publish.

### 3. Search (D3)
- **Index.** `search_index`, an FTS5 virtual table in the project's SQLite and in D1 (migration `0021_search`), with columns `site_id`, `node_id`, `locale`, `title`, `summary`, `text` and the unindexed `href` and `published_at`. `text` is the body as plain text: block directives keep their text props, and code and URLs are dropped.
- **Built on publish.** `publish(site, snapshotId)` and `rollback` rewrite the site's rows from the snapshot being made live, in the same `batch()` as the pointer flip, guarded on its CAS (hard rule 4). The index therefore always matches what readers see: embargoed, expired and draft entries are never in it. Sites with more than 5,000 entries rebuild in chunks behind a `search_rev` marker, and the page says "index updating" until it matches.
- **The page.** `resolveRoute` answers `/search` (a reserved path) with `kind: "search"`, `q` (≤ 200 characters) and the page number. The query uses FTS5 `MATCH` with escaped terms, a `bm25` rank and `snippet()` for excerpts. Results are 20 per page. The page is `noindex` and is never edge-cached. The theme renders it with an ordinary `<form method="get">`.
- **Static builds** have no `/search`. The theme kit tells the theme `search: false` so it hides the form.
- **Limits.** 30 searches per minute per IP on the Site Worker (the comments limiter's pattern). Search queries are not recorded by analytics.

### 4. What this RFC does not do
- **Newsletter signup** needs subscribers, consent and unsubscribe links (ADR-0025 lists reader mail as a follow-up). It gets its own RFC.
- **Live blogs** (`LiveBlogPosting`) wait until Google's current guidance is checked and the newsroom asks for them.
- **Paywalls and memberships** are out of scope.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| A new `Author` node type | Explicit fields | New store, routes, feeds, redirects, Studio screens and tools that taxonomies already provide | Co-Authors Plus reached the same conclusion: authors as a taxonomy |
| Bylines from `ContentEntry.author` (the actor) | No change | Agents are actors; one actor per entry; members only | The actor and the byline are different facts |
| Bylines as Studio members | Single identity | Guest writers need accounts; leaks staff emails into public pages | Optional link instead (§1) |
| Corrections as free markdown in the body | No contract change | Not structured, not in JSON-LD, silently editable | Trust needs append-only data |
| Corrections derived from snapshot diffs | Automatic | Diffs show typo fixes and rewrites alike; no editorial note | The diff stays the evidence; the note says what mattered |
| Pagefind or Lunr in the browser | Works on static hosts | Client script and `wasm-unsafe-eval`; breaks the CSP promise | Threat model promise 4 |
| An external search service | Rich features | Another vendor and data leaving the deployment | Against "one deployment" |
| `LIKE` queries without an index | No migration | Slow, no ranking | FTS5 is available on both SQLite and D1 |

## Compatibility & migration
- **Contracts.** `TermLabel.role`, `Term.links` and `ContentEntry.corrections` are new optional fields. `schemaVersion` stays 1, and fixtures cover each (valid and invalid). Rust and TypeScript are regenerated with `pnpm gen`.
- **Storage.** Migration `0021_search` adds the FTS5 table. Existing published sites get their index on the next publish. `cloudhal search reindex` builds it immediately.
- **Existing sites.** Without an `author` taxonomy nothing changes, and `entryHead` keeps today's fallback. Adding the taxonomy is a Studio action and an MCP call.
- **Rollback.** All three parts are additive. Removing the author taxonomy retires its archives (410s, RFC-0002). Dropping the search table only loses the search page.

## Security & policy impact
- **Scopes.** No new scope. Author terms are added by people in Studio (`allowNewTerms: "none"`) and edited with the existing term tools. `add_correction` needs `content:write`, and publishing a version with a new correction waits for a person (§2.4).
- **Untrusted text.** Bios and correction notes are markdown through the safe renderer. Links are `Link`s with safe schemes only. Search snippets are escaped text with `<mark>` added after escaping.
- **Search abuse.** Per-IP rate limit; the query is length-capped; FTS5 syntax is escaped so users cannot run column filters or `NEAR` expressions that blow up cost.
- **Privacy.** Author terms are public by design. The optional member link is never rendered.

## Phases
| Phase | Scope |
|---|---|
| 19a | Author taxonomy, `role` / `links`, renderer `authors`, JSON-LD, author archive in the starter |
| 19b | Corrections: contract, store invariants, `add_correction`, rendering, Studio list in the entry editor |
| 19c | Search: migration, index on publish/rollback, `/search` route, starter form and results page |

## Open questions
1. **Default taxonomy.** Should `cloudhal init` create the `author` taxonomy for every new site, or only newsroom presets? Default: every new site, empty. An empty taxonomy shows nothing.
2. **Correction approval in `auto` mode.** Should a correction wait for a person even in `auto`, where ordinary publishes do not? Default: yes. Corrections are editorial statements.
3. **Search across locales.** Should results include all locales or only the page's own? Default: the page's own locale. A `?all=1` link offers the rest.
4. **Search in `cloudhal build`.** Should static builds get a prebuilt JSON index for a later opt-in client search? Default: no; static sites hide the form.
5. **Verify** that D1 FTS5 is available on Workers Free and that `wrangler d1 export` skipping virtual tables is acceptable. A backup restores data, and the index is rebuilt by `cloudhal search reindex`.
