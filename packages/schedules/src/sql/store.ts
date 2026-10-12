/**
 * `SqlScheduleStore` — releases, automations, runs, system jobs, the heartbeat and per-site
 * settings over `SqlDriver` (SQLite locally and on Node, D1 on Cloudflare) for the tables of
 * migration `0017_schedules`. Worker-safe; it implements `SchedulerStore` for `runDue`.
 *
 * Writes are single statements or one atomic `batch()` (no interactive transactions, AGENTS.md
 * rule 4). Every composite write is decided by one compare-and-swap, and the other statements of
 * its batch carry the same decision:
 * - **inserts** after a new release are guarded on the release's new content hash (`rl1:`);
 * - **claims** store a fresh random lease token, and every later write of that run (finish,
 *   defer) is guarded on "the row still carries my token" — the token is unique per claim, so it
 *   plays the role of the new content hash, never `rev + 1`;
 * - **dependent rows** (runs, a release's items) are written *before* the CAS statement in the same
 *   batch and guarded on exactly the CAS condition (pre-state and `rev`, or the token), which the
 *   earlier statements cannot change; if the CAS loses, none of them applies.
 * - `release_items.held` is never guarded: it is recomputed from the release's state after every
 *   change (`HELD_SYNC`), so it is right whichever writer won.
 *
 * Every record written is checked with the precompiled contract validators (`assertValid`).
 */
import type {
  Actor,
  Automation,
  AutomationJob,
  AutomationRecurrence,
  Release,
  ReleaseApproval,
  ReleaseOutcome,
  ReleaseState,
  ReleaseWhen,
  ScheduleRun,
  ScheduleRunUsage,
} from "@cloudhal/core-contracts";
import { assertValid } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import {
  assertAutomationTransition,
  CONSECUTIVE_FAILURE_LIMIT,
  firstRunFrom,
} from "../automation.ts";
import { DEFAULT_DAILY_WRITE_CAP, utcDayStart } from "../budget.ts";
import type { TickTrigger } from "../budget-meter.ts";
import { ScheduleConflictError, ScheduleError } from "../errors.ts";
import { newAutomationId, newReleaseId, runId } from "../ids.ts";
import { DEFAULT_MIN_INTERVAL_MINUTES, presetOf, validateRecurrence } from "../recurrence.ts";
import {
  assertReleaseTransition,
  HOLDING_STATES,
  isTerminalRelease,
  MAX_OPEN_RELEASES_PER_SITE,
  type PinnedItem,
  releaseHash,
  TERMINAL_RELEASE_STATES,
} from "../release.ts";
import type {
  ClaimReleaseInput,
  DueAutomation,
  DueRelease,
  Heartbeat,
  RecoverableRelease,
  ReleaseFinish,
  SchedulerStore,
  StoredReleaseItem,
  SystemJobState,
  TickOverview,
} from "../scheduler.ts";
import { plainLine } from "../text.ts";
import { canonicalInstant } from "../time.ts";
import {
  type AutomationRow,
  cursorOf,
  type HeartbeatRow,
  ITEMS_JSON,
  itemsOf,
  type ReleaseRow,
  type RunRow,
  type SystemJobRow,
  toAutomation,
  toHeartbeat,
  toRelease,
  toRun,
  toSystemJob,
} from "./rows.ts";

export interface SqlScheduleStoreOptions {
  /** The clock for `createdAt`/`updatedAt` of people's writes (the scheduler passes `now` itself). */
  now?: () => Date;
}

/** Per-site schedule settings (§4.5, §5.1): outside the graph, so a rollback cannot un-pause a site. */
export interface ScheduleSettings {
  siteId: string;
  /** The site's kill switch (§11.6). */
  paused: boolean;
  pausedBy?: Actor;
  pausedAt?: string;
  pausedReason?: string;
  /** Automation mutations per UTC day (default 200). */
  dailyWriteCap: number;
  /** 0 while the row does not exist (the defaults). */
  rev: number;
  updatedAt?: string;
  updatedBy?: Actor;
}

/** A release with what the store keeps beside the contract. */
export interface ReleaseRecord {
  release: Release;
  items: StoredReleaseItem[];
  executeAt?: string;
  requestId?: string;
  purgePlan?: unknown;
  leaseToken?: string;
  leaseUntil?: string;
}

export interface CreateReleaseInput {
  siteId: string;
  items: readonly PinnedItem[];
  createdBy: Actor;
  title?: string;
  when?: ReleaseWhen;
  metadata?: Record<string, string>;
  /** `planCachePurge(base → target)` per item, computed when pinned (§6.1 step 5). */
  purgePlan?: unknown;
  id?: string;
}

export interface ReleaseChange {
  expectedRev: number;
  to: ReleaseState;
  /** `null` removes it. */
  approval?: ReleaseApproval | null;
  outcome?: ReleaseOutcome | null;
  when?: ReleaseWhen | null;
  requestId?: string | null;
  title?: string | null;
}

export interface CreateAutomationInput {
  siteId: string;
  name: string;
  job: AutomationJob;
  recurrence: Omit<AutomationRecurrence, "preset"> & { preset?: AutomationRecurrence["preset"] };
  owner: Automation["owner"];
  metadata?: Record<string, string>;
  id?: string;
  /** Minutes between runs (default 60, §9.3). */
  minIntervalMinutes?: number;
}

export interface RunQuery {
  subjectId?: string;
  states?: readonly ScheduleRun["state"][];
  limit?: number;
  /** Rows created strictly before this instant (pagination by `createdAt`). */
  before?: string;
}

const HOLDING_SQL = HOLDING_STATES.map((s) => `'${s}'`).join(", ");
const TERMINAL_SQL = TERMINAL_RELEASE_STATES.map((s) => `'${s}'`).join(", ");
/** `release_items.held` recomputed from the release's state (params: release id twice). */
const HELD_SYNC = `UPDATE release_items SET held = CASE WHEN (SELECT state FROM releases WHERE id = ?) IN (${HOLDING_SQL}) THEN 1 ELSE 0 END WHERE release_id = ?`;
const RELEASE_COLUMNS =
  "id, site_id, title, state, hash, when_kind, execute_at, time_zone, local_time, approval, request_id, outcome, purge_plan, lease_token, lease_until, created_by, metadata, rev, created_at, updated_at";
const RUN_COLUMNS =
  "id, site_id, subject_kind, subject_id, occurrence_at, state, outcome, trigger, attempt, lease_token, lease_until, window_opens, window_closes, started_at, ended_at, lateness_s, adjusted, usage, taint, summary, counts, findings, approval_ids, error, rev, created_at, updated_at";

const j = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));

function whenColumns(when: ReleaseWhen | undefined): {
  when_kind: string | null;
  time_zone: string | null;
  local_time: string | null;
  at: string | null;
} {
  if (!when) return { when_kind: null, time_zone: null, local_time: null, at: null };
  if (when.kind === "on-approval")
    return { when_kind: "on-approval", time_zone: null, local_time: null, at: null };
  return {
    when_kind: "at",
    time_zone: when.timeZone,
    local_time: when.localTime ?? null,
    at: canonicalInstant(when.at),
  };
}

/** `when` with its instant in the canonical stored form (what a read gives back). */
function canonicalWhen(when: ReleaseWhen): ReleaseWhen {
  return when.kind === "at" ? { ...when, at: canonicalInstant(when.at) } : when;
}

function itemsPayload(items: readonly PinnedItem[]): string {
  return JSON.stringify(
    items.map((p) => ({
      n: p.item.nodeId,
      o: p.item.kind,
      k: p.item.nodeKind,
      tr: p.item.kind === "set" ? p.item.target.rev : null,
      th: p.item.kind === "set" ? p.item.target.hash : null,
      br: p.item.base?.rev ?? null,
      bh: p.item.base?.hash ?? null,
      d: JSON.stringify([...p.deps]),
      b: p.blobSha ?? null,
    })),
  );
}

/**
 * Inserts a release's items, guarded on the release carrying its new content hash (AGENTS.md rule 4)
 * and this write's `updated_at` (params: id, site, id, items, id, hash, stamp).
 */
const INSERT_ITEMS = `INSERT INTO release_items (release_id, site_id, node_id, op, node_kind, target_rev, target_hash, base_rev, base_hash, deps, blob_sha, held)
SELECT ?, ?, json_extract(value, '$.n'), json_extract(value, '$.o'), json_extract(value, '$.k'), json_extract(value, '$.tr'),
  json_extract(value, '$.th'), json_extract(value, '$.br'), json_extract(value, '$.bh'), json_extract(value, '$.d'), json_extract(value, '$.b'),
  CASE WHEN (SELECT state FROM releases WHERE id = ?) IN (${HOLDING_SQL}) THEN 1 ELSE 0 END
FROM json_each(?) WHERE EXISTS (SELECT 1 FROM releases WHERE id = ? AND hash = ? AND updated_at = ?)`;

function runStateForRelease(finish: ReleaseFinish): {
  state: ScheduleRun["state"];
  outcome: ScheduleRun["outcome"] | null;
  error: ScheduleRun["error"] | null;
} {
  switch (finish.state) {
    case "published":
      return { state: "succeeded", outcome: "did-work", error: null };
    case "missed":
      return { state: "missed", outcome: null, error: null };
    case "conflict":
      return { state: "failed", outcome: "nothing-to-do", error: { code: "conflict" } };
    case "failed":
      return {
        state: "failed",
        outcome: null,
        error: { code: finish.outcome.kind === "failed" ? finish.outcome.code : "failed" },
      };
    case "expired":
      return {
        state: "failed",
        outcome: null,
        error: {
          code: finish.outcome.kind === "expired" ? `expired_${finish.outcome.reason}` : "expired",
        },
      };
    case "canceled":
      return { state: "failed", outcome: null, error: { code: "canceled" } };
  }
}

export class SqlScheduleStore implements SchedulerStore {
  readonly #sql: SqlDriver;
  readonly #now: () => Date;

  constructor(sql: SqlDriver, options: SqlScheduleStoreOptions = {}) {
    this.#sql = sql;
    this.#now = options.now ?? (() => new Date());
  }

  #stamp(): string {
    return this.#now().toISOString();
  }

  // ───────────────────────────── releases ─────────────────────────────

  /** A new `draft` release with its pinned items (§6.1). Items are hashed into `rl1:`. */
  async createRelease(input: CreateReleaseInput): Promise<Release> {
    const open = await this.#sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM releases WHERE site_id = ? AND state NOT IN (${TERMINAL_SQL})`,
      [input.siteId],
    );
    if (Number(open?.n ?? 0) >= MAX_OPEN_RELEASES_PER_SITE)
      throw new ScheduleError(
        "too_many_releases",
        `at most ${MAX_OPEN_RELEASES_PER_SITE} open releases per site`,
      );
    const now = this.#stamp();
    const items = [...input.items].sort((a, b) =>
      a.item.nodeId < b.item.nodeId ? -1 : a.item.nodeId > b.item.nodeId ? 1 : 0,
    );
    const release: Release = {
      schemaVersion: 1,
      id: input.id ?? newReleaseId(),
      siteId: input.siteId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      items: items.map((i) => i.item) as Release["items"],
      ...(input.when ? { when: canonicalWhen(input.when) } : {}),
      state: "draft",
      hash: await releaseHash(
        input.siteId,
        items.map((i) => i.item),
      ),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      rev: 1,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    if (new Set(release.items.map((i) => i.nodeId)).size !== release.items.length)
      throw new ScheduleError("duplicate_item", "a node is in the release twice");
    assertValid("release", release);
    const w = whenColumns(release.when);
    await this.#sql.batch([
      {
        sql: `INSERT INTO releases (${RELEASE_COLUMNS}) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?, 1, ?, ?)`,
        params: [
          release.id,
          release.siteId,
          release.title ?? null,
          release.hash,
          w.when_kind,
          w.at,
          w.time_zone,
          w.local_time,
          j(input.purgePlan),
          JSON.stringify(release.createdBy),
          j(release.metadata),
          now,
          now,
        ],
      },
      {
        sql: INSERT_ITEMS,
        params: [
          release.id,
          release.siteId,
          release.id,
          itemsPayload(items),
          release.id,
          release.hash,
          now,
        ],
      },
    ]);
    return release;
  }

  async getReleaseRecord(siteId: string, id: string): Promise<ReleaseRecord | undefined> {
    const row = await this.#sql.get<ReleaseRow>(
      `SELECT r.*, ${ITEMS_JSON} FROM releases r WHERE r.id = ? AND r.site_id = ?`,
      [id, siteId],
    );
    return row ? this.#record(row) : undefined;
  }

  #record(row: ReleaseRow): ReleaseRecord {
    const items = itemsOf(row);
    return {
      release: toRelease(row, items),
      items,
      ...(row.execute_at ? { executeAt: row.execute_at } : {}),
      ...(row.request_id ? { requestId: row.request_id } : {}),
      ...(row.purge_plan ? { purgePlan: JSON.parse(row.purge_plan) as unknown } : {}),
      ...(row.lease_token ? { leaseToken: row.lease_token } : {}),
      ...(row.lease_until ? { leaseUntil: row.lease_until } : {}),
    };
  }

  async getRelease(siteId: string, id: string): Promise<Release | undefined> {
    return (await this.getReleaseRecord(siteId, id))?.release;
  }

  /** A site's releases in time order (undated drafts last), optionally by state. */
  async listReleases(
    siteId: string,
    options: { states?: readonly ReleaseState[]; limit?: number } = {},
  ): Promise<Release[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const states = options.states ?? [];
    const rows = await this.#sql.all<ReleaseRow>(
      `SELECT r.*, ${ITEMS_JSON} FROM releases r WHERE r.site_id = ?${
        states.length > 0 ? ` AND r.state IN (${states.map(() => "?").join(", ")})` : ""
      } ORDER BY r.execute_at IS NULL, r.execute_at, r.id LIMIT ?`,
      [siteId, ...states, limit],
    );
    return rows.map((r) => toRelease(r, itemsOf(r)));
  }

  /**
   * Moves a release between states (§5.2) with a compare-and-swap on `rev`. The scheduler's own
   * transitions (claim, finish) go through the claim methods; `running` is never entered here.
   */
  async transitionRelease(siteId: string, id: string, change: ReleaseChange): Promise<Release> {
    const rec = await this.getReleaseRecord(siteId, id);
    if (!rec) throw new ScheduleError("not_found", `release ${id} not found`);
    const from = rec.release.state;
    if (rec.release.rev !== change.expectedRev) throw new ScheduleConflictError("release", id);
    if (change.to === "running")
      throw new ScheduleError("invalid_transition", "only the scheduler starts a release (claim)");
    if (from === "running")
      throw new ScheduleError(
        "invalid_transition",
        "a running release finishes on its own in seconds",
      );
    assertReleaseTransition(from, change.to);
    const now = this.#stamp();
    const { approval: _a, outcome: _o, when: _w, title: _t, ...rest } = rec.release;
    const approval =
      change.approval === undefined ? rec.release.approval : (change.approval ?? undefined);
    const outcome =
      change.outcome === undefined
        ? isTerminalRelease(change.to)
          ? rec.release.outcome
          : undefined
        : (change.outcome ?? undefined);
    const when =
      change.when === undefined
        ? rec.release.when
        : change.when
          ? canonicalWhen(change.when)
          : undefined;
    const title = change.title === undefined ? rec.release.title : (change.title ?? undefined);
    const next: Release = {
      ...rest,
      ...(title !== undefined ? { title } : {}),
      ...(when ? { when } : {}),
      state: change.to,
      ...(approval ? { approval } : {}),
      ...(outcome ? { outcome } : {}),
      rev: rec.release.rev + 1,
      updatedAt: now,
    };
    if (next.state === "scheduled" && !next.approval)
      throw new ScheduleError("invalid_transition", "a scheduled release needs an approval");
    if (next.state === "scheduled" && !next.when)
      throw new ScheduleError(
        "invalid_transition",
        "a scheduled release needs a time (or on-approval)",
      );
    if (isTerminalRelease(next.state) && next.outcome?.kind !== next.state)
      throw new ScheduleError(
        "invalid_transition",
        `a ${next.state} release needs a matching outcome`,
      );
    assertValid("release", next);
    const w = whenColumns(next.when);
    // An on-approval release becomes due the moment it is scheduled.
    const executeAt = w.at ?? (next.state === "scheduled" ? now : (rec.executeAt ?? null));
    const requestId = change.requestId === undefined ? (rec.requestId ?? null) : change.requestId;
    const [res] = await this.#sql.batch([
      {
        sql: `UPDATE releases SET title = ?, state = ?, when_kind = ?, execute_at = ?, time_zone = ?, local_time = ?, approval = ?, request_id = ?, outcome = ?, rev = rev + 1, updated_at = ?
              WHERE id = ? AND site_id = ? AND rev = ? AND state = ?`,
        params: [
          next.title ?? null,
          next.state,
          w.when_kind,
          executeAt,
          w.time_zone,
          w.local_time,
          j(next.approval),
          requestId,
          j(next.outcome),
          now,
          id,
          siteId,
          change.expectedRev,
          from,
        ],
      },
      { sql: HELD_SYNC, params: [id, id] },
    ]);
    if ((res?.changes ?? 0) !== 1) throw new ScheduleConflictError("release", id);
    return next;
  }

  /**
   * Re-pins a release's items (§6.4 re-pin; "edit and re-approve"): a new `rl1:` hash, the approval
   * voided. From `draft` or `conflict` the release becomes a `draft`; from `awaiting_approval` or
   * `scheduled` it waits for approval again (S6).
   */
  async repinRelease(
    siteId: string,
    id: string,
    input: { expectedRev: number; items: readonly PinnedItem[]; purgePlan?: unknown },
  ): Promise<Release> {
    const rec = await this.getReleaseRecord(siteId, id);
    if (!rec) throw new ScheduleError("not_found", `release ${id} not found`);
    if (rec.release.rev !== input.expectedRev) throw new ScheduleConflictError("release", id);
    const from = rec.release.state;
    const to: ReleaseState =
      from === "draft" || from === "conflict"
        ? "draft"
        : from === "awaiting_approval" || from === "scheduled"
          ? "awaiting_approval"
          : (() => {
              throw new ScheduleError(
                "invalid_transition",
                `a ${from} release cannot be re-pinned`,
              );
            })();
    const items = [...input.items].sort((a, b) =>
      a.item.nodeId < b.item.nodeId ? -1 : a.item.nodeId > b.item.nodeId ? 1 : 0,
    );
    const hash = await releaseHash(
      siteId,
      items.map((i) => i.item),
    );
    const now = this.#stamp();
    const { approval: _a, outcome: _o, ...rest } = rec.release;
    const next: Release = {
      ...rest,
      items: items.map((i) => i.item) as Release["items"],
      hash,
      state: to,
      rev: rec.release.rev + 1,
      updatedAt: now,
    };
    assertValid("release", next);
    const [res] = await this.#sql.batch([
      {
        sql: `UPDATE releases SET hash = ?, state = ?, approval = NULL, outcome = NULL, request_id = NULL, purge_plan = ?, rev = rev + 1, updated_at = ?
              WHERE id = ? AND site_id = ? AND rev = ? AND state = ?`,
        params: [
          hash,
          to,
          j(input.purgePlan ?? rec.purgePlan),
          now,
          id,
          siteId,
          input.expectedRev,
          from,
        ],
      },
      // Guarded on the new content hash (AGENTS.md rule 4).
      {
        sql: "DELETE FROM release_items WHERE release_id = ? AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND hash = ? AND updated_at = ?)",
        params: [id, id, hash, now],
      },
      { sql: INSERT_ITEMS, params: [id, siteId, id, itemsPayload(items), id, hash, now] },
    ]);
    if ((res?.changes ?? 0) !== 1) throw new ScheduleConflictError("release", id);
    return next;
  }

  /** Withdraws a release (`canceled`). A running release cannot be canceled (§8.5: 409). */
  async cancelRelease(
    siteId: string,
    id: string,
    input: { expectedRev: number; by: Actor },
  ): Promise<Release> {
    return this.transitionRelease(siteId, id, {
      expectedRev: input.expectedRev,
      to: "canceled",
      outcome: { kind: "canceled", at: this.#stamp(), by: input.by },
    });
  }

  /** Nodes held by non-terminal releases (§6.2 locks and holds), node id → release ids. */
  async heldNodes(siteId: string, nodeIds?: readonly string[]): Promise<Map<string, string[]>> {
    const ids = nodeIds ? [...new Set(nodeIds)] : undefined;
    if (ids && ids.length === 0) return new Map();
    const rows = await this.#sql.all<{ node_id: string; release_id: string }>(
      `SELECT node_id, release_id FROM release_items WHERE site_id = ? AND held = 1${
        ids ? ` AND node_id IN (SELECT value FROM json_each(?))` : ""
      } ORDER BY node_id, release_id`,
      ids ? [siteId, JSON.stringify(ids)] : [siteId],
    );
    const out = new Map<string, string[]>();
    for (const r of rows) out.set(r.node_id, [...(out.get(r.node_id) ?? []), r.release_id]);
    return out;
  }

  /** Nodes in two or more non-terminal releases (D15: flagged, not refused). */
  async overlaps(siteId: string): Promise<Map<string, string[]>> {
    const rows = await this.#sql.all<{ node_id: string; ids: string }>(
      `SELECT i.node_id, json_group_array(i.release_id) AS ids FROM release_items i JOIN releases r ON r.id = i.release_id
       WHERE i.site_id = ? AND r.state NOT IN (${TERMINAL_SQL}) GROUP BY i.node_id HAVING COUNT(*) > 1 ORDER BY i.node_id`,
      [siteId],
    );
    return new Map(rows.map((r) => [r.node_id, (JSON.parse(r.ids) as string[]).sort()]));
  }

  /**
   * D5 for one site: releases still `awaiting_approval` at their time become `expired`
   * (`unapproved`). Indexed by `releases_site`; the API calls it when it reads a site's schedule,
   * so the tick never scans releases outside `releases_due`.
   */
  async expireOverdueApprovals(siteId: string, now: string): Promise<number> {
    const at = canonicalInstant(now);
    const outcome = JSON.stringify({ kind: "expired", at, reason: "unapproved" });
    const [, res] = await this.#sql.batch([
      {
        sql: `UPDATE release_items SET held = 0 WHERE site_id = ? AND release_id IN
              (SELECT id FROM releases WHERE site_id = ? AND state = 'awaiting_approval' AND execute_at <= ?)`,
        params: [siteId, siteId, at],
      },
      {
        sql: `UPDATE releases SET state = 'expired', outcome = ?, rev = rev + 1, updated_at = ?
              WHERE site_id = ? AND state = 'awaiting_approval' AND execute_at <= ?`,
        params: [outcome, at, siteId, at],
      },
    ]);
    return res?.changes ?? 0;
  }

  // ───────────────────────────── scheduler: releases ─────────────────────────────

  async overview(_now: string): Promise<TickOverview> {
    const row = await this.#sql.get<
      HeartbeatRow & {
        next_release: string | null;
        next_automation: string | null;
        next_job: string | null;
        jobs: number;
        next_deadline: string | null;
      }
    >(
      `SELECT
         (SELECT MIN(execute_at) FROM releases WHERE state = 'scheduled') AS next_release,
         (SELECT MIN(next_run_at) FROM automations WHERE state = 'active') AS next_automation,
         (SELECT MIN(next_run_at) FROM system_jobs) AS next_job,
         (SELECT COUNT(*) FROM system_jobs) AS jobs,
         (SELECT MIN(CASE WHEN state = 'ready' THEN window_closes ELSE lease_until END) FROM schedule_runs
            WHERE state IN ('ready', 'running')) AS next_deadline,
         h.at, h.trigger, h.next_wake_at, h.ran, h.more, h.lag_s
       FROM (SELECT 1) LEFT JOIN scheduler_heartbeat h ON h.id = 1`,
    );
    const hb = toHeartbeat(row);
    return {
      ...(row?.next_release ? { nextReleaseAt: row.next_release } : {}),
      ...(row?.next_automation ? { nextAutomationAt: row.next_automation } : {}),
      ...(row?.next_job ? { nextSystemJobAt: row.next_job } : {}),
      ...(row?.next_deadline ? { nextRunDeadline: row.next_deadline } : {}),
      systemJobs: Number(row?.jobs ?? 0),
      ...(hb ? { heartbeat: hb } : {}),
    };
  }

  async dueReleases(now: string, limit: number): Promise<DueRelease[]> {
    const rows = await this.#sql.all<ReleaseRow & { site_paused: number }>(
      `SELECT r.*, ${ITEMS_JSON}, COALESCE(s.paused, 0) AS site_paused FROM releases r
       LEFT JOIN schedule_settings s ON s.site_id = r.site_id
       WHERE r.state = 'scheduled' AND r.execute_at <= ? ORDER BY r.execute_at, r.id LIMIT ?`,
      [now, limit],
    );
    return rows.map((row) => {
      const items = itemsOf(row);
      return {
        release: toRelease(row, items),
        items,
        executeAt: String(row.execute_at),
        sitePaused: Number(row.site_paused) === 1,
      };
    });
  }

  async expiredReleaseLeases(now: string, limit: number): Promise<RecoverableRelease[]> {
    const rows = await this.#sql.all<
      ReleaseRow & {
        site_paused: number;
        run_id: string;
        run_attempt: number;
        run_occurrence: string;
      }
    >(
      `SELECT r.*, ${ITEMS_JSON}, COALESCE(s.paused, 0) AS site_paused, x.id AS run_id, x.attempt AS run_attempt, x.occurrence_at AS run_occurrence
       FROM schedule_runs x JOIN releases r ON r.id = x.subject_id AND r.state = 'running' AND r.lease_token = x.lease_token
       LEFT JOIN schedule_settings s ON s.site_id = r.site_id
       WHERE x.state IN ('ready', 'running') AND x.subject_kind = 'release' AND x.lease_until <= ?
       ORDER BY r.execute_at, r.id LIMIT ?`,
      [now, limit],
    );
    return rows.map((row) => {
      const items = itemsOf(row);
      return {
        release: toRelease(row, items),
        items,
        executeAt: String(row.execute_at),
        sitePaused: Number(row.site_paused) === 1,
        run: {
          id: row.run_id,
          attempt: Number(row.run_attempt),
          leaseToken: String(row.lease_token),
          occurrenceAt: row.run_occurrence,
        },
      };
    });
  }

  async claimRelease(input: ClaimReleaseInput): Promise<boolean> {
    const results = await this.#sql.batch([
      {
        // The claim (§8.5): CAS on rev and state, and no other release of the site under a live lease (D15).
        sql: `UPDATE releases SET state = 'running', lease_token = ?, lease_until = ?, rev = rev + 1, updated_at = ?
              WHERE id = ? AND site_id = ? AND rev = ? AND state = 'scheduled'
              AND NOT EXISTS (SELECT 1 FROM releases o WHERE o.site_id = ? AND o.state = 'running' AND o.lease_until > ?)`,
        params: [
          input.token,
          input.leaseUntil,
          input.now,
          input.releaseId,
          input.siteId,
          input.expectedRev,
          input.siteId,
          input.now,
        ],
      },
      {
        // The run row, keyed by the occurrence; guarded on our token (unique per claim).
        sql: `INSERT INTO schedule_runs (${RUN_COLUMNS})
              SELECT ?, ?, 'release', ?, ?, 'running', NULL, ?, 1, ?, ?, NULL, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, ?, ?
              WHERE EXISTS (SELECT 1 FROM releases WHERE id = ? AND lease_token = ?)
              ON CONFLICT(id) DO UPDATE SET state = 'running', trigger = excluded.trigger, attempt = schedule_runs.attempt + 1,
                lease_token = excluded.lease_token, lease_until = excluded.lease_until, started_at = excluded.started_at,
                ended_at = NULL, lateness_s = excluded.lateness_s, adjusted = excluded.adjusted, error = NULL,
                rev = schedule_runs.rev + 1, updated_at = excluded.updated_at`,
        params: [
          input.runId,
          input.siteId,
          input.releaseId,
          canonicalInstant(input.executeAt),
          input.trigger,
          input.token,
          input.leaseUntil,
          input.now,
          input.latenessSeconds,
          input.adjusted ?? null,
          input.now,
          input.now,
          input.releaseId,
          input.token,
        ],
      },
    ]);
    return (results[0]?.changes ?? 0) === 1;
  }

  async reclaimRelease(input: {
    releaseId: string;
    runId: string;
    oldToken: string;
    token: string;
    now: string;
    leaseUntil: string;
    trigger: TickTrigger;
    latenessSeconds: number;
  }): Promise<boolean> {
    const results = await this.#sql.batch([
      {
        sql: `UPDATE releases SET lease_token = ?, lease_until = ?, rev = rev + 1, updated_at = ?
              WHERE id = ? AND state = 'running' AND lease_token = ? AND lease_until <= ?`,
        params: [
          input.token,
          input.leaseUntil,
          input.now,
          input.releaseId,
          input.oldToken,
          input.now,
        ],
      },
      {
        sql: `UPDATE schedule_runs SET lease_token = ?, lease_until = ?, attempt = attempt + 1, trigger = ?, lateness_s = ?, error = NULL,
              rev = rev + 1, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND lease_token = ?)`,
        params: [
          input.token,
          input.leaseUntil,
          input.trigger,
          input.latenessSeconds,
          input.now,
          input.runId,
          input.releaseId,
          input.token,
        ],
      },
    ]);
    return (results[0]?.changes ?? 0) === 1;
  }

  /**
   * The statements that end a claimed release (§6.3 statements 5–7), each guarded on the lease
   * token and, optionally, on `guard` — the site CAS of `publishRelease`, which appends these to its
   * own batch (`EXISTS (SELECT 1 FROM nodes WHERE id = :site AND hash = :hash')`). The release row
   * is updated last.
   */
  releaseFinishStatements(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    latenessSeconds: number;
    finish: ReleaseFinish;
    guard?: SqlStatement;
  }): SqlStatement[] {
    const extra = input.guard ? ` AND ${input.guard.sql}` : "";
    const extraParams: readonly SqlValue[] = input.guard?.params ?? [];
    const owned =
      "EXISTS (SELECT 1 FROM releases WHERE id = ? AND lease_token = ? AND state = 'running')";
    const run = runStateForRelease(input.finish);
    return [
      {
        sql: `UPDATE schedule_runs SET state = ?, outcome = ?, error = ?, ended_at = ?, lateness_s = ?, lease_until = NULL, rev = rev + 1, updated_at = ?
              WHERE id = ? AND lease_token = ? AND ${owned}${extra}`,
        params: [
          run.state,
          run.outcome ?? null,
          j(run.error),
          input.now,
          input.latenessSeconds,
          input.now,
          input.runId,
          input.token,
          input.releaseId,
          input.token,
          ...extraParams,
        ],
      },
      {
        sql: `UPDATE release_items SET held = 0 WHERE release_id = ? AND ${owned}${extra}`,
        params: [input.releaseId, input.releaseId, input.token, ...extraParams],
      },
      {
        sql: `UPDATE releases SET state = ?, outcome = ?, lease_token = NULL, lease_until = NULL, rev = rev + 1, updated_at = ?
              WHERE id = ? AND lease_token = ? AND state = 'running'${extra}`,
        params: [
          input.finish.state,
          JSON.stringify(input.finish.outcome),
          input.now,
          input.releaseId,
          input.token,
          ...extraParams,
        ],
      },
    ];
  }

  async finishRelease(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    latenessSeconds: number;
    finish: ReleaseFinish;
  }): Promise<boolean> {
    const results = await this.#sql.batch(this.releaseFinishStatements(input));
    return (results[results.length - 1]?.changes ?? 0) === 1;
  }

  async deferRelease(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    retryAt: string;
    error: string;
  }): Promise<boolean> {
    const results = await this.#sql.batch([
      {
        sql: `UPDATE schedule_runs SET lease_until = ?, error = ?, rev = rev + 1, updated_at = ?
              WHERE id = ? AND lease_token = ? AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND lease_token = ? AND state = 'running')`,
        params: [
          input.retryAt,
          JSON.stringify({
            code: "transient",
            message: plainLine(input.error),
          }),
          input.now,
          input.runId,
          input.token,
          input.releaseId,
          input.token,
        ],
      },
      {
        sql: "UPDATE releases SET lease_until = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND lease_token = ? AND state = 'running'",
        params: [input.retryAt, input.now, input.releaseId, input.token],
      },
    ]);
    return (results[1]?.changes ?? 0) === 1;
  }

  async settleRelease(input: {
    siteId: string;
    releaseId: string;
    expectedRev: number;
    executeAt: string;
    now: string;
    outcome: ReleaseOutcome & { kind: "missed" | "expired" };
    trigger: TickTrigger;
  }): Promise<boolean> {
    const pre = "EXISTS (SELECT 1 FROM releases WHERE id = ? AND rev = ? AND state = 'scheduled')";
    const statements: SqlStatement[] = [];
    if (input.outcome.kind === "missed") {
      const id = await runId(input.releaseId, input.executeAt);
      statements.push({
        sql: `INSERT OR IGNORE INTO schedule_runs (${RUN_COLUMNS})
              SELECT ?, ?, 'release', ?, ?, 'missed', NULL, ?, 1, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, ?, ?
              WHERE ${pre}`,
        params: [
          id,
          input.siteId,
          input.releaseId,
          canonicalInstant(input.executeAt),
          input.trigger,
          input.now,
          input.outcome.latenessSeconds,
          input.now,
          input.now,
          input.releaseId,
          input.expectedRev,
        ],
      });
    }
    statements.push(
      {
        sql: `UPDATE release_items SET held = 0 WHERE release_id = ? AND ${pre}`,
        params: [input.releaseId, input.releaseId, input.expectedRev],
      },
      {
        sql: `UPDATE releases SET state = ?, outcome = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND site_id = ? AND rev = ? AND state = 'scheduled'`,
        params: [
          input.outcome.kind,
          JSON.stringify(input.outcome),
          input.now,
          input.releaseId,
          input.siteId,
          input.expectedRev,
        ],
      },
    );
    const results = await this.#sql.batch(statements);
    return (results[results.length - 1]?.changes ?? 0) === 1;
  }

  async moveRelease(input: {
    siteId: string;
    releaseId: string;
    expectedRev: number;
    at: string;
    now: string;
  }): Promise<boolean> {
    const res = await this.#sql.run(
      `UPDATE releases SET execute_at = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND site_id = ? AND rev = ? AND state = 'scheduled'`,
      [canonicalInstant(input.at), input.now, input.releaseId, input.siteId, input.expectedRev],
    );
    return res.changes === 1;
  }

  // ───────────────────────────── automations ─────────────────────────────

  /** A new `active` automation (people only, §11.2); its first run is the first occurrence from now. */
  async createAutomation(input: CreateAutomationInput): Promise<Automation> {
    const now = this.#stamp();
    validateRecurrence(input.recurrence, {
      minIntervalMinutes: input.minIntervalMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES,
    });
    const recurrence: AutomationRecurrence = {
      start: input.recurrence.start,
      timeZone: input.recurrence.timeZone,
      ...(input.recurrence.rule !== undefined ? { rule: input.recurrence.rule } : {}),
      preset: input.recurrence.preset ?? presetOf(input.recurrence.rule, input.recurrence.start),
    };
    const first = firstRunFrom(recurrence, now);
    const automation: Automation = {
      schemaVersion: 1,
      id: input.id ?? newAutomationId(),
      siteId: input.siteId,
      name: input.name,
      job: input.job,
      recurrence,
      state: first ? "active" : "ended",
      consecutiveFailures: 0,
      owner: input.owner,
      ...(first ? { nextRunAt: first.at } : {}),
      createdAt: now,
      updatedAt: now,
      rev: 1,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    assertValid("automation", automation);
    await this.#sql.run(
      `INSERT INTO automations (id, site_id, name, job, key_id, start_local, time_zone, rule, preset, state, paused_reason, consecutive_failures,
        owner_id, owner_name, next_run_at, cursor, lease_token, lease_until, metadata, rev, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, NULL, NULL, NULL, ?, 1, ?, ?)`,
      [
        automation.id,
        automation.siteId,
        automation.name,
        JSON.stringify(automation.job),
        automation.job.kind === "agent-task" ? automation.job.keyId : null,
        recurrence.start,
        recurrence.timeZone,
        recurrence.rule ?? null,
        recurrence.preset,
        automation.state,
        automation.owner.id,
        automation.owner.name ?? null,
        automation.nextRunAt ?? null,
        j(automation.metadata),
        now,
        now,
      ],
    );
    return automation;
  }

  async getAutomation(siteId: string, id: string): Promise<Automation | undefined> {
    const row = await this.#sql.get<AutomationRow>(
      "SELECT * FROM automations WHERE id = ? AND site_id = ?",
      [id, siteId],
    );
    return row ? toAutomation(row) : undefined;
  }

  async listAutomations(siteId: string): Promise<Automation[]> {
    const rows = await this.#sql.all<AutomationRow>(
      "SELECT * FROM automations WHERE site_id = ? ORDER BY name, id",
      [siteId],
    );
    return rows.map(toAutomation);
  }

  /**
   * Pause, resume, break or end an automation (§5.3) with a CAS on `rev`. Leaving `active` kills
   * its open runs; resuming resets the failure count and plans the next run from now.
   */
  async transitionAutomation(
    siteId: string,
    id: string,
    change: {
      expectedRev: number;
      to: Automation["state"];
      pausedReason?: NonNullable<Automation["pausedReason"]>;
    },
  ): Promise<Automation> {
    const current = await this.getAutomation(siteId, id);
    if (!current) throw new ScheduleError("not_found", `automation ${id} not found`);
    if (current.rev !== change.expectedRev) throw new ScheduleConflictError("automation", id);
    assertAutomationTransition(current.state, change.to);
    const now = this.#stamp();
    const { pausedReason: _p, nextRunAt: _n, ...rest } = current;
    let nextRunAt: string | undefined = current.nextRunAt;
    let state = change.to;
    if (change.to === "active") {
      nextRunAt = firstRunFrom(current.recurrence, now)?.at;
      if (!nextRunAt) state = "ended";
    }
    if (state === "ended") nextRunAt = undefined;
    const pausedReason = state === "active" || state === "ended" ? undefined : change.pausedReason;
    if ((state === "paused" || state === "auto-paused" || state === "broken") && !pausedReason)
      throw new ScheduleError("invalid_transition", `a ${state} automation needs a pausedReason`);
    const next: Automation = {
      ...rest,
      state,
      ...(pausedReason ? { pausedReason } : {}),
      ...(change.to === "active" ? { consecutiveFailures: 0 } : {}),
      ...(nextRunAt ? { nextRunAt } : {}),
      rev: current.rev + 1,
      updatedAt: now,
    };
    assertValid("automation", next);
    const pre = "EXISTS (SELECT 1 FROM automations WHERE id = ? AND rev = ? AND state = ?)";
    const statements: SqlStatement[] = [];
    if (current.state === "active" && state !== "active")
      statements.push({
        sql: `UPDATE schedule_runs SET state = 'killed', ended_at = ?, lease_until = NULL, rev = rev + 1, updated_at = ?
              WHERE subject_id = ? AND state IN ('due', 'ready', 'running') AND ${pre}`,
        params: [now, now, id, id, change.expectedRev, current.state],
      });
    statements.push({
      sql: `UPDATE automations SET state = ?, paused_reason = ?, consecutive_failures = ?, next_run_at = ?, cursor = CASE WHEN ? = 'active' THEN cursor ELSE NULL END,
            lease_token = NULL, lease_until = NULL, rev = rev + 1, updated_at = ? WHERE id = ? AND site_id = ? AND rev = ? AND state = ?`,
      params: [
        next.state,
        next.pausedReason ?? null,
        next.consecutiveFailures,
        next.nextRunAt ?? null,
        next.state,
        now,
        id,
        siteId,
        change.expectedRev,
        current.state,
      ],
    });
    const results = await this.#sql.batch(statements);
    if ((results[results.length - 1]?.changes ?? 0) !== 1)
      throw new ScheduleConflictError("automation", id);
    return next;
  }

  // ───────────────────────────── scheduler: automations ─────────────────────────────

  async dueAutomations(now: string, limit: number): Promise<DueAutomation[]> {
    const rows = await this.#sql.all<AutomationRow & { site_paused: number }>(
      `SELECT a.*, COALESCE(s.paused, 0) AS site_paused FROM automations a LEFT JOIN schedule_settings s ON s.site_id = a.site_id
       WHERE a.state = 'active' AND a.next_run_at <= ? ORDER BY a.next_run_at, a.id LIMIT ?`,
      [now, limit],
    );
    return rows.map((row) => {
      const cursor = cursorOf(row);
      return {
        automation: toAutomation(row),
        sitePaused: Number(row.site_paused) === 1,
        ...(cursor ? { cursor } : {}),
        ...(row.lease_until ? { leaseUntil: row.lease_until } : {}),
      };
    });
  }

  async claimBuiltinRun(input: {
    automation: Automation;
    occurrence: { at: string; adjusted?: "dst-gap" };
    runId: string;
    attempt: number;
    continuing: boolean;
    coalesced?: { runId: string; occurrenceAt: string; count: number };
    token: string;
    now: string;
    leaseUntil: string;
    trigger: TickTrigger;
    latenessSeconds: number;
  }): Promise<boolean> {
    const a = input.automation;
    const cond =
      "id = ? AND rev = ? AND state = 'active' AND (lease_until IS NULL OR lease_until <= ?)";
    const condParams = [a.id, a.rev, input.now];
    const pre = `EXISTS (SELECT 1 FROM automations WHERE ${cond})`;
    const statements: SqlStatement[] = [];
    if (input.coalesced)
      statements.push({
        sql: `INSERT OR IGNORE INTO schedule_runs (${RUN_COLUMNS})
              SELECT ?, ?, 'builtin', ?, ?, 'skipped', NULL, ?, 1, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL, 1, ?, ?
              WHERE ${pre}`,
        params: [
          input.coalesced.runId,
          a.siteId,
          a.id,
          canonicalInstant(input.coalesced.occurrenceAt),
          input.trigger,
          input.now,
          JSON.stringify({ coalesced: input.coalesced.count }),
          input.now,
          input.now,
          ...condParams,
        ],
      });
    if (!input.continuing)
      statements.push({
        sql: `INSERT OR IGNORE INTO schedule_runs (${RUN_COLUMNS})
              SELECT ?, ?, 'builtin', ?, ?, 'running', NULL, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, ?, ?
              WHERE ${pre}`,
        params: [
          input.runId,
          a.siteId,
          a.id,
          canonicalInstant(input.occurrence.at),
          input.trigger,
          input.attempt,
          input.now,
          input.latenessSeconds,
          input.occurrence.adjusted ?? null,
          input.now,
          input.now,
          ...condParams,
        ],
      });
    statements.push({
      sql: `UPDATE automations SET lease_token = ?, lease_until = ?, rev = rev + 1, updated_at = ? WHERE ${cond}`,
      params: [input.token, input.leaseUntil, input.now, ...condParams],
    });
    const results = await this.#sql.batch(statements);
    return (results[results.length - 1]?.changes ?? 0) === 1;
  }

  async finishBuiltinRun(
    input: Parameters<SchedulerStore["finishBuiltinRun"]>[0],
  ): Promise<boolean> {
    const a = input.automation;
    const owned = "EXISTS (SELECT 1 FROM automations WHERE id = ? AND lease_token = ?)";
    if (!input.step.done) {
      const res = await this.#sql.run(
        `UPDATE automations SET cursor = ?, lease_token = NULL, lease_until = NULL, rev = rev + 1, updated_at = ? WHERE id = ? AND lease_token = ?`,
        [JSON.stringify(input.step.cursor), input.now, a.id, input.token],
      );
      return res.changes === 1;
    }
    const step = input.step;
    const nextState = step.pause ? step.pause.state : step.nextRunAt ? "active" : "ended";
    const results = await this.#sql.batch([
      {
        sql: `UPDATE schedule_runs SET state = ?, outcome = ?, summary = ?, counts = ?, findings = ?, error = ?, ended_at = ?, rev = rev + 1, updated_at = ?
              WHERE id = ? AND state = 'running' AND ${owned}`,
        params: [
          step.run.state,
          step.run.outcome ?? null,
          step.run.summary ?? null,
          j(step.run.counts),
          j(step.run.findings),
          j(step.run.error),
          input.now,
          input.now,
          input.runId,
          a.id,
          input.token,
        ],
      },
      {
        // A person may have paused it meanwhile: only an `active` automation changes state here.
        sql: `UPDATE automations SET cursor = NULL, lease_token = NULL, lease_until = NULL, next_run_at = ?, consecutive_failures = ?,
              state = CASE WHEN state = 'active' THEN ? ELSE state END,
              paused_reason = CASE WHEN state = 'active' THEN ? ELSE paused_reason END,
              rev = rev + 1, updated_at = ? WHERE id = ? AND lease_token = ?`,
        params: [
          step.nextRunAt ?? null,
          step.consecutiveFailures,
          nextState,
          step.pause?.pausedReason ?? null,
          input.now,
          a.id,
          input.token,
        ],
      },
    ]);
    return (results[1]?.changes ?? 0) === 1;
  }

  async recordAgentOccurrence(
    input: Parameters<SchedulerStore["recordAgentOccurrence"]>[0],
  ): Promise<boolean> {
    const a = input.automation;
    const cond = "id = ? AND rev = ? AND state = 'active' AND next_run_at = ?";
    const condParams = [a.id, a.rev, a.nextRunAt ?? null];
    const nextState = input.pause ? input.pause.state : input.nextRunAt ? "active" : "ended";
    const results = await this.#sql.batch([
      {
        sql: `INSERT OR IGNORE INTO schedule_runs (${RUN_COLUMNS})
              SELECT ?, ?, 'agent-task', ?, ?, ?, NULL, ?, 1, NULL, NULL, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, ?, ?
              WHERE EXISTS (SELECT 1 FROM automations WHERE ${cond})`,
        params: [
          input.runId,
          a.siteId,
          a.id,
          canonicalInstant(input.occurrence.at),
          input.state,
          input.trigger,
          input.window.opensAt,
          input.window.closesAt,
          input.state === "missed" ? input.now : null,
          input.latenessSeconds,
          input.occurrence.adjusted ?? null,
          input.now,
          input.now,
          ...condParams,
        ],
      },
      {
        sql: `UPDATE automations SET next_run_at = ?, consecutive_failures = ?, state = ?, paused_reason = ?, rev = rev + 1, updated_at = ? WHERE ${cond}`,
        params: [
          input.nextRunAt ?? null,
          input.consecutiveFailures,
          nextState,
          input.pause?.pausedReason ?? null,
          input.now,
          ...condParams,
        ],
      },
    ]);
    return (results[1]?.changes ?? 0) === 1;
  }

  /**
   * `begin_run` (§11.2; the MCP tool is rollout step 10): the occurrence's `ready` row becomes
   * `running` while its window is open; `endsAt` is the run's lease. False when the window is not
   * open or another call began it (one run per occurrence).
   */
  async beginAgentRun(input: {
    siteId: string;
    runId: string;
    now: string;
    endsAt: string;
  }): Promise<boolean> {
    const res = await this.#sql.run(
      `UPDATE schedule_runs SET state = 'running', started_at = ?, lease_until = ?, usage = ?, rev = rev + 1, updated_at = ?
       WHERE id = ? AND site_id = ? AND state = 'ready' AND window_opens <= ? AND window_closes > ?`,
      [
        input.now,
        input.endsAt,
        JSON.stringify({ toolCalls: 0, writes: 0, approvalRequests: 0 }),
        input.now,
        input.runId,
        input.siteId,
        input.now,
        input.now,
      ],
    );
    return res.changes === 1;
  }

  /** `end_run` (§11.2): `succeeded` with the agent's summary; the failure count resets. */
  async endAgentRun(input: {
    siteId: string;
    runId: string;
    now: string;
    summary?: string;
    outcome: NonNullable<ScheduleRun["outcome"]>;
    usage?: ScheduleRunUsage;
  }): Promise<boolean> {
    const results = await this.#sql.batch([
      {
        sql: `UPDATE automations SET consecutive_failures = 0, rev = rev + 1, updated_at = ?
              WHERE id = (SELECT subject_id FROM schedule_runs WHERE id = ? AND site_id = ? AND state = 'running' AND subject_kind = 'agent-task')`,
        params: [input.now, input.runId, input.siteId],
      },
      {
        sql: `UPDATE schedule_runs SET state = 'succeeded', outcome = ?, summary = ?, usage = COALESCE(?, usage), ended_at = ?, lease_until = NULL, rev = rev + 1, updated_at = ?
              WHERE id = ? AND site_id = ? AND state = 'running' AND subject_kind = 'agent-task'`,
        params: [
          input.outcome,
          input.summary ?? null,
          j(input.usage),
          input.now,
          input.now,
          input.runId,
          input.siteId,
        ],
      },
    ]);
    return (results[1]?.changes ?? 0) === 1;
  }

  async closeExpiredRuns(now: string): Promise<{ missed: number; failed: number }> {
    const expired = `SELECT subject_id FROM schedule_runs WHERE state IN ('ready', 'running') AND subject_kind = 'agent-task'
      AND ((state = 'ready' AND window_closes <= ?) OR (state = 'running' AND lease_until <= ?))`;
    const results = await this.#sql.batch([
      {
        sql: `UPDATE automations SET consecutive_failures = consecutive_failures + 1, rev = rev + 1, updated_at = ? WHERE id IN (${expired})`,
        params: [now, now, now],
      },
      {
        sql: `UPDATE automations SET state = 'auto-paused', paused_reason = 'failures', rev = rev + 1, updated_at = ?
              WHERE state = 'active' AND consecutive_failures >= ? AND id IN (${expired})`,
        params: [now, CONSECUTIVE_FAILURE_LIMIT, now, now],
      },
      {
        sql: `UPDATE schedule_runs SET state = 'missed', ended_at = ?, rev = rev + 1, updated_at = ?
              WHERE state IN ('ready', 'running') AND state = 'ready' AND subject_kind = 'agent-task' AND window_closes <= ?`,
        params: [now, now, now],
      },
      {
        sql: `UPDATE schedule_runs SET state = 'failed', error = '{"code":"not_ended"}', ended_at = ?, lease_until = NULL, rev = rev + 1, updated_at = ?
              WHERE state IN ('ready', 'running') AND state = 'running' AND subject_kind = 'agent-task' AND lease_until <= ?`,
        params: [now, now, now],
      },
    ]);
    return { missed: results[2]?.changes ?? 0, failed: results[3]?.changes ?? 0 };
  }

  // ───────────────────────────── runs ─────────────────────────────

  async getRun(siteId: string, id: string): Promise<ScheduleRun | undefined> {
    const row = await this.#sql.get<RunRow>(
      "SELECT * FROM schedule_runs WHERE id = ? AND site_id = ?",
      [id, siteId],
    );
    return row ? toRun(row) : undefined;
  }

  /** Newest first; by subject and state when given. */
  async listRuns(siteId: string, query: RunQuery = {}): Promise<ScheduleRun[]> {
    const where = ["site_id = ?"];
    const params: SqlValue[] = [siteId];
    if (query.subjectId) {
      where.push("subject_id = ?");
      params.push(query.subjectId);
    }
    if (query.states && query.states.length > 0) {
      where.push(`state IN (${query.states.map(() => "?").join(", ")})`);
      params.push(...query.states);
    }
    if (query.before) {
      where.push("created_at < ?");
      params.push(query.before);
    }
    params.push(Math.min(Math.max(query.limit ?? 50, 1), 200));
    const rows = await this.#sql.all<RunRow>(
      `SELECT * FROM schedule_runs WHERE ${where.join(" AND ")} ORDER BY created_at DESC, occurrence_at DESC, id LIMIT ?`,
      params,
    );
    return rows.map(toRun);
  }

  /** A run's findings (Studio only, ≤ 200). */
  async runFindings(siteId: string, id: string): Promise<unknown[]> {
    const row = await this.#sql.get<{ findings: string | null }>(
      "SELECT findings FROM schedule_runs WHERE id = ? AND site_id = ?",
      [id, siteId],
    );
    return row?.findings ? (JSON.parse(row.findings) as unknown[]) : [];
  }

  /** A run's usage, counted from audit and approval rows (§11.5; no counter columns). */
  async runUsage(siteId: string, runId: string): Promise<ScheduleRunUsage> {
    const row = await this.#sql.get<{ calls: number; writes: number; requests: number }>(
      `SELECT (SELECT COUNT(*) FROM audit WHERE run_id = ?) AS calls,
              (SELECT COUNT(*) FROM audit WHERE run_id = ? AND snapshot_id IS NOT NULL) AS writes,
              (SELECT COUNT(*) FROM approvals WHERE site_id = ? AND run_id = ?) AS requests`,
      [runId, runId, siteId, runId],
    );
    return {
      toolCalls: Number(row?.calls ?? 0),
      writes: Number(row?.writes ?? 0),
      approvalRequests: Number(row?.requests ?? 0),
    };
  }

  /** Automation mutations (audit rows with a snapshot) on the site since midnight UTC (§11.5). */
  async automationWritesToday(siteId: string, now: string): Promise<number> {
    const row = await this.#sql.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit WHERE site_id = ? AND at >= ? AND automation_id IS NOT NULL AND snapshot_id IS NOT NULL`,
      [siteId, utcDayStart(now)],
    );
    return Number(row?.n ?? 0);
  }

  // ───────────────────────────── settings and the kill switch ─────────────────────────────

  async settings(siteId: string): Promise<ScheduleSettings> {
    const row = await this.#sql.get<{
      paused: number;
      paused_by: string | null;
      paused_at: string | null;
      paused_reason: string | null;
      daily_write_cap: number;
      rev: number;
      updated_at: string;
      updated_by: string;
    }>("SELECT * FROM schedule_settings WHERE site_id = ?", [siteId]);
    if (!row) return { siteId, paused: false, dailyWriteCap: DEFAULT_DAILY_WRITE_CAP, rev: 0 };
    return {
      siteId,
      paused: Number(row.paused) === 1,
      ...(row.paused_by ? { pausedBy: JSON.parse(row.paused_by) as Actor } : {}),
      ...(row.paused_at ? { pausedAt: row.paused_at } : {}),
      ...(row.paused_reason ? { pausedReason: row.paused_reason } : {}),
      dailyWriteCap: Number(row.daily_write_cap),
      rev: Number(row.rev),
      updatedAt: row.updated_at,
      updatedBy: JSON.parse(row.updated_by) as Actor,
    };
  }

  /**
   * Changes the kill switch or the daily cap (CAS on `rev`; 0 = no row yet). Pausing pauses every
   * `active` automation of the site (`kill-switch`) and kills open automation runs; due releases
   * wait (and become `missed` after an hour). Resuming resumes exactly the automations the switch
   * paused, planned from now.
   */
  async putSettings(
    siteId: string,
    input: { paused?: boolean; reason?: string; dailyWriteCap?: number },
    options: { expectedRev: number; by: Actor },
  ): Promise<ScheduleSettings> {
    const current = await this.settings(siteId);
    if (current.rev !== options.expectedRev) throw new ScheduleConflictError("settings", siteId);
    const cap = input.dailyWriteCap ?? current.dailyWriteCap;
    if (!Number.isInteger(cap) || cap < 0 || cap > 100_000)
      throw new ScheduleError(
        "invalid_settings",
        "dailyWriteCap must be an integer from 0 to 100000",
      );
    const now = this.#stamp();
    const paused = input.paused ?? current.paused;
    const pausing = paused && !current.paused;
    const resuming = !paused && current.paused;
    const next: ScheduleSettings = {
      siteId,
      paused,
      ...(paused
        ? pausing
          ? {
              pausedBy: options.by,
              pausedAt: now,
              ...(input.reason ? { pausedReason: input.reason.slice(0, 500) } : {}),
            }
          : {
              ...(current.pausedBy ? { pausedBy: current.pausedBy } : {}),
              ...(current.pausedAt ? { pausedAt: current.pausedAt } : {}),
              ...(current.pausedReason ? { pausedReason: current.pausedReason } : {}),
            }
        : {}),
      dailyWriteCap: cap,
      rev: current.rev + 1,
      updatedAt: now,
      updatedBy: options.by,
    };
    const pre =
      current.rev === 0
        ? "NOT EXISTS (SELECT 1 FROM schedule_settings WHERE site_id = ?)"
        : "EXISTS (SELECT 1 FROM schedule_settings WHERE site_id = ? AND rev = ?)";
    const preParams: SqlValue[] = current.rev === 0 ? [siteId] : [siteId, current.rev];
    const statements: SqlStatement[] = [];
    if (pausing) {
      statements.push(
        {
          sql: `UPDATE schedule_runs SET state = 'killed', ended_at = ?, lease_until = NULL, rev = rev + 1, updated_at = ?
                WHERE site_id = ? AND subject_kind IN ('builtin', 'agent-task') AND state IN ('due', 'ready', 'running') AND ${pre}`,
          params: [now, now, siteId, ...preParams],
        },
        {
          sql: `UPDATE automations SET state = 'paused', paused_reason = 'kill-switch', cursor = NULL, lease_token = NULL, lease_until = NULL, rev = rev + 1, updated_at = ?
                WHERE site_id = ? AND state = 'active' AND ${pre}`,
          params: [now, siteId, ...preParams],
        },
      );
    }
    if (resuming) {
      const rows = await this.#sql.all<AutomationRow>(
        "SELECT * FROM automations WHERE site_id = ? AND state = 'paused' AND paused_reason = 'kill-switch'",
        [siteId],
      );
      for (const row of rows) {
        const a = toAutomation(row);
        const first = firstRunFrom(a.recurrence, now);
        statements.push({
          sql: `UPDATE automations SET state = ?, paused_reason = NULL, next_run_at = ?, rev = rev + 1, updated_at = ?
                WHERE id = ? AND state = 'paused' AND paused_reason = 'kill-switch' AND ${pre}`,
          params: [first ? "active" : "ended", first?.at ?? null, now, a.id, ...preParams],
        });
      }
    }
    statements.push(
      current.rev === 0
        ? {
            sql: `INSERT INTO schedule_settings (site_id, paused, paused_by, paused_at, paused_reason, daily_write_cap, rev, updated_at, updated_by)
                  SELECT ?, ?, ?, ?, ?, ?, 1, ?, ? WHERE ${pre}`,
            params: [
              siteId,
              paused ? 1 : 0,
              j(next.pausedBy),
              next.pausedAt ?? null,
              next.pausedReason ?? null,
              cap,
              now,
              JSON.stringify(options.by),
              ...preParams,
            ],
          }
        : {
            sql: `UPDATE schedule_settings SET paused = ?, paused_by = ?, paused_at = ?, paused_reason = ?, daily_write_cap = ?, rev = rev + 1, updated_at = ?, updated_by = ?
                  WHERE site_id = ? AND rev = ?`,
            params: [
              paused ? 1 : 0,
              j(next.pausedBy),
              next.pausedAt ?? null,
              next.pausedReason ?? null,
              cap,
              now,
              JSON.stringify(options.by),
              siteId,
              current.rev,
            ],
          },
    );
    const results = await this.#sql.batch(statements);
    if ((results[results.length - 1]?.changes ?? 0) !== 1)
      throw new ScheduleConflictError("settings", siteId);
    return next;
  }

  // ───────────────────────────── system jobs and heartbeat ─────────────────────────────

  async ensureSystemJobs(jobs: readonly { name: string; nextRunAt: string }[]): Promise<void> {
    if (jobs.length === 0) return;
    await this.#sql.run(
      `INSERT OR IGNORE INTO system_jobs (name, next_run_at) SELECT json_extract(value, '$.name'), json_extract(value, '$.next') FROM json_each(?)`,
      [JSON.stringify(jobs.map((x) => ({ name: x.name, next: canonicalInstant(x.nextRunAt) })))],
    );
  }

  async systemJobs(): Promise<SystemJobState[]> {
    return (await this.#sql.all<SystemJobRow>("SELECT * FROM system_jobs ORDER BY name")).map(
      toSystemJob,
    );
  }

  async dueSystemJobs(now: string): Promise<SystemJobState[]> {
    const rows = await this.#sql.all<SystemJobRow>(
      "SELECT * FROM system_jobs WHERE next_run_at <= ? AND (lease_until IS NULL OR lease_until <= ?) ORDER BY next_run_at, name",
      [now, now],
    );
    return rows.map(toSystemJob);
  }

  async claimSystemJob(input: {
    name: string;
    token: string;
    now: string;
    leaseUntil: string;
  }): Promise<boolean> {
    const res = await this.#sql.run(
      `UPDATE system_jobs SET lease_token = ?, lease_until = ?, last_run_at = ?
       WHERE name = ? AND next_run_at <= ? AND (lease_until IS NULL OR lease_until <= ?)`,
      [input.token, input.leaseUntil, input.now, input.name, input.now, input.now],
    );
    return res.changes === 1;
  }

  async finishSystemJob(input: {
    name: string;
    token: string;
    now: string;
    ok: boolean;
    nextRunAt: string;
    error?: string;
  }): Promise<boolean> {
    const res = await this.#sql.run(
      `UPDATE system_jobs SET next_run_at = ?, lease_token = NULL, lease_until = NULL,
         last_ok_at = CASE WHEN ? = 1 THEN ? ELSE last_ok_at END, last_error = ?
       WHERE name = ? AND lease_token = ?`,
      [
        canonicalInstant(input.nextRunAt),
        input.ok ? 1 : 0,
        input.now,
        input.ok ? null : (input.error ?? "error"),
        input.name,
        input.token,
      ],
    );
    return res.changes === 1;
  }

  async heartbeat(): Promise<Heartbeat | undefined> {
    return toHeartbeat(
      await this.#sql.get<HeartbeatRow>("SELECT * FROM scheduler_heartbeat WHERE id = 1"),
    );
  }

  async writeHeartbeat(h: Heartbeat): Promise<void> {
    await this.#sql.run(
      `INSERT INTO scheduler_heartbeat (id, at, trigger, next_wake_at, ran, more, lag_s) VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET at = excluded.at, trigger = excluded.trigger, next_wake_at = excluded.next_wake_at,
         ran = excluded.ran, more = excluded.more, lag_s = excluded.lag_s`,
      [h.at, h.trigger, h.nextWakeAt, h.ran, h.more ? 1 : 0, h.lagSeconds ?? null],
    );
  }

  // ───────────────────────────── retention ─────────────────────────────

  /**
   * `schedules.retention` (§5.2, §11.1): runs older than 90 days and terminal releases older than
   * 400 days are deleted, at most `limit` of each per call (audit rows stay).
   */
  async applyRetention(
    now: string,
    options: { runDays?: number; releaseDays?: number; limit?: number } = {},
  ): Promise<{ runs: number; releases: number }> {
    const t = Date.parse(canonicalInstant(now));
    const runCutoff = canonicalInstant(t - (options.runDays ?? 90) * 86_400_000);
    const releaseCutoff = canonicalInstant(t - (options.releaseDays ?? 400) * 86_400_000);
    const limit = options.limit ?? 500;
    const old = `SELECT id FROM releases WHERE state IN (${TERMINAL_SQL}) AND updated_at < ? ORDER BY updated_at LIMIT ?`;
    const results = await this.#sql.batch([
      {
        sql: `DELETE FROM schedule_runs WHERE id IN (SELECT id FROM schedule_runs WHERE created_at < ? AND state NOT IN ('due', 'ready', 'running') ORDER BY created_at LIMIT ?)`,
        params: [runCutoff, limit],
      },
      {
        sql: `DELETE FROM release_items WHERE release_id IN (${old})`,
        params: [releaseCutoff, limit],
      },
      { sql: `DELETE FROM releases WHERE id IN (${old})`, params: [releaseCutoff, limit] },
    ]);
    return { runs: results[0]?.changes ?? 0, releases: results[2]?.changes ?? 0 };
  }
}
