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
      "0011_op_guards",
      "0012_roles",
      "0013_media",
      "0014_analytics",
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
      "0011_op_guards",
      "0012_roles",
      "0013_media",
      "0014_analytics",
    ]);
    const tables = await driver.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      "_migrations",
      "account",
      "agent_owner",
      "analytics_daily",
      "analytics_events",
      "analytics_query_budget",
      "analytics_rollup_runs",
      "analytics_salts",
      "analytics_settings",
      "apikey",
      "approvals",
      "asset_refs",
      "audit",
      "invitation",
      "media_blobs",
      "media_uploads",
      "member",
      "nodes",
      "op_guards",
      "organization",
      "password_reset",
      "projects",
      "rateLimit",
      "session",
      "snapshot_blobs",
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
      "0011_op_guards",
      "0012_roles",
      "0013_media",
      "0014_analytics",
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
      "0011_op_guards",
      "0012_roles",
      "0013_media",
      "0014_analytics",
    ]);
    await h.dispose();
  });

  it("a failing migration leaves earlier ones applied and itself unapplied", async () => {
    const driver = await BetterSqlite3Driver.open(":memory:");
    const bad = { name: "0099_bad", sql: "CREATE TABLE ok (x);\nCREATE TABLE ok (x);" };
    await expect(migrate(driver, [...migrations, bad])).rejects.toThrow(/0099_bad/);
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
      "0011_op_guards",
      "0012_roles",
      "0013_media",
      "0014_analytics",
    ]);
    const ok = await driver.get("SELECT name FROM sqlite_master WHERE name = 'ok'");
    expect(ok).toBeUndefined();
    await driver.close();
  });
});

describe("0012_roles: existing users become members (RFC-0005 §11)", () => {
  const before = migrations.filter((m) => m.name < "0012_roles");
  const roles = migrations.filter((m) => m.name === "0012_roles");
  const user = (id: string, createdAt: string) => ({
    sql: `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 0, ?, ?)`,
    params: [id, id, `${id}@example.com`, createdAt, createdAt],
  });
  const site = {
    sql: "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES ('site_mig000001', 'site_mig000001', 'site', 'site', 0, 'h', ?, 't', 't')",
    params: [JSON.stringify({ id: "site_mig000001", name: "The Daily" })],
  };

  for (const backend of ["better-sqlite3", "D1 (Miniflare)"] as const)
    it(`the earliest user is the Owner, others Administrators; one Owner is enforced (${backend})`, async () => {
      const h = backend === "D1 (Miniflare)" ? await createMiniflareD1() : undefined;
      const driver = h ? new D1Driver(h.db) : await BetterSqlite3Driver.open(":memory:");
      await migrate(driver, before);
      await driver.batch([
        site,
        user("userBBBBBB", "2026-01-02T00:00:00.000Z"),
        user("userAAAAAA", "2026-01-01T00:00:00.000Z"),
        user("userCCCCCC", "2026-01-02T00:00:00.000Z"),
        {
          sql: `INSERT INTO "apikey" ("id", "configId", "referenceId", "key", "createdAt", "updatedAt") VALUES ('KeyIdAlnum0001', 'default', 'userBBBBBB', 'hashed', 't', 't')`,
        },
      ]);
      await migrate(driver, roles);
      const org = await driver.get<{ name: string; slug: string }>(
        `SELECT name, slug FROM "organization" WHERE id = 'deployment'`,
      );
      expect(org).toEqual({ name: "The Daily", slug: "deployment" });
      const members = await driver.all<{ userId: string; role: string }>(
        `SELECT "userId", "role" FROM "member" WHERE "organizationId" = 'deployment' ORDER BY "userId"`,
      );
      expect(members).toEqual([
        { userId: "userAAAAAA", role: "owner" },
        { userId: "userBBBBBB", role: "administrator" },
        { userId: "userCCCCCC", role: "administrator" },
      ]);
      expect(
        await driver.get(
          `SELECT agent_id, user_id FROM agent_owner WHERE key_id = 'KeyIdAlnum0001'`,
        ),
      ).toEqual({ agent_id: "agent_KeyIdAlnum0001", user_id: "userBBBBBB" });
      // a second Owner (I2) or a second membership is refused by the database itself
      await expect(
        driver.run(`UPDATE "member" SET "role" = 'owner' WHERE "userId" = 'userBBBBBB'`),
      ).rejects.toThrow();
      await expect(
        driver.run(
          `INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt") VALUES ('x', 'deployment', 'userCCCCCC', 'editor', 't')`,
        ),
      ).rejects.toThrow();
      await (h ? h.dispose() : driver.close());
    });
});
