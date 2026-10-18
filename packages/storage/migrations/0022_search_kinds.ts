import type { Migration } from "../src/migrate.ts";

/**
 * Search kinds (RFC-0029 §2): the index holds pages, terms and authors next to articles. FTS5
 * tables cannot gain columns, so `search_index` is rebuilt with `kind` and `context`, and
 * `search_state` is emptied: the next publish, release, import or `cloudhal search reindex`
 * writes the whole index again.
 *
 * `search_links` lists the terms each indexed article carries, with the article's locale and time
 * gates, so a term or author is found only while its archive lists at least one article the
 * reader can see (the archive's own 404 rule, RFC-0002 §7).
 */
export const migration0022SearchKinds: Migration = {
  name: "0022_search_kinds",
  sql: `
DROP TABLE IF EXISTS search_index;
CREATE VIRTUAL TABLE search_index USING fts5(
  site_id UNINDEXED, node_id UNINDEXED, locale UNINDEXED, kind UNINDEXED,
  title, summary, body,
  href UNINDEXED, context UNINDEXED, published_at UNINDEXED, gate_from UNINDEXED, gate_until UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
DELETE FROM search_state;
CREATE TABLE search_links (
  site_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  gate_from TEXT,
  gate_until TEXT
);
CREATE INDEX search_links_term ON search_links (site_id, term_id, locale);
CREATE INDEX search_links_node ON search_links (site_id, node_id);
`,
};
