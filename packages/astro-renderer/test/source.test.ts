import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { LiveSource, SnapshotSource } from "../src/source.ts";

describe("GraphSource", () => {
  let store: SiteGraphStore;
  let siteId: string;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    siteId = (await seedStarterSite(store, { name: "Demo", slug: "demo" })).id;
  });

  it("LiveSource reflects edits immediately and orders pages by Site.pageIds", async () => {
    const live = new LiveSource(store, siteId);
    expect((await live.pages()).map((p) => p.path)).toEqual(["/", "/about"]);
    const about = await live.pageByPath("/about");
    expect(about?.title).toBe("About");
    await store.updatePage({ ...(about as NonNullable<typeof about>), title: "About us" });
    expect((await live.pageByPath("/about"))?.title).toBe("About us");
    expect((await live.entries("posts")).map((e) => e.slug)).toEqual(["hello-world"]);
    expect(await live.entryBySlug("posts", "missing")).toBeUndefined();
  });

  it("SnapshotSource is frozen at the snapshot and hides drafts", async () => {
    const live = new LiveSource(store, siteId);
    const snap = await store.createSnapshot(siteId, {
      actor: { kind: "system", id: "sys_test0001" },
      reason: "manual",
    });
    const frozen = await SnapshotSource.open(store, snap.id);
    const about = (await live.pageByPath("/about")) as NonNullable<
      Awaited<ReturnType<typeof live.pageByPath>>
    >;
    await store.updatePage({ ...about, title: "Changed after snapshot" });
    const site = await store.getSite(siteId);
    await store.createPage(site as NonNullable<typeof site>, {
      siteId,
      path: "/draft",
      title: "Draft",
      locale: "en",
      status: "draft",
      sections: [],
    });
    expect((await frozen.pageByPath("/about"))?.title).toBe("About");
    expect((await frozen.pages()).map((p) => p.path)).toEqual(["/", "/about"]);
    expect((await live.pages()).map((p) => p.path)).toEqual(["/", "/about", "/draft"]);
    expect((await live.pageByPath("/about"))?.title).toBe("Changed after snapshot");
    expect((await frozen.entries("posts")).length).toBe(1);
    await expect(SnapshotSource.open(store, "snap_nope000001")).rejects.toThrow(/not found/);
  });

  it("both sources expose taxonomies, shown terms, filtered entries and redirects (RFC-0002 §7)", async () => {
    const live = new LiveSource(store, siteId);
    const tag = (await store.getTaxonomyByKey(siteId, "tag")) as NonNullable<
      Awaited<ReturnType<typeof store.getTaxonomyByKey>>
    >;
    await store.createRedirect({
      siteId,
      from: "/old-about",
      to: "/about",
      status: 301,
      match: "exact",
      reason: "manual",
    });
    const snap = await store.createSnapshot(siteId, {
      actor: { kind: "system", id: "sys_test0001" },
      reason: "manual",
    });
    // A later proposed tag is visible to authors in live mode only, never in a snapshot.
    await store.createTerm({
      siteId,
      taxonomyId: tag.id,
      slug: "proposed-one",
      status: "proposed",
      visibility: "public",
      labels: { en: { name: "Proposed one" } },
    });
    // Renderers ignore node kinds they do not know (forward compatibility).
    const frozen = new SnapshotSource(store, {
      ...snap,
      nodes: [
        ...snap.nodes,
        { id: "author_01HZX8K3Q9", kind: "author" as never, rev: 0, hash: "0".repeat(64) },
      ],
    });
    for (const source of [live, frozen]) {
      expect((await source.taxonomies()).map((t) => t.key).sort()).toEqual(["category", "tag"]);
      expect((await source.terms("category")).map((t) => t.slug)).toEqual(["news"]);
      expect((await source.termBySlug("tag", "cloudhal"))?.labels.en?.name).toBe("Cloudhal");
      expect(await source.termBySlug("tag", "nope")).toBeUndefined();
      expect(
        (await source.entriesByTerm("category", "news", { descendants: true })).map((e) => e.slug),
      ).toEqual(["hello-world"]);
      expect((await source.entriesByFilter("category:news+tag:cloudhal")).length).toBe(1);
      expect(await source.entriesByFilter("tag:unknown-term")).toEqual([]);
      expect((await source.redirectFor("/old-about/"))?.location).toBe("/about");
      expect(await source.redirectFor("/about")).toBeUndefined();
    }
    expect((await live.terms("tag")).map((t) => t.slug)).toEqual(["cloudhal", "proposed-one"]);
    expect((await frozen.terms("tag")).map((t) => t.slug)).toEqual(["cloudhal"]);
    expect(await frozen.terms("series")).toEqual([]);
  });
});
