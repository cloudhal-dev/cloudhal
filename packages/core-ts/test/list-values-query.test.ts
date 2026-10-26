/**
 * RFC-0042 §4, #110: list-value queries in SQL equal the in-memory evaluator on random data and
 * queries, on each storage backend (`src/testing-list-values-query.ts`).
 */
import { MemoryBlobStore, SqlBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, createMiniflareDoSqlite } from "@cloudhal/storage/testing";
import { listValuesQuerySuite } from "../src/testing-list-values-query.ts";

listValuesQuerySuite("better-sqlite3 + memory blobs", {
  create: async () => ({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  }),
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
listValuesQuerySuite("Cloudflare D1 (Miniflare) + memory blobs", {
  async create() {
    d1 ??= await createMiniflareD1();
    return { sql: new D1Driver(d1.db), blobs: new MemoryBlobStore() };
  },
  async dispose() {
    await d1?.dispose();
    d1 = undefined;
  },
});

let doSqlite: Awaited<ReturnType<typeof createMiniflareDoSqlite>> | undefined;
listValuesQuerySuite("Durable Object SQLite (Miniflare) + sql blobs", {
  async create() {
    doSqlite ??= await createMiniflareDoSqlite();
    const sql = doSqlite.driver("store");
    return { sql, blobs: new SqlBlobStore(sql) };
  },
  async dispose() {
    await doSqlite?.dispose();
    doSqlite = undefined;
  },
});
