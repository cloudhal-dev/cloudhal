/**
 * The notification seam of automations (RFC-0008 §14). Studio's notifications are derived from
 * state on every `GET /api/notifications` (nothing is stored, ADR-0016 addendum): the run row
 * (`state`, `outcome`, `summary`, `counts`, `findings`) is the record a derived `automation-digest`
 * or `automation-failed` item is built from. `ScheduleNotifier` is the push side for deliveries
 * that need one (a mail sender, a webhook, a stored inbox — none exists yet); `runDue` calls it
 * after a run's end is committed, never before, and a notifier that throws never fails a run.
 */
import type { WeeklyDigest } from "./findings.ts";

export type ScheduleNotificationKind =
  /** A `weekly-digest` run finished: the templated digest (§11.1, §14). */
  | "automation-digest"
  /** A built-in run finished with findings (broken links, stale entries, feed problems). */
  | "automation-findings"
  /** A run failed (§14 `automation-failed`). */
  | "automation-failed"
  /** The automation was auto-paused (three failures, a budget) (§14 `automation-paused`). */
  | "automation-paused";

export interface ScheduleNotification {
  /** Stable, so a client shows it once: `<kind>:<runId>` (paused: `automation-paused:<aut>:<runId>`). */
  readonly id: string;
  readonly kind: ScheduleNotificationKind;
  readonly siteId: string;
  readonly automationId: string;
  readonly automationName: string;
  readonly runId: string;
  /** User ids it is for (§14: the automation's owner). */
  readonly recipients: readonly string[];
  readonly at: string;
  /** The run's plain-text report line (English; Studio words its own from `kind` and `counts`). */
  readonly summary?: string;
  readonly counts?: Readonly<Record<string, number>>;
  /** `automation-digest` only. */
  readonly digest?: WeeklyDigest;
  /** `automation-failed` only. */
  readonly error?: { readonly code: string; readonly message?: string };
  /** `automation-paused` only. */
  readonly pausedReason?: "failures" | "budget";
}

/** Delivers notifications. Implementations must not throw for a delivery failure they can absorb. */
export interface ScheduleNotifier {
  notify(notification: ScheduleNotification): Promise<void>;
}

/** Delivers nothing: the run row is the record (the default). */
export const NOOP_NOTIFIER: ScheduleNotifier = { notify: async () => {} };

/** One log line per notification (the admin Worker's and the Node ticker's default). */
export function logNotifier(log: (line: string) => void): ScheduleNotifier {
  return {
    async notify(n) {
      log(
        `schedules notification ${n.kind} for ${n.recipients.join(", ") || "nobody"}: ${n.automationName} (${n.runId})${n.summary ? `: ${n.summary.split("\n", 1)[0]}` : ""}`,
      );
    },
  };
}
