---
"@cloudhal/core-contracts": minor
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/api": minor
---

RFC-0028 28a: `AssetImage` gains `color`, `alpha` and `focal`; ingest reads transparency from image headers; images get a blurred LQIP over their dominant colour as their background (none for transparent images), within a 24 KB page budget.
