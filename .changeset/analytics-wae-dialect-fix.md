---
"@cloudhal/analytics": patch
---

The WAE compiler now emits SQL the live Analytics SQL API accepts: dimension columns are selected without an alias (an aliased grouped column used in ORDER BY is refused as "column not found"), and Core Web Vitals weights are `toUInt32` (a Float64 weight beside the literal 0 was a type error). Top-content, errors, redirects, crawler and vitals reads and the daily rollups failed on Cloudflare before this. The test fake now refuses both patterns, and every golden statement was run against a live dataset.
