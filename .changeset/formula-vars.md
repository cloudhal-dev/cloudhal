---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Formulas in surfaces.
- **`calculate` takes `vars`:** names bound to values, data paths or calls, so a calculator's result is one formula such as `(10*w + 6.25*h - 5*a + s) * f` instead of deeply nested calls.
- **The grammar adds `^`** (power), and whitespace no longer joins names.
- **The catalog prompt and the site-design skill** lead with formulas.
- **Runtime:** it is now `surface.7.js`; the earlier names keep working.
