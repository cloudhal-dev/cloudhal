import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { seedStarterSite } from "../src/seed.ts";
import { SiteGraphStore } from "../src/store.ts";
import { copySite, exportSite, importSite, SyncConflictError } from "../src/sync.ts";

const actor = { kind: "human" as const, id: "user_sync000001" };

async function pair() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  return { sql, blobs, store };
}

describe("copySite", () => {
  it("bootstraps an empty target with nodes, snapshots, blobs and the published pointer", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Sync", slug: "sync" });
    const v1 = await src.store.createSnapshot(site.id, { actor, reason: "publish" });
    await src.store.publish((await src.store.getSite(site.id)) as typeof site, v1.id);

    const r = await copySite(src, dst, site.id);
    expect(r.nodes.unchanged).toBe(false);
    expect(r.snapshots).toBe(1);
    expect(r.blobs).toBeGreaterThan(0);

    const copied = await dst.store.getSite(site.id);
    expect(copied?.publishedSnapshotId).toBe(v1.id);
    expect((await dst.store.listPages(site.id)).map((p) => p.path).sort()).toEqual(["/", "/about"]);
    const snap = await dst.store.getSnapshot(v1.id);
    const node = await dst.store.readSnapshotNode(
      snap?.nodes[0] as NonNullable<typeof snap>["nodes"][number],
    );
    expect(node.id).toBeDefined();
    // editing works on the target (revs/hashes preserved)
    const about = (await dst.store.listPages(site.id)).find((p) => p.path === "/about");
    await dst.store.updatePage({ ...(about as NonNullable<typeof about>), title: "Remote edit" });

    // the target diverged (an agent edited it there): a plain push must refuse
    const again = await copySite(src, dst, site.id).catch((e) => e);
    expect(again).toBeInstanceOf(SyncConflictError);
    expect((again as SyncConflictError).differing).toContain(about?.id);
  });

  it("is a no-op on identical content, adds new snapshots, and replaces only when asked", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Sync", slug: "sync" });
    await copySite(src, dst, site.id);
    const same = await copySite(src, dst, site.id);
    expect(same).toEqual({
      nodes: { inserted: 0, deleted: 0, unchanged: true },
      snapshots: 0,
      blobs: 0,
    });

    const about = (await src.store.listPages(site.id)).find((p) => p.path === "/about");
    await src.store.updatePage({ ...(about as NonNullable<typeof about>), title: "Local edit" });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    await expect(copySite(src, dst, site.id)).rejects.toThrow(SyncConflictError);
    const replaced = await copySite(src, dst, site.id, { mode: "replace" });
    expect(replaced.snapshots).toBe(1);
    expect((await dst.store.getPage(about?.id as string))?.title).toBe("Local edit");

    // pull direction uses the same function
    const back = await pair();
    await copySite(dst, back, site.id);
    expect((await back.store.getPage(about?.id as string))?.title).toBe("Local edit");
  });

  it("fails loudly when the source is missing the site or a blob", async () => {
    const src = await pair();
    const dst = await pair();
    await expect(copySite(src, dst, "site_missing00001")).rejects.toThrow(/no site/);
    const site = await seedStarterSite(src.store, { name: "Sync", slug: "sync" });
    const snap = await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    await src.blobs.delete(`nodes/${snap.nodes[0]?.hash}.json`);
    await expect(copySite(src, dst, site.id)).rejects.toThrow(/missing/);
    expect(await dst.store.getSite(site.id)).toBeUndefined();
  });

  it("round-trips as JSON and rejects tampered or foreign bundles", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Bundle", slug: "bundle" });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = JSON.parse(JSON.stringify(await exportSite(src, site.id)));
    expect(bundle.format).toBe("cloudhal.site-bundle@1");
    expect(Object.keys(bundle.blobs).length).toBeGreaterThan(0);

    const ok = await pair();
    await importSite(ok, bundle);
    expect((await ok.store.listPages(site.id)).length).toBe(2);

    const [hash] = Object.keys(bundle.blobs) as [string];
    const tampered = {
      ...bundle,
      blobs: { ...bundle.blobs, [hash]: JSON.stringify({ evil: true }) },
    };
    await expect(importSite(await pair(), tampered)).rejects.toThrow(/does not match/);

    const foreign = {
      ...bundle,
      nodes: [
        ...bundle.nodes,
        { ...bundle.nodes[0], id: "page_other000001", site_id: "site_other000001" },
      ],
    };
    await expect(importSite(await pair(), foreign)).rejects.toThrow(/another site/);

    const missing = { ...bundle, blobs: {} };
    await expect(importSite(await pair(), missing)).rejects.toThrow(/missing blob/);
    await expect(importSite(await pair(), { ...bundle, format: "nope" })).rejects.toThrow(/format/);
  });
});
