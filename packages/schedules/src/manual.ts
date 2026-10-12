/**
 * A person's "Publish now" (RFC-0008 §8.6, §13 `POST …/releases/:id/publish-now`): a manual run of
 * one release through the same `ReleaseExecutor` the scheduler uses (`publishRelease` in core-ts),
 * claimed and finished with the same lease-guarded statements, so the effect happens at most once
 * whether a tick or a person gets there first.
 *
 * The release becomes an `on-approval` release approved by the person at `now`; its run is the
 * occurrence `now` with trigger `manual`. Conflicts, missing dependencies and lost approvals end it
 * as they would at its time; a transient error keeps it `running` under its lease for a retry by the
 * next tick (within the hour of `now`).
 */
import type {
  Release,
  ReleaseApproval,
  ReleaseConflict,
  ReleaseOutcome,
} from "@cloudhal/core-contracts";
import { ScheduleConflictError, ScheduleError } from "./errors.ts";
import { newLeaseToken, runId } from "./ids.ts";
import { nextRetryAt, RELEASE_LEASE_MS } from "./release.ts";
import {
  type ReleaseExecution,
  type ReleaseExecutor,
  type ReleaseFinish,
  SCHEDULER_ACTOR,
  type StoredReleaseItem,
} from "./scheduler.ts";
import { canonicalInstant } from "./time.ts";

/** The store calls a manual run needs (`SqlScheduleStore` implements them). */
export interface ManualReleaseStore {
  getReleaseRecord(
    siteId: string,
    id: string,
  ): Promise<{ release: Release; items: StoredReleaseItem[] } | undefined>;
  claimManualRelease(input: {
    siteId: string;
    releaseId: string;
    expectedRev: number;
    approval: ReleaseApproval;
    runId: string;
    token: string;
    now: string;
    leaseUntil: string;
  }): Promise<boolean>;
  finishRelease(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    latenessSeconds: number;
    finish: ReleaseFinish;
  }): Promise<boolean>;
  deferRelease(input: {
    releaseId: string;
    runId: string;
    token: string;
    now: string;
    retryAt: string;
    error: string;
  }): Promise<boolean>;
}

export interface PublishNowResult {
  /** What happened: the executor's verdict (`retry`: still running, the next tick tries again). */
  kind: ReleaseExecution["kind"];
  runId: string;
  release: Release;
}

/**
 * Runs a `scheduled`, `missed` or `expired` release now (see the module comment). Throws
 * `ScheduleError("not_found")`, or `ScheduleConflictError` when the release changed since it was
 * read, is in another state, or another release of the site is running.
 */
export async function publishReleaseNow(input: {
  store: ManualReleaseStore;
  executor: ReleaseExecutor;
  siteId: string;
  releaseId: string;
  expectedRev: number;
  approval: ReleaseApproval;
  now: Date;
  newToken?: () => string;
}): Promise<PublishNowResult> {
  const { store, siteId, releaseId } = input;
  const now = canonicalInstant(input.now);
  const run = await runId(releaseId, now);
  const token = (input.newToken ?? newLeaseToken)();
  const claimed = await store.claimManualRelease({
    siteId,
    releaseId,
    expectedRev: input.expectedRev,
    approval: input.approval,
    runId: run,
    token,
    now,
    leaseUntil: canonicalInstant(input.now.getTime() + RELEASE_LEASE_MS),
  });
  if (!claimed) {
    if (!(await store.getReleaseRecord(siteId, releaseId)))
      throw new ScheduleError("not_found", `release ${releaseId} not found`);
    throw new ScheduleConflictError(
      "release",
      releaseId,
      "the release changed, cannot be published now in its state, or another release of the site is running",
    );
  }
  const rec = await store.getReleaseRecord(siteId, releaseId);
  if (!rec) throw new ScheduleError("not_found", `release ${releaseId} not found`);
  let result: ReleaseExecution;
  try {
    result = await input.executor.execute({
      release: rec.release,
      items: rec.items,
      executeAt: now,
      run: { id: run, attempt: 1, leaseToken: token, recovering: false },
      now: input.now,
      latenessSeconds: 0,
      trigger: "manual",
    });
  } catch (e) {
    result = { kind: "retry", error: e instanceof Error ? e.message : String(e) };
  }
  const base = { releaseId, runId: run, token, now, latenessSeconds: 0 };
  const finish = (state: ReleaseFinish["state"], outcome: ReleaseOutcome) =>
    store.finishRelease({ ...base, finish: { state, outcome } as ReleaseFinish });
  switch (result.kind) {
    case "published":
      if (!result.committed)
        await finish("published", {
          kind: "published",
          runId: run,
          at: now,
          snapshotId: result.snapshotId,
          baseSnapshotId: result.baseSnapshotId,
          latenessSeconds: 0,
          purge: result.purge,
        });
      break;
    case "conflict":
      await finish("conflict", {
        kind: "conflict",
        runId: run,
        at: now,
        conflicts: result.conflicts as [ReleaseConflict, ...ReleaseConflict[]],
      });
      break;
    case "failed":
      await finish("failed", {
        kind: "failed",
        runId: run,
        at: now,
        code: result.code,
        ...(result.message ? { message: result.message.slice(0, 500) } : {}),
      });
      break;
    case "expired":
      await finish("expired", { kind: "expired", at: now, reason: result.reason });
      break;
    case "canceled":
      await finish("canceled", { kind: "canceled", at: now, by: { ...SCHEDULER_ACTOR } });
      break;
    case "retry": {
      const retryAt = nextRetryAt(now, now, 1) ?? canonicalInstant(input.now.getTime() + 30_000);
      await store.deferRelease({ ...base, retryAt, error: result.error.slice(0, 500) });
      break;
    }
  }
  const after = await store.getReleaseRecord(siteId, releaseId);
  return { kind: result.kind, runId: run, release: after?.release ?? rec.release };
}
