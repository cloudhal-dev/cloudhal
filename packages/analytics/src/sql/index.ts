/**
 * @cloudhal/analytics/sql — everything that reads or writes the analytics tables through
 * `SqlDriver` (SQLite locally, D1 on Cloudflare): the raw-event store `SqlAnalytics`, and the
 * settings, salt, rollup-run and query-budget accessors. Worker-safe.
 */
export * from "./state.ts";
export { eventParams, SqlAnalytics, type SqlAnalyticsOptions } from "./store.ts";
