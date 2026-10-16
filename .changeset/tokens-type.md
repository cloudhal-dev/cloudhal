---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Design tokens, type (RFC-0023 23b).
- `@cloudhal/core-ts/tokens` adds `TYPE_PAIRINGS`, `TYPE_SCALES` and fluid steps (`typeStep`, `typeScaleCss`), using Utopia's clamp between 390 and 1440 px.
- `themeVariables` writes `--ch-step-<n>` once a site chooses a `typeScale`.
- The blog theme ships five font pairings as self-hosted OFL variable fonts (latin and latin-ext), preloaded per pairing, and adds `text-wrap` for headings and paragraphs.
- `get_design` reports the pairing and the scale.
