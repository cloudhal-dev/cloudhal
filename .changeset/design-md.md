---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
---

DESIGN.md (RFC-0021 21a).
- **Contract.** Sites carry optional design rules (`Site.design.markdown`), read with the theme's `src/DESIGN.md` (bundled by `cloudhal deploy`).
- **Core.** `@cloudhal/core-ts/design` lints the rules (unknown components or settings, a missing brand section, length) and holds Cloudhal's design guidance.
- **MCP.** `get_design` gives agents the rules, settings, catalog names and guidance in one call. `set_design` changes them only with a person's approval. The server instructions point builders to it, and the official `site-design` skill teaches the process.
- **Build chat** reads the rules.
- **REST and Studio.** `GET`/`PUT /api/sites/:siteId/design` back Studio's new Settings › Design rules section.
