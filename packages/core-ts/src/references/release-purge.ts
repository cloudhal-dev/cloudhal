/**
 * RFC-0045 §2 "Purges", point 4: what a release run purges, decided after its batch committed.
 *
 * - **Re-planned at run time.** The plan stored when the release was pinned diffs the snapshot
 *   live *then* against a virtual target, and skips the referrer closure (it would read every
 *   body one by one): for sites with references it is the batch's *expected* outcome only. After
 *   the commit the executor plans `from → snapshotId` (`from`: the pointer the batch moved) like
 *   every other publish path, and sends that.
 * - **Over the tick's counting driver.** The re-plan's statements count against the tick but are
 *   never refused, like the purge's bookkeeping, so a tick near its budget still purges.
 * - **Never dropped.** A re-plan that throws (a transient error) sends purge-everything, never the
 *   stored plan, which may lack referrers.
 * - **The scheduled snapshot's bundle** (RFC-0010) is written first, best effort, as
 *   `createSnapshot` writes one for `publish`: the re-plan, and the next release's (whose `from`
 *   this snapshot is), then read one bundle instead of every body. Snapshots of more than
 *   `RELEASE_BUNDLE_MAX_NODES` nodes are left without (the site Worker writes it on its first
 *   render), and the planner is told so it spends no shard reads on them.
 */
import type { SqlDriver } from "@cloudhal/storage";
import type { CachePurgePlan } from "../cache-purge.ts";
import type { ReleasePurge } from "../release-apply.ts";
import type { ReleasePurger } from "../releases.ts";
import { SiteGraphStore } from "../store.ts";

/** Above this many nodes a release run leaves its snapshot's bundle to the site Worker. */
export const RELEASE_BUNDLE_MAX_NODES = 1000;

/** What a plan does to the outcome's `purge` (`none` where nothing is cached or nothing changed). */
export function purgeOutcome(plan: CachePurgePlan, purging: boolean): ReleasePurge {
  if (!purging) return "none";
  if (plan.mode === "everything") return "everything";
  return plan.tags.length > 0 ? "tags" : "none";
}

export interface ReleasePurgeInput {
  /** The executor's graph (its blob store is the planner's). */
  readonly graph: SiteGraphStore;
  /** The tick's counting driver; absent ("Publish now"): the graph's own. */
  readonly counted?: SqlDriver | undefined;
  readonly purge: ReleasePurger;
  readonly siteId: string;
  /** The pointer the batch moved (absent: nothing was live, so everything). */
  readonly from?: string | undefined;
  readonly snapshotId: string;
  readonly log: (line: string) => void;
}

/** Writes the bundle, re-plans and sends the purge; a throw only from the purger itself. */
export async function sendReleasePurge(input: ReleasePurgeInput): Promise<ReleasePurge> {
  const { siteId, from, snapshotId: to, log } = input;
  const planner = input.counted
    ? new SiteGraphStore({ sql: input.counted, blobs: input.graph.blobs })
    : input.graph;
  const unbundled = new Set<string>();
  try {
    const snapshot = await planner.getSnapshot(to);
    if (!snapshot || snapshot.nodes.length > RELEASE_BUNDLE_MAX_NODES) unbundled.add(to);
    else await planner.writeSnapshotBundle(snapshot, new Map());
  } catch (e) {
    unbundled.add(to);
    log(`schedules: no bundle for ${to}: ${e instanceof Error ? e.message : String(e)}`);
  }
  let plan: CachePurgePlan;
  try {
    plan = await planner.planCachePurge({ ...(from ? { from } : {}), to }, { unbundled });
  } catch (e) {
    const reason = `the run-time purge plan failed: ${e instanceof Error ? e.message : String(e)}`;
    log(`schedules: ${reason}`);
    plan = { mode: "everything", reason };
  }
  const outcome = purgeOutcome(plan, true);
  return outcome === "none" ? "none" : input.purge(siteId, plan);
}
