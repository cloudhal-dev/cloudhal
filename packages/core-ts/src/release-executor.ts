/**
 * The `ReleaseExecutor` seam of `runDue` (RFC-0008 §6.3, §8): `SiteGraphStore.publishRelease`,
 * then the purge, re-planned after the batch from the pointer it moved (RFC-0045 §2,
 * `references/release-purge.ts`; the stored plan only fills the batch's outcome), then the
 * release-published hook
 * (`release-after.ts`; the Node server rebuilds its static site, #150). `runScheduledTick` and
 * "Publish now" (`ReleaseService.publishNow`) build one; both live in `releases.ts`.
 */
import type { ReleaseExecution, ReleaseExecutor } from "@cloudhal/schedules";
import type { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { SqlDriver } from "@cloudhal/storage";
import type { CachePurgePlan } from "./cache-purge.ts";
import {
  purgeOutcome,
  releaseBlobAllowance,
  sendReleasePurge,
} from "./references/release-purge.ts";
import * as after from "./release-after.ts";
import type { ReleasePurge } from "./release-apply.ts";
import type { ReleasePurger } from "./releases.ts";
import type { SiteGraphStore } from "./store.ts";

/**
 * Statements one release execution takes, for `runDue`'s budget check. On the tick's refusing
 * driver: the stored purge plan (1), the site, the live snapshot and the parent (3), the batch
 * (up to 8, with asset blobs to root), and the search index brought to the new snapshot (7: its
 * reads and one guarded batch, RFC-0019 §3). On its counting driver, never refused: for sites
 * with references, the run-time re-plan's two `getSnapshot` reads (RFC-0045 §2; the bundle
 * write reuses them); the purge's bookkeeping (up to 4); and `recordPurge`, correcting the
 * outcome after a deferred or differing purge (1): 1 + 3 + 8 + 7 + 2 + 4 + 1 = 26. A site that moved between the reads and the
 * batch repeats the reads and the batch once (11 more); that rare path may end the tick early
 * (`more`), never mid-batch, and the purge after it runs on the counting driver regardless.
 *
 * Blob calls (R2 subrequests) are bounded apart: a tick's release runs share
 * `releaseBlobAllowance` (400 on Workers Free, under its 1,000 subrequests with the tick's 40 D1
 * statements; 4,000 on Paid, under its default 10,000 with 900). A re-plan reads at most
 * `RELEASE_REPLAN_MAX_READS` (250) blobs, a bundle write at most 108; past the allowance the run
 * purges everything (`references/release-purge.ts`).
 */
export const RELEASE_EXECUTOR_COST = 26;

export interface ReleaseExecutorOptions {
  readonly graph: SiteGraphStore;
  readonly schedules: SqlScheduleStore;
  /** Absent where nothing is cached (Node): the outcome records `purge: "none"`. */
  readonly purge?: ReleasePurger | undefined;
  /**
   * Corrects the outcome's `purge` after a deferred or failed purge. Default: through `schedules`.
   * The tick passes one over a counting (never refusing) driver, so a committed release always
   * gets its purge.
   */
  readonly recordPurge?: ((releaseId: string, purge: ReleasePurge) => Promise<void>) | undefined;
  /**
   * The tick's counting (never refusing) driver: the run-time purge plan reads over it, and, when
   * `recordPurge` is absent, the outcome's correction is written over it.
   */
  readonly counted?: SqlDriver | undefined;
  /** Blob calls this executor's runs may make together (`releaseBlobAllowance`; default Free's). */
  readonly blobReads?: number | undefined;
  /** After a committed release's purge (`release-after.ts`; the Node server rebuilds, #150). */
  readonly onPublished?: after.ReleasePublishedHook | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

/** The `ReleaseExecutor` of `runDue`: `publishRelease`, then the stored purge plan. */
export function releaseExecutor(o: ReleaseExecutorOptions): ReleaseExecutor {
  const log = o.log ?? (() => {});
  const counted = o.counted;
  // RFC-0045: the blob calls every release run of this tick may make together.
  const allowance = { left: o.blobReads ?? releaseBlobAllowance() };
  const recordPurge =
    o.recordPurge ??
    (counted
      ? (id: string, purge: ReleasePurge) => after.recordPurgeOutcome(counted, id, purge)
      : (id: string, purge: ReleasePurge) => o.schedules.recordPurge(id, purge));
  return {
    cost: RELEASE_EXECUTOR_COST,
    async execute(input): Promise<ReleaseExecution> {
      const stored = await o.schedules.releasePurgePlan(input.release.id);
      const plan: CachePurgePlan = after.isPurgePlan(stored)
        ? stored
        : { mode: "everything", reason: "no purge plan was stored with the release" };
      const expected = purgeOutcome(plan, o.purge !== undefined);
      const r = await o.graph.publishRelease({
        release: input.release,
        items: input.items,
        run: {
          id: input.run.id,
          leaseToken: input.run.leaseToken,
          recovering: input.run.recovering,
        },
        now: input.now,
        latenessSeconds: input.latenessSeconds,
        purge: expected,
      });
      switch (r.kind) {
        case "published": {
          let purge: ReleasePurge = expected;
          if (r.committed && o.purge) {
            try {
              purge = await sendReleasePurge({
                ...{ graph: o.graph, counted, purge: o.purge, stored: plan, allowance, log },
                ...{ site: r.site, from: r.from, snapshotId: r.snapshotId },
              });
            } catch (e) {
              purge = "failed";
              log(
                `schedules: purge after release ${input.release.id} failed: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            if (purge !== expected)
              await recordPurge(input.release.id, purge).catch((e) =>
                log(
                  `schedules: could not record the purge of ${input.release.id}: ${e instanceof Error ? e.message : String(e)}`,
                ),
              );
          }
          if (r.committed) {
            const { siteId, id: releaseId } = input.release;
            await after.notifyReleasePublished(
              o.onPublished,
              { siteId, snapshotId: r.snapshotId, releaseId },
              log,
            );
          }
          return {
            kind: "published",
            snapshotId: r.snapshotId,
            baseSnapshotId: r.baseSnapshotId,
            purge,
            committed: r.committed,
          };
        }
        case "conflict":
          return { kind: "conflict", conflicts: r.conflicts };
        case "failed":
          return { kind: "failed", code: r.code, message: r.message };
        case "canceled":
          return { kind: "canceled" };
        case "retry":
          return { kind: "retry", error: r.error };
      }
    },
  };
}
