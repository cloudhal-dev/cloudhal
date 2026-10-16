---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
---

Surfaces compute (RFC-0022 22a).
- **New functions:** arithmetic (`add`, `subtract`, `multiply`, `divide`, `round`, `floor`, `ceil`, `abs`, `min`, `max`, `clamp`, `number`), choice (`if`, `choose`), aggregates (`sum`, `average`, `count`), `formatPercent`, and `calculate`, which reads a typed expression by grammar and never evaluates code.
- **Nesting and conditions:** calls nest up to 8 deep, and conditions add `gte`/`lte`.
- **Runtime:** the interaction runtime is now `/_cloudhal/surface.2.js`; the same code is also served at `surface.1.js`.
