/**
 * The scheduler on Cloudflare, on Node with Miniflare's D1 (RFC-0008 §8.2–§8.7): the ticker mode
 * (including the legacy `*_CRON=off` vars), the clock's re-arm rule and its Durable Object class
 * against a fake state, and a published release's purge through the shared budget — sent, or
 * deferred into the purge queue when the bucket is empty. The full path (cron and alarm on
 * workerd) is `packages/cli/test/cloudflare-schedules.test.ts`.
 */
import { SqlCommentStore } from "@cloudhal/comments/sql";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { ReleaseService, runScheduledTick } from "@cloudhal/core-ts/releases";
import type { TickReport } from "@cloudhal/schedules";
import { MemoryBlobStore } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { createMiniflareD1, dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminBuiltinInputs,
  followUpDelay,
  nextAlarm,
  releasePurger,
  type SchedulerEnv,
  schedulerClockClass,
  schedulerMode,
  schedulerRuntime,
  tickBudget,
} from "../src/scheduler.ts";

const human = { kind: "human" as const, id: "user_01HZX8K3Q9CD", name: "Halil" };

describe("the ticker's mode and budget", () => {
  const env = (o: Partial<SchedulerEnv> = {}) => o as SchedulerEnv;
  it("reads CLOUDHAL_SCHEDULER, else the legacy *_CRON=off vars as alarm, else cron", () => {
    expect(schedulerMode(env())).toBe("cron");
    expect(schedulerMode(env({ CLOUDHAL_SCHEDULER: "alarm" }))).toBe("alarm");
    expect(schedulerMode(env({ CLOUDHAL_ANALYTICS_CRON: "off" }))).toBe("alarm");
    expect(schedulerMode(env({ CLOUDHAL_COMMENTS_CRON: "off" }))).toBe("alarm");
    expect(schedulerMode(env({ CLOUDHAL_SCHEDULER: "cron", CLOUDHAL_COMMENTS_CRON: "off" }))).toBe(
      "cron",
    );
    expect(tickBudget(env()).maxQueries).toBe(40);
    expect(tickBudget(env({ CLOUDHAL_TICK_BUDGET: "paid" })).maxQueries).toBe(900);
  });

  it("cron ignores pokes; alarm pokes the clock", async () => {
    expect(schedulerRuntime(env()).mode).toBe("cron");
    const seen: string[] = [];
    const ns = {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: async (url: string, init: RequestInit) => {
          seen.push(`${url} ${String(init.body)}`);
          return Response.json({});
        },
      }),
    } as unknown as DurableObjectNamespace;
    const rt = schedulerRuntime(env({ CLOUDHAL_SCHEDULER: "alarm", SCHEDULER_CLOCK: ns }));
    expect(rt.mode).toBe("alarm");
    await rt.poke("2026-11-02T06:00:00.000Z");
    expect(seen).toEqual([
      `https://scheduler-clock.internal/poke {"at":${Date.parse("2026-11-02T06:00:00.000Z")}}`,
    ]);
    // a broken clock never breaks the caller
    const broken = schedulerRuntime(
      env({
        CLOUDHAL_SCHEDULER: "alarm",
        SCHEDULER_CLOCK: {
          idFromName: () => "x",
          get: () => ({
            fetch: async () => {
              throw new Error("down");
            },
          }),
        } as unknown as DurableObjectNamespace,
      }),
    );
    await expect(broken.poke("2026-11-02T06:00:00.000Z")).resolves.toBeUndefined();
  });
});

describe("the SchedulerClock Durable Object (§8.3)", () => {
  const NOW = Date.UTC(2026, 9, 13, 9, 0, 0);
  const report = (o: Partial<TickReport>): TickReport => ({
    ran: 0,
    late: 0,
    failed: 0,
    more: false,
    ...o,
  });

  it("re-arms at min(nextWakeAt, now + 1 h), at now + 1 s with more, and a minute after a failure", () => {
    expect(nextAlarm(report({ nextWakeAt: new Date(NOW + 300_000).toISOString() }), NOW)).toBe(
      NOW + 300_000,
    );
    expect(
      nextAlarm(report({ nextWakeAt: new Date(NOW + 5 * 3_600_000).toISOString() }), NOW),
    ).toBe(NOW + 3_600_000);
    expect(nextAlarm(report({}), NOW)).toBe(NOW + 3_600_000);
    // The cron follow-up: only for work due strictly within the next minute.
    const at = (ms: number) => new Date(NOW + ms).toISOString();
    expect(followUpDelay(report({ nextDueAt: at(6_000) }), NOW)).toBe(6_000);
    expect(followUpDelay(report({ nextDueAt: at(60_000) }), NOW)).toBeUndefined();
    expect(followUpDelay(report({ nextDueAt: at(0) }), NOW)).toBeUndefined();
    expect(followUpDelay(report({}), NOW)).toBeUndefined();
    expect(nextAlarm(report({ more: true }), NOW)).toBe(NOW + 1_000);
    expect(nextAlarm(report({ nextWakeAt: new Date(NOW - 5_000).toISOString() }), NOW)).toBe(
      NOW + 1_000,
    );
    expect(nextAlarm(undefined, NOW)).toBe(NOW + 60_000);
  });

  it("pokes move the alarm earlier only; alarm() ticks, never throws, and always re-arms", async () => {
    let alarm: number | null = null;
    const waits: Promise<unknown>[] = [];
    const state = {
      storage: {
        getAlarm: async () => alarm,
        setAlarm: async (t: number) => {
          alarm = t;
        },
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    } as unknown as DurableObjectState;
    const ticks: Date[] = [];
    let fail = false;
    const lines: string[] = [];
    const Clock = schedulerClockClass(
      async (_env, o) => {
        ticks.push(o.now);
        if (fail) throw new Error("D1 unavailable");
        return report({ nextWakeAt: new Date(Date.now() + 120_000).toISOString() });
      },
      (l) => lines.push(l),
    );
    const clock = new Clock(state, {} as SchedulerEnv);
    const far = Date.now() + 600_000;
    const poke = (at: number) =>
      clock.fetch(
        new Request("https://scheduler-clock.internal/poke", {
          method: "POST",
          body: JSON.stringify({ at }),
        }),
      );
    expect(await (await poke(far)).json()).toEqual({ alarm: far });
    expect(await (await poke(far + 60_000)).json()).toEqual({ alarm: far }); // later: kept
    const sooner = Date.now() + 30_000;
    expect(await (await poke(sooner)).json()).toEqual({ alarm: sooner });
    expect(
      await (await clock.fetch(new Request("https://scheduler-clock.internal/alarm"))).json(),
    ).toEqual({ alarm: sooner });
    // the alarm fires: one tick, re-armed at the tick's next wake
    await clock.alarm();
    expect(ticks).toHaveLength(1);
    expect(alarm).toBeGreaterThanOrEqual(Date.now() + 110_000);
    // a failing tick is caught and the clock re-arms a minute later (never thrown)
    fail = true;
    await expect(clock.alarm()).resolves.toBeUndefined();
    expect(lines).toEqual(["scheduler clock tick failed: D1 unavailable"]);
    expect(alarm).toBeGreaterThan(Date.now() + 50_000);
    expect(alarm).toBeLessThanOrEqual(Date.now() + 60_000);
    expect((await clock.fetch(new Request("https://scheduler-clock.internal/x"))).status).toBe(404);
  });
});

describe("a published release's purge (§6.3 after the batch)", () => {
  let d1: Awaited<ReturnType<typeof createMiniflareD1>>;
  let sql: D1Driver;
  let graph: SiteGraphStore;
  let site: Awaited<ReturnType<typeof seedStarterSite>>;
  beforeAll(async () => {
    d1 = await createMiniflareD1();
  });
  afterAll(async () => {
    await d1.dispose();
  });
  const blobs = new MemoryBlobStore();
  let now = Date.UTC(2026, 9, 13, 9, 0, 0);
  beforeEach(async () => {
    sql = new D1Driver(d1.db);
    await dropAllTables(sql);
    now = Date.UTC(2026, 9, 13, 9, 0, 0);
    graph = new SiteGraphStore({ sql, blobs, now: () => new Date(now) });
    await graph.init();
    site = await seedStarterSite(graph, { name: "Purge", slug: "purge" });
    const snap = await graph.createSnapshot(site.id, { actor: human, reason: "publish" });
    site = await graph.publish((await graph.getSite(site.id)) as typeof site, snap.id);
  });

  /** A release of an edited entry, due at `at`. */
  const scheduled = async (at: number) => {
    const entry = (await graph.listContentEntries(site.id))[0];
    if (!entry) throw new Error("no entry");
    await graph.updateContentEntry({ ...entry, title: "Updated at nine" });
    const svc = new ReleaseService({ graph, now: () => new Date(now) });
    const { release } = await svc.create({
      siteId: site.id,
      set: [entry.id],
      createdBy: human,
      when: { at: new Date(at).toISOString() },
    });
    const r = await svc.schedule(site.id, release.id, {
      expectedRev: release.rev,
      approval: { kind: "person", by: { id: human.id }, at: new Date(now).toISOString() },
    });
    return { release: r, entryId: entry.id };
  };
  /** A fake site Worker answering each purge with `status(n)`. */
  const siteWorker = (status: (n: number) => number) => {
    const calls: (string[] | "everything")[] = [];
    return {
      calls,
      fetch: async (_url: string, init: RequestInit) => {
        const body = init.body ? (JSON.parse(String(init.body)) as { tags: string[] }) : undefined;
        calls.push(body ? body.tags : "everything");
        return new Response("{}", { status: status(calls.length) });
      },
    };
  };
  const tick = (at: number, s: ReturnType<typeof siteWorker>, woke: string[]) =>
    runScheduledTick({
      sql,
      blobs,
      now: new Date(at),
      trigger: "cron",
      wake: "minute",
      purge: ({ counted }) =>
        releasePurger(
          {
            SITE: { fetch: s.fetch } as unknown as Fetcher,
            CLOUDHAL_PURGE_TOKEN: "p".repeat(32),
          } as SchedulerEnv,
          counted,
          { wake: (id) => woke.push(id) },
        ),
    });

  it("sends the stored tags through SITE and logs each request in the shared budget", async () => {
    const { release, entryId } = await scheduled(now + 3_600_000);
    const s = siteWorker(() => 200);
    const woke: string[] = [];
    const report = await tick(now + 3_600_000, s, woke);
    expect(report.ran).toBe(1);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toEqual(expect.arrayContaining([`cloudhal-node-${entryId}`]));
    const log = await sql.all<{ source: string }>("SELECT source FROM cache_purge_log");
    expect(log.map((r) => r.source)).toEqual(["schedules"]);
    const done = await new ReleaseService({ graph }).get(site.id, release.id);
    expect(done.release.outcome).toMatchObject({ kind: "published", purge: "tags" });
    expect(woke).toEqual([]);
  });

  it("a tick late in the minute reports the release due seconds later; the follow-up runs it on time", async () => {
    // Cloudflare fired this Worker's cron at :54 of each minute (measured live): a release due at
    // :00 was seen 6 s early and published by the next tick, 54 s late.
    const due = now + 3_600_000;
    const { release } = await scheduled(due);
    const s = siteWorker(() => 200);
    const early = await tick(due - 6_000, s, []);
    expect(early.ran).toBe(0);
    expect(early.nextDueAt).toBe(new Date(due).toISOString());
    expect(followUpDelay(early, due - 6_000)).toBe(6_000);
    const followUp = await tick(due, s, []);
    expect(followUp.ran).toBe(1);
    const done = await new ReleaseService({ graph }).get(site.id, release.id);
    expect(done.release.outcome).toMatchObject({ kind: "published", latenessSeconds: 0 });
    // Nothing due before the next tick: no follow-up.
    expect(followUp.nextDueAt === undefined || followUpDelay(followUp, due) === undefined).toBe(
      true,
    );
  });

  it("an empty bucket defers the tags into the purge queue and records `deferred`", async () => {
    const { release } = await scheduled(now + 3_600_000);
    const s = siteWorker(() => 502);
    const woke: string[] = [];
    await tick(now + 3_600_000, s, woke);
    const queued = await new SqlCommentStore(sql).purgeQueue.queued(site.id);
    expect(queued.map((q) => q.tag).sort()).toEqual([...(s.calls[0] as string[])].sort());
    expect(woke).toEqual([site.id]);
    const done = await new ReleaseService({ graph }).get(site.id, release.id);
    expect(done.release.outcome).toMatchObject({ kind: "published", purge: "deferred" });
  });
});

describe("the built-in jobs' inputs on the admin Worker (RFC-0008 §11.1)", () => {
  const env = (o: Partial<SchedulerEnv> = {}) => o as SchedulerEnv;
  it("fetches the served site's feed through SITE, nothing for other sites; 404 rows from analytics", async () => {
    const seen: string[] = [];
    const SITE = {
      fetch: async (url: string) => {
        seen.push(url);
        return new Response("<rss/>", { headers: { "content-type": "application/rss+xml" } });
      },
    } as unknown as Fetcher;
    const inputs = adminBuiltinInputs(env({ SITE, CLOUDHAL_SITE_ID: "site_served001" }), {
      rollup: async () => ({ done: [], pending: 0, saltsDeleted: 0, retained: 0, failed: [] }),
      feature: () => ({ reader: "sql", enabled: true }),
      query: async () => ({
        data: {
          report: "errors",
          rows: [
            { path: "/gone", status: 404, refPath: null, hits: 3, lastSeen: null },
            { path: "/error", status: 500, refPath: null, hits: 9, lastSeen: null },
          ],
        },
      }),
    });
    expect(await inputs.fetchDocument?.({ siteId: "site_served001", path: "/rss.xml" })).toEqual({
      status: 200,
      contentType: "application/rss+xml",
      body: "<rss/>",
    });
    expect(seen).toEqual(["https://site.internal/rss.xml"]);
    expect(
      await inputs.fetchDocument?.({ siteId: "site_another01", path: "/rss.xml" }),
    ).toBeUndefined();
    expect(
      await inputs.notFound?.({ siteId: "site_served001", from: "a", to: "b", limit: 10 }),
    ).toEqual([{ path: "/gone", status: 404, refPath: null, hits: 3, lastSeen: null }]);
    // no SITE binding, no analytics query: neither input
    expect(adminBuiltinInputs(env(), undefined)).toEqual({});
  });
});
