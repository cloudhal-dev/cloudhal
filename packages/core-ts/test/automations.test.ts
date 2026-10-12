import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1 } from "@cloudhal/storage/testing";
import { automationsSuite } from "../src/testing-automations.ts";

automationsSuite("better-sqlite3 + memory blobs", {
  create: async () => ({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  }),
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
automationsSuite("Cloudflare D1 (Miniflare) + memory blobs", {
  async create() {
    d1 ??= await createMiniflareD1();
    return { sql: new D1Driver(d1.db), blobs: new MemoryBlobStore() };
  },
  async dispose() {
    await d1?.dispose();
    d1 = undefined;
  },
});
