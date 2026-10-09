/**
 * @cloudhal/analytics — cookie-less, first-party site analytics (RFC-0006, ADR-0021).
 *
 * This entry is Worker-safe and has no storage dependency: the query model and result types, the
 * user-agent/bot and channel classifiers, path/host/UTM normalisation, the visitor hash, the
 * per-isolate limits, the settings rules, the event builders, the pure beacon handler and the
 * in-memory store. Stores: `@cloudhal/analytics/sql` (SQLite/D1), `@cloudhal/analytics/wae`
 * (Workers Analytics Engine); rollups: `@cloudhal/analytics/rollup`; the composite read path:
 * `@cloudhal/analytics/reader`; conformance suites: `@cloudhal/analytics/testing`.
 */
export * from "./beacon.ts";
export * from "./channels.ts";
export * from "./errors.ts";
export * from "./events.ts";
export * from "./limits.ts";
export { answerQuery, MemoryAnalytics } from "./memory.ts";
export * from "./model.ts";
export * from "./paths.ts";
export * from "./settings.ts";
export * from "./ua.ts";
export * from "./visitor.ts";
