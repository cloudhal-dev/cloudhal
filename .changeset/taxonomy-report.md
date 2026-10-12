---
"@cloudhal/core-ts": minor
---

`taxonomyReport()` (also `@cloudhal/core-ts/taxonomy-report`): vocabulary hygiene of one taxonomy — single-use and unused terms, near-duplicates (edit distance ≤ 2, plural forms, synonym collisions) with a merge suggestion, empty and oversized categories, and the proposed backlog. Pure, so MCP's `taxonomy_report` and Studio's hygiene panel read the same thing. `@cloudhal/core-ts/names` exposes the dependency-free name folding and resolution helpers.
