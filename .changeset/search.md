---
"@cloudhal/storage": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/api": minor
"@cloudhal/cli": minor
---

Site search (RFC-0019 19c).
- **Index.** Migration `0021_search` adds an FTS5 index of published articles. Publish and rollback write it in the same batch as the pointer flip, releases and imports right after. Time gates apply at query time, and drafts are never indexed.
- **Store.** `store.search` (escaped words with prefix match, bm25, highlighted snippets, 20 per page), `refreshSearch` and `searchStatus`.
- **Renderer.** `GraphSource.search` (the index, or in memory under `cloudhal dev`), a `search` route kind for `/search`, and `./search` helpers and `searchHead` for themes.
- **Site Worker.** 30 searches per minute per client address.
- **Blog starter.** A header search field and a results page, never cached or indexed.
- **Operators.** `cloudhal search reindex [--remote]` rebuilds the index. `cloudhal dev` now renders pages per request.
