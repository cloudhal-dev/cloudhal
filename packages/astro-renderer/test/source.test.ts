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
});
