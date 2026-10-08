import type { Migration } from "../src/migrate.ts";

/**
 * Out-of-band approvals: an agent's request to publish / roll back / delete waits here until a
 * person decides in Studio. Single use (`consumed`), bound to the tool, the exact arguments, the
 * requesting actor and the site's content at request time (`state_hash`).
 */
export const migration0006Approvals: Migration = {
  name: "0006_approvals",
  sql: `
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  tool TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  input TEXT,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  prompt TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  consumed_at TEXT
);
CREATE INDEX approvals_site_status ON approvals (site_id, status, created_at);
`,
};
