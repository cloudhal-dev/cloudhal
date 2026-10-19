import type { ContentEntry } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { mediaBlobKey } from "../src/assets.ts";
import { PNG_1X1 } from "../src/media/fixtures.ts";
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

  it("round-trips taxonomies, terms and redirects; rows are validated by their declared kind (RFC-0002 inv. 15)", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Kinds", slug: "kinds" });
    await src.store.createRedirect({
      siteId: site.id,
      from: "/old-about",
      to: "/about",
      status: 301,
      match: "exact",
      reason: "manual",
    });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = JSON.parse(JSON.stringify(await exportSite(src, site.id)));
    expect(new Set(bundle.nodes.map((n: { kind: string }) => n.kind))).toEqual(
      new Set(["site", "page", "contentEntry", "taxonomy", "term", "redirect"]),
    );
    const dst = await pair();
    await importSite(dst, bundle);
    expect(await dst.store.listTaxonomies(site.id)).toEqual(
      await src.store.listTaxonomies(site.id),
    );
    expect(await dst.store.listTerms(site.id)).toEqual(await src.store.listTerms(site.id));
    expect((await dst.store.redirectFor(site.id, "/old-about"))?.location).toBe("/about");
    const [post] = await dst.store.listContentEntries(site.id, {
      filter: "category:news+tag:cloudhal",
    });
    expect(post?.slug).toBe("hello-world");
    // and the copy is identical: a second import is a no-op
    expect((await importSite(dst, bundle)).nodes.unchanged).toBe(true);

    const term = bundle.nodes.find((n: { kind: string }) => n.kind === "term");
    const variants: [string, (b: typeof bundle) => void, RegExp][] = [
      [
        "term claimed as page",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === term.id).kind = "page";
        },
        /not a valid page/,
      ],
      [
        "term claimed as taxonomy",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === term.id).kind = "taxonomy";
        },
        /not a valid taxonomy/,
      ],
      [
        "unknown kind",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === term.id).kind = "author";
        },
        /unknown kind author/,
      ],
      [
        "wrong key",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === term.id).key = "tax_x:other";
        },
        /columns do not match/,
      ],
    ];
    for (const [name, mutate, error] of variants) {
      const b = JSON.parse(JSON.stringify(bundle));
      mutate(b);
      await expect(importSite(await pair(), b), name).rejects.toThrow(error);
    }
  });

  it("rejects rows whose columns or contents disagree with their bodies (security review L6)", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Rows", slug: "rows" });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = JSON.parse(JSON.stringify(await exportSite(src, site.id)));
    const page = bundle.nodes.find((n: { kind: string }) => n.kind === "page");
    const variants: [string, (b: typeof bundle) => void, RegExp][] = [
      [
        "invalid body",
        (b) => {
          const n = b.nodes.find((x: { id: string }) => x.id === page.id);
          n.body = JSON.stringify({ ...JSON.parse(n.body), path: "not a path" });
        },
        /not a valid page/,
      ],
      [
        "kind swap",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === page.id).kind = "contentEntry";
        },
        /not a valid content-entry|columns/,
      ],
      [
        "stale hash",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === page.id).hash = "0".repeat(64);
        },
        /hash does not match/,
      ],
      [
        "rev mismatch",
        (b) => {
          b.nodes.find((x: { id: string }) => x.id === page.id).rev = 99;
        },
        /columns do not match/,
      ],
      [
        "snapshot of another site",
        (b) => {
          const s0 = b.snapshots[0];
          s0.body = JSON.stringify({ ...JSON.parse(s0.body), siteId: "site_other000001" });
        },
        /snapshot .* columns/,
      ],
    ];
    for (const [name, mutate, error] of variants) {
      const b = JSON.parse(JSON.stringify(bundle));
      mutate(b);
      await expect(importSite(await pair(), b), name).rejects.toThrow(error);
    }
    await expect(importSite(await pair(), bundle)).resolves.toBeDefined();
  });

  it("copies media bytes before the bundle; a target without them refuses it (RFC-0004 §4.7)", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Sync", slug: "sync" });
    const { asset } = await src.store.ingestAsset({
      siteId: site.id,
      bytes: PNG_1X1,
      filename: "dot.png",
      uploadedBy: actor,
      source: { kind: "upload" },
    });
    const entry = (await src.store.listContentEntries(site.id))[0] as ContentEntry;
    await src.store.updateContentEntry({
      ...entry,
      coverImage: { assetId: asset.id, alt: "" } as NonNullable<ContentEntry["coverImage"]>,
    });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await exportSite(src, site.id);
    expect(bundle.media).toEqual([
      { sha256: asset.sha256, bytes: asset.bytes, mediaType: "image/png" },
    ]);
    await expect(importSite(dst, bundle)).rejects.toMatchObject({ code: "missing_media" });
    // A bundle cannot hide an asset's content by leaving it out of the list.
    await expect(importSite(dst, { ...bundle, media: [] })).rejects.toMatchObject({
      code: "missing_media",
    });
    await copySite(src, dst, site.id);
    expect(await dst.blobs.get(mediaBlobKey(site.id, asset.sha256))).toEqual(PNG_1X1);
    expect((await dst.store.getAsset(asset.id))?.sha256).toBe(asset.sha256);
    expect((await dst.store.blobState(site.id, asset.sha256))?.state).toBe("stored");
    expect((await dst.store.assetUsage(site.id, [asset.id])).get(asset.id)?.total).toBe(1);
    const snap = (await dst.store.listSnapshots(site.id))[0];
    const rows = await dst.sql.all<{ sha256: string }>(
      "SELECT sha256 FROM snapshot_blobs WHERE snapshot_id = ?",
      [snap?.id ?? ""],
    );
    expect(rows.map((r) => r.sha256)).toEqual([asset.sha256]);
  });
});

describe("copySite publish pointer", () => {
  /** A site published once on `src`, copied to `dst`, then published again on `dst` (Studio). */
  async function publishedOnTarget() {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Pointer", slug: "pointer" });
    const v1 = await src.store.createSnapshot(site.id, { actor, reason: "publish" });
    await src.store.publish((await src.store.getSite(site.id)) as typeof site, v1.id);
    await copySite(src, dst, site.id);
    const about = (await dst.store.listPages(site.id)).find((p) => p.path === "/about");
    await dst.store.updatePage({ ...(about as NonNullable<typeof about>), title: "Studio edit" });
    const v2 = await dst.store.createSnapshot(site.id, { actor, reason: "publish" });
    await dst.store.publish((await dst.store.getSite(site.id)) as typeof site, v2.id);
    return { src, dst, site, v1, v2, aboutId: about?.id as string };
  }

  it("a push replaces content but keeps the deployment's newer publish", async () => {
    const { src, dst, site, v1, v2, aboutId } = await publishedOnTarget();
    await src.store.updatePage({
      ...((await src.store.getPage(aboutId)) as NonNullable<
        Awaited<ReturnType<typeof src.store.getPage>>
      >),
      title: "Local edit",
    });
    // a site setting changed locally too: the written site node moves past both revs
    const local = (await src.store.getSite(site.id)) as typeof site;
    await src.store.updateSite({ ...local, name: "Pointer renamed" });
    const before = (await dst.store.getSite(site.id))?.rev as number;
    await copySite(src, dst, site.id, { mode: "replace", published: "target" });
    const after = await dst.store.getSite(site.id);
    expect(after?.publishedSnapshotId).toBe(v2.id);
    expect(after?.publishedSnapshotId).not.toBe(v1.id);
    expect((await dst.store.getPage(aboutId))?.title).toBe("Local edit");
    // a Studio edit holding the old rev now fails its compare-and-swap
    expect(after?.name).toBe("Pointer renamed");
    expect(after?.rev).toBeGreaterThan(before);
  });

  it("does not report a change when only the pointer differs", async () => {
    const { src, dst, site, v2 } = await publishedOnTarget();
    // the target's content equals the source again except for the published pointer
    await copySite(src, dst, site.id, { mode: "replace", published: "target" });
    const again = await copySite(src, dst, site.id, { published: "target" });
    expect(again.nodes.unchanged).toBe(true);
    expect((await dst.store.getSite(site.id))?.publishedSnapshotId).toBe(v2.id);
  });

  it("a pull mirrors the deployment's pointer; a never-published target takes the source's", async () => {
    const { src, dst, site, v2 } = await publishedOnTarget();
    await copySite(dst, src, site.id, { mode: "replace" });
    expect((await src.store.getSite(site.id))?.publishedSnapshotId).toBe(v2.id);

    const local = await pair();
    const fresh = await pair();
    const other = await seedStarterSite(local.store, { name: "Fresh", slug: "fresh" });
    const v = await local.store.createSnapshot(other.id, { actor, reason: "publish" });
    await local.store.publish((await local.store.getSite(other.id)) as typeof other, v.id);
    await copySite(local, fresh, other.id, { published: "target" });
    expect((await fresh.store.getSite(other.id))?.publishedSnapshotId).toBe(v.id);
  });
});
