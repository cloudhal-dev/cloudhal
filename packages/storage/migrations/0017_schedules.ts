import type { Migration } from "../src/migrate.ts";

/**
 * Schedules (RFC-0008 §5.1). Additive: new tables, nullable columns on `audit` and `approvals`;
 * `@cloudhal/schedules` owns the accessors (`SqlScheduleStore`). Releases, automations and runs
 * live outside the site graph: snapshots, diffs, rollbacks and bundles never read these tables.
 *
 * - releases / release_items: a release and its pinned items. The tick looks only at
 *   `releases_due`; `release_items.held` mirrors "the release is awaiting_approval, scheduled or
 *   running" and drives locks and holds (`release_items_held`).
 * - automations: recurring jobs and their per-automation key (`automations_key`, unique).
 * - schedule_runs: one row per occurrence, keyed by a deterministic id (the idempotency key of
 *   every scheduled effect); `schedule_runs_open` finds windows and leases to close.
 * - system_jobs: watermarks of the deployment's periodic jobs (analytics rollup, comments, …).
 * - scheduler_heartbeat: one row — is the scheduler alive, when does it expect to wake next.
 * - schedule_settings: per-site kill switch and daily automation write cap, outside the graph so
 *   a rollback cannot un-pause a site. A missing row means the defaults.
 * - audit and approvals gain the run, release and automation they belong to.
 *
 * No counter columns: budget usage and daily caps are indexed COUNTs over audit rows.
 */
export const migration0017Schedules: Migration = {
  name: "0017_schedules",
  sql: `
CREATE TABLE releases (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, title TEXT,
  state TEXT NOT NULL,
  hash TEXT NOT NULL,
  when_kind TEXT,
  execute_at TEXT,
  time_zone TEXT, local_time TEXT,
  approval TEXT,
  request_id TEXT,
  outcome TEXT,
  purge_plan TEXT,
  lease_token TEXT, lease_until TEXT,
  created_by TEXT NOT NULL,
  metadata TEXT, rev INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX releases_due ON releases (execute_at) WHERE state = 'scheduled';
CREATE INDEX releases_site ON releases (site_id, state, execute_at);
CREATE TABLE release_items (
  release_id TEXT NOT NULL, site_id TEXT NOT NULL, node_id TEXT NOT NULL,
  op TEXT NOT NULL,
  node_kind TEXT NOT NULL,
  target_rev INTEGER, target_hash TEXT,
  base_rev INTEGER, base_hash TEXT,
  deps TEXT NOT NULL,
  blob_sha TEXT,
  held INTEGER NOT NULL,
  PRIMARY KEY (release_id, node_id)
);
CREATE INDEX release_items_held ON release_items (site_id, node_id) WHERE held = 1;
CREATE TABLE automations (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, name TEXT NOT NULL,
  job TEXT NOT NULL,
  key_id TEXT,
  start_local TEXT NOT NULL, time_zone TEXT NOT NULL, rule TEXT, preset TEXT NOT NULL,
  state TEXT NOT NULL, paused_reason TEXT, consecutive_failures INTEGER NOT NULL,
  owner_id TEXT NOT NULL, owner_name TEXT,
  next_run_at TEXT,
  cursor TEXT,
  lease_token TEXT, lease_until TEXT,
  metadata TEXT, rev INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX automations_due ON automations (next_run_at) WHERE state = 'active';
CREATE INDEX automations_site ON automations (site_id, state);
CREATE UNIQUE INDEX automations_key ON automations (key_id) WHERE key_id IS NOT NULL;
CREATE TABLE schedule_runs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL,
  occurrence_at TEXT NOT NULL,
  state TEXT NOT NULL, outcome TEXT, trigger TEXT, attempt INTEGER NOT NULL,
  lease_token TEXT, lease_until TEXT,
  window_opens TEXT, window_closes TEXT,
  started_at TEXT, ended_at TEXT, lateness_s INTEGER, adjusted TEXT,
  usage TEXT, taint TEXT, summary TEXT, counts TEXT, findings TEXT, approval_ids TEXT, error TEXT,
  rev INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (subject_id, occurrence_at)
);
CREATE INDEX schedule_runs_site ON schedule_runs (site_id, created_at);
CREATE INDEX schedule_runs_open ON schedule_runs (window_closes) WHERE state IN ('ready', 'running');
CREATE TABLE system_jobs (
  name TEXT PRIMARY KEY,
  next_run_at TEXT NOT NULL, last_run_at TEXT, last_ok_at TEXT,
  lease_token TEXT, lease_until TEXT, last_error TEXT
);
CREATE TABLE scheduler_heartbeat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  at TEXT NOT NULL, trigger TEXT NOT NULL, next_wake_at TEXT NOT NULL,
  ran INTEGER NOT NULL, more INTEGER NOT NULL, lag_s INTEGER
);
CREATE TABLE schedule_settings (
  site_id TEXT PRIMARY KEY,
  paused INTEGER NOT NULL,
  paused_by TEXT, paused_at TEXT, paused_reason TEXT,
  daily_write_cap INTEGER NOT NULL,
  rev INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
ALTER TABLE audit ADD COLUMN run_id TEXT;
ALTER TABLE audit ADD COLUMN release_id TEXT;
ALTER TABLE audit ADD COLUMN automation_id TEXT;
CREATE INDEX audit_run ON audit (run_id, at) WHERE run_id IS NOT NULL;
CREATE INDEX audit_automation_day ON audit (automation_id, at) WHERE automation_id IS NOT NULL;
ALTER TABLE approvals ADD COLUMN release_id TEXT;
ALTER TABLE approvals ADD COLUMN run_id TEXT;
`,
};
