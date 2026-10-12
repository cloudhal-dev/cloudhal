import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { describeApi } from "../src/testing.ts";

describeApi("better-sqlite3", {
  async create() {
    const store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    return store;
  },
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
describeApi("Cloudflare D1 (Miniflare)", {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    await dropAllTables(sql);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    return store;
  },
  async dispose() {
    await d1?.dispose();
  },
});
