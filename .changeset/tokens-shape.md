---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/mcp-server": minor
---

Design tokens, shape and density (RFC-0023 23c).
- `@cloudhal/core-ts/tokens` adds `RADII`, `DENSITIES` and `shapeCss`.
- `themeVariables` writes `--ch-radius-{control,s,m,l}`, `--ch-space-unit` and `--ch-space-{xs…xl}`.
- The blog theme maps Tailwind's corners and spacing to them. It gains `medium` and `full` (pill buttons) corners and a `density` setting; the defaults keep today's look.
- `get_design` reports the shape.
