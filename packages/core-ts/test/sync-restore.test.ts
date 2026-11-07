/**
 * `restoreBundle` (RFC-0039 §2, `cloudhal import --revert`): a snapshot's nodes as a bundle that
 * `importSite`'s replace writes back, the site node's publish pointer and hostnames with them;
 * revs only move forward, so an editor holding a rev a node had gets a conflict; content taken
 * down since stays down (invariant 5), and a missing node body is refused before any write.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { mediaBlobKey } from "../src/assets.ts";
import { ConflictError } from "../src/errors.ts";
import { PNG_1X1 } from "../src/media/fixtures.ts";
import { seedStarterSite } from "../src/seed.ts";
import { SiteGraphStore } from "../src/store.ts";
import { exportSite, importSite, planImport, restoreBundle } from "../src/sync.ts";

const actor = { kind: "human" as const, id: "user_restore0001" };

async function pair() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  return { sql, blobs, store };
}

type Pair = Awaited<ReturnType<typeof pair>>;

type Row = { id: string; rev: number; hash: string; body: string };

/** The node rows as the store holds them, without their timestamps. */
const rowsOf = (p: Pair, siteId: string) =>
  p.sql.all<Row>(
    "SELECT id, site_id, kind, key, rev, hash, body FROM nodes WHERE site_id = ? ORDER BY id",
    [siteId],
  );

/** The rows' content: without the rev a restore moves forward, and the hash that follows it. */
const contentOf = (rows: readonly Row[]) =>
  rows.map(({ rev: _rev, hash: _hash, body, ...row }) => ({
    ...row,
    body: { ...(JSON.parse(body) as object), rev: undefined },
  }));

const revsOf = (rows: readonly Row[]) => new Map(rows.map((r) => [r.id, r.rev]));

const hostsOf = (p: Pair) => p.sql.all("SELECT * FROM site_hosts ORDER BY host");

async function counts(p: Pair) {
  const n = async (table: string) =>
    (await p.sql.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))?.n;
  return { nodes: await n("nodes"), snapshots: await n("snapshots"), blobs: await p.blobs.list() };
}

async function publishNow(p: Pair, siteId: string) {
  const snap = await p.store.createSnapshot(siteId, { actor, reason: "publish" });
  await p.store.publish((await p.store.getSite(siteId)) as Site, snap.id);
  return snap;
}

describe("restoreBundle", () => {
  it("brings back a snapshot's nodes, the publish pointer and the hostnames", async () => {
    const p = await pair();
    const seeded = await seedStarterSite(p.store, { name: "Restore", slug: "restore" });
    const site = (await p.store.getSite(seeded.id)) as Site;
    await p.store.updateSite({
      ...site,
      domains: [{ hostname: "restore.example.com", primary: true }],
    });
    const live = await publishNow(p, site.id);
    const b = await p.store.createSnapshot(site.id, { actor, reason: "manual" });
    const rows = await rowsOf(p, site.id);
    const hosts = await hostsOf(p);
    expect(hosts).toHaveLength(1);

    // Edits after it: a retitled page, a deleted entry, a new page, no domain, another publish.
    const about = (await p.store.listPages(site.id)).find((x) => x.path === "/about") as Page;
    await p.store.updatePage({ ...about, title: "Changed" });
    const entry = (await p.store.listContentEntries(site.id))[0] as ContentEntry;
    await p.store.deleteContentEntry(entry);
    await p.store.createPage((await p.store.getSite(site.id)) as Site, {
      siteId: site.id,
      path: "/new",
      title: "New",
      locale: "en",
      status: "draft",
      sections: [],
    });
    await p.store.updateSite({ ...((await p.store.getSite(site.id)) as Site), domains: [] });
    const later = await publishNow(p, site.id);
    expect(await hostsOf(p)).toEqual([]);
    const edited = revsOf(await rowsOf(p, site.id));

    const bundle = await restoreBundle(p, b);
    expect(bundle).toMatchObject({ siteId: site.id, snapshots: [], blobs: {} });
    expect(bundle.project).toBeUndefined();
    const plan = await planImport(p, bundle, { mode: "replace" });
    expect(plan).toMatchObject({ snapshots: [], blobs: 0, unchanged: false, fresh: false });
    expect(plan.nodes.added.map((n) => n.id)).toContain(entry.id);
    await importSite(p, bundle, { mode: "replace" });
    const now = await rowsOf(p, site.id);
    expect(contentOf(now)).toEqual(contentOf(rows));
    // A node edited since comes back at the rev after its current one; the rest as they were.
    const atB = revsOf(rows);
    const moved = (id: string) => edited.has(id) && edited.get(id) !== atB.get(id);
    expect(revsOf(now)).toEqual(
      new Map(rows.map((r) => [r.id, moved(r.id) ? (edited.get(r.id) as number) + 1 : r.rev])),
    );
    expect([about.id, site.id].every(moved)).toBe(true);
    expect((await planImport(p, await restoreBundle(p, b), { mode: "replace" })).unchanged).toBe(
      true,
    );
    const restored = (await p.store.getSite(site.id)) as Site;
    expect(restored.publishedSnapshotId).toBe(live.id);
    expect(restored.publishedSnapshotId).not.toBe(later.id);
    expect(await hostsOf(p)).toEqual(hosts);
  });

  it("moves revs forward: an editor holding a rev the node had gets a conflict", async () => {
    const p = await pair();
    const site = await seedStarterSite(p.store, { name: "Revs", slug: "revs" });
    const start = await exportSite(p, site.id);
    const aboutOf = async () =>
      (await p.store.listPages(site.id)).find((x) => x.path === "/about") as Page;
    const first = await aboutOf();
    await p.store.updatePage({ ...first, title: "Before" });
    const b = await p.store.createSnapshot(site.id, { actor, reason: "manual" });
    // A replace keeps the bundle's revs: the page is back at the rev it had first, and one edit
    // later at the rev the snapshot holds, with other content (a Studio tab now holds that rev).
    await importSite(p, start, { mode: "replace" });
    const tab = await p.store.updatePage({ ...(await aboutOf()), title: "After" });
    expect(tab.rev).toBe(b.nodes.find((n) => n.id === first.id)?.rev);

    await importSite(p, await restoreBundle(p, b), { mode: "replace" });
    expect(await aboutOf()).toMatchObject({ title: "Before", rev: tab.rev + 1 });
    await expect(p.store.updatePage({ ...tab, title: "Stale" })).rejects.toThrow(ConflictError);
    expect((await aboutOf()).title).toBe("Before");
    expect((await planImport(p, await restoreBundle(p, b), { mode: "replace" })).unchanged).toBe(
      true,
    );
  });

  it("keeps content taken down after the snapshot down: the asset comes back, its bytes do not", async () => {
    const p = await pair();
    const site = await seedStarterSite(p.store, { name: "Media", slug: "media" });
    const { asset } = await p.store.ingestAsset({
      siteId: site.id,
      bytes: PNG_1X1,
      filename: "a.png",
      uploadedBy: actor,
      source: { kind: "upload" },
    });
    const b = await p.store.createSnapshot(site.id, { actor, reason: "manual" });
    const rows = await rowsOf(p, site.id);
    await p.store.purgeBlob(site.id, asset.sha256, actor, { text: "notice", legal: false });
    const bundle = await restoreBundle(p, b);
    expect(bundle.purged?.map((x) => x.sha256)).toEqual([asset.sha256]);
    expect(bundle.media).toBeUndefined();
    await importSite(p, bundle, { mode: "replace" });
    expect(contentOf(await rowsOf(p, site.id))).toEqual(contentOf(rows));
    expect(await p.blobs.head(mediaBlobKey(site.id, asset.sha256))).toBeNull();
    const ledger = await p.sql.get(
      "SELECT state FROM media_blobs WHERE site_id = ? AND sha256 = ?",
      [site.id, asset.sha256],
    );
    expect(ledger).toEqual({ state: "purged" });
  });

  it("lists the media the snapshot's assets need", async () => {
    const p = await pair();
    const site = await seedStarterSite(p.store, { name: "Listed", slug: "listed" });
    const { asset } = await p.store.ingestAsset({
      siteId: site.id,
      bytes: PNG_1X1,
      filename: "a.png",
      uploadedBy: actor,
      source: { kind: "upload" },
    });
    const b = await p.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await restoreBundle(p, b);
    expect(bundle.media).toEqual([
      { sha256: asset.sha256, bytes: asset.bytes, mediaType: asset.mediaType },
    ]);
    expect(bundle.purged).toBeUndefined();
    expect((await planImport(p, bundle, { mode: "replace" })).unchanged).toBe(true);
  });

  it("refuses a snapshot whose node body is missing, before anything is written", async () => {
    const p = await pair();
    const site = await seedStarterSite(p.store, { name: "Gone", slug: "gone" });
    const b = await p.store.createSnapshot(site.id, { actor, reason: "manual" });
    const ref = b.nodes.find((n) => n.kind === "page");
    if (!ref) throw new Error("no page ref");
    await p.blobs.delete(`nodes/${ref.hash}.json`);
    const before = await counts(p);
    await expect(restoreBundle(p, b)).rejects.toThrow(
      `snapshot ${b.id} references a missing blob ${ref.hash}`,
    );
    expect(await counts(p)).toEqual(before);
  });
});
