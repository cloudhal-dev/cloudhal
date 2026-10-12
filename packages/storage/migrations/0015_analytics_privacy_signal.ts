import type { Migration } from "../src/migrate.ts";

/**
 * The privacy signal of a page view (RFC-0006 §6.2, `AnalyticsPageviewEvent.privacySignal`): 1 when
 * the beacon request carried GPC or DNT, so Studio can say how many page views were counted without
 * a visitor hash. Additive: older rows read as NULL (no signal recorded). Only `analytics_events`
 * (the SQLite store) needs a column; daily rollups keep the count in a `signals` row.
 */
export const migration0015AnalyticsPrivacySignal: Migration = {
  name: "0015_analytics_privacy_signal",
  sql: `
ALTER TABLE analytics_events ADD COLUMN privacy_signal INTEGER;
`,
};
