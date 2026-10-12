---
"@cloudhal/analytics": minor
"@cloudhal/storage": minor
---

Site analytics core, storage and Workers Analytics Engine adapters (RFC-0006 rollout steps 2–4).

- New package `@cloudhal/analytics` (Worker-safe): the query model (`summary`, `series`, `top`, `vitals`, `renders`) with `assertAnalyticsQuery`; user-agent, bot/crawler and channel classifiers; path, host and UTM normalisation; the daily visitor hash; per-isolate beacon and render limits; settings rules; event builders; the pure beacon handler `handleBeacon`/`processBeacon` for `POST /__cloudhal/e`; `MemoryAnalytics`; `SqlAnalytics` on SQLite/D1 through `SqlDriver`; settings (CAS on `rev`), salt, rollup-run and query-budget accessors; `runRollups`, `RollupReader` and `CompositeReader`; `WaeWriter`, `WaeReader` (60 s cache, daily budget, one retry, error mapping) and `compileWae`; conformance, state and rollup suites in `@cloudhal/analytics/testing`.
- `@cloudhal/storage`: migration `0014_analytics` adds `analytics_settings`, `analytics_salts`, `analytics_daily`, `analytics_rollup_runs`, `analytics_query_budget` and `analytics_events`.
