import type { Migration } from "../src/migrate.ts";

/**
 * Reader comments (RFC-0007 §4.1). Additive; `@cloudhal/comments` owns the accessors. Comments
 * live outside the site graph: snapshots, diffs, rollbacks and bundles never read these tables.
 *
 * - comment_settings: per-site settings (a missing row = off), collections inside as JSON. CAS on `rev`.
 * - comment_secrets: owner-supplied keys (the Turnstile secret), AES-GCM under a key derived from
 *   CLOUDHAL_COMMENTS_KEY; write-only through the API.
 * - comment_threads: per-entry overrides (a missing row = default). CAS on `rev`.
 * - comments: one row per comment, keyed by entry id. `body` is plain text (NULL once deleted);
 *   `email_id`, `ip_hmac` and `challenge_id` never leave the store (they are not in the contract).
 *   `hash` is the SHA-256 of the canonical Comment record; `op` the last bulk operation, which
 *   guards the statements that follow it in the same batch. No counter columns: counts are
 *   indexed COUNTs on read.
 * - commenter_emails: the only place an address lives (encrypted, plus a keyed hash for lookups).
 * - comment_events: moderation history and statements of reasons (no text, no email).
 * - comment_reports: notices (DSA Art. 16); a report never changes a comment by itself.
 * - comment_bans: keyed hashes, never addresses.
 * - comment_salts: one random salt per UTC month for IP HMACs; deleted when two months old.
 * - comment_purge_queue: cache tags waiting for a coalesced purge.
 * - cache_purge_log: purge requests sent by this deployment (publish and comments), for the
 *   shared Free-tier purge budget.
 *
 * Beyond the RFC's listing: `comments_parent` (replies and tombstone checks) and
 * `comment_reports_comment` (a comment's reports) indexes, both partial or small.
 */
export const migration0016Comments: Migration = {
  name: "0016_comments",
  sql: `
CREATE TABLE comment_settings (
  site_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  show_when_off INTEGER NOT NULL,
  collections TEXT NOT NULL,
  close_after_days INTEGER,
  protection TEXT NOT NULL,
  turnstile_site_key TEXT,
  allow_without_script INTEGER NOT NULL,
  link_limit INTEGER NOT NULL,
  watch_words TEXT NOT NULL,
  blocked_words TEXT NOT NULL,
  daily_cap INTEGER NOT NULL,
  ai_labels TEXT NOT NULL,
  retention TEXT NOT NULL,
  plan_hint TEXT,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE comment_secrets (
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (site_id, name)
);
CREATE TABLE comment_threads (
  site_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  closes_at TEXT,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (site_id, node_id)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  parent_id TEXT,
  in_reply_to_id TEXT,
  source TEXT NOT NULL,
  origin TEXT,
  author TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL,
  labels TEXT NOT NULL,
  moderation TEXT,
  email_id TEXT,
  ip_hmac TEXT,
  challenge_id TEXT,
  proof TEXT NOT NULL,
  op TEXT,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  rev INTEGER NOT NULL
);
CREATE INDEX comments_node ON comments (site_id, node_id, status, created_at);
CREATE INDEX comments_queue ON comments (site_id, status, created_at);
CREATE INDEX comments_client ON comments (site_id, ip_hmac, created_at) WHERE ip_hmac IS NOT NULL;
CREATE UNIQUE INDEX comments_challenge ON comments (challenge_id) WHERE challenge_id IS NOT NULL;
CREATE INDEX comments_email ON comments (email_id) WHERE email_id IS NOT NULL;
CREATE INDEX comments_parent ON comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE TABLE commenter_emails (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  email_hmac TEXT NOT NULL,
  email_ciphertext TEXT NOT NULL,
  email_iv TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (site_id, email_hmac)
);
CREATE TABLE comment_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason_code TEXT,
  note TEXT,
  automated INTEGER NOT NULL,
  approval_id TEXT,
  op TEXT,
  at TEXT NOT NULL
);
CREATE INDEX comment_events_comment ON comment_events (comment_id, at);
CREATE TABLE comment_reports (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  email_id TEXT,
  ip_hmac TEXT,
  challenge_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution TEXT
);
CREATE INDEX comment_reports_open ON comment_reports (site_id, resolved_at, created_at);
CREATE UNIQUE INDEX comment_reports_challenge ON comment_reports (challenge_id) WHERE challenge_id IS NOT NULL;
CREATE INDEX comment_reports_comment ON comment_reports (comment_id);
CREATE TABLE comment_bans (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  value TEXT NOT NULL,
  until TEXT,
  reason_code TEXT NOT NULL,
  note TEXT,
  by_actor TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (site_id, subject, value)
);
CREATE TABLE comment_salts (
  month TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE comment_purge_queue (
  site_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  priority TEXT NOT NULL,
  enqueued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  next_at TEXT NOT NULL,
  PRIMARY KEY (site_id, tag)
);
CREATE TABLE cache_purge_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  requests INTEGER NOT NULL
);
CREATE INDEX cache_purge_log_at ON cache_purge_log (at);
`,
};
