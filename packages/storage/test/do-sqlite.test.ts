import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrations } from "../migrations/index.ts";
import { SqlBlobStore } from "../src/blob/sql.ts";
import { migrate } from "../src/migrate.ts";
import {
  createMiniflareDoSqlite,
  describeBlobStoreConformance,
  describeSqlDriverConformance,
} from "../src/testing.ts";

// One Miniflare for the whole file: suites run in order, never in parallel (test-load rule).
let handle: Awaited<ReturnType<typeof createMiniflareDoSqlite>> | undefined;
const open = async (db: string) => {
  handle ??= await createMiniflareDoSqlite();
  return handle.driver(db);
};

describeSqlDriverConformance("Durable Object SQLite (Miniflare)", {
  create: () => open("conformance"),
});

describeBlobStoreConformance("sql over Durable Object SQLite (Miniflare)", {
  create: async () => new SqlBlobStore(await open("blobs")),
});

describe("DoSqliteDriver", () => {
  beforeAll(async () => {
    await open("init");
  });
  afterAll(async () => {
    await handle?.dispose();
    handle = undefined;
  });

  it("applies every Cloudhal migration, FTS5 included", async () => {
    const driver = await open("migrations");
    const { applied } = await migrate(driver, migrations);
    expect(applied).toEqual(migrations.map((m) => m.name));
    expect(applied.length).toBeGreaterThan(20);
    const fts = await driver.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE sql LIKE 'CREATE VIRTUAL TABLE%'",
    );
    expect(fts.length).toBeGreaterThan(0);
    expect((await migrate(driver, migrations)).applied).toEqual([]);
  });

  it("keeps one database per object name", async () => {
    const a = await open("iso-a");
    const b = await open("iso-b");
    await a.exec("CREATE TABLE only_a (x INTEGER)");
    await expect(b.run("INSERT INTO only_a (x) VALUES (1)")).rejects.toThrow();
  });
});
