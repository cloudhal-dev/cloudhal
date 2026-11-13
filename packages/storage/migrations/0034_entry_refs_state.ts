import type { Migration } from "../src/migrate.ts";

/**
 * RFC-0045 §2.4, rollout step 7: progress of the one-time per-site `entry_refs` rebuild
 * (`rebuildEntryRefs` in core-ts; the admin Worker's `refs.rebuild` job, and `openLocalStore` on
 * Node). One row per site once the job has started there:
 *
 * - `cursor`: the key (`nodes.key`, `collection:locale:slug`) of the last entry whose rows a chunk
 *   wrote; `NULL` before the first chunk;
 * - `done`: 1 once every entry was read and the orphans removed; the site is then never read again.
 *
 * The rows themselves are written per node, anchored on each node's read hash, so the job needs no
 * more state than where to go on.
 */
export const migration0034EntryRefsState: Migration = {
  name: "0034_entry_refs_state",
  sql: `
CREATE TABLE entry_refs_state (
  site_id TEXT PRIMARY KEY,
  cursor TEXT,
  done INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
