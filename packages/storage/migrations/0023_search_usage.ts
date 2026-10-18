import type { Migration } from "../src/migrate.ts";

/**
 * Semantic search budgets (RFC-0029 §3, Security): calls a site's readers made to the Cloudflare AI
 * Search provider per UTC day. Past the deployment's daily limit the site answers from FTS5 alone.
 * One row per site and day; nothing about the reader or the query.
 */
export const migration0023SearchUsage: Migration = {
  name: "0023_search_usage",
  sql: `
CREATE TABLE search_usage (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL,
  PRIMARY KEY (site_id, day)
);
`,
};
