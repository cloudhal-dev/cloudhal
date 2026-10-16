---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Overlays (RFC-0025 25c).
- **Catalog.** `Dialog`, `Drawer`, `Popover`, `Tooltip` and `Lightbox` join the catalog, and a Button's `open`/`close` actions open and close them. They render as native top-layer elements: Invoker Commands, `popovertarget` and `interestfor`.
- **A2UI.** `Modal` maps to `Dialog`.
- **Overlay module.** `@cloudhal/astro-renderer` serves `/_cloudhal/overlay.1.js`, which shims what older browsers lack.
- **Checks.** `render_page` adds the `overlay-open` check.
