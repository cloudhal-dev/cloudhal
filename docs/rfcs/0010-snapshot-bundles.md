# RFC-0010: Snapshot bundles — one read to load a published site
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-13
- Related: ADR-0002 (storage interface, batch-only), ADR-0012 (two Workers, pointer-flip publishing, snapshot sources cached per isolate), RFC-0001 (snapshots), RFC-0004 (blob keys, GC roots), RFC-0008 §6.1 (release bodies; its "Workers Free (50 subrequests)" note is corrected below), the 2026-10-13 security and performance audit (PR #22)
- Numbering: RFC-0009 stays with editorial notes, as RFC-0007 says.
- Sources (checked 2026-10-13 in the Cloudflare docs source, `cloudflare/cloudflare-docs` at `0cd4753`, because developers.cloudflare.com was not reachable from the drafting environment): Workers limits, "Subrequests" and "Simultaneous open connections" — https://developers.cloudflare.com/workers/platform/limits/ · R2 object lifecycles — https://developers.cloudflare.com/r2/buckets/object-lifecycles/ **[verify: `wrangler r2 bucket lifecycle` flags]**

## Summary
A published site is rendered from an immutable snapshot whose node bodies live in R2 as one object per node (`nodes/<hash>.json`). The site Worker reads every one of them, one R2 `get` each, the first time an isolate renders a snapshot, which is after every cold start and after every publish. This RFC adds **snapshot bundles**: the bodies of a published snapshot, written as a few shard objects next to the per-node blobs, so the site Worker loads a site with one round of reads whatever its size; the per-node layout stays the source of truth and the fallback.

## Motivation
- **Latency on every publish and cold start.** `SnapshotSource#load` (`packages/astro-renderer/src/source.ts`) calls `readSnapshotNode` once per node. A Worker invocation may have at most **6 connections waiting for response headers**; the rest queue. A site with 1,000 nodes therefore makes about 1,000 R2 reads in ~167 sequential rounds before the first byte of the first page. Every isolate pays it again after each publish, because the snapshot id changes even when most nodes did not.
- **A hard ceiling.** R2 and D1 calls are subrequests to internal services: **1,000 per invocation on Workers Free**, the configured limit on Paid (default 10,000). The same invocation also reads the pointer and comments from D1, so a site with roughly 1,000 nodes cannot render at all on Free, and a large site on Paid gets close to the default. (RFC-0008 §6.1 assumed 50; that figure is the Free limit for external `fetch` subrequests, not for R2/D1.)
- **Who is affected:** every visitor of a cold or just-published Cloudflare site (time to first byte), and every owner whose site outgrows a few hundred nodes; agents publish often, so "after every publish" is frequent. Pages served from the Workers Cache are not affected: a hit never runs the Worker.
- **Why now:** the audit measured the shape of the problem; sites built by agents grow fast (every term, menu, redirect and asset is a node), and the fix is easier before there are large deployments to migrate.

## Proposal

### Layout
```
nodes/<hash>.json                          unchanged: one body per node, content-addressed, never deleted
bundles/<siteId>/<snapshotId>/<i>.json     new: shard i of the snapshot's bodies (i = 0, 1, …)
```
Shard `i` holds the bodies of `snapshot.nodes[i·K … (i+1)·K − 1]`, in the snapshot's own order, with **K = 256**. The shard count follows from `snapshot.nodes.length`, so there is no manifest and no contract change.

```ts
/** packages/core-ts/src/bundles.ts — one shard object (JSON). */
interface SnapshotBundleShard {
  v: 1;
  snapshotId: string;
  shard: number;
  /** The refs' hashes, in order: the reader checks them against the snapshot before trusting a body. */
  hashes: string[];
  /** The node bodies as stored under nodes/<hash>.json (parsed JSON), same order. */
  bodies: unknown[];
}

export const BUNDLE_SHARD_NODES = 256;
export function bundleKey(siteId: string, snapshotId: string, shard: number): string;
export async function writeSnapshotBundle(blobs: BlobStore, snapshot: Snapshot, body: (ref: NodeRef) => Promise<unknown>): Promise<void>;
export async function readSnapshotBundle(blobs: BlobStore, snapshot: Snapshot): Promise<Map<string, unknown> | undefined>;
```

### Who writes a bundle
1. **At publish, where the bodies are already in memory.** `createSnapshot` with `reason: "publish"` has every working-copy row it just stored; it writes the shards for the new snapshot right after the snapshot row (bodies held back by a release come from the live snapshot's bundle, or per node). Cost: `ceil(N / 256)` R2 `put`s, at most 6 in flight.
2. **Read-through, on the site Worker.** When `SnapshotSource` finds no complete bundle for the **published** snapshot, it loads node by node as today and then writes the bundle in `ctx.waitUntil`. This covers every path that makes a snapshot live without `createSnapshot`: release runs (`release-apply.ts`), rollback to an old snapshot, `cloudhal push`/bundle import (`sync.ts`), and bundles a lifecycle rule has expired. Concurrent isolates may both write; the content is identical, so the last write wins harmlessly.
3. **Previews never write.** A preview of an arbitrary snapshot loads node by node (it is uncached and rare); writing bundles for every previewed or history snapshot would multiply storage for no reader.

### Who reads a bundle
`SnapshotSource#load` asks `readSnapshotBundle` first. It reads all shards with at most 6 in flight, and accepts the result only if every shard exists, parses, has `v: 1` and the right `snapshotId`, and its `hashes` equal the snapshot's refs for that range. Anything else (a missing, partial, corrupt or foreign shard) is treated as "no bundle": the node-by-node path runs and, for the published snapshot, rewrites the bundle. Admin-side readers (MCP tools, diffs, releases) keep reading per node: they touch a handful of nodes per call.

### Retention
Bundles are a cache, never a source of truth. `cloudhal deploy` adds an R2 lifecycle rule that expires objects under `bundles/` after **30 days** **[default]**. The live snapshot's bundle is rewritten by the read-through path the first time it is missing, so expiry costs one slow load per site per 30 days at most. Storage is bounded by the bodies of what was published in the last 30 days (a 5 MB site published 10 times a day ≈ 1.5 GB worst case, inside R2's free 10 GB-month **[verify against current R2 pricing]**). Node blobs keep their current never-deleted rule.

### Invariants
1. A bundle never changes what renders: the site renders exactly the bodies named by the snapshot's refs, whether they came from a bundle or from `nodes/<hash>.json`.
2. A shard is used only when its `snapshotId` and `hashes` match the snapshot; on any doubt the reader falls back per node.
3. Only published snapshots get bundles (written at publish or read-through); previews and history never write one.
4. Losing every bundle (deleted bucket prefix, lifecycle, a bug) costs latency only, never correctness.
5. Bundle keys are built from validated ids (`siteId`, `snapshotId`) and an integer; no client string reaches a key.
6. Offline parity: `fs` and `MemoryBlobStore` implement the same keys; `cloudhal dev` may skip bundles (local reads are cheap) but the code path is the same and tested on SQLite + fs and on workerd with local R2.

### Expected effect
| Site size | Today (cold load) | With bundles |
|---|---|---|
| 50 nodes | 50 R2 reads, ~9 rounds | 1 read |
| 1,000 nodes | ~1,000 reads, ~167 rounds; at the Free ceiling | 4 reads, 1 round |
| 5,000 nodes | fails on Free; ~834 rounds on Paid | 20 reads, 4 rounds |

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Per-isolate cache of parsed bodies by hash | Tiny change; a publish re-reads only changed nodes in a warm isolate | Cold isolates still read every node; memory held across snapshots | Fixes the warm case only; keep it as a later, independent improvement |
| Bodies in a D1 table keyed by hash, one `SELECT … IN (json_each(?))` | One subrequest; natural dedupe across snapshots | Every node version of every site lives in D1 (500 MB per database on Free, 10 GB on Paid); rows read billed per cold load; large result sets | Moves history into the scarcest storage; R2 is the right home for bodies |
| KV or the Cache API in front of each node | Simple keys | Each `get`/`match` is still one subrequest per node; Cache API is per colo | Same round count as today |
| One unsharded bundle per snapshot | Simplest | One large object to parse at once; a 10 MB+ JSON parse in a 128 MB isolate next to the parsed result | Shards keep peaks and retries small at the cost of `ceil(N/256)` reads |
| Content-addressed shards shared between snapshots | Dedupe across publishes | Shard boundaries shift with every insert; needs a manifest and a contract change | Complexity for storage that a lifecycle rule already bounds |
| Load only what a route needs | Fewer bodies per request | The renderer builds menus, lists, archives, feeds and redirects from the whole graph; a large refactor of `SnapshotSource` | Out of proportion; bundles remove the cost without changing rendering |
| Raise `limits.subrequests` | One config line | Paid only; does nothing for latency | Treats the ceiling, not the cause |
| Static build per snapshot | No reads at all | Rejected by ADR-0012: publish would need a build server | Breaks "approved publish is live on the next request" |

## Compatibility & migration
- **Contracts:** none. `Snapshot` and `NodeRef` are unchanged; the bundle shape is internal to `@cloudhal/core-ts` and versioned by its own `v`.
- **Data:** no migration. Existing deployments have no bundles; the first render of each site's published snapshot writes one.
- **Rollout:** one release. The reader tolerates missing bundles, so the site Worker can ship before or after the admin Worker. `cloudhal deploy` adds the lifecycle rule idempotently (a deployment where the rule cannot be set keeps working; bundles then live until deleted).
- **Rollback:** an older site Worker ignores `bundles/`; the objects expire through the lifecycle rule or can be deleted by prefix.
- **RFC-0008 §6.1** is corrected to say the Free limit for R2/D1 calls is 1,000 per invocation; its "at most 20 new bodies per call" rule stays as a conservative budget.

## Security & policy impact
- No new scopes, routes or approval points. Bundles hold only bodies of snapshots that were published, the same data `nodes/<hash>.json` already holds in the same private bucket.
- A previewed snapshot never gets a bundle, so a draft cannot reach a key a published reader might load (invariant 3); the reader also rejects a shard whose `snapshotId` differs (invariant 2).
- Tenant isolation: keys are per site; the site Worker only reads `bundles/<its siteId>/`.

## Open questions
1. **K = 256 nodes per shard**, or a byte budget (for example 4 MB) when writing? Count-based needs no manifest; a byte budget would need one. **[default: 256]**
2. **Compression:** store shards gzip-compressed and decompress with `DecompressionStream`? R2 bills storage, not bytes read, so it would mainly cut storage for text-heavy sites. **[default: not in v1]**
3. **Lifecycle period:** 30 days, or shorter? **[default: 30]**
4. Should the admin Worker also pre-warm a bundle after a **release run** and a **rollback** (it has the snapshot but not the bodies), or is read-through enough? **[default: read-through]**
5. Measure before and after on a deployed site with 50 / 1,000 nodes (time to first byte of the first request after a publish) and record it in the implementation notes.
