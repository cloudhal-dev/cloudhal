---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
"@cloudhal/ui": minor
---

Theme design settings, RFC-0017 phase 7a (ADR-0031). A theme declares what may change about its look in `src/settings.ts`, using the block props subset with two additions: `x-contrast` rules hold color pairs to a WCAG ratio, and `x-labels` gives words for enum values. The store checks `Site.theme.config` against those settings when it changes (`invalid_props`). `cloudhal studio`, `cloudhal mcp` and `cloudhal deploy` load the settings, and the admin Worker bundles them. New `GET`/`PUT /api/sites/:siteId/theme-settings` routes and MCP tools `get_theme_settings` and `set_theme_settings`. `themeVariables` renders settings as typed CSS variables and attributes only. `BlockPropsForm` shows a swatch for color fields. Studio gains Settings › Appearance.
