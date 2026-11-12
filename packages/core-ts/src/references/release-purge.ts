/**
 * RFC-0045 §2 "Purges", point 4: what a release run purges, decided after its batch committed.
 *
 * - **Sites without references: exactly as before 3b.** The plan stored at pin time is sent (nothing
 *   when it purges nothing), with no read at all: the test is the site row `publishRelease`
 *   returns, which is the site node the release publishes. (A site whose last reference field was
 *   removed since `from` gets the stored plan, as every site did before 3b.)
 * - **Sites with references (or converting from them): re-planned** `from → snapshotId` (`from`:
 *   the pointer the batch moved), like every other publish path. The pin-time plan skips the
 *   referrer closure and is the batch's *expected* outcome only. The re-plan reads over the tick's
 *   counting driver (never refused) and, for blobs, within the run's share of the tick's blob
 *   allowance; past it, or if it throws, the run purges everything, never the stored plan.
 * - **Then the scheduled snapshot's bundle** (RFC-0010), best effort and bounded, so the *next*
 *   release run (whose `from` this snapshot is) reads one bundle: only for reference sites, only
 *   when `from` has a bundle, from `from`'s bodies plus at most `RELEASE_BUNDLE_MAX_FETCH` changed
 *   nodes, for snapshots of at most `RELEASE_BUNDLE_MAX_NODES` nodes. This run's re-plan reads
 *   `from`'s bundle and the items, and spends no shard reads on `to` (`unbundled`).
 *
 * **Subrequests.** R2 and D1 calls are capped per invocation: 1,000 on Workers Free, 10,000 by
 * default on Paid (RFC-0010, ADR-0024). A tick spends at most its `maxQueries` D1 statements (40
 * Free, 900 Paid) and the release runs' blob allowance (`releaseBlobAllowance`: 400 Free, 4,000
 * Paid, shared by every run of the tick), plus the purge's own calls: well under either cap.
 */
import type { NodeRef, Site, Snapshot } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { type CachePurgePlan, planCachePurge, type SnapshotReader } from "../cache-purge.ts";
import type { ReleasePurge } from "../release-apply.ts";
import type { ReleasePurger } from "../releases.ts";
import { SiteGraphStore } from "../store.ts";
import { definesReferences } from "./purge.ts";

/** Above this many nodes a release run leaves its snapshot's bundle to the site Worker. */
export const RELEASE_BUNDLE_MAX_NODES = 1000;
/** Changed nodes a bundle write may fetch one by one (the rest come from `from`'s bundle). */
export const RELEASE_BUNDLE_MAX_FETCH = 100;
/** The most blob reads one re-plan may make (node bodies and bundle shards). */
export const RELEASE_REPLAN_MAX_READS = 250;
/** What a bundle write may cost in blob calls: `from`'s shards, the fetches, `to`'s shards. */
const BUNDLE_WRITE_COST = 2 * Math.ceil(RELEASE_BUNDLE_MAX_NODES / 256) + RELEASE_BUNDLE_MAX_FETCH;

/** The blob calls one tick's release runs may make together (see the module comment). */
export function releaseBlobAllowance(budget?: { readonly maxQueries: number }): number {
  return budget && budget.maxQueries > 40 ? 4000 : 400;
}

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
  /** The plan stored at pin time. */
  readonly stored: CachePurgePlan;
  /** The site row the batch wrote (`to`'s site node). */
  readonly site: Site;
  /** The pointer the batch moved (absent: nothing was live, so everything). */
  readonly from?: string | undefined;
  readonly snapshotId: string;
  /** Blob calls left for this tick's release runs; spent here. */
  readonly allowance: { left: number };
  readonly log: (line: string) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Sends the run's purge (see the module comment); a throw only from the purger itself. */
export async function sendReleasePurge(input: ReleasePurgeInput): Promise<ReleasePurge> {
  const { site, allowance, log } = input;
  const planner = input.counted
    ? new SiteGraphStore({ sql: input.counted, blobs: input.graph.blobs })
    : input.graph;
  const send = (plan: CachePurgePlan) =>
    purgeOutcome(plan, true) === "none"
      ? Promise.resolve("none" as const)
      : input.purge(site.id, plan);
  if (!definesReferences(site)) return send(input.stored);
  let from: Snapshot | undefined;
  let to: Snapshot | undefined;
  try {
    [from, to] = await Promise.all([
      input.from ? planner.getSnapshot(input.from) : undefined,
      planner.getSnapshot(input.snapshotId),
    ]);
  } catch (e) {
    log(`schedules: the release's snapshots could not be read: ${message(e)}`);
    return send({ mode: "everything", reason: `snapshots unreadable: ${message(e)}` });
  }
  const pair: Pair = { from, to, allowance, log };
  const plan = await replan(planner, pair);
  const sent = await send(plan);
  if (from && to && pair.fromBundle !== "missing")
    await writeBundle(planner, { ...pair, from, to });
  return sent;
}

interface Pair {
  readonly from: Snapshot | undefined;
  readonly to: Snapshot | undefined;
  readonly allowance: { left: number };
  readonly log: (line: string) => void;
  /** What the re-plan found of `from`'s bundle (unset: it did not look). */
  fromBundle?: "present" | "missing";
}

/** The run-time plan within the run's blob share; purge-everything when it cannot be made. */
async function replan(planner: SiteGraphStore, p: Pair): Promise<CachePurgePlan> {
  const { from, to } = p;
  if (!from || !to) return { mode: "everything", reason: "nothing was live before the release" };
  const maxReads = Math.min(RELEASE_REPLAN_MAX_READS, p.allowance.left);
  p.allowance.left -= maxReads;
  if (maxReads < 10) return { mode: "everything", reason: "the tick's blob allowance is spent" };
  const reader: SnapshotReader = {
    getSnapshot: async (id) => (id === from.id ? from : id === to.id ? to : undefined),
    readSnapshotNode: (ref: NodeRef) => planner.readSnapshotNode(ref),
    readSnapshotBundle: async (s, o) => {
      const got = await planner.readSnapshotBundle(s, o);
      if (s.id === from.id && !o?.only) p.fromBundle = got ? "present" : "missing";
      return got;
    },
  };
  try {
    // `to` has no bundle yet: it is written after the purge, for the next run.
    return await planCachePurge(reader, from.id, to.id, { maxReads, unbundled: new Set([to.id]) });
  } catch (e) {
    const reason = `the run-time purge plan failed: ${message(e)}`;
    p.log(`schedules: ${reason}`);
    return { mode: "everything", reason };
  }
}

/** `to`'s bundle from `from`'s bodies plus the few changed nodes; skipped when it would cost more. */
async function writeBundle(planner: SiteGraphStore, p: Pair & { from: Snapshot; to: Snapshot }) {
  const { from, to } = p;
  if (to.nodes.length > RELEASE_BUNDLE_MAX_NODES || from.nodes.length > RELEASE_BUNDLE_MAX_NODES)
    return;
  if (p.allowance.left < BUNDLE_WRITE_COST) return;
  p.allowance.left -= BUNDLE_WRITE_COST;
  try {
    const bodies = await planner.readSnapshotBundle(from, { maxNodes: RELEASE_BUNDLE_MAX_NODES });
    if (!bodies) return;
    const known = new Map<string, string>();
    for (const ref of to.nodes) {
      const body = bodies.get(ref.hash);
      if (body !== undefined) known.set(ref.hash, JSON.stringify(body));
    }
    if (to.nodes.length - known.size > RELEASE_BUNDLE_MAX_FETCH) return;
    await planner.writeSnapshotBundle(to, known);
  } catch (e) {
    p.log(`schedules: no bundle for ${to.id}: ${message(e)}`);
  }
}
