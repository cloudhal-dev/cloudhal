---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": patch
---

Site chrome, mobile and behaviour (RFC-0025 25b).
- **Core.** `heroSurface` and the transparent-header rule in `resolveChrome`.
- **Logos.** The brand's logos count as asset uses (node kind `site`).
- **Renderer.** `@cloudhal/astro-renderer/chrome` serves the chrome module (`/_cloudhal/chrome.1.js`): header height, scroll state, hide-on-scroll, the menu dialog and the popover fallback.
- **Checks.** `render_page` adds the `skip-link`, `landmarks`, `header-contrast` and `focus-obscured` checks.
- **Form schemas.** `chromeSchemas` gains `collapseAt` and `shrink`.
