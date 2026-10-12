/**
 * Row ↔ contract mapping for the tables of migration `0017_schedules`.
 *
 * `schedule_runs.subject_kind` is `release`, `builtin` or `agent-task` (the contract's subject kind,
 * with an automation's job kind folded in so a run maps back to its `ScheduleRunSubject` alone).
 */
import type {
  Actor,
  Automation,
  AutomationJob,
  Release,
  ReleaseApproval,
  ReleaseItem,
  ReleaseNodeKind,
  ReleaseOutcome,
  ScheduleRun,
} from "@cloudhal/core-contracts";
import type { TickTrigger } from "../budget-meter.ts";
import type { BuiltinCursor, Heartbeat, StoredReleaseItem, SystemJobState } from "../scheduler.ts";

export interface ReleaseRow extends Record<string, unknown> {
  id: string;
  site_id: string;
  title: string | null;
  state: Release["state"];
  hash: string;
  when_kind: "at" | "on-approval" | null;
  execute_at: string | null;
  time_zone: string | null;
  local_time: string | null;
  approval: string | null;
  request_id: string | null;
  outcome: string | null;
  purge_plan: string | null;
  lease_token: string | null;
  lease_until: string | null;
  created_by: string;
  metadata: string | null;
  rev: number;
  created_at: string;
  updated_at: string;
  /** JSON array of item rows (`ITEMS_JSON`). */
  items_json?: string | null;
}

export interface ItemRow {
  node_id: string;
  op: "set" | "remove";
  node_kind: ReleaseNodeKind;
  target_rev: number | null;
  target_hash: string | null;
  base_rev: number | null;
  base_hash: string | null;
  deps: string;
  blob_sha: string | null;
  held: number;
}

/** A correlated subquery that returns a release's items as one JSON array (one query per release list). */
export const ITEMS_JSON = `(SELECT json_group_array(json_object('node_id', i.node_id, 'op', i.op, 'node_kind', i.node_kind,
  'target_rev', i.target_rev, 'target_hash', i.target_hash, 'base_rev', i.base_rev, 'base_hash', i.base_hash,
  'deps', i.deps, 'blob_sha', i.blob_sha, 'held', i.held)) FROM release_items i WHERE i.release_id = r.id) AS items_json`;

const parse = <T>(s: string | null | undefined): T | undefined =>
  s == null ? undefined : (JSON.parse(s) as T);

export function toItem(row: ItemRow): StoredReleaseItem {
  const base =
    row.base_rev != null && row.base_hash != null
      ? { base: { rev: Number(row.base_rev), hash: row.base_hash } }
      : {};
  const item: ReleaseItem =
    row.op === "set"
      ? {
          kind: "set",
          nodeId: row.node_id,
          nodeKind: row.node_kind,
          target: { rev: Number(row.target_rev), hash: String(row.target_hash) },
          ...base,
        }
      : ({ kind: "remove", nodeId: row.node_id, nodeKind: row.node_kind, ...base } as ReleaseItem);
  return {
    item,
    deps: parse<string[]>(row.deps) ?? [],
    ...(row.blob_sha ? { blobSha: row.blob_sha } : {}),
    held: Number(row.held) === 1,
  };
}

export function itemsOf(row: ReleaseRow): StoredReleaseItem[] {
  const rows = parse<ItemRow[]>(row.items_json ?? "[]") ?? [];
  return rows
    .map(toItem)
    .sort((a, b) => (a.item.nodeId < b.item.nodeId ? -1 : a.item.nodeId > b.item.nodeId ? 1 : 0));
}

export function toRelease(row: ReleaseRow, items: readonly StoredReleaseItem[]): Release {
  const when =
    row.when_kind === "at"
      ? {
          when: {
            kind: "at" as const,
            at: String(row.execute_at),
            timeZone: String(row.time_zone),
            ...(row.local_time ? { localTime: row.local_time } : {}),
          },
        }
      : row.when_kind === "on-approval"
        ? { when: { kind: "on-approval" as const } }
        : {};
  const approval = parse<ReleaseApproval>(row.approval);
  const outcome = parse<ReleaseOutcome>(row.outcome);
  const metadata = parse<Record<string, string>>(row.metadata);
  return {
    schemaVersion: 1,
    id: row.id,
    siteId: row.site_id,
    ...(row.title != null ? { title: row.title } : {}),
    items: items.map((i) => i.item) as Release["items"],
    ...when,
    state: row.state,
    hash: row.hash,
    ...(approval ? { approval } : {}),
    ...(outcome ? { outcome } : {}),
    createdBy: JSON.parse(row.created_by) as Actor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: Number(row.rev),
    ...(metadata ? { metadata } : {}),
  };
}

export interface AutomationRow extends Record<string, unknown> {
  id: string;
  site_id: string;
  name: string;
  job: string;
  key_id: string | null;
  start_local: string;
  time_zone: string;
  rule: string | null;
  preset: Automation["recurrence"]["preset"];
  state: Automation["state"];
  paused_reason: Automation["pausedReason"] | null;
  consecutive_failures: number;
  owner_id: string;
  owner_name: string | null;
  next_run_at: string | null;
  cursor: string | null;
  lease_token: string | null;
  lease_until: string | null;
  metadata: string | null;
  rev: number;
  created_at: string;
  updated_at: string;
}

export function toAutomation(row: AutomationRow): Automation {
  const metadata = parse<Record<string, string>>(row.metadata);
  return {
    schemaVersion: 1,
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    job: JSON.parse(row.job) as AutomationJob,
    recurrence: {
      start: row.start_local,
      timeZone: row.time_zone,
      ...(row.rule ? { rule: row.rule } : {}),
      preset: row.preset,
    },
    state: row.state,
    ...(row.paused_reason ? { pausedReason: row.paused_reason } : {}),
    consecutiveFailures: Number(row.consecutive_failures),
    owner: { id: row.owner_id, ...(row.owner_name ? { name: row.owner_name } : {}) },
    ...(row.next_run_at ? { nextRunAt: row.next_run_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: Number(row.rev),
    ...(metadata ? { metadata } : {}),
  };
}

export function cursorOf(row: AutomationRow): BuiltinCursor | undefined {
  return parse<BuiltinCursor>(row.cursor);
}

export interface RunRow extends Record<string, unknown> {
  id: string;
  site_id: string;
  subject_kind: "release" | "builtin" | "agent-task";
  subject_id: string;
  occurrence_at: string;
  state: ScheduleRun["state"];
  outcome: ScheduleRun["outcome"] | null;
  trigger: TickTrigger | null;
  attempt: number;
  lease_token: string | null;
  lease_until: string | null;
  window_opens: string | null;
  window_closes: string | null;
  started_at: string | null;
  ended_at: string | null;
  lateness_s: number | null;
  adjusted: ScheduleRun["adjusted"] | null;
  usage: string | null;
  taint: string | null;
  summary: string | null;
  counts: string | null;
  findings: string | null;
  approval_ids: string | null;
  error: string | null;
  rev: number;
  created_at: string;
  updated_at: string;
}

export function toRun(row: RunRow): ScheduleRun {
  const subject: ScheduleRun["subject"] =
    row.subject_kind === "release"
      ? { kind: "release", releaseId: row.subject_id }
      : { kind: "automation", automationId: row.subject_id, job: row.subject_kind };
  const usage = parse<ScheduleRun["usage"]>(row.usage);
  const taint = parse<ScheduleRun["taint"]>(row.taint);
  const counts = parse<ScheduleRun["counts"]>(row.counts);
  const approvalIds = parse<string[]>(row.approval_ids);
  const error = parse<ScheduleRun["error"]>(row.error);
  return {
    schemaVersion: 1,
    id: row.id,
    siteId: row.site_id,
    subject,
    occurrenceAt: row.occurrence_at,
    state: row.state,
    ...(row.outcome ? { outcome: row.outcome } : {}),
    ...(row.trigger ? { trigger: row.trigger } : {}),
    attempt: Number(row.attempt),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
    ...(row.lateness_s != null ? { latenessSeconds: Number(row.lateness_s) } : {}),
    ...(row.adjusted ? { adjusted: row.adjusted } : {}),
    ...(row.subject_kind === "agent-task" && row.window_opens && row.window_closes
      ? { window: { opensAt: row.window_opens, closesAt: row.window_closes } }
      : {}),
    ...(usage ? { usage } : {}),
    ...(taint ? { taint } : {}),
    ...(row.summary != null ? { summary: row.summary } : {}),
    ...(counts ? { counts } : {}),
    ...(approvalIds && approvalIds.length > 0 ? { approvalIds } : {}),
    ...(error ? { error } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: Number(row.rev),
  };
}

export interface SystemJobRow extends Record<string, unknown> {
  name: string;
  next_run_at: string;
  last_run_at: string | null;
  last_ok_at: string | null;
  lease_token: string | null;
  lease_until: string | null;
  last_error: string | null;
}

export function toSystemJob(row: SystemJobRow): SystemJobState {
  return {
    name: row.name,
    nextRunAt: row.next_run_at,
    ...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
    ...(row.last_ok_at ? { lastOkAt: row.last_ok_at } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.lease_until ? { leaseUntil: row.lease_until } : {}),
  };
}

export interface HeartbeatRow extends Record<string, unknown> {
  at: string | null;
  trigger: TickTrigger | null;
  next_wake_at: string | null;
  ran: number | null;
  more: number | null;
  lag_s: number | null;
}

export function toHeartbeat(row: HeartbeatRow | undefined): Heartbeat | undefined {
  if (!row?.at || !row.trigger || !row.next_wake_at) return undefined;
  return {
    at: row.at,
    trigger: row.trigger,
    nextWakeAt: row.next_wake_at,
    ran: Number(row.ran ?? 0),
    more: Number(row.more ?? 0) === 1,
    ...(row.lag_s != null ? { lagSeconds: Number(row.lag_s) } : {}),
  };
}
