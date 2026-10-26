import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0042 §4, #110: an index of list-field values, so the store, the API and MCP filter and sort
 * a collection without reading every entry. Rows are written by core-ts in each entry's own batch
 * (AGENTS.md rule 4), only for a collection's `listFields`; the store reads them only while the
 * collection's `entry_list_state` row says they are complete. DDL only: nothing is backfilled
 * here (the admin Worker migrates on its first request); `rebuildListValues` does that.
 *
 * `entry_list_values`, one row per entry and listed field, plus one per chosen option of a
 * multiple select:
 * - `field`: the listed field's key;
 * - `has`: 1 when the resolved value counts as a value (`hasFieldValue`), else 0; 2 marks an option
 *   row of a multiple select;
 * - `num`: a number, a datetime in epoch ms, a date as the integer YYYYMMDD, a boolean as 1/0;
 * - `text`: a select option, or a text or url value of at most 100 UTF-16 units that is well
 *   formed (never truncated; NULL otherwise);
 * - `tie`: the collection sort's key (`publishedAt ?? createdAt`, or the title mapped so that
 *   BINARY order is JavaScript's);
 * - `created`: the node's `created_at` (the store's own order);
 * - `locale`, `status`: the entry's, for the prefilter.
 *
 * `entry_list_state`, one row per listed collection: the `fingerprint` of the definitions the rows
 * were built with, `ready` once every entry has its rows, `epoch` (a token every reset changes,
 * which guards the backfill's chunks) and `cursor` (the last `nodes.key` the backfill wrote; NULL
 * means from the start).
 */
export const migration0029EntryListValues: Migration = {
  name: "0029_entry_list_values",
  sql: `
CREATE TABLE entry_list_values (
  site_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  field TEXT NOT NULL,
  has INTEGER NOT NULL,
  num REAL,
  text TEXT,
  tie TEXT NOT NULL,
  node_id TEXT NOT NULL,
  created TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX entry_list_values_query ON entry_list_values (site_id, collection, field, has, num, text, tie, node_id, created, locale, status);
CREATE INDEX entry_list_values_node ON entry_list_values (node_id, field, has, num, text);
CREATE TABLE entry_list_state (
  site_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  epoch TEXT NOT NULL,
  ready INTEGER NOT NULL,
  cursor TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, collection)
);
`,
};
