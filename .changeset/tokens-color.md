---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
"@cloudhal/ui": minor
---

Design tokens, color (RFC-0023 23a). `@cloudhal/core-ts/tokens` expands a seed, a scheme (`tonal`, `vibrant`, `neutral`, `mono`), a contrast level and a mode (`light`, `dark`, `auto`) into 16 OKLCH color roles for light and dark. Every text and UI pair is checked against WCAG 2.2 and repaired if it fails, and the repairs are reported. `themeVariables` emits them as `--ch-color-<role>` (`light-dark()` for `auto`). Sites without a seed keep their old colors. The blog theme reads roles instead of fixed greys, so it gets dark mode. `get_design` returns the roles, their contrast and the repairs; `render_page` takes `scheme: "dark"`. Studio's Appearance form shows the roles live (`ColorRolePreview`).
