---
"@cloudhal/core-ts": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
---

Studio and agent search (RFC-0029 29d).
- **core-ts.** `searchSiteNodes` searches a site's own articles, pages, terms, media, menu items and redirects, drafts included. Words match the way term names fold (Turkish-aware, no diacritics), titles first, up to 5 hits per kind.
- **API.** `GET /api/sites/:siteId/search?q=&kinds=&limit=` (`content:read`). Media, menus and redirects appear only for people with `site:read`.
- **MCP.** `search_site` (read-only, `content:read`) finds nodes by words in the editing view, or with `published` returns what readers find on `/search`.
