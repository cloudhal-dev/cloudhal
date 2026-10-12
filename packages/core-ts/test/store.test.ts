import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1 } from "@cloudhal/storage/testing";
import { describeSiteGraphStore } from "../src/testing.ts";
import { gatesSuite } from "../src/testing-gates.ts";

const sqlite = {
  create: async () => ({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  }),
};
describeSiteGraphStore("better-sqlite3 + memory blobs", sqlite);
gatesSuite("better-sqlite3 + memory blobs", sqlite);

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
const miniflare = {
  async create() {
    d1 ??= await createMiniflareD1();
    return { sql: new D1Driver(d1.db), blobs: new MemoryBlobStore() };
  },
  async dispose() {
    await d1?.dispose();
    d1 = undefined;
  },
};
describeSiteGraphStore("Cloudflare D1 (Miniflare) + memory blobs", miniflare);
gatesSuite("Cloudflare D1 (Miniflare) + memory blobs", miniflare);
