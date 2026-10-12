import type { Migration } from "../src/migrate.ts";

/**
 * Assets and the media library (RFC-0004 §4.2). Asset nodes need no change of their own (`nodes.kind`
 * is free text; their uniqueness key is the SHA-256). These tables hold what is not a node:
 *
 * - media_blobs: the ledger of content-addressed bytes per site (`media/<siteId>/<sha256>` in the
 *   blob store). `state` is `stored`, `deleting` (garbage collection in progress) or `purged`
 *   (takedown: the bytes are gone from every snapshot). An upload in flight holds `lease_until`,
 *   which keeps garbage collection away (§4.5).
 * - snapshot_blobs: which content each snapshot references, so bytes a snapshot needs are never
 *   collected.
 * - asset_refs: derived index of the live references (ImageRef.assetId and markdown `asset:<id>`)
 *   of the current pages, entries and terms; rewritten in the same batch as each node write.
 * - media_uploads: single-use upload tickets for the REST stream (§5.5).
 */
export const migration0013Media: Migration = {
  name: "0013_media",
  sql: `
CREATE TABLE media_blobs (
  site_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  original_sha256 TEXT,
  state TEXT NOT NULL,
  lease_until TEXT,
  purge_reason TEXT,
  purge_legal INTEGER,
  purged_by TEXT,
  purged_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, sha256)
);
CREATE INDEX media_blobs_original ON media_blobs (site_id, original_sha256);
CREATE INDEX media_blobs_state ON media_blobs (site_id, state, created_at);
CREATE TABLE snapshot_blobs (
  snapshot_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, sha256)
);
CREATE INDEX snapshot_blobs_site_sha ON snapshot_blobs (site_id, sha256);
CREATE TABLE asset_refs (
  site_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_kind TEXT NOT NULL,
  field TEXT NOT NULL,
  PRIMARY KEY (node_id, asset_id, field)
);
CREATE INDEX asset_refs_asset ON asset_refs (site_id, asset_id);
CREATE TABLE media_uploads (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  sha256 TEXT,
  bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  options TEXT NOT NULL,
  state TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX media_uploads_actor ON media_uploads (site_id, actor_id, state);
`,
};
