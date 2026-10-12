import type { Migration } from "../src/migrate.ts";

/**
 * Site Graph storage, version 1 (RFC-0001).
 * - projects: one row per Project, body is the contract JSON.
 * - nodes: every site-scoped node (site, page, contentEntry). `key` is the uniqueness key per kind:
 *     site         → "site"
 *     page         → "<locale>:<path>"
 *     contentEntry → "<collection>:<locale>:<slug>"
 * - snapshots: immutable Snapshot contracts, linked by parent_id.
 * Timestamps are ISO 8601 strings; booleans are integers; bodies are JSON text.
 */
export const migration0001Init: Migration = {
  name: "0001_init",
  sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  rev INTEGER NOT NULL,
  hash TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX nodes_site_kind_key ON nodes (site_id, kind, key);
CREATE INDEX nodes_site_kind ON nodes (site_id, kind);
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  parent_id TEXT,
  site_rev INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX snapshots_site_created ON snapshots (site_id, created_at);
`,
};
