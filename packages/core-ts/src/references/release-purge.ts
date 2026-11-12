/**
 * RFC-0045 §2 "Purges", point 4: what a release run purges, decided after its batch committed.
 *
 * - **The gate is the published site node.** A release never carries the site node, so the new
 *   snapshot publishes the live one's. When the working site row the batch read is that node (a
 *   first publish), it is tested as is; otherwise the published body is read once. In practice
 *   that read happens except on a first publish: a snapshot's site node is captured before the
 *   publish flips the pointer, so the row differs from it at least in `publishedSnapshotId` and
 *   `rev`. The read is counted but never refused (one call per release, from the sizing's margin),
 *   so a site without references never depends on what other runs left; if it fails, the working
 *   row decides (no references: the stored plan; else everything). Only a node that defines
 *   references, or still converts from them, re-plans; every other site sends the plan stored at
 *   pin time, as before 3b (nothing when it purges nothing).
 * - **Re-planned** `from → snapshotId` (`from`: the pointer the batch moved), like every other
 *   publish path. The pin-time plan skips the referrer closure and is the batch's *expected*
 *   outcome only. The re-plan's statements run on the tick's counting driver (never refused); if
 *   it throws, the run purges everything, never the stored plan. A re-plan that could not finish
 *   (more distinct terms in the two snapshots than reads left, the planner reading every term)
 *   purges everything before it reads anything.
 * - **Blob calls are charged as they happen** against the invocation's allowance, shared by every
 *   tick of one invocation. The tick wraps the release graph's store with `chargedBlobs`, so the
 *   run's other calls (`refreshSearch`'s reads, `labelOf`, a first publish's head and put) count
 *   too, never refused; each re-plan then gets `maxReads = min(2,000, left)` of what is really
 *   left. Past it, the planner purges everything: an over-purge, never a stale page. The scheduled
 *   snapshot gets no bundle here (the site Worker writes one on its first read): back-to-back
 *   releases of one site with no visitor between them re-plan node by node, within the same
 *   allowance.
 *
 * **Sizing the allowance.** R2 and D1 calls are capped per invocation: 1,000 on Workers Free, by
 * default 10,000 on Paid (RFC-0010, ADR-0024). An invocation runs up to two ticks (the cron's
 * follow-up). Per tick: D1, at most `maxQueries` refused statements plus 7 counted ones per
 * release (the re-plan's 2 `getSnapshot`, bookkeeping 4, `recordPurge` 1); the built-in jobs' 40
 * blob reads. Per release, counted from the allowance itself: `refreshSearch`'s worst case
 * (`MAX_RELEASE_ITEMS` × 2 + the site + ~10 taxonomies ≈ 211), `labelOf` and the publish's own
 * blobs (2), the gate read (1); and the purge's sends (≤ 4).
 * - **Free** (40 statements, 1 release per tick):
 *   1,000 − 2 × (40 + 7) − 2 × 40 − 2 × (211 + 2 + 4) = 392, so 350.
 * - **Paid** (900 statements; about 27 releases fit a tick's D1, at 33 statements each with claim
 *   and finish): 27 releases of 100 items pass the default 10,000 with `refreshSearch` alone,
 *   re-plan or not (RFC-0008's budgets, unchanged here). Sized for ticks of up to 10 such
 *   releases: 10,000 − 2 × (900 + 10 × 7) − 2 × 40 − 2 × 10 × 217 = 3,640, so 3,000.
 *
 * Accepted over-purges (an over-purge, never a stale page; rare, and for a feature not enabled
 * yet): a reference site with more terms than the allowance leaves purges everything on every
 * release; on Free, a reference-site release that changes an existing asset reads every entry,
 * page and term one by one in the asset rule, so above about 350 nodes it purges everything. The
 * AI Search mirror's R2 calls (RFC-0029) are not counted.
 */
import type { NodeRef, Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import {
  type CachePurgePlan,
  DEFAULT_PURGE_MAX_READS,
  planCachePurge,
  type SnapshotReader,
} from "../cache-purge.ts";
import type { ReleasePurge } from "../release-apply.ts";
import type { ReleasePurger } from "../releases.ts";
import { SiteGraphStore } from "../store.ts";
import { definesReferences } from "./purge.ts";

/** Blob calls one invocation's release runs may make (see the module comment). */
export const RELEASE_BLOB_ALLOWANCE = { free: 350, paid: 3000 } as const;

/** The allowance for a tick budget: Paid's when it allows more than Free's 40 statements. */
export function releaseBlobAllowance(budget?: { readonly maxQueries: number }): number {
  return budget && budget.maxQueries > 40
    ? RELEASE_BLOB_ALLOWANCE.paid
    : RELEASE_BLOB_ALLOWANCE.free;
}

/** What a plan does to the outcome's `purge` (`none` where nothing is cached or nothing changed). */
export function purgeOutcome(plan: CachePurgePlan, purging: boolean): ReleasePurge {
  if (!purging) return "none";
  if (plan.mode === "everything") return "everything";
  return plan.tags.length > 0 ? "tags" : "none";
}

export interface ReleasePurgeInput {
  /** The executor's graph (its blob store and driver are the planner's). */
  readonly graph: SiteGraphStore;
  /** The tick's counting driver; absent ("Publish now"): the graph's own. */
  readonly counted?: SqlDriver | undefined;
  readonly purge: ReleasePurger;
  /** The plan stored at pin time. */
  readonly stored: CachePurgePlan;
  /** The site row the batch wrote. */
  readonly site: Site;
  /** The site node the new snapshot publishes, and whether the working row was it. */
  readonly publishedSite?: { readonly ref: NodeRef; readonly current: boolean } | undefined;
  /** The pointer the batch moved (absent: nothing was live, so everything). */
  readonly from?: string | undefined;
  readonly snapshotId: string;
  /** Blob calls left for this invocation's release runs; charged by actual calls. */
  readonly allowance: { left: number };
  readonly log: (line: string) => void;
}

const chargedStores = new WeakSet<BlobStore>();

/**
 * A blob store that charges every call to `allowance`, never refusing one: the tick wraps the
 * release graph's store with it, so `refreshSearch`, `labelOf` and the publish's own blobs count
 * too, and a re-plan's `maxReads` sees what is really left.
 */
export function chargedBlobs(blobs: BlobStore, allowance: { left: number }): BlobStore {
  if (chargedStores.has(blobs)) return blobs;
  const out = new Proxy(blobs, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        allowance.left--;
        return v.apply(target, args);
      };
    },
  });
  chargedStores.add(out);
  return out;
}

/** The plan to send: the stored one, a re-plan, or purge-everything; never throws. */
async function planFor(input: ReleasePurgeInput): Promise<CachePurgePlan> {
  const { site, allowance, log } = input;
  const planner = new SiteGraphStore({
    sql: input.counted ?? input.graph.sql,
    blobs: chargedBlobs(input.graph.blobs, allowance),
  });
  const everything = (reason: string): CachePurgePlan => {
    log(`schedules: ${reason}`);
    return { mode: "everything", reason };
  };
  // The gate: counted, never refused (one call per release, from the sizing's margin), so a
  // site without references never depends on what other runs left.
  let node: Site = site;
  const published = input.publishedSite;
  if (published && !published.current)
    try {
      node = await planner.readSnapshotNode<Site>(published.ref);
    } catch (e) {
      // the working row decides: no references there, the stored plan; else everything
      if (!definesReferences(site)) return input.stored;
      return everything(`the published site node could not be read: ${message(e)}`);
    }
  if (!definesReferences(node)) return input.stored;
  if (!input.from) return { mode: "everything", reason: "nothing was live before the release" };
  try {
    const maxReads = Math.min(DEFAULT_PURGE_MAX_READS, allowance.left);
    const [from, to] = await Promise.all([
      planner.getSnapshot(input.from),
      planner.getSnapshot(input.snapshotId),
    ]);
    if (!from || !to) return everything("a release snapshot is missing");
    // A hopeless re-plan stops before it reads: the planner reads every term of both snapshots.
    const terms = new Set(
      [...from.nodes, ...to.nodes].filter((n) => n.kind === "term").map((n) => n.hash),
    );
    if (terms.size >= maxReads)
      return everything(`${terms.size} terms need more blob reads than are left (${maxReads})`);
    const reader: SnapshotReader = {
      getSnapshot: async (id) => (id === from.id ? from : id === to.id ? to : undefined),
      readSnapshotNode: (ref: NodeRef) => planner.readSnapshotNode(ref),
      readSnapshotBundle: (s, o) => planner.readSnapshotBundle(s, o),
    };
    // `to` has no bundle: no shard reads are spent on it.
    return await planCachePurge(reader, from.id, to.id, { maxReads, unbundled: new Set([to.id]) });
  } catch (e) {
    return everything(`the run-time purge plan failed: ${message(e)}`);
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Sends the run's purge (see the module comment); a throw only from the purger itself. */
export async function sendReleasePurge(input: ReleasePurgeInput): Promise<ReleasePurge> {
  const plan = await planFor(input);
  return purgeOutcome(plan, true) === "none" ? "none" : input.purge(input.site.id, plan);
}
