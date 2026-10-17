import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, createTableReset } from "@cloudhal/storage/testing";
import { describeAssetsApi } from "../src/testing-assets.ts";

describeAssetsApi("better-sqlite3", {
  async create() {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    return { store, sql };
  },
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
const reset = createTableReset();
describeAssetsApi("Cloudflare D1 (Miniflare)", {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await reset(sql, () => store.init());
    return { store, sql };
  },
  async dispose() {
    await d1?.dispose();
  },
});
