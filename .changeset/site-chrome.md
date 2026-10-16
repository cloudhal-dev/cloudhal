---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/cli": minor
---

Site chrome (RFC-0025 25a).
- **Contract.** `Site.brand`, `Site.chrome` and `Page.chrome`.
- **Core.** `@cloudhal/core-ts/chrome`: `resolveChrome`, `checkChrome`, `chromeSchemas`, the brand form helpers and `applyChromeForm`.
- **Tools.** MCP `get_chrome`, `set_chrome` and `set_brand`; `update_page` takes `chrome` and `motion`.
- **REST and CLI.** `GET/PUT /api/sites/:id/chrome`; `cloudhal chrome get|set`.
- **Theme.** The blog theme renders its header and footer from the chrome, with a skip link.
