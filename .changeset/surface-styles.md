---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Surface styles (RFC-0023 23d).
- `Band` and `Card` take a `surface`: plain, muted, raised, inverse, brand, accent, gradient, mesh, dots, grid or noise. The renderer writes it as `data-surface`; an old `tone` maps to one (`TONE_SURFACE`).
- `Band.anchor` becomes the band's `id`, so links can jump to it.
- A new `gradient` color role is checked against text on brand, so text on a gradient keeps its contrast.
- The blog theme draws every surface from the color roles, in light and dark.
