---
"@cloudhal/astro-renderer": patch
"@cloudhal/mcp-server": patch
"@cloudhal/api": patch
"@cloudhal/cli": patch
---

Static previews get a skip link, a `main#main` and a footer; `render_page` no longer reports a carousel's module as missing on a static preview (previews run no scripts); build-eval runs list the components used (`Carousel:hero`).
