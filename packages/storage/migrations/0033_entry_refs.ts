import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0045 §2: `entry_refs`, the reverse index of reference values (the `asset_refs` pattern,
 * RFC-0004 §4.4). One row per (holding node, field path, stored translation group id), whatever
 * the target's state; core-ts writes them in each entry's own batch, anchored on the entry's new
 * hash (AGENTS.md rule 4), and rebuilds them beside an imported node set. Every guard and lookup
 * filters `site_id`, so a row naming another tenant's id pins nothing there.
 *
 * - `target_id`: the referenced translation group id, as stored;
 * - `source_id`, `source_collection`: the node holding the value and its collection;
 * - `field`: `venue`, or `speakers.person` inside a repeater; `root_key` the top-level key;
 * - `shared`: from the definition, 1 for `localized: false` (every inheriting member shows it),
 *   2 for `localized: true` (only members without their own value);
 * - `source_status`: the holding node's own status.
 *
 * DDL only: no reference value can exist before rollout step 7, on any path (§1).
 */
export const migration0033EntryRefs: Migration = {
  name: "0033_entry_refs",
  sql: `
CREATE TABLE entry_refs (
  site_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_collection TEXT NOT NULL,
  field TEXT NOT NULL,
  root_key TEXT NOT NULL,
  shared INTEGER NOT NULL,
  source_status TEXT NOT NULL,
  PRIMARY KEY (source_id, field, target_id)
);
CREATE INDEX entry_refs_target ON entry_refs (site_id, target_id, source_status);
`,
};
