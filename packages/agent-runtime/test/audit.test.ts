import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { AuditLog } from "../src/audit.ts";

describe("AuditLog", () => {
  it("records and lists decisions newest first", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const log = new AuditLog(sql);
    const actor = { kind: "agent" as const, id: "agent_test00001" };
    await log.record({
      at: "2026-10-08T10:00:00Z",
      actor,
      siteId: "site_a",
      tool: "get_page",
      decision: "allow",
      outcome: "ok",
      durationMs: 3,
    });
    await log.record({
      at: "2026-10-08T10:00:01Z",
      actor,
      siteId: "site_a",
      tool: "publish",
      decision: "approval-required",
      reason: "publish is destructive",
      input: { snapshotId: "snap_1" },
      outcome: "pending",
    });
    const rows = await log.list({ siteId: "site_a" });
    expect(rows.map((r) => r.tool)).toEqual(["publish", "get_page"]);
    expect(rows[0]?.input).toEqual({ snapshotId: "snap_1" });
    expect((await log.list({ actorId: "nobody" })).length).toBe(0);
    await sql.close();
  });
});
