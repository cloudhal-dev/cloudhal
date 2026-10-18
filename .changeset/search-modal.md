---
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
---

The reader's search modal (RFC-0029 29c).
- **Endpoint.** `searchJsonResponse`, `searchJson` and `searchJsonRequest` in `./search` answer `GET /search.json?q=&kinds=&page=`. It returns 8 hits as JSON, with snippets escaped and marked on the server, `no-store` and `noindex`. A static build gets an empty `404`, so no file is written.
- **Limit.** `SearchLimiter` is now a token bucket: 60 tokens per client, refilled at one a second. `/search` costs 2 and `/search.json` costs 1 (`searchCost`, `SEARCH_COST`), so a burst of 30 result pages is still allowed. The endpoint's `429` is JSON.
- **Module.** `/_cloudhal/search.1.js` (`./search-client`) is served by `cloudhal dev` and written by Site Worker builds.
  - It turns the theme's dialog into a WAI-ARIA combobox: hits grouped by kind, ↑↓ and Enter, the last five searches kept in this browser, and ⌘K / Ctrl+K and `/` to open it.
  - Without it, the header form and `/search` work as before.
- **Starter.** `src/pages/search.json.ts`, `SearchDialog.astro` and `search-dialog.css`. The header field opens the modal, and the modal's words come in English and Turkish.
