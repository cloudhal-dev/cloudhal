import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0033 §5: an index for languages written without spaces between words (Chinese, Japanese,
 * Korean, Thai and their neighbours), with FTS5's `trigram` tokenizer; the columns match
 * `search_index`. `search_state` is emptied so the next publish, release, import or
 * `cloudhal search reindex` writes every row again, each into its locale's table.
 */
export const migration0026SearchCjk: Migration = {
  name: "0026_search_cjk",
  sql: `
CREATE VIRTUAL TABLE search_index_cjk USING fts5(
  site_id UNINDEXED, node_id UNINDEXED, locale UNINDEXED, kind UNINDEXED,
  title, summary, body,
  href UNINDEXED, context UNINDEXED, published_at UNINDEXED, gate_from UNINDEXED, gate_until UNINDEXED,
  tokenize = 'trigram'
);
DELETE FROM search_state;
`,
};
