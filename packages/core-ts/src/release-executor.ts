/**
 * The `ReleaseExecutor` seam of `runDue` (RFC-0008 §6.3, §8): `SiteGraphStore.publishRelease`,
 * then the stored purge plan, sent after the batch, then the release-published hook
 * (`release-after.ts`; the Node server rebuilds its static site, #150). `runScheduledTick` and
 * "Publish now" (`ReleaseService.publishNow`) build one; both live in `releases.ts`.
 */
import type { ReleaseExecution, ReleaseExecutor } from "@cloudhal/schedules";
import type { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { CachePurgePlan } from "./cache-purge.ts";
import * as after from "./release-after.ts";
import type { ReleasePurge } from "./release-apply.ts";
import type { ReleasePurger } from "./releases.ts";
import type { SiteGraphStore } from "./store.ts";

/**
 * Statements one release execution takes, for `runDue`'s budget check: the stored purge plan (1),
 * the site, the live snapshot and the parent (3), the eight-statement batch, and the purge's own
 * bookkeeping after it (up to 4). A site that moved between the reads and the batch repeats the
 * reads and the batch once; that rare path may end the tick early (`more`), never mid-batch.
 */
export const RELEASE_EXECUTOR_COST = 16;

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
  /** After a committed release's purge (`release-after.ts`; the Node server rebuilds, #150). */
  readonly onPublished?: after.ReleasePublishedHook | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

/** The `ReleaseExecutor` of `runDue`: `publishRelease`, then the stored purge plan. */
export function releaseExecutor(o: ReleaseExecutorOptions): ReleaseExecutor {
  const log = o.log ?? (() => {});
  const recordPurge =
    o.recordPurge ?? ((id: string, purge: ReleasePurge) => o.schedules.recordPurge(id, purge));
  return {
    cost: RELEASE_EXECUTOR_COST,
    async execute(input): Promise<ReleaseExecution> {
      const stored = await o.schedules.releasePurgePlan(input.release.id);
      const plan: CachePurgePlan = after.isPurgePlan(stored)
        ? stored
        : { mode: "everything", reason: "no purge plan was stored with the release" };
      const expected: ReleasePurge = !o.purge
        ? "none"
        : plan.mode === "everything"
          ? "everything"
          : plan.tags.length > 0
            ? "tags"
            : "none";
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
          if (r.committed && o.purge && expected !== "none") {
            try {
              purge = await o.purge(input.release.siteId, plan);
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
