import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, createTableReset } from "@cloudhal/storage/testing";
import Database from "better-sqlite3";
import { describeMcpOauthBounds } from "../src/testing-mcp-oauth-bounds.ts";
import { describeMcpOauthRegistration } from "../src/testing-mcp-oauth-registration.ts";

const sqlite = {
  async create() {
    const database = new Database(":memory:");
    const sql = new BetterSqlite3Driver(database);
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs });
    await store.init();
    return { store, sql, blobs, database };
  },
};
describeMcpOauthRegistration("better-sqlite3", sqlite);
describeMcpOauthBounds("better-sqlite3", sqlite);

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
const reset = createTableReset();
const miniflare = {
  async create() {
    d1 ??= await createMiniflareD1();
    const sql = new D1Driver(d1.db);
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs });
    await reset(sql, () => store.init());
    return { store, sql, blobs, database: d1.db };
  },
};
// One Miniflare for both suites (the table reset keeps its schema); closed after the second.
describeMcpOauthRegistration("Cloudflare D1 (Miniflare)", miniflare);
describeMcpOauthBounds("Cloudflare D1 (Miniflare)", {
  ...miniflare,
  async dispose() {
    await d1?.dispose();
  },
});
