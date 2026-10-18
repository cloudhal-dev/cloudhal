---
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": patch
---

Search providers and more kinds (RFC-0029 29b).
- **Index.** Migration `0022_search_kinds` rebuilds `search_index` with `kind` and `context` and adds `search_links`. The search state is cleared: the next publish, release, import or `cloudhal search reindex` writes the whole index again.
- **Kinds.** Published pages (section words and SEO description; `noindex` pages left out), public terms and authors are indexed next to articles. A term or author is found only while a visible article in the reader's locale carries it, which is the archive's own 404 rule. `SearchOptions.kinds` narrows the results. `SearchHit` gains optional `kind` and `context`, and `SearchResults` gains `provider`.
- **Providers.** The `SearchProvider` interface, with `fts5Provider`, `memoryProvider` and `withFallback` (a failing provider, or one slower than 1.5 s, is answered by FTS5). `SiteGraphStoreOptions.search` sets the store's provider; FTS5 is still written on every publish. Index updates reach `provider.sync`.
- **Renderer.** Under `cloudhal dev`, search covers pages and terms too (`searchDocuments`). `SourceSearchOptions.kinds` narrows the results.
- **Starter.** Results show a topic's or author's taxonomy. The placeholder reads "Search the site…".
