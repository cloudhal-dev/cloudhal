import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import Database from "better-sqlite3";
import { describeRolesApi } from "../src/testing-roles.ts";

describeRolesApi("better-sqlite3", {
  async create() {
    const database = new Database(":memory:");
    const sql = new BetterSqlite3Driver(database);
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs });
    await store.init();
    return { store, sql, blobs, database };
  },
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
describeRolesApi("Cloudflare D1 (Miniflare)", {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    await dropAllTables(sql);
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs });
    await store.init();
    return { store, sql, blobs, database: d1.db };
  },
  async dispose() {
    await d1?.dispose();
  },
});
