---
"@cloudhal/analytics": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": patch
---

Estimated cache-hit ratio (RFC-0006 §5.4). The `summary` query gains `renders`: people's HTML `200` renders (cache misses; no crawler, not a bot), weighted by `sampleOneIn`, under the node/country/device filter, `null` under a channel filter and where rollups do not keep it — on every store (memory, SQLite/D1, WAE with one extra bounded statement, rollups via a `renders` row beside the daily total). `estimatedCacheHitRatio()` and `AnalyticsService.cacheHitRatio()` give `1 − renders ÷ page views`, only for `store: "wae"` (no edge cache locally). REST `…/summary` and `get_analytics` return `renders` and `cacheHitRatio` (described as an estimate); `…/status`' quota adds yesterday's `renders` and `cacheHitRatio`. Studio shows it in "About this data" as "Cache hits (estimated)".
