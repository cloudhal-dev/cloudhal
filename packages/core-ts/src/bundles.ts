/**
 * Snapshot bundles (RFC-0010, ADR-0024): the bodies of a published snapshot as a few shard objects,
 * so the site Worker loads a site in one round of blob reads instead of one read per node.
 *
 * `bundles/<siteId>/<snapshotId>/<i>.json` holds the bodies of `snapshot.nodes[i·K … i·K+K−1]`, in
 * the snapshot's order, with their hashes (K = {@link BUNDLE_SHARD_NODES}). The shard count follows
 * from the number of refs, so there is no manifest and no contract change. Bundles are a cache:
 * `nodes/<hash>.json` stays the source of truth, and a reader that finds a missing, partial or
 * mismatching shard treats the whole bundle as absent.
 */
import type { NodeRef, Snapshot } from "@cloudhal/core-contracts";
import type { BlobStore } from "@cloudhal/storage";
import { BLOB_CONCURRENCY, eachLimited } from "./concurrency.ts";

/** Nodes per shard (RFC-0010 open question 1, default). */
export const BUNDLE_SHARD_NODES = 256;
/** The shard format; a reader ignores shards of another version. */
export const BUNDLE_VERSION = 1;
/** Where bundles live; `cloudhal deploy` expires this prefix (RFC-0010 §Retention). */
export const BUNDLE_PREFIX = "bundles/";

const ID = /^[a-z]+_[A-Za-z0-9]{6,32}$/;

export function bundleShardCount(snapshot: Pick<Snapshot, "nodes">): number {
  return Math.ceil(snapshot.nodes.length / BUNDLE_SHARD_NODES);
}

/** The key of shard `shard`; only validated ids reach it. */
export function bundleKey(siteId: string, snapshotId: string, shard: number): string {
  if (!ID.test(siteId) || !ID.test(snapshotId) || !Number.isInteger(shard) || shard < 0)
    throw new Error(`invalid bundle key parts: ${siteId} ${snapshotId} ${shard}`);
  return `${BUNDLE_PREFIX}${siteId}/${snapshotId}/${shard}.json`;
}

const shardRefs = (snapshot: Snapshot, shard: number): NodeRef[] =>
  snapshot.nodes.slice(shard * BUNDLE_SHARD_NODES, (shard + 1) * BUNDLE_SHARD_NODES);

/**
 * Writes every shard of `snapshot`. `body` returns a node's stored body as JSON text (what
 * `nodes/<hash>.json` holds); bodies are spliced in as they are, never re-parsed.
 */
export async function writeSnapshotBundle(
  blobs: BlobStore,
  snapshot: Snapshot,
  body: (ref: NodeRef) => Promise<string>,
): Promise<void> {
  const shards = Array.from({ length: bundleShardCount(snapshot) }, (_, i) => i);
  const encoder = new TextEncoder();
  await eachLimited(shards, BLOB_CONCURRENCY, async (shard) => {
    const refs = shardRefs(snapshot, shard);
    const bodies: string[] = [];
    for (const ref of refs) bodies.push(await body(ref));
    const text = `{"v":${BUNDLE_VERSION},"snapshotId":${JSON.stringify(snapshot.id)},"shard":${shard},"hashes":${JSON.stringify(refs.map((r) => r.hash))},"bodies":[${bodies.join(",")}]}`;
    await blobs.put(bundleKey(snapshot.siteId, snapshot.id, shard), encoder.encode(text), {
      contentType: "application/json",
    });
  });
}

/**
 * The snapshot's bodies by node hash, or `undefined` unless every shard is there and matches the
 * snapshot (version, snapshot id, the refs' hashes in order). Never throws for a bad bundle: the
 * caller falls back to `nodes/<hash>.json`.
 */
export async function readSnapshotBundle(
  blobs: BlobStore,
  snapshot: Snapshot,
): Promise<Map<string, unknown> | undefined> {
  const count = bundleShardCount(snapshot);
  if (count === 0) return undefined;
  const bodies = new Map<string, unknown>();
  let complete = true;
  const decoder = new TextDecoder();
  try {
    await eachLimited(
      Array.from({ length: count }, (_, i) => i),
      BLOB_CONCURRENCY,
      async (shard) => {
        if (!complete) return;
        const bytes = await blobs.get(bundleKey(snapshot.siteId, snapshot.id, shard));
        if (!bytes) {
          complete = false;
          return;
        }
        const parsed = JSON.parse(decoder.decode(bytes)) as {
          v?: unknown;
          snapshotId?: unknown;
          shard?: unknown;
          hashes?: unknown;
          bodies?: unknown;
        };
        const refs = shardRefs(snapshot, shard);
        const hashes = parsed.hashes;
        const list = parsed.bodies;
        if (
          parsed.v !== BUNDLE_VERSION ||
          parsed.snapshotId !== snapshot.id ||
          parsed.shard !== shard ||
          !Array.isArray(hashes) ||
          !Array.isArray(list) ||
          hashes.length !== refs.length ||
          list.length !== refs.length ||
          refs.some((r, i) => r.hash !== hashes[i])
        ) {
          complete = false;
          return;
        }
        for (const [i, r] of refs.entries()) bodies.set(r.hash, list[i]);
      },
    );
  } catch {
    return undefined; // unreadable or unparsable shard: the bundle is absent
  }
  return complete ? bodies : undefined;
}
