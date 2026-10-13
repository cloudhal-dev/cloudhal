/**
 * RFC-0010 snapshot bundles: shards of 256 bodies in the snapshot's order, written at publish and
 * read only when every shard matches the snapshot; anything else reads as "no bundle".
 */
import type { Snapshot } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import {
  BUNDLE_SHARD_NODES,
  bundleKey,
  bundleShardCount,
  readSnapshotBundle,
  SiteGraphStore,
  seedStarterSite,
  writeSnapshotBundle,
} from "../src/index.ts";

const ACTOR = { kind: "human" as const, id: "user_bundle0001" };

/** A synthetic snapshot of `n` refs whose bodies are `{"i":k}`. */
function synthetic(n: number): { snapshot: Snapshot; body: (hash: string) => string } {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `page_${String(i).padStart(8, "0")}`,
    kind: "page" as const,
    rev: 1,
    hash: i.toString(16).padStart(64, "0"),
  }));
  const snapshot = {
    schemaVersion: 1,
    id: "snap_SYNTHETIC1",
    siteId: "site_SYNTHETIC1",
    nodes,
  } as unknown as Snapshot;
  return { snapshot, body: (hash) => JSON.stringify({ i: Number.parseInt(hash, 16) }) };
}

describe("snapshot bundles", () => {
  it("shards by 256 refs in order and reads back every body", async () => {
    const blobs = new MemoryBlobStore();
    const { snapshot, body } = synthetic(2 * BUNDLE_SHARD_NODES + 1);
    expect(bundleShardCount(snapshot)).toBe(3);
    await writeSnapshotBundle(blobs, snapshot, async (r) => body(r.hash));
    expect(await blobs.list("bundles/")).toEqual(
      [0, 1, 2].map((i) => bundleKey(snapshot.siteId, snapshot.id, i)),
    );
    const read = await readSnapshotBundle(blobs, snapshot);
    expect(read?.size).toBe(513);
    expect(read?.get(snapshot.nodes[300]?.hash as string)).toEqual({ i: 300 });
  });

  it("treats a missing, corrupt or foreign shard as no bundle", async () => {
    const { snapshot, body } = synthetic(300);
    const fresh = async () => {
      const blobs = new MemoryBlobStore();
      await writeSnapshotBundle(blobs, snapshot, async (r) => body(r.hash));
      return blobs;
    };
    const key1 = bundleKey(snapshot.siteId, snapshot.id, 1);
    const enc = new TextEncoder();

    const missing = await fresh();
    await missing.delete(key1);
    expect(await readSnapshotBundle(missing, snapshot)).toBeUndefined();

    const corrupt = await fresh();
    await corrupt.put(key1, enc.encode("{not json"));
    expect(await readSnapshotBundle(corrupt, snapshot)).toBeUndefined();

    const foreign = await fresh();
    const text = new TextDecoder().decode((await foreign.get(key1)) as Uint8Array);
    await foreign.put(key1, enc.encode(text.replace(snapshot.id, "snap_OTHERONE1")));
    expect(await readSnapshotBundle(foreign, snapshot)).toBeUndefined();

    // a snapshot whose refs differ from what the shard recorded (a different hash) never uses it
    const changed = await fresh();
    const other = {
      ...snapshot,
      nodes: snapshot.nodes.map((n, i) => (i === 260 ? { ...n, hash: "f".repeat(64) } : n)),
    } as Snapshot;
    expect(await readSnapshotBundle(changed, other)).toBeUndefined();
    expect((await readSnapshotBundle(changed, snapshot))?.size).toBe(300);
  });

  it("refuses keys built from anything but validated ids", () => {
    expect(() => bundleKey("site_ok123456", "../x", 0)).toThrow(/invalid bundle key/);
    expect(() => bundleKey("site_ok123456", "snap_ok123456", -1)).toThrow(/invalid bundle key/);
  });

  it("a publish snapshot writes its bundle; other snapshots do not", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs });
    await store.init();
    const site = await seedStarterSite(store, { name: "Bundled", slug: "bundled" });
    const manual = await store.createSnapshot(site.id, { actor: ACTOR, reason: "manual" });
    expect(await store.readSnapshotBundle(manual)).toBeUndefined();
    const published = await store.createSnapshot(site.id, { actor: ACTOR, reason: "publish" });
    const bundle = await store.readSnapshotBundle(published);
    expect(bundle?.size).toBe(published.nodes.length);
    for (const ref of published.nodes)
      expect(bundle?.get(ref.hash)).toEqual(await store.readSnapshotNode(ref));
    // written later for any snapshot (the read-through path), from nodes/<hash>.json
    await store.writeSnapshotBundle(manual);
    expect((await store.readSnapshotBundle(manual))?.size).toBe(manual.nodes.length);
  });
});
