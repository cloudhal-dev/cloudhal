/**
 * RFC-0045 §2 "Purges", point 4: a release run re-plans its purge at run time. The plan stored
 * when the release was pinned diffs the snapshot that was live *then* against a virtual target; by
 * the run, other publishes may have moved the pointer, and referrers (whose pages show the
 * release's targets as cards) are found only from the two real snapshots' bodies. So after
 * `publishRelease` commits, the executor plans `from → snapshotId` (`from`: the pointer the batch
 * moved), exactly like every other publish path, and sends that.
 *
 * The stored plan still decides the outcome's `purge` written in the batch (it must be known
 * before the batch); the executor corrects it when the re-plan purges differently. Reads: two
 * `getSnapshot` statements, then bundle shards and node bodies (blob reads, bounded by
 * `maxReads`), counted in `RELEASE_EXECUTOR_COST`.
 */
import type { CachePurgePlan } from "../cache-purge.ts";
import type { ReleasePurge } from "../release-apply.ts";
import type { SiteGraphStore } from "../store.ts";

/** The purge a release run sends: planned now, from the pointer it moved to the snapshot it made. */
export function releasePurgePlan(
  graph: Pick<SiteGraphStore, "planCachePurge">,
  published: { readonly from?: string | undefined; readonly snapshotId: string },
): Promise<CachePurgePlan> {
  const { from, snapshotId: to } = published;
  return graph.planCachePurge({ ...(from ? { from } : {}), to });
}

/** What a plan does to the outcome's `purge` (`none` where nothing is cached or nothing changed). */
export function purgeOutcome(plan: CachePurgePlan, purging: boolean): ReleasePurge {
  if (!purging) return "none";
  if (plan.mode === "everything") return "everything";
  return plan.tags.length > 0 ? "tags" : "none";
}
