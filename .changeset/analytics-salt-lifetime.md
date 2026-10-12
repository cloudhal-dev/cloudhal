---
"@cloudhal/analytics": patch
"@cloudhal/astro-renderer": patch
---

Unique-visitor salts keep RFC-0006's promises (threat model review of 2026-10-12, items 1–2). `getOrCreateSalt` deletes every earlier day's salt in the same atomic `batch()` that creates a day's first one, so salts no longer outlive their day on deployments without the hourly cron. `createSaltProvider(sql, { ttlMs, now })` returns a provider with `reset()` that re-reads the stored row at least every 60 s; `SiteAnalytics` re-reads the salt whenever it re-reads its settings and on `reset()`, and `AnalyticsService.updateSettings` purges (which resets the Site Worker's memo) when unique visitors are switched on or off, so a salt deleted by switching the mode off is never used again once an isolate sees the change.
