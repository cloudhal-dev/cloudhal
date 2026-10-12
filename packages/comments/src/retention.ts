/**
 * The retention plan (RFC-0007 §9.3, invariant C11): what the hourly job deletes or clears, with
 * the cutoffs computed from a site's settings and the clock. Pure; `SqlCommentStore.retention`
 * runs the steps in order as bounded statements — at most 500 rows a run in total, so the job
 * stays inside Workers Free's limits and a backlog catches up over hours.
 *
 * | Data | Default |
 * |---|---|
 * | `pending` never decided | deleted after 30 days |
 * | `spam` | deleted after 30 days |
 * | `deleted` | deleted after 30 days; a tombstone stays while approved replies need it |
 * | `hidden` | kept, or deleted after N days when set |
 * | `ip_hmac`, `challenge_id` | cleared after 30 days on comments and reports |
 * | Commenter emails | deleted when nothing refers to them |
 * | Resolved reports, statements of reasons of removed comments | 6 months |
 * | Bans | removed when they expire |
 * | Monthly salts | deleted when two months old |
 * | Comments of a deleted entry | deleted 30 days after the entry |
 *
 * A comment due for deletion that still has approved replies under it becomes a tombstone instead
 * (no text, erased author, status `deleted`), so the replies keep their place.
 */
import { DAY_MS, utcMonth } from "./model.ts";
import { DEFAULT_RETENTION, type RetentionSettings } from "./settings.ts";

export const RETENTION_BUDGET = 500;
/** Comments of a deleted entry are deleted this long after the entry. */
export const DELETED_ENTRY_DAYS = 30;
/** `cache_purge_log` rows older than this are deleted (the budget window is 60 s). */
export const PURGE_LOG_KEEP_MS = 3_600_000;

export type RetentionStepKind =
  | "pending"
  | "spam"
  | "deleted"
  | "hidden"
  | "tombstones"
  | "client-data"
  | "reports"
  | "events"
  | "emails"
  | "bans";

export interface RetentionStep {
  readonly kind: RetentionStepKind;
  /** Rows older than this instant are affected (bans: expired before it). */
  readonly cutoff: string;
}

export interface RetentionPlan {
  readonly steps: readonly RetentionStep[];
  /** Rows the run may touch in total. */
  readonly budget: number;
}

/** A site's retention steps, in the order they must run (comments before the emails they free). */
export function retentionPlan(
  retention: RetentionSettings = DEFAULT_RETENTION,
  now: Date,
  budget = RETENTION_BUDGET,
): RetentionPlan {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const steps: RetentionStep[] = [
    { kind: "pending", cutoff: ago(retention.pendingDays) },
    { kind: "spam", cutoff: ago(retention.spamDays) },
    { kind: "deleted", cutoff: ago(retention.deletedDays) },
  ];
  if (retention.hiddenDays !== null)
    steps.push({ kind: "hidden", cutoff: ago(retention.hiddenDays) });
  // tombstones: rows of the steps above kept because approved replies hang under them
  steps.push({
    kind: "tombstones",
    cutoff: ago(Math.min(retention.pendingDays, retention.spamDays, retention.deletedDays)),
  });
  steps.push(
    { kind: "client-data", cutoff: ago(retention.clientDataDays) },
    { kind: "reports", cutoff: ago(retention.resolvedReportDays) },
    { kind: "events", cutoff: ago(retention.resolvedReportDays) },
    { kind: "emails", cutoff: now.toISOString() },
    { kind: "bans", cutoff: now.toISOString() },
  );
  return { steps, budget };
}

/** Salts of months before the previous one are deleted (§9.2): the oldest month to keep. */
export function oldestSaltMonthToKeep(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return utcMonth(d);
}

/** Entries deleted at least 30 days ago whose comments the job may delete. */
export function deletedEntriesDue(
  deleted: readonly { readonly nodeId: string; readonly deletedAt: string }[],
  now: Date,
): string[] {
  const cutoff = now.getTime() - DELETED_ENTRY_DAYS * DAY_MS;
  return deleted.filter((d) => Date.parse(d.deletedAt) <= cutoff).map((d) => d.nodeId);
}

export interface RetentionReport {
  /** Rows touched per step. */
  readonly counts: Readonly<Partial<Record<RetentionStepKind | "entries", number>>>;
  /** True when the budget ran out (the next run continues). */
  readonly more: boolean;
}
