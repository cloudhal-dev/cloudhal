---
"@cloudhal/core-ts": minor
"@cloudhal/storage": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
---

Search in every locale (RFC-0033 / ADR-0035, phase C).

- **Languages written without spaces between words**: Chinese, Japanese, Korean, Thai, Lao, Khmer, Burmese and Tibetan.
  - These locales are indexed in a new table, `search_index_cjk` (migration `0026_search_cjk`). It uses FTS5's `trigram` tokenizer, so a query matches inside words.
  - Queries shorter than three characters fall back to `LIKE` over the same rows.
  - In-memory search in dev and previews also matches substrings in these locales.
  - The migration empties `search_state`, so each site's index is rewritten at the next publish.
- **Term results** link to the archive under the locale's own slug (`termSearchRows` takes the default locale).
- **The search modal** asks `/<locale>/search.json` on a localized page.
  - `localizeLinks` now also rewrites the dialog's `data-endpoint` and `data-page`.
  - `searchJsonResponse` takes `locale` and `localize`, so result links point to the locale's URLs.
  - A locale on its own domain is searched at its root `/search.json`.
