import type { Migration } from "../src/migrate.ts";

/**
 * Site analytics (RFC-0006 §7.4). Additive; `@cloudhal/analytics` owns the accessors.
 *
 * - analytics_settings: per-site overrides of the deployment defaults, outside the site graph (a
 *   content rollback never changes a privacy setting). CAS on `rev`. A missing row = the default.
 * - analytics_salts: one random salt per UTC day for the deployment (unique-visitors mode only);
 *   rows older than today are deleted hourly.
 * - analytics_daily: daily rollups (UTC days). `dim` ∈ total | node | refHost | channel | utmSource
 *   | utmMedium | utmCampaign | country | device | browser | os | status | redirect | crawler |
 *   vitals.<metric>; key '(other)' holds what fell outside the top N, so totals add up. `good` and
 *   `poor` (vitals: weighted samples per rating) extend the RFC's table so Studio can show the share
 *   of good samples from rollups.
 * - analytics_rollup_runs: which site-days are rolled up, written last, so the job is idempotent.
 * - analytics_query_budget: uncached live (WAE) queries per UTC day (§7.7).
 * - analytics_events: raw events for the SQLite store (local and Node self-host). Created everywhere
 *   because migrations are one ledger; never written on Cloudflare.
 */
export const migration0014Analytics: Migration = {
  name: "0014_analytics",
  sql: `
CREATE TABLE analytics_settings (
  site_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  unique_visitors INTEGER NOT NULL,
  vitals_one_in INTEGER NOT NULL,
  rollup_retention_days INTEGER,
  plan_hint TEXT,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE analytics_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE analytics_daily (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  dim TEXT NOT NULL,
  key TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER,
  hits INTEGER,
  value REAL,
  samples INTEGER,
  good INTEGER,
  poor INTEGER,
  PRIMARY KEY (site_id, day, dim, key)
);
CREATE INDEX analytics_daily_key ON analytics_daily (site_id, dim, key, day);
CREATE TABLE analytics_rollup_runs (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  state TEXT NOT NULL,
  rows INTEGER,
  source TEXT NOT NULL,
  error TEXT,
  finished_at TEXT,
  PRIMARY KEY (site_id, day)
);
CREATE TABLE analytics_query_budget (
  day TEXT PRIMARY KEY,
  queries INTEGER NOT NULL
);
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY,
  site_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  node_id TEXT,
  node_kind TEXT,
  ref_host TEXT,
  ref_path TEXT,
  channel TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  country TEXT,
  device TEXT NOT NULL,
  browser TEXT,
  os TEXT,
  visitor TEXT,
  nav_type TEXT,
  locale TEXT,
  crawler TEXT,
  redirect_to TEXT,
  status INTEGER,
  entrance INTEGER,
  lcp INTEGER,
  inp INTEGER,
  cls REAL,
  ttfb INTEGER,
  fcp INTEGER,
  render_ms INTEGER,
  sample_one_in INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX analytics_events_time ON analytics_events (site_id, kind, ts);
CREATE INDEX analytics_events_node ON analytics_events (site_id, node_id, ts);
`,
};
