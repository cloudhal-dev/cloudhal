# ADR-0035: Published content in several languages — one node per locale in translation groups, locale in the URL, gated agent translation, Site = publication

- Status: Accepted (2026-10-18, by Halil)
- Date: 2026-10-18
- Related: RFC-0033; the research report (internal); RFC-0001/0002/0003/0004/0008/0018 (their deferred locale work); ADR-0033/0034 (Studio's own UI, not this)
- Sources:
  - Google: [localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
  - [EU AI Act Art. 50](https://artificialintelligenceact.eu/article/50/)
  - [Crossref relationships](https://www.crossref.org/documentation/schema-library/markup-guide-metadata-segments/relationships/)
  - [Arc XP localization strategies](https://docs.arcxp.com/en/products/general/localization-strategies-to-build-your-sites.html)
  - [Sanity localization](https://www.sanity.io/docs/localization)
  - [MDN translated content](https://developer.mozilla.org/en-US/docs/MDN/Community/Translated_content)

## Context
Pages, entries, terms, menus and assets already carry a locale or per-locale labels, but only the default locale is served and nothing links translations. Three accepted RFCs deferred their locale work to a model that did not exist. The research (19 platforms, 4 newsrooms, docs and scholarly tools, Google, W3C and the AI Act) points to one shape. RFC-0033 proposes it.

## Decision
1. **One language stays the zero-cost default.** Several languages are a setting.
2. **Hybrid model.**
   - Pages and entries: one node per locale, linked by `translation.group`. Each translation records its source `{id, locale, rev, hash}`, its `method` (`original`, `human`, `machine`, `machine-reviewed`), `provenance` and `review`.
   - Taxonomy, term, menu, asset and site chrome: per-locale field maps, which already exist.
   - Terms gain a slug per locale.
3. **Status and staleness.** Each translation has its own status. Staleness is computed (source hash ≠ recorded hash), never stored.
4. **Review gate.** A machine translation in a collection listed in `Site.localization.review.required` cannot be published without a person's review. Only humans set `review`.
5. **URLs.**
   - The locale goes in the path: `prefix-except-default` by default, `prefix-all` as an option, or a domain per locale.
   - Never cookie- or `Accept-Language`-only.
   - `hreflang` is reciprocal, self-referencing and includes `x-default`; every page is self-canonical.
   - `lang`, `dir` and `Content-Language` are set; sitemaps, feeds, search and `llms.txt` are per locale.
   - Fallback is off by default. When on, it shows a notice and is `noindex`.
6. **Landing pages.** Translations keep the original's section ids. With `layout: "linked"` (the default), structural changes propagate as drafts and text written by people is never overwritten. With `independent`, nothing propagates. Theme words come from the theme's per-locale strings, never from pages.
7. **Agents draft; people decide.**
   - Glossary, deterministic checks and a quality score (starting with an LLM MQM-style judge, behind an interface) gate every draft.
   - A new `content:translate` scope; optional `locales[]` limits on keys.
   - News and scholarly starters require review.
   - Unreviewed machine text is labelled to readers (`label: "unreviewed"` by default; scholarly starters use `always`).
8. **Site = publication, Project = container.** Translation groups may cross sites in one project (language editions); `hreflang` then spans hosts.
9. **Deferred to later RFCs.** The glossary is per site; a project glossary may come later. Per-locale rollback, scholarly (DOI per language version, JATS, `citation_*`), docs versions × locales, and hostname dispatch with per-site themes come later.

## Alternatives considered
- Single-language only.
- Field-level localisation everywhere.
- Document per locale everywhere.
- A `Publication` entity inside Site.
- Edge proxy translation.
- Auto-publishing machine output.
- Cookie or `Accept-Language` locales.
- A theme per locale.
- A text overlay inside one page.

The reasons each was rejected are in the table in RFC-0033.

## Consequences
- **Positive.**
  - Additive and compatible: existing sites are unchanged and existing URLs keep working.
  - Per-node CAS gives independent locking and review.
  - News editions, mirrors and journal portals all fit one model.
  - The AI Act disclosure and Google's guidance are met by default.
- **Negative.**
  - Structural sync for linked layouts is new machinery (a JSON Patch between revisions).
  - CJK search needs a second FTS5 table.
  - The redirect key gains a locale.
- **Risks.**
  - Quality scores are noisy per segment; they route drafts and never replace review.
  - Cross-site groups must stay inside one project (the store enforces this).
