---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Icon weights and theme icon sets (RFC-0026 26c–26d).
- **Weights.** `renderIcon` draws light, regular, bold or fill. The blog theme's `iconWeight` setting picks one; `MediaContext.icons` carries it to surfaces.
- **Theme sets.** `defineIconSet` lets a theme draw names itself, checked as geometry only.
