/**
 * The store calls the policy layer, REST and MCP use (RFC-0008 rollout steps 7–8): "Publish now"
 * through the injected executor, automation keys and open runs, run bookkeeping, automation edits
 * and deletes — on better-sqlite3 and Miniflare D1.
 */
import type { Actor, Release, ScheduleRun } from "@cloudhal/core-contracts";
import { isValid } from "@cloudhal/core-contracts";
import { migrate, migrations, type SqlDriver } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWindow } from "../src/automation.ts";
import { ScheduleConflictError } from "../src/errors.ts";
import { publishReleaseNow } from "../src/manual.ts";
import type { PinnedItem } from "../src/release.ts";
import { SqlScheduleStore } from "../src/sql/store.ts";
import { fakeReleaseExecutor } from "../src/testing.ts";

const SITE = "site_apistore01";
const T0 = "2026-10-12T10:00:00.000Z";
const T = "2026-11-02T06:00:00.000Z";
const EDITOR: Actor = { kind: "human", id: "user_editor01", name: "Ayşe" };
const h = (c: string) => c.repeat(64);
const approval = { kind: "person" as const, by: { id: "user_editor01", name: "Ayşe" }, at: T0 };

function pinned(nodes: readonly string[]): PinnedItem[] {
  return nodes.map((nodeId, i) => ({
    item: {
      kind: "set",
      nodeId,
      nodeKind: "contentEntry",
      target: { rev: 2, hash: h(String(i)) },
      base: { rev: 1, hash: h("a") },
    },
    deps: [],
  }));
}

function suite(label: string, open: () => Promise<SqlDriver>) {
  describe(`schedule store for the API: ${label}`, () => {
    let sql: SqlDriver;
    let store: SqlScheduleStore;
    const clock = { now: T0 };

    beforeEach(async () => {
      sql = await open();
      clock.now = T0;
      store = new SqlScheduleStore(sql, { now: () => new Date(clock.now) });
    });

    async function scheduled(): Promise<Release> {
      const r = await store.createRelease({
        siteId: SITE,
        items: pinned(["entry_apistore1"]),
        createdBy: EDITOR,
      });
      return store.transitionRelease(SITE, r.id, {
        expectedRev: r.rev,
        to: "scheduled",
        when: { kind: "at", at: T, timeZone: "UTC" },
        approval,
      });
    }

    it("publish now runs a scheduled release once through the executor", async () => {
      const r = await scheduled();
      const exec = fakeReleaseExecutor();
      const now = new Date("2026-10-12T11:00:00.000Z");
      const out = await publishReleaseNow({
        store,
        executor: exec,
        siteId: SITE,
        releaseId: r.id,
        expectedRev: r.rev,
        approval: { ...approval, at: now.toISOString() },
        now,
      });
      expect(out.kind).toBe("published");
      expect(out.release).toMatchObject({
        state: "published",
        when: { kind: "on-approval" },
        outcome: { kind: "published", latenessSeconds: 0 },
      });
      expect(isValid("release", out.release)).toBe(true);
      expect(exec.calls).toHaveLength(1);
      expect(exec.calls[0]?.trigger).toBe("manual");
      const run = (await store.getRun(SITE, out.runId)) as ScheduleRun;
      expect(run).toMatchObject({ state: "succeeded", trigger: "manual" });
      expect((await store.heldNodes(SITE)).size).toBe(0);
      // a second press finds a published release: refused, nothing runs again
      await expect(
        publishReleaseNow({
          store,
          executor: exec,
          siteId: SITE,
          releaseId: r.id,
          expectedRev: out.release.rev,
          approval,
          now,
        }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
      expect(exec.calls).toHaveLength(1);
    });

    it("publish now takes missed releases; conflicts and retries end as the tick would", async () => {
      const r = await scheduled();
      const conflictExec = fakeReleaseExecutor(() => ({
        kind: "conflict",
        conflicts: [{ nodeId: "entry_apistore1", expected: { rev: 1, hash: h("a") } }],
      }));
      const out = await publishReleaseNow({
        store,
        executor: conflictExec,
        siteId: SITE,
        releaseId: r.id,
        expectedRev: r.rev,
        approval,
        now: new Date(T0),
      });
      expect(out.release).toMatchObject({ state: "conflict", outcome: { kind: "conflict" } });

      const again = await scheduled();
      const retry = await publishReleaseNow({
        store,
        executor: fakeReleaseExecutor(() => ({ kind: "retry", error: "D1 busy" })),
        siteId: SITE,
        releaseId: again.id,
        expectedRev: again.rev,
        approval,
        now: new Date(T0),
      });
      expect(retry.kind).toBe("retry");
      expect(retry.release.state).toBe("running");
      // a stale rev is a conflict, not a second run
      await expect(
        publishReleaseNow({
          store,
          executor: fakeReleaseExecutor(),
          siteId: SITE,
          releaseId: again.id,
          expectedRev: again.rev,
          approval,
          now: new Date(T0),
        }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
    });

    it("automation keys, manual windows, open runs and run bookkeeping", async () => {
      const a = await store.createAutomation({
        siteId: SITE,
        name: "Comment triage",
        job: {
          kind: "agent-task",
          keyId: "key_apistore01",
          instructions: "Label new comments.",
          modeCap: "edits",
          readsUntrustedText: true,
          windowMinutes: 30,
          budget: { maxToolCalls: 10, maxWrites: 0, maxApprovalRequests: 0, maxMinutes: 15 },
        },
        recurrence: {
          start: "2026-10-12T09:07",
          timeZone: "UTC",
          rule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=7",
        },
        owner: { id: "user_editor01", name: "Ayşe" },
      });
      expect((await store.automationByKey("key_apistore01"))?.id).toBe(a.id);
      expect(await store.automationByKey("key_nothing0001")).toBeUndefined();
      const now = "2026-10-12T10:00:30.000Z";
      const window = runWindow("2026-10-12T10:00:00.000Z", 30);
      const id = await store.openManualWindow({ automation: a, now, window });
      expect(id).toMatch(/^run_/);
      expect(await store.openManualWindow({ automation: a, now, window })).toBeUndefined();
      expect((await store.readyAgentRun(SITE, a.id, now))?.id).toBe(id);
      expect(await store.openAgentRun(SITE, a.id, now)).toBeUndefined();
      expect(
        await store.beginAgentRun({
          siteId: SITE,
          runId: id as string,
          now,
          endsAt: "2026-10-12T10:15:30.000Z",
        }),
      ).toBe(true);
      const open = await store.openAgentRun(SITE, a.id, now);
      expect(open?.id).toBe(id);
      expect(await store.openAgentRun(SITE, a.id, "2026-10-12T10:15:30.000Z")).toBeUndefined();
      expect(
        await store.recordRunCall(SITE, id as string, {
          now,
          taint: { at: now, tool: "list_comments" },
          counts: { "reduce-calls": 1, refusals: 0 },
          usage: { toolCalls: 2, writes: 0, approvalRequests: 0 },
        }),
      ).toBe(true);
      // the first taint stays
      await store.recordRunCall(SITE, id as string, {
        now,
        taint: { at: now, tool: "top_content" },
      });
      const run = (await store.getRun(SITE, id as string)) as ScheduleRun;
      expect(run.taint).toEqual({ at: now, tool: "list_comments" });
      expect(run.counts).toEqual({ "reduce-calls": 1, refusals: 0 });
      expect(isValid("schedule-run", run)).toBe(true);
      expect(
        await store.endAgentRunAs(SITE, id as string, {
          now,
          state: "budget-exceeded",
          error: { code: "budget_exceeded", message: "toolCalls" },
        }),
      ).toBe(true);
      expect((await store.getRun(SITE, id as string))?.state).toBe("budget-exceeded");
      expect(await store.recordRunCall(SITE, id as string, { now })).toBe(false);
    });

    it("updates and deletes automations with a CAS", async () => {
      const a = await store.createAutomation({
        siteId: SITE,
        name: "Weekly links",
        job: { kind: "builtin", builtin: "broken-links" },
        recurrence: { start: "2026-10-12T09:07", timeZone: "UTC", rule: "FREQ=WEEKLY;BYDAY=MO" },
        owner: { id: "user_editor01" },
      });
      const renamed = await store.updateAutomation(SITE, a.id, {
        expectedRev: a.rev,
        name: "Broken links",
        recurrence: { start: "2026-10-12T09:07", timeZone: "UTC", rule: "FREQ=DAILY" },
      });
      expect(renamed).toMatchObject({ name: "Broken links", rev: a.rev + 1 });
      expect(renamed.recurrence.rule).toBe("FREQ=DAILY");
      expect(await store.getAutomation(SITE, a.id)).toEqual(renamed);
      await expect(
        store.updateAutomation(SITE, a.id, { expectedRev: a.rev, name: "stale" }),
      ).rejects.toBeInstanceOf(ScheduleConflictError);
      await expect(store.deleteAutomation(SITE, a.id, a.rev)).rejects.toBeInstanceOf(
        ScheduleConflictError,
      );
      await store.deleteAutomation(SITE, a.id, renamed.rev);
      expect(await store.getAutomation(SITE, a.id)).toBeUndefined();
    });

    it("reports release lateness for the scheduler's health", async () => {
      const r = await scheduled();
      await publishReleaseNow({
        store,
        executor: fakeReleaseExecutor(),
        siteId: SITE,
        releaseId: r.id,
        expectedRev: r.rev,
        approval,
        now: new Date(T0),
      });
      expect(await store.releaseLateness("2026-10-01T00:00:00.000Z")).toEqual([0]);
    });
  });
}

suite("better-sqlite3", async () => {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  return sql;
});

let d1: Awaited<ReturnType<typeof createMiniflareD1>> | undefined;
suite("Cloudflare D1 (Miniflare)", async () => {
  d1 ??= await createMiniflareD1();
  const sql = new D1Driver(d1.db);
  await dropAllTables(sql);
  await migrate(sql, migrations);
  return sql;
});
afterAll(async () => {
  await d1?.dispose();
});
