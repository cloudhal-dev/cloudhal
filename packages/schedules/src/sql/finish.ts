/**
 * The statements that end a claimed release (RFC-0008 §6.3 statements 5–7). Temporal-free and
 * storage-free, so `publishRelease` (`@cloudhal/core-ts`, through `@cloudhal/schedules/engine`)
 * appends them to its own guarded batch; `SqlScheduleStore.finishRelease` runs them alone.
 */
import type { ScheduleRun } from "@cloudhal/core-contracts";
import type { SqlStatement, SqlValue } from "@cloudhal/storage";
import type { ReleaseFinish } from "../scheduler.ts";

const j = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));

/** The run row's state for a release's terminal state. */
export function runStateForRelease(finish: ReleaseFinish): {
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

export interface ReleaseFinishInput {
  releaseId: string;
  runId: string;
  token: string;
  now: string;
  latenessSeconds: number;
  finish: ReleaseFinish;
  /**
   * An extra condition every statement carries — the site CAS of `publishRelease`
   * (`EXISTS (SELECT 1 FROM nodes WHERE id = :site AND hash = :hash')`).
   */
  guard?: SqlStatement;
}

/**
 * Statements 5–7 of §6.3, each guarded on the lease token and, optionally, on `guard`. The release
 * row is updated last, so a caller reads the batch's last result to know the release finished.
 */
export function releaseFinishStatements(input: ReleaseFinishInput): SqlStatement[] {
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
