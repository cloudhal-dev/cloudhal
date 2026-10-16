---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": patch
---

Site chrome bars, mega menus and the footer region (RFC-0025 25d).
- **Contract.** `chrome.footer.region` (a checked surface) and menu items' `display: "mega"`.
- **Core.** `resolveChrome` resolves the announcement and consent bars.
- **Renderer.** `/_cloudhal/prefs.1.js` hides closed bars before the page paints. `chrome.2.js` handles their buttons. The interaction runtime (`surface.10.js`) shows copy toasts.
- **MCP.** `set_chrome` takes `announcement`, `consent` and `footer.region`.
