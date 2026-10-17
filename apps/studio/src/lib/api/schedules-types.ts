/** Schedules' types (the calls load with the schedule screens from `lib/schedules-api.ts`). */
import type { Actor, Automation, Release, ScheduleRun } from "@cloudhal/core-contracts";
import type { ApprovalStatus } from "./approvals.ts";

// ---- schedules (RFC-0008 §12–§14, packages/api/src/routes/schedules.ts) -----------------------

/** `features.schedules` of `/api/instance`. */
export interface SchedulesFeature {
  available: boolean;
  /** What wakes the scheduler; `null` when this server does not know. */
  scheduler: "cron" | "alarm" | "node" | "request" | null;
  /** The site renderer enforces time gates (`availability`). */
  gates: boolean;
  automations: boolean;
  publishNow: boolean;
  limits: {
    maxItems: number;
    horizonDays: number;
    requestHorizonDays: number;
    lateMinutes: number;
  };
}

/** `GET /api/scheduler`: is scheduled work running (§8.7)? */
export interface SchedulerStatus {
  mode: "cron" | "alarm" | "node" | "request" | null;
  /** `running`, `late` (stalled with work due within 24 h), `stopped`, or `unknown` (never ticked). */
  state: "running" | "late" | "stopped" | "unknown";
  healthy: boolean;
  lastTickAt?: string;
  lastTrigger?: string;
  nextWakeAt?: string;
  lagSeconds?: number;
  nextDueAt?: string;
  dueWithin24h: boolean;
  automations: boolean;
  /** Release lateness over the last 7 days, in seconds. */
  lag: { p50: number | null; p95: number | null; runs: number };
}

/** How a release stands with approval (`approvalState`, §10.4). */
export type ReleaseApprovalState = "none" | "pending" | "approved" | "auto" | "denied" | "expired";

/** One thing on the calendar (`GET …/schedule`): a release, a gate or an automation occurrence. */
export interface CalendarItem {
  /** `rel_…`, `gate:<nodeId>:from|until` or `occ:<automationId>:<at>`. */
  id: string;
  kind: "release" | "gate" | "automation";
  at: string;
  title: string;
  target: { nodeIds?: string[]; nodeId?: string; automationId?: string; releaseId?: string };
  origin: "person" | "agent";
  approval: ReleaseApprovalState;
  /** A release state, `embargo` / `expiry` for gates, `planned` for occurrences. */
  state: string;
  /** Nodes also in another open release (D15). */
  overlaps?: string[];
}

export interface SchedulePage {
  items: CalendarItem[];
  nextCursor?: string;
  /** The site's zone (IANA), UTC when it has none. */
  timeZone: string;
}

export interface CalendarQuery {
  from: string;
  to: string;
  types?: readonly ("release" | "gate" | "automation")[];
  states?: readonly string[];
  origin?: "person" | "agent";
  approval?: ReleaseApprovalState;
  collection?: string;
  q?: string;
  cursor?: string;
}

/** A release item with its title and path (§12 `get_release`). */
export interface ReleaseItemView {
  nodeId: string;
  nodeKind: "page" | "contentEntry" | "taxonomy" | "term" | "redirect" | "menu" | "asset";
  kind: "set" | "remove";
  title: string | null;
  path: string | null;
  pinnedRev: number | null;
  liveRev: number | null;
  /** Added because another item uses it (§6.1 step 2). */
  closure: boolean;
  /** Other open releases with this node. */
  overlaps: string[];
}

/** `GET …/releases/:id`: the release, its time, approval state, items, locks and request. */
export interface ReleaseView extends Release {
  executeAt: string | null;
  approvalState: ReleaseApprovalState;
  view: {
    items: ReleaseItemView[];
    closureAdded: string[];
    lockedNodes: string[];
    request?: {
      id: string;
      status: ApprovalStatus;
      actor: Actor;
      expiresAt: string;
      createdAt: string;
    };
  };
}

/** `GET …/releases/:id/diff`: base → target per item, and what is live now after a conflict. */
export interface ReleaseDiff {
  releaseId: string;
  state: Release["state"];
  items: {
    nodeId: string;
    nodeKind: ReleaseItemView["nodeKind"];
    kind: "set" | "remove";
    base: Record<string, unknown> | null;
    target: Record<string, unknown> | null;
    live?: Record<string, unknown> | null;
  }[];
}

/**
 * When a release runs, as REST takes it: an instant, a wall-clock time in a zone (the server
 * resolves clock changes), or as soon as someone approves it.
 */
export type ReleaseWhenInput =
  | { at: string; timeZone?: string }
  | { localTime: string; timeZone?: string }
  | "on-approval";

/** What scheduling, moving or cancelling did. */
export interface ReleaseResult {
  release: Release;
  status: "scheduled" | "approval-pending" | "draft" | "canceled" | Release["state"];
  approvalId?: string;
}

/** `POST …/automations/preview-rule`: the next runs and the rule in words. */
export interface RulePreview {
  occurrences: { at: string; local: string; adjusted?: "dst-gap" }[];
  dstAdjusted: string[];
  /** The rule in words, rendered by the server in the asked locale. */
  text: string;
}

export type BuiltinJob =
  | "broken-links"
  | "stale-content"
  | "feed-check"
  | "weekly-digest"
  | "cleanup";

export interface AutomationInput {
  name: string;
  job:
    | { kind: "builtin"; builtin: BuiltinJob; staleAfterDays?: number }
    | {
        kind: "agent-task";
        instructions: string;
        modeCap: "plan" | "manual" | "edits" | "auto";
        readsUntrustedText: boolean;
        windowMinutes: number;
        budget: {
          maxToolCalls: number;
          maxWrites: number;
          maxApprovalRequests: number;
          maxMinutes: number;
        };
      };
  recurrence: {
    start: string;
    timeZone: string;
    rule?: string;
    preset: Automation["recurrence"]["preset"];
  };
}

/** `GET|PUT …/schedule-settings`: the site's kill switch and daily automation write cap. */
export interface ScheduleSettings {
  paused: boolean;
  pausedBy?: Actor;
  pausedAt?: string;
  pausedReason?: string;
  dailyWriteCap: number;
  /** 0 while the site has never saved them (the defaults). */
  rev: number;
  /** Automation writes since midnight UTC (GET only). */
  writesToday?: number;
  updatedAt?: string;
  updatedBy?: Actor;
}

/**
 * One finding of a built-in job (`packages/schedules/src/findings.ts`; not a contract). Codes are
 * stable; `untrusted` text came from visitors or a fetched document and is shown as plain text.
 */
export interface RunFinding {
  code: string;
  severity: "error" | "warning" | "info";
  nodeId?: string;
  nodeKind?: string;
  field?: string;
  href?: string;
  targetId?: string;
  gate?: string;
  path?: string;
  status?: number;
  hits?: number;
  title?: string;
  updatedAt?: string;
  ageDays?: number;
  document?: "rss" | "sitemap";
  detail?: string;
  url?: string;
  count?: number;
  items?: { id: string; title: string; at?: string; state?: string }[];
  proposal?: { path: string; nodeId?: string; reason: string };
  untrusted?: boolean;
}

export interface RunDetail {
  run: ScheduleRun;
  findings: RunFinding[];
  auditRowIds: number[];
  snapshots: string[];
}

/** The schedule notifications (RFC-0008 §14). */
export const SCHEDULE_NOTIFICATION_KINDS = [
  "schedule-approval-due",
  "schedule-upcoming",
  "schedule-published",
  "schedule-conflict",
  "schedule-missed",
  "schedule-expired",
  "schedule-failed",
  "scheduler-stalled",
  "automation-paused",
  "automation-failed",
  "automation-digest",
] as const;

export type ReleaseNotification = {
  id: string;
  kind:
    | "schedule-approval-due"
    | "schedule-upcoming"
    | "schedule-published"
    | "schedule-conflict"
    | "schedule-missed"
    | "schedule-expired"
    | "schedule-failed";
  siteId: string;
  releaseId: string;
  title: string | null;
  executeAt: string | null;
  latenessSeconds?: number;
  reason?: string;
  changed?: number;
  at: string;
};
export type ScheduleNotification =
  | ReleaseNotification
  | {
      id: string;
      kind: "scheduler-stalled";
      state: "late" | "stopped" | "unknown";
      lastTickAt: string | null;
      at: string;
    }
  | {
      id: string;
      kind: "automation-paused" | "automation-failed" | "automation-digest";
      siteId: string;
      automationId: string;
      name: string;
      reason?: string;
      runId?: string;
      /** `automation-digest`: the digest's plain-text report and its counts (published, scheduled, …). */
      summary?: string;
      counts?: Record<string, number>;
      at: string;
    };
