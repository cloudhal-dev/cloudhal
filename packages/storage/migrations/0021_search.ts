import type { Migration } from "../src/migrate.ts";

/**
 * Site search (RFC-0019 §3): an FTS5 index of the published articles, rewritten from the snapshot
 * a publish or rollback makes live, so it always matches what readers see. `search_state` records
 * which snapshot the index reflects; a page whose site points elsewhere says "index updating".
 * Time gates are columns, not filters: an embargoed article is indexed and found only once its
 * `from` has passed, an expired one only before its `until`.
 *
 * `wrangler d1 export` skips virtual tables: a restored backup rebuilds the index on the next
 * publish or with `cloudhal search reindex`.
 */
export const migration0021Search: Migration = {
  name: "0021_search",
  sql: `
CREATE VIRTUAL TABLE search_index USING fts5(
  site_id UNINDEXED, node_id UNINDEXED, locale UNINDEXED,
  title, summary, body,
  href UNINDEXED, published_at UNINDEXED, gate_from UNINDEXED, gate_until UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE search_state (
  site_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  entries INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
