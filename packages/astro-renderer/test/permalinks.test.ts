/** RFC-0038 on the public site: an entry answers at its collection's permalink, the old URL redirects. */
import type { Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { resolveRoute } from "../src/routing.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "../src/source.ts";

async function moved(): Promise<{ store: SiteGraphStore; site: Site }> {
  const store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  });
  await store.init();
  const seeded = await seedStarterSite(store, { name: "Links", slug: "links" });
  const site = await store.updateSite({
    ...seeded,
    collections: { posts: { permalink: "/blog/{slug}" } },
  });
  return { store, site };
}

describe("RFC-0038 collection permalinks on the public site", () => {
  it("serves the entry at /blog/<slug> and redirects /posts/<slug> there (live and snapshot)", async () => {
    const { store, site } = await moved();
    const snap = await store.createSnapshot(site.id, {
      actor: { kind: "system", id: "sys_test0001" },
      reason: "manual",
    });
    const sources: GraphSource[] = [
      new LiveSource(store, site.id),
      await SnapshotSource.open(store, snap.id),
    ];
    for (const source of sources) {
      const served = await resolveRoute(source, "/blog/hello-world");
      expect(served.kind).toBe("entry");
      if (served.kind === "entry") expect(served.entry.slug).toBe("hello-world");
      expect(await resolveRoute(source, "/posts/hello-world", { search: "?ref=x" })).toEqual({
        kind: "redirect",
        status: 301,
        location: "/blog/hello-world?ref=x",
      });
    }
  });
});
