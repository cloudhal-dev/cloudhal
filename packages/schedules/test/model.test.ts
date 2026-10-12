import { describe, expect, it } from "vitest";
import {
  accountRunResult,
  afterRunCall,
  backstopDue,
  budgetLeft,
  CLEAN_RUN,
  canTransitionAutomation,
  canTransitionRun,
  checkRunBudget,
  checkRunCall,
  cleanCounts,
  DEFAULT_AGENT_BUDGET,
  dailyAt,
  dueOccurrences,
  forbiddenUntrustedScopes,
  heartbeatNextWake,
  hourlyAt,
  insideWindow,
  killSwitchPauses,
  killSwitchResumes,
  plainLine,
  plainText,
  presetRule,
  type RunTaintState,
  runEndsAt,
  runWindow,
  schedulerHealth,
  TICK_BUDGETS,
  TickBudgetExhaustedError,
  TickMeter,
  untrustedEffectiveScopes,
  utcDayStart,
  withinDailyWriteCap,
} from "../src/index.ts";

describe("automation and run states (§5.3)", () => {
  it("only people resume; ended automations revive only by a person", () => {
    expect(canTransitionAutomation("active", "paused")).toBe(true);
    expect(canTransitionAutomation("paused", "active")).toBe(true);
    expect(canTransitionAutomation("auto-paused", "active")).toBe(true);
    expect(canTransitionAutomation("ended", "paused")).toBe(false);
    expect(canTransitionAutomation("active", "active")).toBe(false);
    expect(canTransitionRun("ready", "running")).toBe(true);
    expect(canTransitionRun("ready", "succeeded")).toBe(false);
    expect(canTransitionRun("succeeded", "failed")).toBe(false);
  });

  it("D11: three consecutive failures pause; a budget breach pauses at once; success resets", () => {
    expect(accountRunResult(0, "failed", "builtin")).toEqual({ consecutiveFailures: 1 });
    expect(accountRunResult(2, "failed", "builtin")).toEqual({
      consecutiveFailures: 3,
      pause: { state: "auto-paused", pausedReason: "failures" },
    });
    expect(accountRunResult(2, "missed", "agent-task").pause?.pausedReason).toBe("failures");
    expect(accountRunResult(2, "missed", "builtin")).toEqual({ consecutiveFailures: 2 });
    expect(accountRunResult(1, "budget-exceeded", "agent-task").pause?.pausedReason).toBe("budget");
    expect(accountRunResult(2, "succeeded", "agent-task")).toEqual({ consecutiveFailures: 0 });
    expect(accountRunResult(2, "skipped", "builtin")).toEqual({ consecutiveFailures: 2 });
  });

  it("S8: after downtime only the latest occurrence runs; the rest coalesce", () => {
    const rec = {
      start: "2026-10-01T00:17",
      timeZone: "UTC",
      rule: presetRule("hourly", "2026-10-01T00:17"),
    };
    const d = dueOccurrences(rec, "2026-10-12T01:17:00.000Z", "2026-10-12T06:20:00Z");
    expect(d?.latest.at).toBe("2026-10-12T06:17:00.000Z");
    expect(d?.coalesced).toBe(5);
    expect(d?.firstCoalesced?.at).toBe("2026-10-12T01:17:00.000Z");
    expect(d?.next?.at).toBe("2026-10-12T07:17:00.000Z");
    expect(dueOccurrences(rec, "2026-10-12T07:17:00.000Z", "2026-10-12T06:20:00Z")).toBeUndefined();
    const once = { start: "2026-10-12T05:00", timeZone: "UTC" };
    expect(dueOccurrences(once, "2026-10-12T05:00:00.000Z", "2026-10-12T05:00:30Z")).toEqual({
      latest: { at: "2026-10-12T05:00:00.000Z", local: "2026-10-12T05:00" },
      coalesced: 0,
    });
  });

  it("windows and run ends (§11.2)", () => {
    const w = runWindow("2026-10-12T09:07:00Z", 30);
    expect(w).toEqual({
      opensAt: "2026-10-12T09:07:00.000Z",
      closesAt: "2026-10-12T09:37:00.000Z",
    });
    expect(insideWindow(w, "2026-10-12T09:07:00Z")).toBe(true);
    expect(insideWindow(w, "2026-10-12T09:37:00Z")).toBe(false);
    expect(runEndsAt(w, "2026-10-12T09:30:00Z", 15)).toBe("2026-10-12T09:37:00.000Z");
    expect(runEndsAt(w, "2026-10-12T09:10:00Z", 15)).toBe("2026-10-12T09:25:00.000Z");
  });

  it("the kill switch pauses the active ones and resumes exactly those", () => {
    const list = [
      { id: "aut_a", state: "active" as const },
      { id: "aut_b", state: "paused" as const, pausedReason: "person" as const },
    ];
    expect(killSwitchPauses(list)).toEqual(["aut_a"]);
    expect(
      killSwitchResumes([
        { id: "aut_a", state: "paused", pausedReason: "kill-switch" },
        { id: "aut_b", state: "paused", pausedReason: "person" },
      ]),
    ).toEqual(["aut_a"]);
  });
});

describe("taint (§11.4, D10)", () => {
  const at = "2026-10-12T09:10:00Z";
  it("a run that reads visitor text may only read, label, hide and pause from then on", () => {
    let s: RunTaintState = CLEAN_RUN;
    expect(checkRunCall(s, { tool: "create_entry", class: "advisory" })).toEqual({ allowed: true });
    s = afterRunCall(s, { tool: "list_comments", class: "read" }, "allowed", at).state;
    expect(s.taint).toEqual({ at, tool: "list_comments" });
    expect(checkRunCall(s, { tool: "create_entry", class: "advisory" })).toMatchObject({
      allowed: false,
      code: "tainted",
    });
    expect(checkRunCall(s, { tool: "schedule_release", class: "publish" })).toMatchObject({
      allowed: false,
    });
    expect(checkRunCall(s, { tool: "get_entry", class: "read" })).toEqual({ allowed: true });
    expect(checkRunCall(s, { tool: "hide_comment", class: "reduce" })).toEqual({ allowed: true });
    expect(checkRunCall(s, { tool: "label_comments", class: "advisory" })).toEqual({
      allowed: true,
    });
    // The first taint is kept.
    expect(
      afterRunCall(s, { tool: "broken_links", class: "read" }, "allowed", "2026-10-12T09:20:00Z")
        .state.taint?.tool,
    ).toBe("list_comments");
  });

  it("no egress inside runs; anomalies end the run", () => {
    expect(checkRunCall(CLEAN_RUN, { tool: "fetch_asset_url", class: "read" })).toMatchObject({
      code: "no_egress_in_runs",
    });
    let s: RunTaintState = CLEAN_RUN;
    let kill: string | undefined;
    for (let i = 0; i < 10 && !kill; i++)
      ({ state: s, kill } = afterRunCall(
        s,
        { tool: "update_entry", class: "advisory" },
        "refused",
        at,
      ));
    expect(kill).toBe("too_many_refusals");
    s = { reduceCalls: 50, consecutiveRefusals: 0 };
    expect(afterRunCall(s, { tool: "hide_comment", class: "reduce" }, "allowed", at).kill).toBe(
      "too_many_reduce_calls",
    );
    expect(
      afterRunCall(s, { tool: "hide_comment", class: "reduce" }, "refused", at).kill,
    ).toBeUndefined();
  });

  it("automations that read untrusted text hold no write scopes", () => {
    const scopes = [
      "content:read",
      "comments:moderate",
      "content:write:own",
      "asset:write",
      "schedules:read",
      "releases:publish",
    ];
    expect(forbiddenUntrustedScopes(scopes)).toEqual([
      "content:write:own",
      "asset:write",
      "releases:publish",
    ]);
    expect(untrustedEffectiveScopes(scopes)).toEqual([
      "content:read",
      "comments:moderate",
      "schedules:read",
    ]);
  });
});

describe("budgets (§11.5, D11)", () => {
  it("counts calls, writes, approval requests and minutes", () => {
    const b = DEFAULT_AGENT_BUDGET;
    const clock = { startedAt: "2026-10-12T09:00:00Z", now: "2026-10-12T09:10:00Z" };
    expect(checkRunBudget(b, { toolCalls: 99, writes: 0, approvalRequests: 0 }, clock)).toEqual({
      ok: true,
    });
    expect(checkRunBudget(b, { toolCalls: 100, writes: 0, approvalRequests: 0 }, clock)).toEqual({
      ok: false,
      exceeded: "toolCalls",
    });
    expect(
      checkRunBudget(b, { toolCalls: 1, writes: 20, approvalRequests: 0 }, clock, { write: true }),
    ).toEqual({ ok: false, exceeded: "writes" });
    expect(
      checkRunBudget(b, { toolCalls: 1, writes: 0, approvalRequests: 5 }, clock, {
        approvalRequest: true,
      }),
    ).toEqual({
      ok: false,
      exceeded: "approvalRequests",
    });
    expect(
      checkRunBudget(
        b,
        { toolCalls: 1, writes: 0, approvalRequests: 0 },
        { ...clock, now: "2026-10-12T09:15:01Z" },
      ),
    ).toEqual({
      ok: false,
      exceeded: "minutes",
    });
    expect(budgetLeft(b, { toolCalls: 30, writes: 25, approvalRequests: 1 })).toEqual({
      toolCalls: 70,
      writes: 0,
      approvalRequests: 4,
    });
    expect(withinDailyWriteCap(199, 200)).toBe(true);
    expect(withinDailyWriteCap(200, 200)).toBe(false);
    expect(utcDayStart("2026-10-12T23:59:59.999Z")).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("tick budget, watermarks and heartbeat (§8)", () => {
  it("the meter refuses a statement before the budget is exceeded", async () => {
    let executed = 0;
    const inner = {
      name: "fake",
      get: async () => {
        executed++;
        return undefined;
      },
      all: async () => {
        executed++;
        return [];
      },
      run: async () => {
        executed++;
        return { changes: 0, lastRowId: null };
      },
      batch: async (s: readonly unknown[]) => {
        executed += s.length;
        return s.map(() => ({ changes: 0, lastRowId: null }));
      },
      exec: async () => {},
      close: async () => {},
    };
    const meter = new TickMeter({ maxQueries: 4, maxReleases: 1, deadlineMs: 1000 }, () => 0);
    const sql = meter.wrap(inner);
    await sql.get("SELECT 1");
    await sql.batch([{ sql: "x" }, { sql: "y" }]);
    expect(meter.used).toBe(3);
    expect(meter.canAfford(1)).toBe(true);
    expect(meter.canAfford(1, 1)).toBe(false);
    await expect(sql.batch([{ sql: "x" }, { sql: "y" }])).rejects.toThrow(TickBudgetExhaustedError);
    expect(executed).toBe(3);
    expect(TICK_BUDGETS.free.maxQueries).toBe(40);
  });

  it("watermarks: the next :17 and the next day", () => {
    expect(hourlyAt(17)(new Date("2026-10-12T10:17:00Z")).toISOString()).toBe(
      "2026-10-12T11:17:00.000Z",
    );
    expect(hourlyAt(17)(new Date("2026-10-12T10:16:59Z")).toISOString()).toBe(
      "2026-10-12T10:17:00.000Z",
    );
    expect(dailyAt(3, 30)(new Date("2026-10-12T03:30:00Z")).toISOString()).toBe(
      "2026-10-13T03:30:00.000Z",
    );
  });

  it("health: stalled when late with work due, stopped after ten minutes; the backstop fires after two", () => {
    const hb = {
      at: "2026-10-12T10:00:00.000Z",
      trigger: "cron" as const,
      nextWakeAt: heartbeatNextWake("2026-10-12T10:00:00.000Z", "2026-10-12T10:01:00.000Z"),
      ran: 0,
      more: false,
    };
    expect(hb.nextWakeAt).toBe("2026-10-12T10:05:00.000Z");
    expect(schedulerHealth(hb, "2026-10-12T10:06:00Z", { dueWithin24h: true }).state).toBe(
      "running",
    );
    expect(schedulerHealth(hb, "2026-10-12T10:07:01Z", { dueWithin24h: true })).toMatchObject({
      state: "late",
      healthy: false,
    });
    expect(schedulerHealth(hb, "2026-10-12T10:07:01Z", { dueWithin24h: false }).state).toBe(
      "running",
    );
    expect(schedulerHealth(hb, "2026-10-12T10:15:01Z", { dueWithin24h: false }).state).toBe(
      "stopped",
    );
    expect(schedulerHealth(undefined, "2026-10-12T10:15:01Z", { dueWithin24h: false }).state).toBe(
      "unknown",
    );
    expect(backstopDue(hb, "2026-10-12T10:07:00Z")).toBe(false);
    expect(backstopDue(hb, "2026-10-12T10:07:01Z")).toBe(true);
    expect(backstopDue(undefined, "2026-10-12T10:07:01Z")).toBe(true);
  });
});

describe("text the contracts accept", () => {
  it("cleans one-line messages, summaries and counts", () => {
    expect(plainLine("a\u0007b‮c\nd")).toBe("a b c d");
    expect(plainText("line 1\nline\t2\u0000⁦")).toBe("line 1\nline\t2  ");
    expect(plainText("x".repeat(3000))).toHaveLength(2000);
    expect(cleanCounts({ "broken-links": 2.7, Bad: 1, ok: -3 })).toEqual({
      "broken-links": 2,
      ok: 0,
    });
  });
});
