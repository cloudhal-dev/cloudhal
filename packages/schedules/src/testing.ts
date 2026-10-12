/**
 * Shared suites (RFC-0008 §16, §17), run from vitest files against better-sqlite3 and Miniflare D1
 * like the storage, analytics and comments suites:
 *
 * - `describeScheduleStoreConformance` — `SqlScheduleStore`: releases (create, the `rl1:` hash,
 *   transitions with CAS, re-pin, cancel, holds and overlaps, lazy expiry), automations (create,
 *   pause/resume with CAS), settings and the kill switch, usage counted from audit rows, system
 *   jobs, the heartbeat and retention. Every record read back is checked against its contract.
 * - `describeSchedulerConformance` — `runDue` over the real store with fake work seams: releases on
 *   time and never early (S2), at most one effect under concurrent ticks on two stores sharing one
 *   database (S3), conflicts (S4), the hour limit and retries (S8), lease expiry and recovery, the
 *   kill switch, one release at a time per site in time order (D15), built-in steps and agent-task
 *   windows, watermarks, the heartbeat, and the statement count of every path within the Workers
 *   Free `TickBudget` (S17).
 */
import type { Actor, Automation, Release, ScheduleRun } from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import type { RunResult, SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TICK_BUDGETS, type TickBudget, TickMeter } from "./budget-meter.ts";
import { ScheduleConflictError, ScheduleError } from "./errors.ts";
import { newLeaseToken, runId } from "./ids.ts";
import { presetRule } from "./recurrence.ts";
import { type PinnedItem, releaseHash } from "./release.ts";
import {
  type BuiltinRunner,
  type BuiltinStepInput,
  type BuiltinStepResult,
  hourlyAt,
  type ReleaseExecution,
  type ReleaseExecutionInput,
  type ReleaseExecutor,
  type RunDueDeps,
  runDue,
  type SystemJobDefinition,
  type TickReport,
} from "./scheduler.ts";
import { SqlScheduleStore } from "./sql/store.ts";

export interface ScheduleStoreFactory {
  /** A fresh, migrated, empty database. */
  create(): Promise<SqlDriver>;
  /** A second driver over the same database (another isolate or process). Default: the same driver. */
  peer?(driver: SqlDriver): SqlDriver;
  dispose?(): Promise<void>;
}

/** A driver that counts statements: every read, every write and every statement of a batch. */
export interface CountingDriver extends SqlDriver {
  readonly statements: SqlStatement[];
  reset(): void;
}

export function countingDriver(inner: SqlDriver): CountingDriver {
  const statements: SqlStatement[] = [];
  const note = (sql: string, params?: readonly SqlValue[]) =>
    statements.push({ sql, ...(params ? { params } : {}) });
  return {
    name: `counting(${inner.name})`,
    statements,
    get: (sql, params) => {
      note(sql, params);
      return inner.get(sql, params);
    },
    all: (sql, params) => {
      note(sql, params);
      return inner.all(sql, params);
    },
    run: (sql: string, params?: readonly SqlValue[]): Promise<RunResult> => {
      note(sql, params);
      return inner.run(sql, params);
    },
    batch: (list) => {
      statements.push(...list);
      return inner.batch(list);
    },
    exec: (sql) => inner.exec(sql),
    close: () => inner.close(),
    reset() {
      statements.length = 0;
    },
  };
}

/** A `ReleaseExecutor` stand-in (the seam `publishRelease` fills in rollout step 5). */
export interface FakeReleaseExecutor extends ReleaseExecutor {
  readonly calls: ReleaseExecutionInput[];
  behavior: (input: ReleaseExecutionInput) => ReleaseExecution | Promise<ReleaseExecution>;
}

export function fakeReleaseExecutor(
  behavior?: (input: ReleaseExecutionInput) => ReleaseExecution | Promise<ReleaseExecution>,
  cost = 0,
): FakeReleaseExecutor {
  const calls: ReleaseExecutionInput[] = [];
  const fake: FakeReleaseExecutor = {
    cost,
    calls,
    behavior:
      behavior ??
      ((i) => ({
        kind: "published",
        snapshotId: `snap_${i.run.id.slice(4, 24)}`,
        baseSnapshotId: "snap_BASE000001",
        purge: "tags",
        committed: false,
      })),
    async execute(input) {
      calls.push(input);
      return fake.behavior(input);
    },
  };
  return fake;
}

export function expectContractRelease(r: Release): void {
  expect(isValid("release", r), JSON.stringify(r)).toBe(true);
}
export function expectContractAutomation(a: Automation): void {
  expect(isValid("automation", a), JSON.stringify(a)).toBe(true);
}
export function expectContractRun(r: ScheduleRun): void {
  expect(isValid("schedule-run", r), JSON.stringify(r)).toBe(true);
}

const SITE = "site_conform01";
const OTHER_SITE = "site_conform02";
const T0 = "2026-10-12T10:00:00.000Z";
/** 09:00 in Istanbul on 2 November 2026. */
const T = "2026-11-02T06:00:00.000Z";
const TZ = "Europe/Istanbul";
const EDITOR: Actor = { kind: "human", id: "user_editor01", name: "Ayşe" };
const AGENT: Actor = { kind: "agent", id: "agent_desk0001", name: "Desk" };
const h = (c: string) => c.repeat(64);
const plus = (at: string, ms: number) => new Date(Date.parse(at) + ms).toISOString();
const MIN = 60_000;

function pinned(nodes: readonly string[], rev = 2): PinnedItem[] {
  return nodes.map((nodeId, i) => ({
    item: {
      kind: "set",
      nodeId,
      nodeKind: "contentEntry",
      target: { rev, hash: h(String((i + rev) % 10)) },
      base: { rev: rev - 1, hash: h("a") },
    },
    deps: ["term_conform01"],
  }));
}

interface Ctx {
  sql: SqlDriver;
  peer: SqlDriver;
  clock: { now: string };
  store: SqlScheduleStore;
  exec: FakeReleaseExecutor;
}

async function count(
  sql: SqlDriver,
  table: string,
  where = "1 = 1",
  params: SqlValue[] = [],
): Promise<number> {
  const r = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
    params,
  );
  return Number(r?.n ?? 0);
}

async function setup(factory: ScheduleStoreFactory): Promise<Ctx> {
  const sql = await factory.create();
  const clock = { now: T0 };
  return {
    sql,
    peer: factory.peer ? factory.peer(sql) : sql,
    clock,
    store: new SqlScheduleStore(sql, { now: () => new Date(clock.now) }),
    exec: fakeReleaseExecutor(),
  };
}

async function scheduledRelease(
  ctx: Ctx,
  o: {
    at?: string;
    siteId?: string;
    nodes?: string[];
    localTime?: string;
    approval?: Release["approval"];
  } = {},
): Promise<Release> {
  const r = await ctx.store.createRelease({
    siteId: o.siteId ?? SITE,
    items: pinned(o.nodes ?? ["entry_conform01"]),
    createdBy: AGENT,
    title: "Election results",
  });
  return ctx.store.transitionRelease(r.siteId, r.id, {
    expectedRev: r.rev,
    to: "scheduled",
    when: {
      kind: "at",
      at: o.at ?? T,
      timeZone: TZ,
      ...(o.localTime ? { localTime: o.localTime } : {}),
    },
    approval: o.approval ?? { kind: "person", by: { id: "user_editor01", name: "Ayşe" }, at: T0 },
  });
}

/** One tick at `at`, metered with `budget` (Workers Free by default) over `driver`. */
async function tick(
  ctx: Ctx,
  at: string,
  o: Partial<Omit<RunDueDeps, "store" | "meter">> & {
    driver?: SqlDriver;
    /** Receives the tick's metered driver (what an executor in the same invocation uses). */
    withDriver?: (metered: SqlDriver) => void;
  } = {},
): Promise<TickReport> {
  const { driver, budget, withDriver, ...rest } = o;
  const b: TickBudget = budget ?? TICK_BUDGETS.free;
  const meter = new TickMeter(b, () => 0);
  const metered = meter.wrap(driver ?? ctx.sql);
  withDriver?.(metered);
  const store = new SqlScheduleStore(metered, { now: () => new Date(at) });
  return runDue(new Date(at), {
    store,
    meter,
    trigger: "cron",
    budget: b,
    releases: ctx.exec,
    wake: "minute",
    ...rest,
  });
}

function code(e: unknown): string | undefined {
  return e instanceof ScheduleError
    ? e.code
    : e instanceof ScheduleConflictError
      ? "conflict"
      : undefined;
}

export function describeScheduleStoreConformance(
  label: string,
  factory: ScheduleStoreFactory,
): void {
  describe(`schedule store conformance: ${label}`, { timeout: 120_000 }, () => {
    let ctx: Ctx;
    beforeEach(async () => {
      ctx = await setup(factory);
    });
    afterAll(async () => {
      await ctx?.sql.close();
      await factory.dispose?.();
    });

    it("creates a draft release with its pinned items and the rl1: hash; reads it back as the contract", async () => {
      const items = pinned(["entry_conform02", "entry_conform01"]);
      const r = await ctx.store.createRelease({
        siteId: SITE,
        items,
        createdBy: AGENT,
        title: "Two articles",
      });
      expectContractRelease(r);
      expect(r.state).toBe("draft");
      expect(r.hash).toBe(
        await releaseHash(
          SITE,
          items.map((i) => i.item),
        ),
      );
      const rec = await ctx.store.getReleaseRecord(SITE, r.id);
      expect(rec?.release).toEqual(r);
      expect(rec?.items.map((i) => [i.item.nodeId, i.deps, i.held])).toEqual([
        ["entry_conform01", ["term_conform01"], false],
        ["entry_conform02", ["term_conform01"], false],
      ]);
      expect(await ctx.store.getRelease(OTHER_SITE, r.id)).toBeUndefined();
    });

    it("transitions with CAS: scheduled holds the nodes; stale revs and illegal moves are refused", async () => {
      const r = await scheduledRelease(ctx);
      expectContractRelease(r);
      expect(r.state).toBe("scheduled");
      expect([...(await ctx.store.heldNodes(SITE))]).toEqual([["entry_conform01", [r.id]]]);
      await expect(
        ctx.store.transitionRelease(SITE, r.id, { expectedRev: r.rev - 1, to: "draft" }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
      await expect(
        ctx.store.transitionRelease(SITE, r.id, {
          expectedRev: r.rev,
          to: "published",
          outcome: { kind: "missed", at: T, latenessSeconds: 0 },
        }),
      ).rejects.toBeInstanceOf(ScheduleError);
      // A person moves it and keeps the approval (D4).
      const moved = await ctx.store.transitionRelease(SITE, r.id, {
        expectedRev: r.rev,
        to: "scheduled",
        when: { kind: "at", at: plus(T, 60 * MIN), timeZone: TZ },
      });
      expect(moved.approval).toEqual(r.approval);
      expect(moved.hash).toBe(r.hash);
      const canceled = await ctx.store.cancelRelease(SITE, r.id, {
        expectedRev: moved.rev,
        by: EDITOR,
      });
      expect(canceled.outcome).toMatchObject({ kind: "canceled", by: EDITOR });
      expectContractRelease((await ctx.store.getRelease(SITE, r.id)) as Release);
      expect((await ctx.store.heldNodes(SITE)).size).toBe(0);
      // Scheduled needs an approval.
      const d = await ctx.store.createRelease({
        siteId: SITE,
        items: pinned(["entry_conform03"]),
        createdBy: AGENT,
      });
      let err: unknown;
      try {
        await ctx.store.transitionRelease(SITE, d.id, {
          expectedRev: d.rev,
          to: "scheduled",
          when: { kind: "on-approval" },
        });
      } catch (e) {
        err = e;
      }
      expect(code(err)).toBe("invalid_transition");
    });

    it("re-pinning changes the hash and voids the approval (S6); a lost CAS changes no item", async () => {
      const r = await scheduledRelease(ctx, { nodes: ["entry_conform01", "entry_conform02"] });
      const items = pinned(["entry_conform01"], 5);
      const re = await ctx.store.repinRelease(SITE, r.id, { expectedRev: r.rev, items });
      expect(re.state).toBe("awaiting_approval");
      expect(re.approval).toBeUndefined();
      expect(re.hash).not.toBe(r.hash);
      expect(re.hash).toBe(
        await releaseHash(
          SITE,
          items.map((i) => i.item),
        ),
      );
      const rec = await ctx.store.getReleaseRecord(SITE, r.id);
      expect(rec?.items.map((i) => [i.item.nodeId, i.held])).toEqual([["entry_conform01", true]]);
      expectContractRelease(rec?.release as Release);
      await expect(
        ctx.store.repinRelease(SITE, r.id, {
          expectedRev: r.rev,
          items: pinned(["entry_conform09"], 7),
        }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
      expect(
        (await ctx.store.getReleaseRecord(SITE, r.id))?.items.map((i) => i.item.nodeId),
      ).toEqual(["entry_conform01"]);
    });

    it("flags a node in two pending releases (D15) and expires unapproved releases at their time (D5)", async () => {
      const a = await scheduledRelease(ctx, { nodes: ["entry_conform01"] });
      const b = await ctx.store.createRelease({
        siteId: SITE,
        items: pinned(["entry_conform01", "entry_conform02"]),
        createdBy: AGENT,
      });
      expect([...(await ctx.store.overlaps(SITE))]).toEqual([
        ["entry_conform01", [a.id, b.id].sort()],
      ]);
      const waiting = await ctx.store.transitionRelease(SITE, b.id, {
        expectedRev: b.rev,
        to: "awaiting_approval",
        when: { kind: "at", at: T, timeZone: TZ },
        requestId: "apr_conform01",
      });
      expect(waiting.state).toBe("awaiting_approval");
      expect(await ctx.store.expireOverdueApprovals(SITE, plus(T, -MIN))).toBe(0);
      expect(await ctx.store.expireOverdueApprovals(SITE, T)).toBe(1);
      const expired = (await ctx.store.getRelease(SITE, b.id)) as Release;
      expect(expired.state).toBe("expired");
      expect(expired.outcome).toEqual({ kind: "expired", at: T, reason: "unapproved" });
      expectContractRelease(expired);
      expect([...(await ctx.store.heldNodes(SITE))]).toEqual([["entry_conform01", [a.id]]]);
      expect(
        (await ctx.store.listReleases(SITE, { states: ["expired"] })).map((r) => r.id),
      ).toEqual([b.id]);
    });

    it("automations: created with their first run; pause/resume with CAS; too-frequent rules refused", async () => {
      const a = await ctx.store.createAutomation({
        siteId: SITE,
        name: "Hourly broken-link sweep",
        job: { kind: "builtin", builtin: "broken-links" },
        recurrence: {
          start: "2026-10-12T10:17",
          timeZone: "UTC",
          rule: presetRule("hourly", "2026-10-12T10:17"),
        },
        owner: { id: "user_editor01", name: "Ayşe" },
      });
      expectContractAutomation(a);
      expect(a).toMatchObject({
        state: "active",
        nextRunAt: "2026-10-12T10:17:00.000Z",
        recurrence: { preset: "hourly" },
      });
      ctx.clock.now = "2026-10-12T12:30:00.000Z";
      const paused = await ctx.store.transitionAutomation(SITE, a.id, {
        expectedRev: a.rev,
        to: "paused",
        pausedReason: "person",
      });
      expect(paused.pausedReason).toBe("person");
      await expect(
        ctx.store.transitionAutomation(SITE, a.id, { expectedRev: a.rev, to: "active" }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
      const resumed = await ctx.store.transitionAutomation(SITE, a.id, {
        expectedRev: paused.rev,
        to: "active",
      });
      expect(resumed).toMatchObject({
        state: "active",
        nextRunAt: "2026-10-12T13:17:00.000Z",
        consecutiveFailures: 0,
      });
      expectContractAutomation((await ctx.store.getAutomation(SITE, a.id)) as Automation);
      let err: unknown;
      try {
        await ctx.store.createAutomation({
          siteId: SITE,
          name: "Too often",
          job: { kind: "builtin", builtin: "feed-check" },
          recurrence: {
            start: "2026-10-12T10:00",
            timeZone: "UTC",
            rule: "FREQ=DAILY;BYMINUTE=0,30",
          },
          owner: { id: "user_editor01" },
        });
      } catch (e) {
        err = e;
      }
      expect(code(err)).toBe("rule_too_frequent");
    });

    it("the kill switch pauses active automations and kills their open runs; resuming restores exactly those", async () => {
      const mk = (name: string) =>
        ctx.store.createAutomation({
          siteId: SITE,
          name,
          job: {
            kind: "agent-task",
            keyId: `key_${name}`,
            instructions: "Triage new comments",
            modeCap: "edits",
            readsUntrustedText: true,
            windowMinutes: 30,
            budget: { maxToolCalls: 50, maxWrites: 0, maxApprovalRequests: 0, maxMinutes: 15 },
          },
          recurrence: {
            start: "2026-10-12T10:07",
            timeZone: "UTC",
            rule: presetRule("hourly", "2026-10-12T10:07"),
          },
          owner: { id: "user_editor01" },
        });
      const a = await mk("triage1");
      const b = await mk("triage2");
      await ctx.store.transitionAutomation(SITE, b.id, {
        expectedRev: b.rev,
        to: "paused",
        pausedReason: "person",
      });
      await tick(ctx, "2026-10-12T10:07:30.000Z");
      expect(
        await count(ctx.sql, "schedule_runs", "subject_id = ? AND state = 'ready'", [a.id]),
      ).toBe(1);
      const s = await ctx.store.putSettings(
        SITE,
        { paused: true, reason: "incident" },
        { expectedRev: 0, by: EDITOR },
      );
      expect(s).toMatchObject({ paused: true, rev: 1, pausedBy: EDITOR, pausedReason: "incident" });
      expect((await ctx.store.getAutomation(SITE, a.id))?.pausedReason).toBe("kill-switch");
      expect(
        await count(ctx.sql, "schedule_runs", "subject_id = ? AND state = 'killed'", [a.id]),
      ).toBe(1);
      await expect(
        ctx.store.putSettings(SITE, { paused: false }, { expectedRev: 0, by: EDITOR }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
      ctx.clock.now = "2026-10-12T11:30:00.000Z";
      await ctx.store.putSettings(SITE, { paused: false }, { expectedRev: 1, by: EDITOR });
      expect(await ctx.store.getAutomation(SITE, a.id)).toMatchObject({
        state: "active",
        nextRunAt: "2026-10-12T12:07:00.000Z",
      });
      expect(await ctx.store.getAutomation(SITE, b.id)).toMatchObject({
        state: "paused",
        pausedReason: "person",
      });
      expect(await ctx.store.settings(OTHER_SITE)).toEqual({
        siteId: OTHER_SITE,
        paused: false,
        dailyWriteCap: 200,
        rev: 0,
      });
    });

    it("usage and the daily cap are counted from audit and approval rows (no counters)", async () => {
      const audit = (
        site: string,
        run: string | null,
        aut: string | null,
        snap: string | null,
        at: string,
      ) => ({
        sql: "INSERT INTO audit (at, actor_kind, actor_id, site_id, tool, decision, snapshot_id, run_id, automation_id) VALUES (?, 'agent', 'agent_desk0001', ?, 'update_entry', 'allow', ?, ?, ?)",
        params: [at, site, snap, run, aut],
      });
      await ctx.sql.batch([
        audit(SITE, "run_conform0001", "aut_conform01", null, "2026-10-12T09:00:00Z"),
        audit(SITE, "run_conform0001", "aut_conform01", "snap_conform01", "2026-10-12T09:01:00Z"),
        audit(SITE, "run_conform0002", "aut_conform01", "snap_conform02", "2026-10-11T23:59:59Z"),
        audit(SITE, null, null, "snap_conform03", "2026-10-12T09:02:00Z"),
        {
          sql: "INSERT INTO approvals (id, site_id, tool, args_hash, actor_kind, actor_id, prompt, state_hash, status, created_at, expires_at, run_id) VALUES ('apr_conform01', ?, 'schedule_release', 'x', 'agent', 'agent_desk0001', 'p', 's', 'pending', 't', 't', 'run_conform0001')",
          params: [SITE],
        },
      ]);
      expect(await ctx.store.runUsage(SITE, "run_conform0001")).toEqual({
        toolCalls: 2,
        writes: 1,
        approvalRequests: 1,
      });
      expect(await ctx.store.automationWritesToday(SITE, "2026-10-12T12:00:00Z")).toBe(1);
    });

    it("system jobs: registered once, claimed once, watermark moved; an expired lease is taken over", async () => {
      await ctx.store.ensureSystemJobs([
        { name: "comments.hourly", nextRunAt: "2026-10-12T10:17:00Z" },
      ]);
      await ctx.store.ensureSystemJobs([
        { name: "comments.hourly", nextRunAt: "2026-10-12T23:17:00Z" },
      ]);
      expect(await ctx.store.systemJobs()).toEqual([
        { name: "comments.hourly", nextRunAt: "2026-10-12T10:17:00.000Z" },
      ]);
      const now = "2026-10-12T10:17:05.000Z";
      expect(await ctx.store.dueSystemJobs(now)).toHaveLength(1);
      const t1 = newLeaseToken();
      expect(
        await ctx.store.claimSystemJob({
          name: "comments.hourly",
          token: t1,
          now,
          leaseUntil: plus(now, 10 * MIN),
        }),
      ).toBe(true);
      expect(
        await ctx.store.claimSystemJob({
          name: "comments.hourly",
          token: newLeaseToken(),
          now,
          leaseUntil: plus(now, 10 * MIN),
        }),
      ).toBe(false);
      expect(await ctx.store.dueSystemJobs(now)).toHaveLength(0);
      // The lease expires: another tick takes over; the first can no longer finish.
      const later = plus(now, 11 * MIN);
      const t2 = newLeaseToken();
      expect(
        await ctx.store.claimSystemJob({
          name: "comments.hourly",
          token: t2,
          now: later,
          leaseUntil: plus(later, 10 * MIN),
        }),
      ).toBe(true);
      expect(
        await ctx.store.finishSystemJob({
          name: "comments.hourly",
          token: t1,
          now: later,
          ok: true,
          nextRunAt: "2026-10-12T11:17:00Z",
        }),
      ).toBe(false);
      expect(
        await ctx.store.finishSystemJob({
          name: "comments.hourly",
          token: t2,
          now: later,
          ok: true,
          nextRunAt: "2026-10-12T11:17:00Z",
        }),
      ).toBe(true);
      expect((await ctx.store.systemJobs())[0]).toEqual({
        name: "comments.hourly",
        nextRunAt: "2026-10-12T11:17:00.000Z",
        lastRunAt: later,
        lastOkAt: later,
      });
    });

    it("the heartbeat is one row, upserted", async () => {
      expect(await ctx.store.heartbeat()).toBeUndefined();
      await ctx.store.writeHeartbeat({
        at: T0,
        trigger: "cron",
        nextWakeAt: plus(T0, 5 * MIN),
        ran: 0,
        more: false,
      });
      await ctx.store.writeHeartbeat({
        at: plus(T0, MIN),
        trigger: "alarm",
        nextWakeAt: plus(T0, 6 * MIN),
        ran: 2,
        more: true,
        lagSeconds: 3,
      });
      expect(await ctx.store.heartbeat()).toEqual({
        at: plus(T0, MIN),
        trigger: "alarm",
        nextWakeAt: plus(T0, 6 * MIN),
        ran: 2,
        more: true,
        lagSeconds: 3,
      });
      expect(await count(ctx.sql, "scheduler_heartbeat")).toBe(1);
    });

    it("retention deletes old runs and old terminal releases only", async () => {
      const r = await scheduledRelease(ctx);
      await tick(ctx, T);
      const keep = await scheduledRelease(ctx, {
        nodes: ["entry_conform05"],
        at: plus(T, 400 * 86_400_000),
      });
      expect((await ctx.store.getRelease(SITE, r.id))?.state).toBe("published");
      expect(await ctx.store.applyRetention(plus(T, 89 * 86_400_000))).toEqual({
        runs: 0,
        releases: 0,
      });
      expect(await ctx.store.applyRetention(plus(T, 91 * 86_400_000))).toEqual({
        runs: 1,
        releases: 0,
      });
      expect(await ctx.store.applyRetention(plus(T, 401 * 86_400_000))).toEqual({
        runs: 0,
        releases: 1,
      });
      expect(await ctx.store.getRelease(SITE, r.id)).toBeUndefined();
      expect(await count(ctx.sql, "release_items", "release_id = ?", [r.id])).toBe(0);
      expect(await ctx.store.getRelease(SITE, keep.id)).toBeDefined();
    });
  });
}

/** Statement counts measured per path (filled while the scheduler suite runs; see the README). */
export const MEASURED_STATEMENTS: Record<string, number> = {};

export function describeSchedulerConformance(label: string, factory: ScheduleStoreFactory): void {
  describe(`scheduler conformance (runDue): ${label}`, { timeout: 120_000 }, () => {
    let ctx: Ctx;
    beforeEach(async () => {
      ctx = await setup(factory);
    });
    afterAll(async () => {
      await ctx?.sql.close();
      await factory.dispose?.();
    });
    const measure = (path: string, report: TickReport) => {
      expect(report.statements, path).toBeLessThanOrEqual(TICK_BUDGETS.free.maxQueries);
      MEASURED_STATEMENTS[path] = report.statements ?? -1;
      return report.statements;
    };

    it("an idle tick is one read, plus the heartbeat every fifth minute (S17)", async () => {
      expect(measure("idle tick, heartbeat due", await tick(ctx, T0))).toBe(2);
      expect(measure("idle tick", await tick(ctx, plus(T0, MIN)))).toBe(1);
      expect(await tick(ctx, plus(T0, 5 * MIN))).toMatchObject({
        statements: 2,
        ran: 0,
        more: false,
      });
      expect(await ctx.store.heartbeat()).toMatchObject({
        at: plus(T0, 5 * MIN),
        trigger: "cron",
        nextWakeAt: plus(T0, 10 * MIN),
      });
    });

    it("publishes a release at its time and never before (S2); records the run", async () => {
      const r = await scheduledRelease(ctx);
      expect((await tick(ctx, plus(T, -1000))).ran).toBe(0);
      expect(ctx.exec.calls).toHaveLength(0);
      const report = await tick(ctx, plus(T, 41_000));
      expect(measure("release published (executor not committing)", report)).toBe(9);
      expect(report).toMatchObject({ ran: 1, late: 0, failed: 0, more: false });
      expect(ctx.exec.calls).toHaveLength(1);
      expect(ctx.exec.calls[0]).toMatchObject({
        executeAt: T,
        latenessSeconds: 41,
        run: { attempt: 1, recovering: false },
      });
      const done = (await ctx.store.getRelease(SITE, r.id)) as Release;
      expectContractRelease(done);
      const run = await runId(r.id, T);
      expect(done).toMatchObject({
        state: "published",
        outcome: { kind: "published", runId: run, latenessSeconds: 41, purge: "tags" },
      });
      const runs = await ctx.store.listRuns(SITE, { subjectId: r.id });
      expect(runs).toHaveLength(1);
      expectContractRun(runs[0] as ScheduleRun);
      expect(runs[0]).toMatchObject({
        id: run,
        state: "succeeded",
        outcome: "did-work",
        trigger: "cron",
        attempt: 1,
        latenessSeconds: 41,
      });
      expect((await ctx.store.heldNodes(SITE)).size).toBe(0);
      expect((await tick(ctx, plus(T, 2 * MIN))).ran).toBe(0);
      expect(ctx.exec.calls).toHaveLength(1);
    });

    it("an executor that commits its own batch costs its reads and statements, within 40", async () => {
      await scheduledRelease(ctx);
      let sql: SqlDriver = ctx.sql;
      ctx.exec = fakeReleaseExecutor(async (i) => {
        // What publishRelease will do (§6.3): four reads, then one batch — statements 1–4 and 8 of
        // its own, statements 5–7 from the store, guarded on the site CAS.
        const store = new SqlScheduleStore(sql);
        await sql.get("SELECT 1");
        await sql.get("SELECT 1");
        await sql.get("SELECT 1");
        await sql.get("SELECT 1");
        await sql.batch([
          { sql: "SELECT 1" },
          { sql: "SELECT 1" },
          { sql: "SELECT 1" },
          { sql: "SELECT 1" },
          { sql: "SELECT 1" },
          ...store.releaseFinishStatements({
            releaseId: i.release.id,
            runId: i.run.id,
            token: i.run.leaseToken,
            now: i.now.toISOString(),
            latenessSeconds: i.latenessSeconds,
            finish: {
              state: "published",
              outcome: {
                kind: "published",
                runId: i.run.id,
                at: i.now.toISOString(),
                snapshotId: "snap_conform01",
                baseSnapshotId: "snap_conform00",
                latenessSeconds: i.latenessSeconds,
                purge: "tags",
              },
            },
            guard: { sql: "EXISTS (SELECT 1 FROM releases WHERE id = ?)", params: [i.release.id] },
          }),
        ]);
        return {
          kind: "published",
          snapshotId: "snap_conform01",
          baseSnapshotId: "snap_conform00",
          purge: "tags",
          committed: true,
        };
      }, 12);
      // In production the executor's store runs over the tick's metered driver, as here.
      const report = await tick(ctx, T, { withDriver: (d) => (sql = d) });
      expect(report.ran).toBe(1);
      expect(
        measure("release published (publishRelease shape: 4 reads + 8-statement batch)", report),
      ).toBe(18);
      expect((await ctx.store.listRuns(SITE))[0]).toMatchObject({
        state: "succeeded",
        outcome: "did-work",
      });
      expect(
        (await ctx.store.getRelease(SITE, (await ctx.store.listReleases(SITE))[0]?.id as string))
          ?.state,
      ).toBe("published");
    });

    it("S3: two ticks on two stores over one database produce one effect", async () => {
      const r = await scheduledRelease(ctx);
      const [a, b] = await Promise.all([tick(ctx, T), tick(ctx, T, { driver: ctx.peer })]);
      expect(a.ran + b.ran).toBe(1);
      expect(ctx.exec.calls).toHaveLength(1);
      expect(await count(ctx.sql, "schedule_runs", "subject_id = ?", [r.id])).toBe(1);
      expect((await ctx.store.getRelease(SITE, r.id))?.state).toBe("published");
      // Racing claims directly: exactly one wins.
      const r2 = await scheduledRelease(ctx, { nodes: ["entry_conform07"], at: plus(T, MIN) });
      const run = await runId(r2.id, plus(T, MIN));
      const claim = (store: SqlScheduleStore) =>
        store.claimRelease({
          siteId: SITE,
          releaseId: r2.id,
          expectedRev: r2.rev,
          executeAt: plus(T, MIN),
          runId: run,
          token: newLeaseToken(),
          now: plus(T, MIN),
          leaseUntil: plus(T, 11 * MIN),
          trigger: "cron",
          latenessSeconds: 0,
        });
      const wins = await Promise.all([claim(ctx.store), claim(new SqlScheduleStore(ctx.peer))]);
      expect(wins.filter(Boolean)).toHaveLength(1);
    });

    it("D15: one release at a time per site, in time order, even across concurrent ticks", async () => {
      const first = await scheduledRelease(ctx, { nodes: ["entry_conform01"], at: T });
      const second = await scheduledRelease(ctx, { nodes: ["entry_conform02"], at: plus(T, MIN) });
      const other = await scheduledRelease(ctx, {
        siteId: OTHER_SITE,
        nodes: ["entry_conform03"],
        at: T,
      });
      let running = 0;
      let maxRunning = 0;
      const order: string[] = [];
      const runningInDb: number[] = [];
      ctx.exec.behavior = async (i) => {
        if (i.release.siteId === SITE) {
          running++;
          maxRunning = Math.max(maxRunning, running);
          runningInDb.push(
            await count(ctx.sql, "releases", "site_id = ? AND state = 'running'", [SITE]),
          );
        }
        order.push(i.release.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (i.release.siteId === SITE) running--;
        return {
          kind: "published",
          snapshotId: "snap_conform01",
          baseSnapshotId: "snap_conform00",
          purge: "none",
          committed: false,
        };
      };
      const paid = TICK_BUDGETS.paid;
      await Promise.all([
        tick(ctx, plus(T, 2 * MIN), { budget: paid }),
        tick(ctx, plus(T, 2 * MIN), { budget: paid, driver: ctx.peer }),
      ]);
      await tick(ctx, plus(T, 3 * MIN), { budget: paid });
      expect(maxRunning).toBe(1);
      expect(runningInDb).toEqual([1, 1]);
      expect(order.filter((id) => id !== other.id)).toEqual([first.id, second.id]);
      for (const id of [first.id, second.id])
        expect((await ctx.store.getRelease(SITE, id))?.state).toBe("published");
      expect((await ctx.store.getRelease(OTHER_SITE, other.id))?.state).toBe("published");
    });

    it("S8: more than an hour late is missed, never published; within the hour it runs late", async () => {
      const late = await scheduledRelease(ctx, { nodes: ["entry_conform01"], at: T });
      const ok = await scheduledRelease(ctx, { nodes: ["entry_conform02"], at: plus(T, 30 * MIN) });
      const report = await tick(ctx, plus(T, 61 * MIN));
      expect(report).toMatchObject({ ran: 1, late: 2 });
      const missed = (await ctx.store.getRelease(SITE, late.id)) as Release;
      expectContractRelease(missed);
      expect(missed).toMatchObject({
        state: "missed",
        outcome: { kind: "missed", latenessSeconds: 3660 },
      });
      expect((await ctx.store.listRuns(SITE, { subjectId: late.id }))[0]).toMatchObject({
        state: "missed",
        latenessSeconds: 3660,
      });
      expect(ctx.exec.calls.map((c) => c.release.id)).toEqual([ok.id]);
      expect((await ctx.store.getRelease(SITE, ok.id))?.state).toBe("published");
      const m = await scheduledRelease(ctx, { nodes: ["entry_conform04"], at: plus(T, 2 * MIN) });
      ctx.exec.calls.length = 0;
      expect(measure("release missed", await tick(ctx, plus(T, 63 * MIN)))).toBe(7);
      expect((await ctx.store.getRelease(SITE, m.id))?.state).toBe("missed");
    });

    it("never early: a wall-clock release whose instant moved later waits for it (tzdata)", async () => {
      // Stored at 05:00Z by older rules; today's tzdata puts 09:00 Istanbul at 06:00Z.
      const r = await scheduledRelease(ctx, {
        at: "2026-11-02T05:00:00.000Z",
        localTime: "2026-11-02T09:00",
      });
      await tick(ctx, "2026-11-02T05:00:30.000Z");
      expect(ctx.exec.calls).toHaveLength(0);
      const moved = (await ctx.store.getRelease(SITE, r.id)) as Release;
      expect(moved.state).toBe("scheduled");
      expect(moved.when).toEqual({
        kind: "at",
        at: T,
        timeZone: TZ,
        localTime: "2026-11-02T09:00",
      });
      await tick(ctx, plus(T, 5000));
      expect(ctx.exec.calls).toHaveLength(1);
    });

    it("expires releases whose approval is gone, lapsed or no longer matches the items", async () => {
      const auto = await scheduledRelease(ctx, {
        nodes: ["entry_conform01"],
        approval: {
          kind: "auto",
          by: AGENT,
          keyId: "key_conform01",
          at: T0,
          windowEnds: plus(T, -MIN),
        },
      });
      const lost = await scheduledRelease(ctx, { nodes: ["entry_conform02"] });
      const tampered = await scheduledRelease(ctx, { nodes: ["entry_conform03"] });
      await ctx.sql.run("UPDATE release_items SET target_hash = ? WHERE release_id = ?", [
        h("e"),
        tampered.id,
      ]);
      await tick(ctx, T, {
        budget: TICK_BUDGETS.paid,
        checkApproval: (rel) =>
          rel.id === lost.id ? { ok: false, reason: "approval_lost" } : { ok: true },
      });
      expect(ctx.exec.calls).toHaveLength(0);
      for (const [id, reason] of [
        [auto.id, "auto_window_ended"],
        [lost.id, "approval_lost"],
        [tampered.id, "approval_lost"],
      ] as const) {
        const r = (await ctx.store.getRelease(SITE, id)) as Release;
        expectContractRelease(r);
        expect(r).toMatchObject({ state: "expired", outcome: { kind: "expired", reason } });
      }
    });

    it("S4: a conflict holds the release with the changed nodes; a failure records its code", async () => {
      const c = await scheduledRelease(ctx, { nodes: ["entry_conform01"] });
      const f = await scheduledRelease(ctx, { nodes: ["entry_conform02"], at: plus(T, MIN) });
      ctx.exec.behavior = (i) =>
        i.release.id === c.id
          ? {
              kind: "conflict",
              conflicts: [
                {
                  nodeId: "entry_conform01",
                  expected: { rev: 1, hash: h("a") },
                  found: { rev: 3, hash: h("f") },
                },
              ],
            }
          : {
              kind: "failed",
              code: "dependency_missing",
              message: "entry_conform02 needs term_conform01",
            };
      const report = await tick(ctx, plus(T, MIN), { budget: TICK_BUDGETS.paid });
      expect(report.failed).toBe(1);
      const conflict = (await ctx.store.getRelease(SITE, c.id)) as Release;
      expectContractRelease(conflict);
      expect(conflict.outcome).toMatchObject({
        kind: "conflict",
        conflicts: [{ nodeId: "entry_conform01" }],
      });
      expect((await ctx.store.listRuns(SITE, { subjectId: c.id }))[0]).toMatchObject({
        state: "failed",
        error: { code: "conflict" },
      });
      const failed = (await ctx.store.getRelease(SITE, f.id)) as Release;
      expect(failed.outcome).toMatchObject({ kind: "failed", code: "dependency_missing" });
      expect((await ctx.store.heldNodes(SITE)).size).toBe(0);
    });

    it("transient errors retry with back-off inside the hour; then the release is missed", async () => {
      const r = await scheduledRelease(ctx);
      let fail = 1;
      ctx.exec.behavior = () =>
        fail-- > 0
          ? { kind: "retry", error: "D1_ERROR: network\nconnection lost" }
          : {
              kind: "published",
              snapshotId: "snap_conform01",
              baseSnapshotId: "snap_conform00",
              purge: "tags",
              committed: false,
            };
      await tick(ctx, T);
      expect((await ctx.store.listRuns(SITE, { subjectId: r.id }))[0]).toMatchObject({
        state: "running",
        error: { code: "transient" },
      });
      await tick(ctx, plus(T, 10_000));
      expect(ctx.exec.calls).toHaveLength(1);
      const report = await tick(ctx, plus(T, 31_000));
      expect(measure("release recovered after a transient error", report)).toBe(13);
      expect(ctx.exec.calls[1]).toMatchObject({ run: { attempt: 2, recovering: true } });
      expect((await ctx.store.getRelease(SITE, r.id))?.state).toBe("published");
      expectContractRun((await ctx.store.listRuns(SITE, { subjectId: r.id }))[0] as ScheduleRun);
      // Always transient: missed once retrying would pass the hour.
      const r2 = await scheduledRelease(ctx, { nodes: ["entry_conform02"], at: plus(T, 2 * MIN) });
      ctx.exec.behavior = () => ({ kind: "retry", error: "timeout" });
      await tick(ctx, plus(T, 61 * MIN + 30_000));
      expect((await ctx.store.getRelease(SITE, r2.id))?.state).toBe("running");
      await tick(ctx, plus(T, 63 * MIN));
      expect((await ctx.store.getRelease(SITE, r2.id))?.state).toBe("missed");
    });

    it("a claim left by a crashed tick is recovered after its lease; past the hour it is missed", async () => {
      const r = await scheduledRelease(ctx);
      const run = await runId(r.id, T);
      expect(
        await ctx.store.claimRelease({
          siteId: SITE,
          releaseId: r.id,
          expectedRev: r.rev,
          executeAt: T,
          runId: run,
          token: newLeaseToken(),
          now: T,
          leaseUntil: plus(T, 10 * MIN),
          trigger: "alarm",
          latenessSeconds: 0,
        }),
      ).toBe(true);
      await tick(ctx, plus(T, 5 * MIN));
      expect(ctx.exec.calls).toHaveLength(0);
      const report = await tick(ctx, plus(T, 10 * MIN));
      expect(measure("release recovered after an expired lease", report)).toBe(13);
      expect(ctx.exec.calls[0]).toMatchObject({ run: { id: run, attempt: 2, recovering: true } });
      expect((await ctx.store.getRelease(SITE, r.id))?.state).toBe("published");
      const r2 = await scheduledRelease(ctx, { nodes: ["entry_conform02"], at: plus(T, MIN) });
      await ctx.store.claimRelease({
        siteId: SITE,
        releaseId: r2.id,
        expectedRev: r2.rev,
        executeAt: plus(T, MIN),
        runId: await runId(r2.id, plus(T, MIN)),
        token: newLeaseToken(),
        now: plus(T, MIN),
        leaseUntil: plus(T, 11 * MIN),
        trigger: "cron",
        latenessSeconds: 0,
      });
      await tick(ctx, plus(T, 62 * MIN));
      expect(ctx.exec.calls).toHaveLength(1);
      expect((await ctx.store.getRelease(SITE, r2.id))?.state).toBe("missed");
    });

    it("the kill switch holds due releases; resumed within the hour they run, after it they are missed", async () => {
      const a = await scheduledRelease(ctx, { nodes: ["entry_conform01"] });
      await ctx.store.putSettings(SITE, { paused: true }, { expectedRev: 0, by: EDITOR });
      await tick(ctx, T);
      expect(ctx.exec.calls).toHaveLength(0);
      await ctx.store.putSettings(SITE, { paused: false }, { expectedRev: 1, by: EDITOR });
      await tick(ctx, plus(T, 30 * MIN));
      expect((await ctx.store.getRelease(SITE, a.id))?.state).toBe("published");
      const b = await scheduledRelease(ctx, { nodes: ["entry_conform02"], at: plus(T, 31 * MIN) });
      await ctx.store.putSettings(SITE, { paused: true }, { expectedRev: 2, by: EDITOR });
      await tick(ctx, plus(T, 60 * MIN));
      await tick(ctx, plus(T, 92 * MIN));
      expect((await ctx.store.getRelease(SITE, b.id))?.state).toBe("missed");
      expect(ctx.exec.calls).toHaveLength(1);
    });

    it("a tick that cannot afford a release claims nothing and reports more", async () => {
      const r = await scheduledRelease(ctx);
      const report = await tick(ctx, T, {
        budget: { maxQueries: 4, maxReleases: 1, deadlineMs: 8000 },
      });
      expect(report.more).toBe(true);
      expect(report.statements).toBeLessThanOrEqual(4);
      expect((await ctx.store.getRelease(SITE, r.id))?.state).toBe("scheduled");
      expect(report.nextWakeAt).toBe(plus(T, 1000));
    });

    it("built-in jobs: one bounded step per tick, the latest occurrence after downtime, three failures pause", async () => {
      const steps: BuiltinStepInput[] = [];
      let script: (BuiltinStepResult | Error)[] = [
        {
          done: true,
          outcome: "did-work",
          counts: { "broken-links": 2 },
          summary: "2 broken links",
          findings: [{ path: "/a" }],
        },
      ];
      const builtins: BuiltinRunner = {
        cost: 0,
        async step(input) {
          steps.push(input);
          const next = script.shift() ?? { done: true };
          if (next instanceof Error) throw next;
          return next;
        },
      };
      const a = await ctx.store.createAutomation({
        siteId: SITE,
        name: "Hourly broken-link sweep",
        job: { kind: "builtin", builtin: "broken-links" },
        recurrence: {
          start: "2026-10-12T10:17",
          timeZone: "UTC",
          rule: presetRule("hourly", "2026-10-12T10:17"),
        },
        owner: { id: "user_editor01" },
      });
      expect((await tick(ctx, "2026-10-12T10:16:00.000Z", { builtins })).ran).toBe(0);
      const r1 = await tick(ctx, "2026-10-12T10:17:20.000Z", { builtins });
      expect(measure("built-in step (done)", r1)).toBe(8);
      expect(r1.ran).toBe(1);
      const run1 = await runId(a.id, "2026-10-12T10:17:00.000Z");
      const got = (await ctx.store.getRun(SITE, run1)) as ScheduleRun;
      expectContractRun(got);
      expect(got).toMatchObject({
        state: "succeeded",
        outcome: "did-work",
        counts: { "broken-links": 2 },
        summary: "2 broken links",
        latenessSeconds: 20,
        subject: { kind: "automation", job: "builtin" },
      });
      expect(await ctx.store.runFindings(SITE, run1)).toEqual([{ path: "/a" }]);
      expect(await ctx.store.getAutomation(SITE, a.id)).toMatchObject({
        nextRunAt: "2026-10-12T11:17:00.000Z",
        consecutiveFailures: 0,
      });
      // Five hours down: one skipped row for 11:17–14:17, one run at 15:17.
      script = [
        { done: false, position: { offset: 200 } },
        { done: true, outcome: "nothing-to-do" },
      ];
      const r2 = await tick(ctx, "2026-10-12T15:20:00.000Z", { builtins });
      expect(measure("built-in step (more to do) with coalesced occurrences", r2)).toBe(8);
      const skipped = (await ctx.store.getRun(
        SITE,
        await runId(a.id, "2026-10-12T11:17:00.000Z"),
      )) as ScheduleRun;
      expectContractRun(skipped);
      expect(skipped).toMatchObject({ state: "skipped", counts: { coalesced: 4 } });
      const run2 = await runId(a.id, "2026-10-12T15:17:00.000Z");
      expect(await ctx.store.getRun(SITE, run2)).toMatchObject({ state: "running" });
      // The next tick continues the same run from its position.
      await tick(ctx, "2026-10-12T15:21:00.000Z", { builtins });
      expect(steps[steps.length - 1]).toMatchObject({
        run: { id: run2 },
        position: { offset: 200 },
      });
      expect(await ctx.store.getRun(SITE, run2)).toMatchObject({
        state: "succeeded",
        outcome: "nothing-to-do",
      });
      expect(await count(ctx.sql, "schedule_runs", "subject_id = ?", [a.id])).toBe(3);
      // Three failures in a row pause it.
      script = [new Error("boom\u0007"), new Error("boom"), new Error("boom")];
      for (const at of [
        "2026-10-12T16:17:01.000Z",
        "2026-10-12T17:17:01.000Z",
        "2026-10-12T18:17:01.000Z",
      ])
        await tick(ctx, at, { builtins });
      const paused = (await ctx.store.getAutomation(SITE, a.id)) as Automation;
      expectContractAutomation(paused);
      expect(paused).toMatchObject({
        state: "auto-paused",
        pausedReason: "failures",
        consecutiveFailures: 3,
      });
      const failed = (await ctx.store.getRun(
        SITE,
        await runId(a.id, "2026-10-12T16:17:00.000Z"),
      )) as ScheduleRun;
      expectContractRun(failed);
      expect(failed.error).toEqual({ code: "job_error", message: "boom " });
    });

    it("agent tasks: windows recorded at the occurrence, begun once, closed as missed or failed", async () => {
      const a = await ctx.store.createAutomation({
        siteId: SITE,
        name: "Hourly comment triage",
        job: {
          kind: "agent-task",
          keyId: "key_conform01",
          instructions: "Label new comments",
          modeCap: "edits",
          readsUntrustedText: true,
          windowMinutes: 30,
          budget: { maxToolCalls: 50, maxWrites: 0, maxApprovalRequests: 0, maxMinutes: 15 },
        },
        recurrence: {
          start: "2026-10-12T10:07",
          timeZone: "UTC",
          rule: presetRule("hourly", "2026-10-12T10:07"),
        },
        owner: { id: "user_editor01" },
      });
      const r1 = await tick(ctx, "2026-10-12T10:07:10.000Z", { automationsEnabled: true });
      expect(measure("agent-task occurrence recorded", r1)).toBe(6);
      const run1 = await runId(a.id, "2026-10-12T10:07:00.000Z");
      const ready = (await ctx.store.getRun(SITE, run1)) as ScheduleRun;
      expectContractRun(ready);
      expect(ready).toMatchObject({
        state: "ready",
        window: { opensAt: "2026-10-12T10:07:00.000Z", closesAt: "2026-10-12T10:37:00.000Z" },
      });
      expect((await ctx.store.getAutomation(SITE, a.id))?.nextRunAt).toBe(
        "2026-10-12T11:07:00.000Z",
      );
      expect(
        await ctx.store.beginAgentRun({
          siteId: SITE,
          runId: run1,
          now: "2026-10-12T10:10:00.000Z",
          endsAt: "2026-10-12T10:25:00.000Z",
        }),
      ).toBe(true);
      expect(
        await ctx.store.beginAgentRun({
          siteId: SITE,
          runId: run1,
          now: "2026-10-12T10:11:00.000Z",
          endsAt: "2026-10-12T10:26:00.000Z",
        }),
      ).toBe(false);
      expect(
        await ctx.store.endAgentRun({
          siteId: SITE,
          runId: run1,
          now: "2026-10-12T10:20:00.000Z",
          summary: "Labelled 4 comments",
          outcome: "did-work",
        }),
      ).toBe(true);
      expectContractRun((await ctx.store.getRun(SITE, run1)) as ScheduleRun);
      // 11:07 opens; nobody begins; the window closes → missed, a failure counted.
      await tick(ctx, "2026-10-12T11:07:05.000Z");
      const closing = await tick(ctx, "2026-10-12T11:37:05.000Z");
      expect(measure("agent-task window closed", closing)).toBe(8);
      expect(
        await ctx.store.getRun(SITE, await runId(a.id, "2026-10-12T11:07:00.000Z")),
      ).toMatchObject({ state: "missed" });
      expect((await ctx.store.getAutomation(SITE, a.id))?.consecutiveFailures).toBe(1);
      // 12:07 begun but never ended → failed at its end.
      await tick(ctx, "2026-10-12T12:07:05.000Z");
      const run3 = await runId(a.id, "2026-10-12T12:07:00.000Z");
      await ctx.store.beginAgentRun({
        siteId: SITE,
        runId: run3,
        now: "2026-10-12T12:08:00.000Z",
        endsAt: "2026-10-12T12:20:00.000Z",
      });
      await tick(ctx, "2026-10-12T12:21:00.000Z");
      const failed = (await ctx.store.getRun(SITE, run3)) as ScheduleRun;
      expectContractRun(failed);
      expect(failed).toMatchObject({ state: "failed", error: { code: "not_ended" } });
      expect((await ctx.store.getAutomation(SITE, a.id))?.consecutiveFailures).toBe(2);
      // Downtime: only the latest window is recorded (already closed → missed); the third failure pauses.
      await tick(ctx, "2026-10-12T16:40:00.000Z");
      expect(await count(ctx.sql, "schedule_runs", "subject_id = ?", [a.id])).toBe(4);
      expect(await ctx.store.getAutomation(SITE, a.id)).toMatchObject({
        state: "auto-paused",
        pausedReason: "failures",
      });
      // CLOUDHAL_AUTOMATIONS=off: nothing happens for automations.
      const b = await ctx.store.createAutomation({
        siteId: OTHER_SITE,
        name: "Another",
        job: {
          kind: "agent-task",
          keyId: "key_conform02",
          instructions: "x",
          modeCap: "plan",
          readsUntrustedText: false,
          windowMinutes: 5,
          budget: { maxToolCalls: 1, maxWrites: 0, maxApprovalRequests: 0, maxMinutes: 1 },
        },
        recurrence: { start: "2026-10-12T17:00", timeZone: "UTC" },
        owner: { id: "user_editor01" },
      });
      await tick(ctx, "2026-10-12T17:00:30.000Z", { automationsEnabled: false });
      expect(await count(ctx.sql, "schedule_runs", "subject_id = ?", [b.id])).toBe(0);
    });

    it("system jobs run behind their watermark, once across concurrent ticks", async () => {
      let runs = 0;
      let fail = false;
      const job: SystemJobDefinition = {
        name: "comments.hourly",
        cost: 2,
        next: hourlyAt(17),
        async run() {
          runs++;
          await new Promise((resolve) => setTimeout(resolve, 2));
          if (fail) throw new Error("rollup failed");
        },
      };
      const first = await tick(ctx, "2026-10-12T10:00:00.000Z", { systemJobs: [job] });
      expect(measure("first tick registering system jobs", first)).toBe(3);
      expect(runs).toBe(0);
      expect((await ctx.store.systemJobs())[0]?.nextRunAt).toBe("2026-10-12T10:17:00.000Z");
      const due = await tick(ctx, "2026-10-12T10:17:05.000Z", { systemJobs: [job] });
      expect(measure("system job run", due)).toBe(6);
      expect(runs).toBe(1);
      expect((await ctx.store.systemJobs())[0]).toMatchObject({
        nextRunAt: "2026-10-12T11:17:00.000Z",
        lastOkAt: "2026-10-12T10:17:05.000Z",
      });
      await Promise.all([
        tick(ctx, "2026-10-12T11:17:05.000Z", { systemJobs: [job] }),
        tick(ctx, "2026-10-12T11:17:05.000Z", { systemJobs: [job], driver: ctx.peer }),
      ]);
      expect(runs).toBe(2);
      fail = true;
      const failed = await tick(ctx, "2026-10-12T14:20:00.000Z", { systemJobs: [job] });
      expect(failed.failed).toBe(1);
      expect((await ctx.store.systemJobs())[0]).toMatchObject({
        nextRunAt: "2026-10-12T15:17:00.000Z",
        lastError: "rollup failed",
      });
    });

    it("the heartbeat records the tick and the next wake; work forces a write", async () => {
      await tick(ctx, T0, { trigger: "alarm", wake: "computed" });
      expect(await ctx.store.heartbeat()).toMatchObject({
        at: T0,
        trigger: "alarm",
        nextWakeAt: plus(T0, 5 * MIN),
        ran: 0,
      });
      await scheduledRelease(ctx, { at: plus(T0, 2 * MIN) });
      const report = await tick(ctx, plus(T0, 2 * MIN + 1000), {
        trigger: "alarm",
        wake: "computed",
      });
      expect(report.ran).toBe(1);
      expect(await ctx.store.heartbeat()).toMatchObject({
        at: plus(T0, 2 * MIN + 1000),
        trigger: "alarm",
        ran: 1,
        more: false,
        lagSeconds: 1,
      });
    });
  });
}
