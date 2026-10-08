import type { Migration } from "../src/migrate.ts";

/**
 * Assertion rows for multi-node operations (RFC-0002 §4.3). D1 has no interactive transactions and
 * a CAS `UPDATE` that matches no row is not an error, so a governance batch (rename, merge, retire,
 * move, review) ends with `INSERT INTO op_guards … SELECT …, CASE WHEN <every node reached its
 * expected hash> THEN 1 END`. A miss leaves `ok` NULL, the NOT NULL constraint fails, and the whole
 * batch rolls back. `(op_id, seq)` makes a replayed operation fail instead of applying twice.
 * Rows older than 30 days are swept by the store.
 *
 * RFC-0002 also adds node kinds without a storage change (`kind` is free text). Their uniqueness
 * keys in `nodes.key`:
 *   taxonomy → "<key>"
 *   term     → "<taxonomyId>:<slug>" ("<taxonomyId>:~<id>" once retired; the slug stays reserved
 *              by the store's guards until a person reclaims it)
 *   redirect → "<from>"
 */
export const migration0011OpGuards: Migration = {
  name: "0011_op_guards",
  sql: `
CREATE TABLE op_guards (
  op_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (op_id, seq)
);
CREATE INDEX op_guards_created ON op_guards (created_at);
`,
};
