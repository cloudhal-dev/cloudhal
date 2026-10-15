---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/ui": patch
---

Surfaces in markdown bodies (RFC-0020 phase 20d): ```` ```surface ```` fences — the info string holds the surface's id and catalog, every line one component or a `{"data":…}` merge. `@cloudhal/core-ts/surfaces` adds `bodySurfaces`, `parseSurfaceFence` (whole lines only; `complete: false` while streaming) and `checkBodySurfaces`; the store refuses broken fences in article bodies and rich-text sections with `invalid_surface`; the renderer draws fences on the site, in previews and feeds, through the theme's components when it has them (`SURFACE_SLOT`); the body editor keeps fences verbatim; `catalogPrompt` teaches the syntax.
