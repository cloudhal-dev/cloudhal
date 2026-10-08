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
    expect((await migrate(driver, migrations)).applied).toEqual([
      "0001_init",
      "0002_auth",
      "0003_agent",
      "0004_audit_actor_name",
      "0005_auth_rate_limit",
      "0006_approvals",
      "0007_audit_mode",
      "0008_policy_detail",
      "0009_audit_elevation",
      "0010_approval_result",
    ]);
    expect((await migrate(driver, migrations)).applied).toEqual([]);
    expect(await appliedMigrations(driver)).toEqual([
      "0001_init",
      "0002_auth",
      "0003_agent",
      "0004_audit_actor_name",
      "0005_auth_rate_limit",
      "0006_approvals",
      "0007_audit_mode",
      "0008_policy_detail",
      "0009_audit_elevation",
      "0010_approval_result",
    ]);
    const tables = await driver.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      "_migrations",
      "account",
      "apikey",
      "approvals",
      "audit",
      "invitation",
      "member",
      "nodes",
      "organization",
      "projects",
      "rateLimit",
      "session",
      "snapshots",
      "user",
      "verification",
    ]);
    await driver.close();
  });

  it("applies the Cloudhal schema on D1 (Miniflare)", async () => {
    const h = await createMiniflareD1();
    const driver = new D1Driver(h.db);
    expect((await migrate(driver, migrations)).applied).toEqual([
      "0001_init",
      "0002_auth",
      "0003_agent",
      "0004_audit_actor_name",
      "0005_auth_rate_limit",
      "0006_approvals",
      "0007_audit_mode",
      "0008_policy_detail",
      "0009_audit_elevation",
      "0010_approval_result",
    ]);
    expect(await appliedMigrations(driver)).toEqual([
      "0001_init",
      "0002_auth",
      "0003_agent",
      "0004_audit_actor_name",
      "0005_auth_rate_limit",
      "0006_approvals",
      "0007_audit_mode",
      "0008_policy_detail",
      "0009_audit_elevation",
      "0010_approval_result",
    ]);
    await h.dispose();
  });

  it("a failing migration leaves earlier ones applied and itself unapplied", async () => {
    const driver = await BetterSqlite3Driver.open(":memory:");
    const bad = { name: "0011_bad", sql: "CREATE TABLE ok (x);\nCREATE TABLE ok (x);" };
    await expect(migrate(driver, [...migrations, bad])).rejects.toThrow(/0011_bad/);
    expect(await appliedMigrations(driver)).toEqual([
      "0001_init",
      "0002_auth",
      "0003_agent",
      "0004_audit_actor_name",
      "0005_auth_rate_limit",
      "0006_approvals",
      "0007_audit_mode",
      "0008_policy_detail",
      "0009_audit_elevation",
      "0010_approval_result",
    ]);
    const ok = await driver.get("SELECT name FROM sqlite_master WHERE name = 'ok'");
    expect(ok).toBeUndefined();
    await driver.close();
  });
});
