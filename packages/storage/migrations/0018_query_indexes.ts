import type { Migration } from "../src/migrate.ts";

/**
 * Indexes for queries that scanned `nodes` or `media_uploads` (D1 bills rows read):
 * - `nodes_sites`: `listSites()` (`WHERE kind = 'site' ORDER BY created_at, id`), which Studio's
 *   notification poll runs, scanned every node of every site;
 * - `nodes_site_kind_created`: per-site lists by kind in creation order (pages, media library)
 *   sorted in a temporary B-tree. It covers `(site_id, kind)`, so `nodes_site_kind` goes;
 * - `nodes_assets_created`: a key's daily upload limit (`created_at >= ?` over assets);
 * - `media_uploads_expires`: removing expired upload tickets.
 * Index-only: no table or row changes.
 */
export const migration0018QueryIndexes: Migration = {
  name: "0018_query_indexes",
  sql: `
CREATE INDEX nodes_sites ON nodes (created_at, id) WHERE kind = 'site';
CREATE INDEX nodes_site_kind_created ON nodes (site_id, kind, created_at, id);
DROP INDEX nodes_site_kind;
CREATE INDEX nodes_assets_created ON nodes (created_at) WHERE kind = 'asset';
CREATE INDEX media_uploads_expires ON media_uploads (expires_at);
`,
};
