import type { Migration } from "../src/migrate.ts";

/**
 * Body proposals (RFC-0014 §5, ADR-0028): `edit_body` in `propose` mode files its operations here
 * instead of writing. A row, not a graph node, until a person accepts it: snapshots, diffs and
 * rollbacks never read this table. `base` holds the hashes of the blocks the operations name, as
 * the agent read them, so an operation whose block changed since is refused as stale.
 */
export const migration0019BodyProposals: Migration = {
  name: "0019_body_proposals",
  sql: `
CREATE TABLE body_proposals (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
  node_id TEXT NOT NULL, section_id TEXT,
  base_rev INTEGER NOT NULL, base TEXT NOT NULL, ops TEXT NOT NULL,
  actor TEXT NOT NULL, note TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_by TEXT, decided_at TEXT, accepted_ops TEXT, result_rev INTEGER
);
CREATE INDEX body_proposals_node ON body_proposals (site_id, node_id, created_at);
CREATE INDEX body_proposals_open ON body_proposals (site_id, created_at) WHERE status = 'open';
`,
};
