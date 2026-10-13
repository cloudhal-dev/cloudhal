/**
 * RFC-0010 on the read side: the site's snapshot source loads a published snapshot from its bundle
 * (no per-node reads), loads node by node without one, and writes the missing bundle in the
 * background for the published snapshot only — never for previews.
 */
import { mintPreviewToken, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { SiteResolver } from "../src/resolver.ts";
import { SnapshotSource } from "../src/source.ts";

const SECRET = "bundles-preview-secret-at-least-32-bytes";
const actor = { kind: "human" as const, id: "user_bundles001" };

class CountingBlobs extends MemoryBlobStore {
  gets: string[] = [];
  override async get(key: string) {
    this.gets.push(key);
    return super.get(key);
  }
}

async function setup() {
  const blobs = new CountingBlobs();
  const store = new SiteGraphStore({ sql: await BetterSqlite3Driver.open(":memory:"), blobs });
  await store.init();
  const site = await seedStarterSite(store, { name: "Bundled", slug: "bundled" });
  return { blobs, store, site };
}

const nodeReads = (blobs: CountingBlobs) => blobs.gets.filter((k) => k.startsWith("nodes/"));

describe("snapshot bundles in the renderer", () => {
  it("loads a published snapshot from its bundle without per-node reads", async () => {
    const { blobs, store, site } = await setup();
    const snap = await store.createSnapshot(site.id, { actor, reason: "publish" });
    blobs.gets = [];
    const source = await SnapshotSource.open(store, snap.id);
    expect((await source.pageByPath("/about"))?.path).toBe("/about");
    expect(nodeReads(blobs)).toEqual([]);
    expect(blobs.gets).toEqual([`bundles/${site.id}/${snap.id}/0.json`]);
  });

  it("without a bundle, loads node by node and writes the bundle once", async () => {
    const { blobs, store, site } = await setup();
    const snap = await store.createSnapshot(site.id, { actor, reason: "manual" });
    blobs.gets = [];
    const source = await SnapshotSource.open(store, snap.id);
    const tasks: Promise<unknown>[] = [];
    source.persistBundle((t) => tasks.push(t));
    source.persistBundle((t) => tasks.push(t));
    expect((await source.pageByPath("/about"))?.path).toBe("/about");
    expect(nodeReads(blobs).length).toBeGreaterThan(0);
    await Promise.all(tasks);
    const bundle = await store.readSnapshotBundle(snap);
    expect(bundle?.size).toBe(snap.nodes.length);
    for (const ref of snap.nodes)
      expect(bundle?.get(ref.hash)).toEqual(await store.readSnapshotNode(ref));
    // the next isolate reads the bundle
    blobs.gets = [];
    await (await SnapshotSource.open(store, snap.id)).pageByPath("/about");
    expect(nodeReads(blobs)).toEqual([]);
  });

  it("the resolver persists the published snapshot's bundle, never a preview's", async () => {
    const { store, site } = await setup();
    const tasks: Promise<unknown>[] = [];
    const resolver = new SiteResolver({
      store,
      siteId: site.id,
      previewSecret: SECRET,
      pointerTtlMs: 0,
      persistBundle: (t) => tasks.push(t),
    });
    // a snapshot published without a bundle (as a rollback or a release run would)
    const history = await store.createSnapshot(site.id, { actor, reason: "manual" });
    const fresh = await store.getSite(site.id);
    await store.publish(fresh as NonNullable<typeof fresh>, history.id);
    const draft = await store.createSnapshot(site.id, { actor, reason: "manual" });

    const token = await mintPreviewToken(SECRET, {
      site: site.id,
      target: { snapshot: draft.id },
      ttlSeconds: 600,
    });
    const preview = await resolver.resolve(
      new Request(`https://site.example/?cloudhal-preview=${token}`),
    );
    expect(preview.kind).toBe("preview");
    expect(tasks).toHaveLength(0);

    const live = await resolver.resolve(new Request("https://site.example/"));
    expect(live).toMatchObject({ kind: "published", snapshotId: history.id });
    expect(tasks).toHaveLength(1);
    await Promise.all(tasks);
    expect((await store.readSnapshotBundle(history))?.size).toBe(history.nodes.length);
    expect(await store.readSnapshotBundle(draft)).toBeUndefined();
  });
});
