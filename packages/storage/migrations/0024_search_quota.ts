import type { Migration } from "../src/migrate.ts";

/**
 * The semantic search quota (RFC-0029 §3): Cloudflare AI Search includes 1,000 semantic queries a
 * month per account, so the deployment counts its own calls per UTC month (`2026-11`), not per
 * site and day (`0023_search_usage`, which this replaces; it never held a call on a live
 * deployment). Past the limit the site answers from FTS5 until the month ends.
 */
export const migration0024SearchQuota: Migration = {
  name: "0024_search_quota",
  sql: `
DROP TABLE IF EXISTS search_usage;
CREATE TABLE search_quota (
  period TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
);
`,
};
