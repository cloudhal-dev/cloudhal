import { describe, expect, it } from "vitest";
import { migrations } from "../migrations/index.ts";
import { appliedMigrations, migrate, splitStatements } from "../src/migrate.ts";
import { BetterSqlite3Driver } from "../src/sql/better-sqlite3.ts";
import { D1Driver } from "../src/sql/d1.ts";
import { createMiniflareD1 } from "../src/testing.ts";

describe("splitStatements", () => {
  it("splits on end-of-line semicolons and drops comments", () => {
    expect(splitStatements("-- c\nCREATE TABLE a (x);\n\nCREATE TABLE b (y);")).toEqual([
      "CREATE TABLE a (x)",
      "CREATE TABLE b (y)",
    ]);
  });
});

describe("migrate", () => {
  it("applies the Cloudhal schema on better-sqlite3, idempotently", async () => {
    const driver = await BetterSqlite3Driver.open(":memory:");
    expect((await migrate(driver, migrations)).applied).toEqual(["0001_init"]);
    expect((await migrate(driver, migrations)).applied).toEqual([]);
    expect(await appliedMigrations(driver)).toEqual(["0001_init"]);
    const tables = await driver.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual(["_migrations", "nodes", "projects", "snapshots"]);
    await driver.close();
  });

  it("applies the Cloudhal schema on D1 (Miniflare)", async () => {
    const h = await createMiniflareD1();
    const driver = new D1Driver(h.db);
    expect((await migrate(driver, migrations)).applied).toEqual(["0001_init"]);
    expect(await appliedMigrations(driver)).toEqual(["0001_init"]);
    await h.dispose();
  });

  it("a failing migration leaves earlier ones applied and itself unapplied", async () => {
    const driver = await BetterSqlite3Driver.open(":memory:");
    const bad = { name: "0002_bad", sql: "CREATE TABLE ok (x);\nCREATE TABLE ok (x);" };
    await expect(migrate(driver, [...migrations, bad])).rejects.toThrow(/0002_bad/);
    expect(await appliedMigrations(driver)).toEqual(["0001_init"]);
    const ok = await driver.get("SELECT name FROM sqlite_master WHERE name = 'ok'");
    expect(ok).toBeUndefined();
    await driver.close();
  });
});
