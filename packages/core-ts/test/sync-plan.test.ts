/**
 * `planImport` (RFC-0039 invariants 2, 3 and 6): what an import would change, with every refusal
 * `importSite` throws, and no write; and `importSite` refusing before its first write (node bodies
 * that are not the nodes their snapshot refs name, ids another site holds, rows the node batch's
 * keys refuse, malformed takedowns), so a refused push or pull leaves the target as it was.
 */
import type { ContentEntry, NodeRef, Page, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { mediaBlobKey } from "../src/assets.ts";
import { InvariantError } from "../src/errors.ts";
import { canonicalJson, nodeHash, sha256Hex } from "../src/hash.ts";
import { makePng, PNG_1X1 } from "../src/media/fixtures.ts";
import { uniquenessKey } from "../src/nodes.ts";
import { seedStarterSite } from "../src/seed.ts";
import { SiteGraphStore } from "../src/store.ts";
import {
  copySite,
  exportSite,
  importSite,
  type NodeRow,
  planImport,
  type SiteBundle,
  SyncConflictError,
} from "../src/sync.ts";

const actor = { kind: "human" as const, id: "user_plan000001" };

async function pair() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  return { sql, blobs, store };
}

type Pair = Awaited<ReturnType<typeof pair>>;

async function counts(p: Pair) {
  const n = async (table: string) =>
    (await p.sql.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))?.n;
  return {
    nodes: await n("nodes"),
    snapshots: await n("snapshots"),
    projects: await n("projects"),
    blobs: await p.blobs.list(),
  };
}

async function upload(p: Pair, siteId: string, bytes: Uint8Array, filename: string) {
  const { asset } = await p.store.ingestAsset({
    siteId,
    bytes,
    filename,
    uploadedBy: actor,
    source: { kind: "upload" },
  });
  return asset;
}

async function editAbout(p: Pair, siteId: string, title: string): Promise<Page> {
  const about = (await p.store.listPages(siteId)).find((x) => x.path === "/about") as Page;
  return p.store.updatePage({ ...about, title });
}

const refsOf = (bundle: SiteBundle, snapshotId: string): NodeRef[] =>
  (
    JSON.parse(bundle.snapshots.find((s) => s.id === snapshotId)?.body ?? "{}") as {
      nodes: NodeRef[];
    }
  ).nodes;

/** `bundle` with one ref of snapshot `snapshotId` pointing at `body`, added to the blobs. */
async function pointAt(bundle: SiteBundle, snapshotId: string, refId: string, body: unknown) {
  const text = canonicalJson(body);
  const hash = await sha256Hex(text);
  const snapshots = bundle.snapshots.map((s) => {
    if (s.id !== snapshotId) return s;
    const snap = JSON.parse(s.body) as { nodes: NodeRef[] };
    for (const ref of snap.nodes) if (ref.id === refId) ref.hash = hash;
    return { ...s, body: JSON.stringify(snap) };
  });
  return { hash, bundle: { ...bundle, snapshots, blobs: { ...bundle.blobs, [hash]: text } } };
}

/** A row with another id (and `edit`ed body), its key and hash recomputed. */
async function rowWith(row: NodeRow, id: string, edit: (body: Page) => void = () => {}) {
  const body = { ...(JSON.parse(row.body) as Page), id };
  edit(body);
  return {
    ...row,
    id,
    key: uniquenessKey("page", body),
    body: canonicalJson(body),
    hash: await nodeHash(body),
  };
}

describe("planImport", () => {
  it("plans a fresh import without writing anything", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Plan", slug: "plan" });
    const asset = await upload(src, site.id, PNG_1X1, "dot.png");
    const entry = (await src.store.listContentEntries(site.id))[0] as ContentEntry;
    await src.store.updateContentEntry({
      ...entry,
      coverImage: { assetId: asset.id, alt: "" } as NonNullable<ContentEntry["coverImage"]>,
    });
    const snap = await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await exportSite(src, site.id);
    const dst = await pair();
    const empty = await counts(dst);

    const plan = await planImport(dst, bundle, { report: true });
    expect(plan).toMatchObject({
      siteId: site.id,
      mode: "bootstrap",
      fresh: true,
      unchanged: false,
      snapshots: [snap.id],
      blobs: Object.keys(bundle.blobs).length,
      projectAdded: true,
      takedowns: { listed: 0, bytesHere: [] },
    });
    expect(plan.conflict).toBeUndefined();
    expect(plan.nodes.added.map((n) => n.id).sort()).toEqual(bundle.nodes.map((n) => n.id).sort());
    expect(plan.nodes.changed).toEqual([]);
    expect(plan.nodes.removed).toEqual([]);
    expect(plan.media.missing.map((m) => m.sha256)).toEqual([asset.sha256]);
    expect(await counts(dst)).toEqual(empty);
    expect(empty).toMatchObject({ nodes: 0, snapshots: 0, projects: 0, blobs: [] });
    // Without `report`, missing media throw as importSite does.
    await expect(planImport(dst, bundle)).rejects.toMatchObject({ code: "missing_media" });
  });

  it("refuses a diverged bootstrap before any write; report returns the conflict (invariant 6)", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Plan", slug: "plan" });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    await copySite(src, dst, site.id);
    const there = await editAbout(dst, site.id, "Edited on the target");
    await editAbout(src, site.id, "Edited here");
    const here = await editAbout(src, site.id, "Edited here again");
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await exportSite(src, site.id);
    const before = await counts(dst);

    const error = await importSite(dst, bundle).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncConflictError);
    // No node body and no snapshot of the refused bundle landed.
    expect(await counts(dst)).toEqual(before);
    expect(await dst.blobs.list("nodes/")).toEqual(before.blobs);

    const plan = await planImport(dst, bundle, { report: true });
    expect(plan.conflict).toEqual((error as SyncConflictError).differing);
    expect(plan.conflict).toContain(there.id);
    expect(plan.fresh).toBe(false);
    expect(plan.snapshots).toHaveLength(1);
    expect(plan.nodes.changed.map((c) => [c.to.id, c.from.rev, c.to.rev])).toContainEqual([
      here.id,
      there.rev,
      here.rev,
    ]);
    expect(here.rev).not.toBe(there.rev);
    await expect(planImport(dst, bundle)).rejects.toBeInstanceOf(SyncConflictError);
    expect(await counts(dst)).toEqual(before);
  });

  it("reports media present, missing, of another size and taken down on the target", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Media", slug: "media" });
    const a = await upload(src, site.id, PNG_1X1, "a.png");
    const b = await upload(src, site.id, makePng({ width: 2, height: 2 }), "b.png");
    const c = await upload(src, site.id, makePng({ width: 3, height: 2 }), "c.png");
    const d = await upload(src, site.id, makePng({ width: 4, height: 2 }), "d.png");
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    // D stays in the snapshot only, so taking it down on the target changes no node.
    await src.store.deleteAsset(d);
    await copySite(src, dst, site.id);
    await dst.blobs.delete(mediaBlobKey(site.id, b.sha256));
    await dst.blobs.put(mediaBlobKey(site.id, c.sha256), new Uint8Array([1, 2, 3]));
    await dst.store.purgeBlob(site.id, d.sha256, actor, { text: "notice", legal: false });
    const bundle = await exportSite(src, site.id);

    const plan = await planImport(dst, bundle, { report: true });
    const shas = (list: { sha256: string }[]) => list.map((m) => m.sha256).sort();
    expect(plan.unchanged).toBe(true);
    expect(shas(plan.media.present)).toEqual([a.sha256]);
    expect(shas(plan.media.missing)).toEqual([b.sha256, d.sha256].sort());
    expect(shas(plan.media.wrongSize)).toEqual([c.sha256]);
    expect(shas(plan.media.takenDownHere)).toEqual([d.sha256]);
    const error = await importSite(dst, bundle).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvariantError);
    expect(error).toMatchObject({
      code: "missing_media",
      message: "the target is missing 2 media file(s); copy them first",
    });
  });

  it("refuses a node body that is not JSON without quoting it, before any write", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Bodies", slug: "bodies" });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await exportSite(src, site.id);
    const [hash] = Object.keys(bundle.blobs).sort() as [string];
    const crafted = { ...bundle, blobs: { ...bundle.blobs, [hash]: "\u001b[31m{" } };
    const dst = await pair();
    const error = (await importSite(dst, crafted).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe(`blob ${hash} is not JSON`);
    expect(error.message).not.toMatch(/\p{Cc}/u);
    expect(await counts(dst)).toMatchObject({ nodes: 0, snapshots: 0, blobs: [] });
  });

  it("refuses a node body a snapshot references that is not the node its ref names (invariant 2)", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Bodies", slug: "bodies" });
    const asset = await upload(src, site.id, PNG_1X1, "dot.png");
    const v1 = await src.store.createSnapshot(site.id, { actor, reason: "publish" });
    await src.store.publish((await src.store.getSite(site.id)) as Site, v1.id);
    // v2 keeps the original bodies referenced once v1's refs are pointed elsewhere.
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await exportSite(src, site.id);
    const [first, second] = refsOf(bundle, v1.id).filter((r) => r.kind === "page") as [
      NodeRef,
      NodeRef,
    ];
    const secondBody = JSON.parse(bundle.blobs[second.hash] as string) as unknown;
    const dst = await pair();
    await dst.blobs.put(mediaBlobKey(site.id, asset.sha256), PNG_1X1);
    const before = await counts(dst);
    const cases = [
      // The published snapshot's page: what the renderer would read.
      [
        first.id,
        { id: "not-a-page", title: 42, blocks: "<script>x</script>" },
        "is not a valid page",
      ],
      // A valid page, but another one.
      [first.id, secondBody, "is not the page its snapshot ref names"],
      // An asset the media ledger would read after the node set landed.
      [asset.id, {}, "is not a valid asset"],
    ] as const;
    for (const [refId, body, what] of cases) {
      const crafted = await pointAt(bundle, v1.id, refId, body);
      for (const run of [
        () => importSite(dst, crafted.bundle),
        () => planImport(dst, crafted.bundle, { report: true }),
      ]) {
        const error = (await run().catch((e: unknown) => e)) as Error;
        expect(error.message).toBe(`blob ${crafted.hash} ${what}`);
      }
      expect(await counts(dst)).toEqual(before);
    }
    // A body no snapshot references.
    const stray = canonicalJson({ stray: true });
    const strayHash = await sha256Hex(stray);
    await expect(
      importSite(dst, { ...bundle, blobs: { ...bundle.blobs, [strayHash]: stray } }),
    ).rejects.toThrow(`blob ${strayHash} is not referenced by any snapshot`);
    expect(await counts(dst)).toEqual(before);
    expect(before).toMatchObject({ nodes: 0, snapshots: 0, projects: 0 });
    // The bundle itself imports.
    await importSite(dst, bundle);
  });

  it("refuses ids another site holds, rows the node batch's keys refuse and malformed takedowns, before any write", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Rows", slug: "rows" });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const bundle = await exportSite(src, site.id);
    const dst = await pair();
    const other = await seedStarterSite(dst.store, { name: "Other", slug: "other" });
    const theirs = await dst.store.createSnapshot(other.id, { actor, reason: "manual" });
    const theirPage = (await dst.store.listPages(other.id))[0] as Page;
    const before = await counts(dst);
    const page = bundle.nodes.find((n) => n.kind === "page") as NodeRow;
    const nodes = (...extra: NodeRow[]) => [...bundle.nodes.filter((n) => n !== page), ...extra];
    const [snap] = bundle.snapshots as [SiteBundle["snapshots"][number]];
    const snapBody = { ...(JSON.parse(snap.body) as object), id: theirs.id };
    const group = { group: page.id, method: "original" } as const;
    const cases: [Partial<SiteBundle>, string][] = [
      [
        { nodes: nodes(await rowWith(page, theirPage.id)) },
        `node ${theirPage.id} belongs to another site of this installation`,
      ],
      [
        { snapshots: [{ ...snap, id: theirs.id, body: JSON.stringify(snapBody) }] },
        `snapshot ${theirs.id} belongs to another site of this installation`,
      ],
      [
        { nodes: nodes(page, await rowWith(page, "page_dup0000001")) },
        "node page_dup0000001: another page has its key",
      ],
      [
        {
          nodes: nodes(
            await rowWith(page, page.id, (b) => {
              b.translation = group;
            }),
            await rowWith(page, "page_tr00000002", (b) => {
              b.path = "/copy";
              b.translation = { ...group, method: "human" };
            }),
          ),
        },
        "node page_tr00000002: another page of its translation group has its locale",
      ],
      [{ snapshots: [snap, snap] }, `snapshot ${snap.id} appears twice`],
      [
        {
          purged: [{ sha256: "a".repeat(64), reason: null as never, legal: false, by: "", at: "" }],
        },
        "bundle takedown entry is malformed",
      ],
    ];
    for (const [edit, message] of cases) {
      await expect(importSite(dst, { ...bundle, ...edit })).rejects.toThrow(message);
      expect(await counts(dst)).toEqual(before);
    }
  });

  it("reads the target's own asset bodies for the media ledger, never the bundle's text for them", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Ledger", slug: "ledger" });
    const asset = await upload(src, site.id, PNG_1X1, "dot.png");
    const snap = await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    await copySite(src, dst, site.id);
    const bundle = await exportSite(src, site.id);
    const ref = refsOf(bundle, snap.id).find((r) => r.kind === "asset") as NodeRef;
    // Not JSON: before, the ledger parsed it after the node set had landed.
    const crafted = { ...bundle, blobs: { ...bundle.blobs, [ref.hash]: "\u001b[31m{" } };
    expect(await importSite(dst, crafted)).toMatchObject({
      nodes: { unchanged: true },
      snapshots: 0,
      blobs: 0,
    });
    expect(
      await dst.sql.all("SELECT sha256 FROM snapshot_blobs WHERE snapshot_id = ?", [snap.id]),
    ).toEqual([{ sha256: asset.sha256 }]);
  });

  it("refuses a site over the batch limit before any snapshot lands", async () => {
    const src = await pair();
    const site = await seedStarterSite(src.store, { name: "Big", slug: "big" });
    const nodes = (await exportSite(src, site.id)).nodes.length;
    for (let i = 0; nodes + i <= 1000; i++)
      await src.store.createRedirect({
        siteId: site.id,
        from: `/old-${i}`,
        to: "/about",
        status: 301,
        match: "exact",
        reason: "manual",
      });
    await src.store.createSnapshot(site.id, { actor, reason: "manual" });
    const dst = await pair();
    await expect(importSite(dst, await exportSite(src, site.id))).rejects.toThrow(
      /too many nodes .* for one atomic copy/,
    );
    expect(await counts(dst)).toMatchObject({ nodes: 0, snapshots: 0, blobs: [] });
  });

  it("keeps the published pointer of a published target for a push (published: target)", async () => {
    const src = await pair();
    const dst = await pair();
    const site = await seedStarterSite(src.store, { name: "Pointer", slug: "pointer" });
    const v1 = await src.store.createSnapshot(site.id, { actor, reason: "publish" });
    await src.store.publish((await src.store.getSite(site.id)) as Site, v1.id);
    await copySite(src, dst, site.id);
    const v2 = await dst.store.createSnapshot(site.id, { actor, reason: "publish" });
    await dst.store.publish((await dst.store.getSite(site.id)) as Site, v2.id);
    const bundle = await exportSite(src, site.id);
    const plan = await planImport(dst, bundle, { mode: "replace", published: "target" });
    // Only the pointer differs, and the target's is kept: nothing changes.
    expect(plan.unchanged).toBe(true);
    expect(plan.nodes.changed).toEqual([]);
  });
});
