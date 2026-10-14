import type { Migration } from "../src/migrate.ts";

/**
 * In-editor AI (RFC-0016): per-site settings and per-day usage.
 * - ai_settings: a missing row = AI off. `model` is a Workers AI id or a gateway `provider/model`;
 *   `gateway` an AI Gateway id. CAS on `rev`.
 * - ai_usage: one row per site and UTC day, bumped by one upsert per command; the daily cap reads it.
 */
export const migration0020Ai: Migration = {
  name: "0020_ai",
  sql: `
CREATE TABLE ai_settings (
  site_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  model TEXT NOT NULL,
  gateway TEXT,
  daily_limit INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE ai_usage (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  PRIMARY KEY (site_id, day)
);
`,
};
