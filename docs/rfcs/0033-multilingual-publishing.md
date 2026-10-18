# RFC-0033: Multilingual publishing, language editions and publications

- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-18
- Related:
  - [Research report](../reports/2026-10-multilingual-publishing-research.md): evidence and sources for every claim here.
  - RFC-0001: `Site.locales`, `Page.locale`, `(site, locale, path)` uniqueness.
  - RFC-0002: per-locale term labels; per-locale slugs deferred "until locale routing exists".
  - RFC-0003: one menu tree; per-locale trees deferred.
  - RFC-0004: per-locale asset text; DOI deposit deferred.
  - RFC-0008: per-locale releases deferred "until a locale model".
  - RFC-0018: one theme per deployment; per-site themes deferred.
  - RFC-0019 / RFC-0029: search.
  - RFC-0020: agentic build.
  - ADR-0033 / ADR-0034: Studio RTL and translation workflow. Those cover Studio's own UI; this RFC covers published content.

## Summary

- **One-language sites stay the default and cost nothing.** A site may publish in several languages, and a project may run several publications (sites), each with its own theme, domain, languages and editorial policy.
- **Pages and articles get one node per language, linked by a translation group that records the source revision.** Structural data keeps the per-locale label maps it already has. Each translation therefore has its own status, review, lock and history, and becomes "stale" when its source changes.
- **The locale goes in the URL**, and the renderer generates the language signals from the graph: `hreflang`, `lang`/`dir`, per-locale sitemaps, feeds, search and `llms.txt`. Agents draft translations through a glossary-, check- and quality-gated pipeline. People decide what ships, and unreviewed machine translation is labelled to readers.

## Motivation

- **The model is half there and nothing is served.** Pages, entries, terms, menus and assets already carry a locale or per-locale labels. But the renderer, sitemap, RSS, redirects and search all hard-code `site.defaultLocale`, and nothing links a page to its translation. Three accepted RFCs (0002, 0003, 0008) deferred their locale work to "a locale model" that does not exist yet. This RFC is that model.
- **The decision cannot be postponed.** Every new feature either bakes in "one language" or assumes a shape for translations: the docs starter, the scholarly features (DOI, citations), per-site themes and the agentic build (RFC-0020). Retrofitting is what hurt WordPress (no core model after eight years), Ghost (one locale per install since 2017) and every CMS that published all languages together.
- **The agent era changes the economics, not the editorial rules.** An agent can draft 16 languages in minutes, so translation is no longer the bottleneck. Review, provenance and accountability are.
  - Google accepts reviewed or useful AI translation and penalises scaled, valueless output.
  - EU AI Act Art. 50(4), in force since 2026-08-02, requires disclosure of AI text published on matters of public interest unless a person holds editorial responsibility after review.
  - Scholarly norms (COPE, Crossref, arXiv) require AI disclosure and separate identifiers for translations.

  The platform must make the safe path the easy one.
- **Pages, news, docs and papers need different things from one model.**

  | Content | What it needs |
  |---|---|
  | Pages | mirrors |
  | News | editions that diverge: their own home page, selection and timing (BBC, DW, Le Monde in English, Arc XP) |
  | Docs | staleness tracking and fallback with a notice (MDN, Starlight) |
  | Scholarly articles | a DOI per language version with `isTranslationOf`, multilingual metadata, and labelled machine translation (Crossref, JATS, SciELO) |

## Proposal

### 1. The decision in one table

| Question | Decision |
|---|---|
| Single-language only? | **No.** One language is the default (`locales: [x]`), with no prefixes and no extra UI. Adding a second language is a setting, not a migration. |
| Model | **Hybrid.** Documents (Page, ContentEntry: articles, docs pages, papers) are **one node per locale in a translation group**. Structural nodes (Taxonomy, Term, Menu, Asset, Site chrome) keep **per-locale field maps**. |
| Publish | **Per translation**, through each node's existing `status`. A site-wide snapshot still captures them all; per-locale rollback comes later (§9). |
| Fallback | **Off by default:** a missing translation is a 404 and is absent from the switcher, sitemap and `hreflang`. Optional per site: serve the default-language page with a notice, `noindex`. |
| URLs | **Locale in the path.** Default `prefix-except-default` (today's URLs keep working); `prefix-all` with an `x-default` chooser at `/`; or a domain per locale. Never cookie- or `Accept-Language`-only. |
| Several publications | **A Site is a publication** (domain, theme, languages, policy). A **Project** holds many. One deployment serves many sites by hostname (§7). |
| Language editions (news) | Separate sites in one project, with translation groups that **may cross sites**. Each edition has its own home page, sections and selection, and `hreflang` spans domains. |
| Themes | **One theme per site**, several per deployment (RFC-0018 follow-up). No theme per locale: direction, fonts and words come from the locale (`dir`, theme `STRINGS`, logical CSS). |
| Who translates | Agents draft, gated by glossary, deterministic checks and a quality score. **People review.** News and scholarly content always need review. |
| Labelling | Unreviewed machine translation is **labelled to readers** and recorded in JSON-LD and provenance. Review removes the visible label; the provenance record stays. |

### 2. Contracts

All new fields are optional (AGENTS.md rule 3). `schemaVersion` stays `[1]`.

**`common.schema.json#/$defs`**: the translation link and its provenance.

```jsonc
"TranslationMethod": {
  "type": "string",
  "description": "How this node's text came to be. 'original' marks the source of a group.",
  "enum": ["original", "human", "machine", "machine-reviewed"]
},
"Translation": {
  "type": "object",
  "description": "Links a page or entry to the other language versions of the same work (RFC-0033).",
  "additionalProperties": false,
  "required": ["group", "method"],
  "properties": {
    "group": { "$ref": "#/$defs/Id", "description": "The group's id: the original node's id. Shared by every translation; may cross sites in one project." },
    "method": { "$ref": "#/$defs/TranslationMethod" },
    "layout": { "type": "string", "description": "linked: the original's structural changes propagate as drafts (§4a); independent: nothing propagates. Absent means linked.", "enum": ["linked", "independent"] },
    "source": {
      "type": "object",
      "description": "The node and revision this translation was made from. Absent on the original.",
      "additionalProperties": false,
      "required": ["id", "locale", "rev", "hash"],
      "properties": {
        "id": { "$ref": "#/$defs/Id" },
        "siteId": { "$ref": "#/$defs/Id" },
        "locale": { "$ref": "#/$defs/Locale" },
        "rev": { "$ref": "#/$defs/Revision" },
        "hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
      }
    },
    "provenance": {
      "type": "object",
      "description": "Machine-translation record (engine, glossary, checks, score). Required by the store when method is machine or machine-reviewed.",
      "additionalProperties": false,
      "required": ["engine", "at"],
      "properties": {
        "engine": { "type": "string", "maxLength": 200 },
        "glossaryRev": { "$ref": "#/$defs/Revision" },
        "score": { "type": "number", "minimum": 0, "maximum": 100 },
        "checks": { "type": "array", "items": { "type": "string", "maxLength": 100 }, "maxItems": 50 },
        "at": { "$ref": "#/$defs/Timestamp" }
      }
    },
    "review": {
      "type": "object",
      "additionalProperties": false,
      "required": ["by", "at"],
      "properties": { "by": { "$ref": "#/$defs/Actor" }, "at": { "$ref": "#/$defs/Timestamp" } }
    }
  }
}
```

**`page.schema.json`, `content-entry.schema.json`**: `"translation": { "$ref": "common.schema.json#/$defs/Translation" }`.

**`site.schema.json`**: a `localization` object.

```jsonc
"localization": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "routing": { "type": "string", "enum": ["prefix-except-default", "prefix-all"] },
    "domains": {
      "type": "object",
      "description": "Optional hostname per locale; the locale is then served at that host's root.",
      "propertyNames": { "$ref": "common.schema.json#/$defs/Locale" },
      "additionalProperties": { "$ref": "#/$defs/Domain/properties/hostname" }
    },
    "fallback": { "type": "string", "enum": ["none", "default-with-notice"] },
    "review": {
      "type": "object",
      "description": "Collections ('pages' for pages) whose machine translations need a person's review before they publish. News and scholarly collections are added by their starters.",
      "additionalProperties": false,
      "properties": { "required": { "type": "array", "items": { "type": "string", "maxLength": 100 }, "uniqueItems": true } }
    },
    "label": {
      "type": "string",
      "description": "When readers see a machine-translation notice. 'unreviewed' (the default) shows it until a person reviews; 'always' keeps it after review.",
      "enum": ["unreviewed", "always"]
    }
  }
}
```

Absent values mean `prefix-except-default`, `none`, no required review, and `unreviewed`. The `$ref` into `Domain/properties/hostname` may break the schema-subset rule. If it does, copy the hostname pattern into a new `common.schema.json#/$defs/Hostname`.

**Term labels** gain an optional `slug` per locale (RFC-0002's deferral). The redirect key becomes `(site, locale, from)`: `from` keeps its shape, plus an optional `locale` that defaults to the site default.

A new root type **`glossary.schema.json`** holds one per site. Its entries are `{ term, locales: { [locale]: { text, note? } }, doNotTranslate? }`, with `rev`. Agents and the translation checks read it.

### 3. Invariants

1. A page's or entry's `locale` is one of `site.locales`. The store checks this on every write; today only menus are checked.
2. A translation group has at most one node per (site, locale) and exactly one `method: "original"`. The group id is the original's id. Deleting the original promotes no one: the group keeps the id, and the remaining nodes point at a source that no longer exists.
3. Writes inside a group are per node (each translation is its own CAS on `rev`). Creating a translation is one `batch()`: insert the node, guarded on the source's current `hash` (rule 4). There is no group-level row, so there is no group-level contention.
4. **Stale** means `translation.source.hash` differs from the source's current hash. It is computed, never stored. A stale published translation stays published, and Studio and agents are told about it.
5. `method: "machine"` with a collection in `localization.review.required` cannot move to `published` without a `review`. Setting `review` turns `machine` into `machine-reviewed`, and only a human actor may set it.
6. `provenance` is required whenever `method` is `machine` or `machine-reviewed`, and is never deleted by later edits.
7. The renderer emits `hreflang` only for published members of a group. Every set is reciprocal and self-referencing, includes `x-default`, and every member is self-canonical.

### 4. Rendering and SEO (renderer and theme kit)

- **Routing.**
  - `resolvePath` takes the locale from the path prefix or the host (`localization.domains`), then calls the `GraphSource` with it; it already accepts `locale`.
  - `routablePaths`, archives, redirects and the 410/time-gate logic become per locale.
  - Hrefs from search, menus and related lists carry the locale.
  - A menu item pointing at a page resolves to that page's translation in the current locale when one exists (RFC-0003's deferral).
- **Head.**
  - `<html lang dir>` comes from a small CLDR direction table (Worker-safe data, no `Intl.Locale#getTextInfo` dependency).
  - The `Content-Language` header is set.
  - `<link rel=alternate hreflang>` for each published group member, plus `x-default`.
  - `og:locale` and `og:locale:alternate`.
  - JSON-LD: `inLanguage`, `translationOfWork`/`workTranslation`. `translator` is the reviewer, or a `SoftwareApplication` for unreviewed machine output.
- **Feeds and discovery.**
  - A sitemap per locale with `xhtml:link` alternates, and a sitemap index.
  - An RSS feed per locale.
  - `llms.txt` per locale root.
  - The markdown form of each page per locale (`Accept: text/markdown`, per Cloudflare's convention).
- **Language switcher.**
  - The schema's existing `locale` header/footer control lists the published group members of the current page.
  - With no translation, it links to that locale's home page.
  - It never redirects by `Accept-Language` or IP. A remembered choice (cookie) may show a "Read in …" banner only.
- **Machine-translation notice.** A theme-kit component every theme gets. It shows the notice wording, links to the original, and offers "reviewed by …" when reviewed. The wording lives in the theme `STRINGS` for each locale.
- **Fallback with notice** (opt-in). The default-language page is served at the requested locale's URL with a notice and `noindex`, and is not listed in `hreflang` or the sitemap (Starlight's model).
- **Caching.** The locale is in the URL or host, so each locale has its own cache key and there is no `Vary: Accept-Language`. Publish purges the cache tags of every group member whose `hreflang` set changed.

### 4a. Landing pages, themes and generated pages across languages

A landing page in three languages is **three page nodes in one group**: the original and two translations. Each has its own path, status and review. People and agents do not build it three times.

- **The layout is linked by default.** Sections keep the same `id` in every translation, because `translate` copies the original's sections and surface tree and changes only text.
  - Translated: text props, `alt`, SEO, link labels.
  - Shared: images, icons, bindings, styles, motion.
  - A translation stores `translation.layout`, which is `"linked"` (default) or `"independent"`. *(Add to `Translation` in §2 as an optional enum.)*
- **Linked layout propagates structure, never text.** When the original changes structurally, the store computes the JSON Patch between `source.rev` and now with RFC-0020's `patchPage`. Structural changes are an added, removed or reordered section, a changed image, style or binding, or a new surface node.
  - The patch is applied to each linked translation as a **draft**.
  - New text arrives in the source language, marked `untranslated` in the check list, and `translate` fills only those strings.
  - Text already translated or edited by a person is never touched (invariant: a person's edit wins).
  - Webflow's model is "inherit until overridden" for layout. This gets the same result with no field-level storage.
- **Independent layout is for pages that diverge by market or edition:** a different hero, other sections, a local offer. Nothing propagates. The page stays in the group for `hreflang` and the switcher, and the staleness signal still tells editors the original changed.
- **The theme's own words never live in pages.** "Read more", "Search", dates, "min read" and the machine-translation notice come from the theme's `STRINGS` per locale (`starters/blog/src/theme.ts`).
  - A theme ships at least English. It declares its locales in the manifest (RFC-0018).
  - For a site locale the theme lacks, the agent drafts the missing strings into a site-level override map (a `strings` map in `Site.theme.config`), reviewed like any translation.
  - `theme:check` fails a theme whose templates contain hard-coded words. This is the same rule Studio follows (AGENTS.md rule 10).
- **Data blocks follow the page's locale automatically.** A "latest articles" list, archives, tags and menus read with the page's locale, so a Spanish landing page lists Spanish articles. Missing items fall back only if the site's `fallback` allows it.
- **Theme presets and the generator (RFC-0017/0018/0020)** write pages in the site's default locale. Then, for every other locale, `translate` creates linked translations in the same build turn. A build in four languages is therefore one plan, one set of sections and four reviewable drafts. Asking the Build chat to build "the Spanish version" edits the Spanish node only: its layout becomes `independent` after the user confirms.
- **Direction and type are per locale, not per page.** `dir`, logical CSS (ADR-0033) and per-script font stacks in the theme's tokens make one layout serve LTR and RTL. A theme that cannot render RTL declares it, and Studio warns before an RTL locale is added.

### 5. Search

- Search rows already carry `locale`; queries keep filtering by it, and hrefs gain the prefix.
- Chinese, Japanese and Korean (and Thai) get a second FTS5 table with the `trigram` tokenizer, chosen by locale, because `unicode61` cannot split words without spaces.
- Search providers (RFC-0029) receive the locale. AI Search indexes stay per site and are filtered by a locale facet.

### 6. The agent pipeline (MCP and policy)

This is the core of the agent-era answer. The agent does the translating; the platform enforces the rules.

- **Tools.**
  - `translate`: `{ nodeId, locales[], mode: "draft" }`. It creates a translation node, or updates a stale one, as a **draft**, with `source` and `provenance`. It never overwrites a node whose last change came from a human after its `source.rev` (Strapi's failure). In that case it writes the update as a suggested draft for review instead.
  - `list_translations` returns a group's coverage: locale × status × stale × method.
  - `link_translation` / `unlink_translation` attach existing nodes, for example for editions written independently.
  - `get_glossary` / `propose_glossary_entry`.
  - `review_translation` is for people only (Studio). Agents cannot call it.
- **Pipeline**, run by `translate`:
  1. Glossary and do-not-translate list as hard constraints.
  2. An LLM with the site's DESIGN.md voice notes and the theme's locale notes.
  3. **Deterministic checks**: links, numbers, dates and units, glossary terms, placeholders and surface bindings, length, script and direction, structured-data fields, and the body-block profile.
  4. A **quality score** (an LLM MQM-style judge to begin with; a provider can plug in COMET-family scoring). The score routes; it never proves quality.

  The result and the checks land in `provenance`. A failed check keeps the draft out of review until it is fixed.
- **Staleness.** An edit to an original that changes its hash marks every translation stale. Studio and the agent inbox list them. An automation (RFC-0008) may re-run `translate` in draft mode with its budgets. A news correction (RFC-0019) on an original is flagged on every translation until it is carried over.
- **Policy.**
  - A new scope, `content:translate`, covers draft translations.
  - Publishing still needs `content:publish`.
  - API keys and principals gain an optional `locales[]` limit, checked like the `:own` variants. A Japanese-desk key can then only write `ja` nodes.
  - Automation budgets gain an optional per-locale word cap.
  - Publishing a machine translation of a review-required collection is an approval point.
- **News and scholarly defaults.**
  - The newsroom and scholarly starters put their collections in `localization.review.required`.
  - News headlines and dek are flagged for transcreation: the reviewer sees source and draft side by side, with the headline unlocked.
  - The AI Act Art. 50(4) disclosure applies exactly when the platform shows the label: unreviewed machine text. Review with editorial responsibility is the documented exemption.

### 7. Several publications and themes

- **Site = publication.** It owns:
  - its domains and per-locale domains;
  - its theme (`Site.theme`) and design (RFC-0021);
  - its `locales` and `localization`;
  - its editorial and AI policy;
  - its analytics and search (already per site).
- **Project = the container.** It holds many publications under one Studio, one account set and one D1. Roles stay per site, as today.
- **One deployment, many sites.** Today each site Worker serves one `siteId`. The target is one site Worker that maps hostname → `siteId` (a KV/D1 lookup, Cloudflare for SaaS custom hostnames) and renders with that site's theme. Themes are packages with data-only manifests (RFC-0018), so this needs no per-tenant code. A per-site Worker (Workers for Platforms) stays the option for custom code.
- **Language editions** are sites in one project with their own home pages and sections. Their articles join cross-site translation groups (`source.siteId`), so `hreflang` spans domains (Google allows cross-domain sets).
- **Mirror or edition is a choice per project, not a platform limit:**
  - a company site: one site, many locales;
  - a newsroom with an English edition: two sites, shared groups;
  - a journal portal: one site per journal, each with its own theme, languages and later DOI prefix (OJS's model).

### 8. Studio

- **A Translations card in the page and article editors** shows:
  - the coverage matrix for the group;
  - stale badges with "what changed" (a diff of the source between `source.rev` and now);
  - Translate (agent, draft);
  - Review (side by side, accept);
  - provenance.
- **A site-level Languages screen** holds the locales, routing, domains, fallback, review collections, label and glossary.
- **A coverage view** lists every group × locale, filterable by stale, unreviewed or missing. It is the translation work queue.
- **The editor's locale switch** moves between group members. "New translation" creates a linked node.

All of it follows DESIGN.md, Kumo and the Studio i18n rules already in place.

### 9. Later RFCs that build on this one

Each is named so it is not done inside this RFC.

- **Scholarly publishing:**
  - a DOI per language version with Crossref/DataCite `isTranslationOf`/`hasTranslation` deposit (RFC-0004's deferral);
  - multilingual title, abstract and keyword fields;
  - JATS export (`trans-title-group`, `abstract xml:lang`, `sub-article`);
  - `citation_*` Highwire meta per language URL;
  - the ScholarlyArticle JSON-LD.
- **Docs:**
  - a docs starter with a `sidebar` menu;
  - **versions × locales as one matrix** (Hugo `sites.matrix` is the reference);
  - fallback with notice on by default.
- **Per-locale releases and rollback:** composed releases per locale (RFC-0008's deferral) and rollback of one locale.
- **Multi-site serving:** the hostname-dispatch Worker and per-site themes (RFC-0018's deferral).

## Implementation phases

Each phase is its own PR or PRs, run sequentially. Tests run one package at a time.

| Phase | Scope | Done when |
|---|---|---|
| A. Contracts and store | `Translation`, `Site.localization`, term slug per locale, redirect locale, glossary root; `pnpm gen`; store checks (invariants 1–6); group queries; stale computation; fixtures | the conformance suites pass on sqlite and D1 |
| B. Renderer and SEO | routing, switcher, linked-layout propagation (§4a), theme `STRINGS` overrides, `lang`/`dir`, `hreflang`, canonical, JSON-LD, per-locale sitemap/RSS/`llms.txt`/markdown, notice component, fallback | `design:shots` passes in two locales, one RTL; an `hreflang` validator test passes |
| C. Search | locale hrefs, trigram table for CJK and Thai, provider locale | search tests pass for `ja` and `ar` |
| D. Agent pipeline | MCP tools, checks, score, policy scope, locale-limited keys, approvals, staleness inbox | the build eval runs an "add Spanish" turn; news cannot auto-publish |
| E. Studio | Translations card, Languages screen, coverage view, review | the e2e flow passes: translate → review → publish → edit source → stale |
| F. Newsroom example | an English edition as a second site with cross-site groups | live deploy shows correct `hreflang` across hosts |

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Stay single-language; one site per language, unlinked (Ghost) | nothing to build | no `hreflang`, no staleness, no shared terms or media, duplicated setup | the market's failed pattern; blocks docs and scholarly |
| Field-level localisation of every node (Contentful, Payload) | one identity; shared fields | one status per node (all languages publish together) or a retrofit; identical structure forced on long-form; large rows against D1 limits; breaks per-node CAS review | fails news (editions diverge) and long-form; vendors are retrofitting per-locale status |
| Document per locale everywhere, terms and menus included (WPML) | uniform | duplicates taxonomy, menus and media; translation joins on every query | Cloudhal already has per-locale label maps for structure, which is cheaper and right |
| A separate `Publication` entity inside a Site (OJS journals) | models journal portals directly | a new level everywhere (routes, roles, analytics, Studio) | Site already is the publication and Project the container; a portal is many sites |
| Proxy or overlay translation at the edge (Weglot) | instant | shallow, no editorial control, no provenance, SEO fragile | contradicts reviewable, snapshotted changes |
| Auto-publish machine translations | fast | Google scaled-content risk, AI Act disclosure, scholarly norms | allowed only for collections outside `review.required`, always labelled |
| Locale by cookie or `Accept-Language` | clean URLs | invisible to crawlers, cache fragmentation, Google advises against | path or host only |
| One page, text per locale inside each section (overlay; Webflow, Framer) | layout edited once | one status for all languages; markets cannot diverge; large rows; agents patch one big node | linked layout (§4a) gives the same "edit once" with per-locale nodes |
| Theme per locale | per-market look | doubles theme work; direction and words already come from the locale | per-site themes cover editions that need a different look |

## Compatibility & migration

- **Additive only.** Existing sites have no `translation` and no `localization`, so they behave exactly as today: default locale unprefixed, no `hreflang`, no notice.
- Turning on a second locale with `prefix-except-default` leaves every existing URL in place.
- Switching to `prefix-all` adds 301s from the unprefixed paths, written as redirects in the same publish.
- **Store migration.** The redirect uniqueness key becomes `(site, locale, from)`, backfilled with the default locale. The trigram search table is created empty and filled by `cloudhal search reindex`.
- **Rollback.** Translation fields are optional. Removing a locale unpublishes its nodes; nothing else references them.

## Security & policy impact

- **New scope:** `content:translate`. Optional `locales[]` limits on keys and principals. Publishing machine output in review-required collections is a new approval point.
- **Only humans set `review`.** Agent keys cannot, in any mode, bypass included.
- **Translation input is untrusted text.** The pipeline treats source text as data, the same rule as comments and AI-addressed text in RFC-0007. Instructions inside an article never steer the translator.
- **Tenant isolation.** Cross-site groups are limited to sites in the same project, and the store rejects a `source.siteId` outside it.
- **Provenance is append-only per translation.** It is part of the snapshot, so audit and rollback cover it.

## Open questions (recommendations given)

1. **Default `routing` for new multilingual sites:** `prefix-except-default` or `prefix-all`? *Recommendation:* `prefix-except-default`. It is compatible, Starlight and Docusaurus use it, and Google accepts it; `prefix-all` stays one setting away.
2. **The quality score:** an LLM judge, or a hosted COMET-family model? *Recommendation:* start with an LLM MQM-style judge through the existing AI provider, behind an interface, and add a COMET provider when Workers AI or a partner offers one.
3. **Should reviewing remove the label?** *Recommendation:* yes, by default (`label: "unreviewed"`). This matches the AI Act exemption and Microsoft's and Springer's practice. Sites that want permanent disclosure set `always`; scholarly starters default to `always`.
4. **Glossary scope:** per site or per project? *Recommendation:* per site now; a project glossary later, inherited by its sites.
5. **Per-locale rollback:** in this RFC or later? *Recommendation:* later (§9). Node status already gives per-locale publishing, and site-wide rollback stays correct.

## References

All sources are listed in the [research report](../reports/2026-10-multilingual-publishing-research.md). The key ones:
- Google: [localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [spam policies](https://developers.google.com/search/docs/essentials/spam-policies), [generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content).
- [EU AI Act Art. 50](https://artificialintelligenceact.eu/article/50/).
- [Crossref relationships](https://www.crossref.org/documentation/schema-library/markup-guide-metadata-segments/relationships/), [JATS multi-language](https://jats.nlm.nih.gov/publishing/tag-library/1.4/chapter/tag-multi-lang-articles.html).
- [Arc XP localization strategies](https://docs.arcxp.com/en/products/general/localization-strategies-to-build-your-sites.html), [Contentful locales](https://contentful.com/developers/docs/concepts/locales), [Sanity localization](https://www.sanity.io/docs/localization), [Strapi i18n](https://docs.strapi.io/cms/features/internationalization).
- [Starlight i18n](https://starlight.astro.build/guides/i18n/), [MDN translated content](https://developer.mozilla.org/en-US/docs/MDN/Community/Translated_content), [Hugo multilingual](https://gohugo.io/content-management/multilingual/).
