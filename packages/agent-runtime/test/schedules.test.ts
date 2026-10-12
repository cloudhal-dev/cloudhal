/** RFC-0008 §10: schedule scopes, the `publish` call class, the release checks, approvals and audit. */
import { migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { ApprovalStore } from "../src/approvals.ts";
import { AuditLog } from "../src/audit.ts";
import {
  AUTO_RELEASE_WINDOW_HOURS,
  autoReleaseWindowEnds,
  checkAutoRelease,
  scopesForMode,
} from "../src/modes.ts";
import {
  holds,
  implies,
  isKeyScope,
  KEY_SCOPES,
  PERSON_SCOPES,
  PolicyEngine,
  type Scope,
  weakerScopes,
} from "../src/policy.ts";
import { ABILITIES, abilities, narrow, roleScopes } from "../src/roles.ts";

const agent = { kind: "agent" as const, id: "agent_sched00001" };
const human = { kind: "human" as const, id: "user_sched000001" };

describe("schedule scopes (RFC-0008 §10.1)", () => {
  it("site:publish implies releases:publish; own variants follow", () => {
    expect(implies("site:publish", "releases:publish")).toBe(true);
    expect(implies("site:publish", "releases:publish:own")).toBe(true);
    expect(implies("site:publish:own", "releases:publish:own")).toBe(true);
    expect(implies("site:publish:own", "releases:publish")).toBe(false);
    expect(implies("releases:publish", "site:publish")).toBe(false);
    expect(implies("schedules:write", "schedules:write:own")).toBe(true);
    expect(implies("schedules:write", "schedules:read")).toBe(false);
    expect(weakerScopes("site:publish")).toEqual([
      "site:publish:own",
      "releases:publish:own",
      "releases:publish",
    ]);
  });

  it("automations:manage is person-only; the rest are key scopes", () => {
    expect(PERSON_SCOPES).toContain("automations:manage");
    expect(isKeyScope("automations:manage")).toBe(false);
    for (const s of [
      "schedules:read",
      "schedules:write",
      "schedules:write:own",
      "releases:publish",
      "releases:publish:own",
    ] as Scope[])
      expect(KEY_SCOPES).toContain(s);
  });

  it("narrowing a key keeps releases within the creator's role", () => {
    expect(narrow(["releases:publish", "schedules:write"], roleScopes("author"))).toEqual([
      "releases:publish:own",
      "schedules:write:own",
    ]);
    expect(narrow(["releases:publish"], roleScopes("contributor"))).toEqual([]);
    expect(narrow(["*"], roleScopes("editor"))).toEqual(
      expect.arrayContaining(["schedules:write", "releases:publish"]),
    );
    expect(narrow(["*"], roleScopes("editor"))).not.toContain("automations:manage");
  });

  it("new keys read the schedule in every mode; existing keys are not widened", () => {
    for (const m of ["plan", "manual", "edits", "auto"] as const)
      expect(scopesForMode(m)).toContain("schedules:read");
    expect(scopesForMode("plan")).not.toContain("schedules:write");
    expect(holds(scopesForMode("auto"), "releases:publish")).toBe(true);
  });

  it("abilities for Studio", () => {
    expect(ABILITIES["releases.approveAny"]).toBe("releases:publish");
    const author = abilities("author", roleScopes("author"));
    expect(author["releases.approve"]).toBe(true);
    expect(author["releases.approveAny"]).toBe(false);
    expect(author["automations.manage"]).toBe(false);
    const contributor = abilities("contributor", roleScopes("contributor"));
    expect(contributor["schedules.write"]).toBe(true);
    expect(contributor["releases.approve"]).toBe(false);
    const editor = abilities("editor", roleScopes("editor"));
    expect(editor["automations.manage"]).toBe(true);
    expect(editor["schedules.settings"]).toBe(false);
  });
});

describe("the publish call class (RFC-0008 §10.3)", () => {
  const engine = new PolicyEngine([
    {
      name: "list_releases",
      scopes: ["schedules:read"],
      annotations: { readOnlyHint: true },
    },
    {
      name: "propose_release",
      scopes: ["schedules:write"],
      annotations: { readOnlyHint: false },
      own: "release",
      classify: () => "advisory",
    },
    {
      name: "schedule_release",
      scopes: ["schedules:write"],
      annotations: { readOnlyHint: false },
      own: "release",
      classify: () => "publish",
    },
    {
      name: "reschedule",
      scopes: ["schedules:write"],
      annotations: { readOnlyHint: false },
      own: "release",
      classify: () => "reduce",
    },
    {
      name: "lift_embargo",
      scopes: ["schedules:write"],
      annotations: { readOnlyHint: false },
      own: "release",
      classify: () => "person",
    },
  ]);
  const key = (mode: "plan" | "manual" | "edits" | "auto" | "bypass", local = false) => ({
    actor: agent,
    scopes: ["schedules:read", "schedules:write"] as Scope[],
    mode,
    local,
  });

  it("plan reads only; proposals are free from manual up (D6)", () => {
    expect(engine.evaluate(key("plan"), "list_releases")).toEqual({ kind: "allow" });
    for (const t of ["propose_release", "schedule_release", "reschedule", "lift_embargo"])
      expect(engine.evaluate(key("plan"), t)).toMatchObject({ kind: "deny", code: "mode" });
    for (const mode of ["manual", "edits", "auto"] as const)
      expect(engine.evaluate(key(mode), "propose_release")).toEqual({ kind: "allow" });
  });

  it("publish waits in manual and edits, offers the low-risk path in auto, runs in bypass", () => {
    expect(engine.evaluate(key("manual"), "schedule_release")).toMatchObject({
      kind: "approval-required",
      cause: "manual-mode",
    });
    const edits = engine.evaluate(key("edits"), "schedule_release");
    expect(edits).toMatchObject({ kind: "approval-required", cause: "tool" });
    expect(edits).not.toHaveProperty("autoApprove");
    expect(engine.evaluate(key("auto"), "schedule_release")).toMatchObject({
      kind: "approval-required",
      cause: "tool",
      autoApprove: "low-risk-release",
    });
    expect(engine.evaluate(key("bypass", true), "schedule_release")).toEqual({ kind: "allow" });
    // a remote key never gets bypass
    expect(engine.evaluate(key("bypass"), "schedule_release")).toMatchObject({
      kind: "approval-required",
    });
    // people over MCP are asked in their own client
    expect(engine.evaluate({ actor: human, scopes: ["*"] }, "schedule_release")).toMatchObject({
      kind: "approval-required",
      cause: "tool",
    });
    expect(engine.evaluate(key("edits"), "schedule_release", { confirmed: true })).toEqual({
      kind: "allow",
    });
  });

  it("reduce waits only in manual; person waits in every mode (D8)", () => {
    expect(engine.evaluate(key("manual"), "reschedule")).toMatchObject({
      kind: "approval-required",
    });
    for (const mode of ["edits", "auto"] as const)
      expect(engine.evaluate(key(mode), "reschedule")).toEqual({ kind: "allow" });
    for (const p of [key("manual"), key("edits"), key("auto"), key("bypass", true)])
      expect(engine.evaluate(p, "lift_embargo")).toMatchObject({
        kind: "approval-required",
        cause: "tool",
      });
  });

  it("own variants carry a release limit", () => {
    const author = {
      actor: agent,
      scopes: ["schedules:write:own"] as Scope[],
      mode: "edits" as const,
    };
    expect(engine.evaluate(author, "propose_release")).toEqual({
      kind: "allow",
      limit: { level: "own", target: "release" },
    });
    expect(
      engine.evaluate({ actor: agent, scopes: ["schedules:read"] }, "propose_release"),
    ).toMatchObject({ kind: "deny", code: "missing_scope" });
  });
});

describe("auto-mode releases (RFC-0008 §10.7, D9)", () => {
  const entry = (id: string, live = false, deps: string[] = []) => ({
    kind: "set" as const,
    nodeId: id,
    nodeKind: "contentEntry",
    live,
    deps,
  });

  it("articles only, nothing removed, riding assets allowed", () => {
    expect(checkAutoRelease([entry("entry_a00001"), entry("entry_b00001", true)])).toMatchObject({
      rule: "low-risk-release",
      lowRisk: true,
      changes: 2,
    });
    const riding = checkAutoRelease([
      entry("entry_a00001", false, ["asset_a00001"]),
      { kind: "set", nodeId: "asset_a00001", nodeKind: "asset", live: false },
    ]);
    expect(riding).toMatchObject({ lowRisk: true, changes: 1 });
    expect(
      checkAutoRelease([{ kind: "set", nodeId: "asset_a00001", nodeKind: "asset", live: false }]),
    ).toMatchObject({ lowRisk: false, code: "media" });
    expect(
      checkAutoRelease([
        { kind: "remove", nodeId: "entry_a00001", nodeKind: "contentEntry", live: true },
      ]),
    ).toMatchObject({ lowRisk: false, code: "removes-content" });
    expect(
      checkAutoRelease([{ kind: "set", nodeId: "page_a000001", nodeKind: "page", live: true }]),
    ).toMatchObject({ lowRisk: false, code: "structure" });
  });

  it("the window ends at the elevation's end or after 24 hours, whichever is first", () => {
    const now = new Date("2026-10-12T10:00:00.000Z");
    expect(autoReleaseWindowEnds(now)).toBe(
      new Date(now.getTime() + AUTO_RELEASE_WINDOW_HOURS * 3_600_000).toISOString(),
    );
    expect(autoReleaseWindowEnds(now, "2026-10-12T11:00:00.000Z")).toBe("2026-10-12T11:00:00.000Z");
    expect(autoReleaseWindowEnds(now, "2026-10-20T11:00:00.000Z")).toBe("2026-10-13T10:00:00.000Z");
  });
});

describe("release approvals and audit columns (RFC-0008 §5.1, §10.4, §10.5)", () => {
  it("requests carry the release and run, expire at the release's time and close with it", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const now = new Date("2026-10-12T10:00:00.000Z");
    const approvals = new ApprovalStore(sql, { now: () => now });
    const req = {
      siteId: "site_sched00001",
      tool: "schedule_release",
      argsHash: "a".repeat(64),
      actor: agent,
      prompt: "Publish at 09:00?",
      stateHash: `rl1:${"b".repeat(64)}`,
      releaseId: "rel_ABCDEFGHJK0123456789",
      runId: "run_ABCDEFGHJK0123456789",
      expiresAt: "2026-11-02T06:00:00.000Z",
    };
    const a = await approvals.request(req);
    expect(a).toMatchObject({
      releaseId: req.releaseId,
      runId: req.runId,
      expiresAt: req.expiresAt,
      status: "pending",
    });
    // one waiting request per identical call
    expect((await approvals.request(req)).id).toBe(a.id);
    expect(await approvals.list({ releaseId: req.releaseId })).toHaveLength(1);
    expect(await approvals.closeForRelease(req.siteId, req.releaseId, human, "canceled")).toBe(1);
    expect(await approvals.get(a.id)).toMatchObject({ status: "denied", reason: "canceled" });
    expect(await approvals.closeForRelease(req.siteId, req.releaseId, human, "again")).toBe(0);
  });

  it("audit rows carry run, release and automation ids", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const log = new AuditLog(sql);
    await log.record({
      at: "2026-10-12T10:00:00.000Z",
      actor: agent,
      siteId: "site_sched00001",
      tool: "schedule_release",
      decision: "allow",
      outcome: "ok",
      runId: "run_ABCDEFGHJK0123456789",
      releaseId: "rel_ABCDEFGHJK0123456789",
      automationId: "aut_ABCDEFGHJK0123456789",
    });
    await log.record({
      at: "2026-10-12T10:00:01.000Z",
      actor: agent,
      siteId: "site_sched00001",
      tool: "get_mode",
      decision: "allow",
    });
    const rows = await log.list({ runId: "run_ABCDEFGHJK0123456789" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      runId: "run_ABCDEFGHJK0123456789",
      releaseId: "rel_ABCDEFGHJK0123456789",
      automationId: "aut_ABCDEFGHJK0123456789",
    });
    expect(await log.list({ releaseId: "rel_ABCDEFGHJK0123456789" })).toHaveLength(1);
  });
});
