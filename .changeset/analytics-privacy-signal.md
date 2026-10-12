---
"@cloudhal/core-contracts": minor
"@cloudhal/storage": minor
"@cloudhal/analytics": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": patch
---

GPC/DNT share (RFC-0006 §6.2). `AnalyticsPageviewEvent` gains an optional boolean `privacySignal` (WAE `double10`): set when the beacon request carried `Sec-GPC: 1` or `DNT: 1`, the same check that skips the visitor hash; nothing else about the signal is stored. Migration `0015_analytics_privacy_signal` adds `analytics_events.privacy_signal`. The `summary` query gains `signals` on every store (WAE: `SUM(double10)` in the existing statement; rollups: a `signals` row beside the daily total, `null` for days rolled up before it), and `privacySignalShare()` gives the share. REST `…/summary` and `get_analytics` return `signals` and `privacySignalShare`; Studio shows "Privacy signals" in "About this data" while unique visitors are on.
