/**
 * `createSnapshot` stores node bodies under `nodes/<hash>.json`. Bodies are content-addressed and
 * never deleted, so a snapshot only checks and writes the hashes its parent does not hold: an edit
 * to one node costs one blob round trip, not one per node of the site.
 */
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { SiteGraphStore, seedStarterSite } from "../src/index.ts";

const ACTOR = { kind: "human" as const, id: "user_snapcount01" };

class CountingBlobs extends MemoryBlobStore {
  heads = 0;
  puts = 0;
  override async head(key: string) {
    this.heads++;
    return super.head(key);
  }
  override async put(...args: Parameters<MemoryBlobStore["put"]>) {
    this.puts++;
    return super.put(...args);
  }
}

describe("createSnapshot blob writes", () => {
  it("touches only the hashes the previous snapshot does not hold", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new CountingBlobs();
    const store = new SiteGraphStore({ sql, blobs });
    await store.init();
    const site = await seedStarterSite(store, { name: "Counted", slug: "counted" });
    const first = await store.createSnapshot(site.id, { actor: ACTOR, reason: "manual" });
    expect(first.nodes.length).toBeGreaterThan(2);
    for (const n of first.nodes) expect(await blobs.get(`nodes/${n.hash}.json`)).not.toBeNull();

    blobs.heads = 0;
    blobs.puts = 0;
    const again = await store.createSnapshot(site.id, { actor: ACTOR, reason: "manual" });
    expect([blobs.heads, blobs.puts]).toEqual([0, 0]);
    expect(again.nodes).toEqual(first.nodes);

    const current = await store.getSite(site.id);
    if (!current) throw new Error("site missing");
    const renamed = await store.updateSite({ ...current, name: "Renamed" });
    const third = await store.createSnapshot(site.id, { actor: ACTOR, reason: "manual" });
    expect([blobs.heads, blobs.puts]).toEqual([1, 1]);
    const ref = third.nodes.find((n) => n.id === renamed.id);
    expect(ref?.hash).not.toBe(first.nodes.find((n) => n.id === renamed.id)?.hash);
    if (!ref) throw new Error("site ref missing");
    expect((await store.readSnapshotNode(ref)) as { name: string }).toMatchObject({
      name: "Renamed",
    });
  });
});
