/**
 * RFC-0008 §8.4 and §16 on Node: the scheduler's Node ticker (catch-up at start, pokes, at most
 * 60 s between ticks) on the project's SQLite, and `cloudhal schedules status | list | run-due`,
 * locally and with `--remote` against an in-process admin API (deployment token).
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApi } from "@cloudhal/api";
import type { Release } from "@cloudhal/core-contracts";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { ReleaseService } from "@cloudhal/core-ts/releases";
import { presetRule } from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminWorkerConfig } from "../src/cloudflare/config.ts";
import { parseSchedulesConfig, writeProjectConfig } from "../src/config.ts";
import {
  automationsEnabled,
  describeSchedulesStatus,
  init,
  readProjectConfig,
  runLocalTick,
  schedulesList,
  schedulesRunDue,
  schedulesStatus,
  startLocalScheduler,
} from "../src/index.ts";

const human = { kind: "human" as const, id: "user_schedcli001", name: "Halil" };
const TOKEN = "schedules-cli-deploy-token-0123456789abcdef";

describe("the Node ticker and `cloudhal schedules` (RFC-0008 §8.4, §16)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let dataDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-schedules-cli-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Ticking Site" })).siteId;
    dataDir = path.join(projectDir, (await readProjectConfig(projectDir)).dataDir);
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  /** A release of the seeded article retitled to `title`, due at `at` (lead time bypassed). */
  const release = async (
    local: Awaited<ReturnType<typeof openLocalStore>>,
    title: string,
    at: number,
  ): Promise<Release> => {
    const entry = (await local.store.listContentEntries(siteId)).find(
      (e) => e.slug === "hello-world",
    );
    if (!entry) throw new Error("no hello-world");
    await local.store.updateContentEntry({ ...entry, title });
    const svc = new ReleaseService({
      graph: local.store,
      now: () => new Date(at - 120_000),
    });
    const { release: draft } = await svc.create({
      siteId,
      set: [entry.id],
      createdBy: human,
      when: { at: new Date(at).toISOString() },
    });
    return svc.schedule(siteId, draft.id, {
      expectedRev: draft.rev,
      approval: { kind: "person", by: { id: human.id }, at: new Date().toISOString() },
    });
  };

  it("catches up at start, ticks again when poked, and never waits more than a minute", async () => {
    const local = await openLocalStore(dataDir);
    try {
      const snap = await local.store.createSnapshot(siteId, { actor: human, reason: "publish" });
      await local.store.publish((await local.store.getSite(siteId)) as never, snap.id);
      // due 30 s ago, while no process ran: the catch-up tick at start publishes it
      const missed = await release(local, "Caught up at start", Date.now() - 30_000);
      const lines: string[] = [];
      const ticker = startLocalScheduler({
        sql: local.sql,
        blobs: local.blobs,
        graph: local.store,
        log: (l) => lines.push(l),
      });
      try {
        await ticker.started;
        const schedules = new SqlScheduleStore(local.sql);
        expect((await schedules.getRelease(siteId, missed.id))?.state).toBe("published");
        expect((await schedules.listRuns(siteId, { subjectId: missed.id }))[0]).toMatchObject({
          state: "succeeded",
          trigger: "node",
        });
        // the next tick is at most a minute away
        expect(ticker.nextAt()).toBeLessThanOrEqual(Date.now() + 60_000);
        // a release a few seconds away: the poke moves the timer to it
        const soon = Date.now() + 3_000;
        const next = await release(local, "Published on a poke", soon);
        await ticker.poke(new Date(soon).toISOString());
        expect(ticker.nextAt()).toBeLessThanOrEqual(soon + 1_000);
        const deadline = Date.now() + 15_000;
        while (
          (await schedules.getRelease(siteId, next.id))?.state !== "published" &&
          Date.now() < deadline
        )
          await new Promise((resolve) => setTimeout(resolve, 250));
        expect((await schedules.getRelease(siteId, next.id))?.state).toBe("published");
        expect((await schedules.heartbeat())?.trigger).toBe("node");
        expect(lines.some((l) => /^schedules tick \(node\): 1 ran/.test(l))).toBe(true);
      } finally {
        ticker.stop();
      }
    } finally {
      await local.close();
    }
  });

  it("status, list and run-due on the project's SQLite", async () => {
    const status = await schedulesStatus({ projectDir });
    expect(status).toMatchObject({
      where: "local",
      engine: { schedulesLevel: 1 },
      scheduler: { mode: "node", state: "running", healthy: true },
      sites: [{ siteId, openReleases: [], gatedNodes: 0 }],
    });
    expect(describeSchedulesStatus(status)[0]).toMatch(/^scheduler \(local, node\): running/);
    const list = await schedulesList({ projectDir });
    expect(list.map((r) => r.state)).toEqual(["published", "published"]);
    const r = await schedulesRunDue({ projectDir });
    expect(r).toMatchObject({ ran: 0, failed: 0, more: false });
  });

  it("--remote talks to the deployment's admin API with the deployment token", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    const local = await openLocalStore(dataDir);
    const { exportSite, importSite } = await import("@cloudhal/core-ts");
    await importSite({ sql, blobs }, await exportSite(local, siteId), {
      mode: "bootstrap",
    });
    await local.close();
    const ticks: string[] = [];
    const app = createApi({
      store: remote,
      admin: { deployToken: TOKEN, storage: { sql, blobs } },
      scheduler: {
        mode: "cron",
        poke: async () => {},
        runDue: async (trigger) => {
          ticks.push(trigger);
          return { ran: 1, late: 0, failed: 0, more: false };
        },
      },
    });
    const f = ((input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init))) as typeof fetch;
    const deployDir = path.join(dataDir, "deploy");
    await mkdir(deployDir, { recursive: true });
    await writeFile(
      path.join(deployDir, "state.json"),
      JSON.stringify({ name: "ticking", adminUrl: "https://ticking-admin.example" }),
    );
    await writeFile(
      path.join(deployDir, "secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: TOKEN }),
    );
    const status = await schedulesStatus({ projectDir, remote: true, fetch: f });
    expect(status).toMatchObject({
      where: "remote",
      engine: { schedulesLevel: 1 },
      scheduler: { mode: "cron", state: "unknown", healthy: false },
      sites: [{ siteId, openReleases: [], gatedNodes: 0 }],
    });
    expect(await schedulesList({ projectDir, remote: true, fetch: f })).toEqual([]);
    expect(await schedulesRunDue({ projectDir, remote: true, fetch: f })).toMatchObject({ ran: 1 });
    expect(ticks).toEqual(["manual"]);
    // the wrong token is refused
    await writeFile(
      path.join(deployDir, "secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: "x".repeat(40) }),
    );
    await expect(schedulesStatus({ projectDir, remote: true, fetch: f })).rejects.toThrow(/401/);
  });
});

describe("the deployment's tick budget and automations switch (RFC-0008 §8.2, §11.6)", () => {
  const admin = { name: "news", studioDir: "studio", main: "./worker.ts" };

  it("the admin config always carries CLOUDHAL_TICK_BUDGET and CLOUDHAL_AUTOMATIONS", () => {
    // nothing said: the Workers Free budget, automations on (a redeploy never drops either var)
    expect(adminWorkerConfig(admin).vars).toMatchObject({
      CLOUDHAL_TICK_BUDGET: "free",
      CLOUDHAL_AUTOMATIONS: "on",
    });
    expect(
      adminWorkerConfig({ ...admin, schedules: { automations: false, plan: "paid" } }).vars,
    ).toMatchObject({ CLOUDHAL_TICK_BUDGET: "paid", CLOUDHAL_AUTOMATIONS: "off" });
  });

  it("cloudhal.json `schedules` is read leniently and kept on write", async () => {
    expect(parseSchedulesConfig({ automations: false, plan: "paid" })).toEqual({
      automations: false,
      plan: "paid",
    });
    expect(parseSchedulesConfig({ automations: "no", plan: "pro" })).toEqual({});
    expect(parseSchedulesConfig("paid")).toBeUndefined();
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-schedules-cfg-"));
    try {
      await writeFile(
        path.join(tmp, "cloudhal.json"),
        JSON.stringify({ siteId: "site_abcdefgh", schedules: { plan: "paid" } }),
      );
      const cfg = await readProjectConfig(tmp);
      expect(cfg.schedules).toEqual({ plan: "paid" });
      await writeProjectConfig(tmp, cfg);
      expect((await readProjectConfig(tmp)).schedules).toEqual({ plan: "paid" });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("CLOUDHAL_AUTOMATIONS=off stops automations on Node", async () => {
    expect(automationsEnabled({})).toBe(true);
    expect(automationsEnabled({ CLOUDHAL_AUTOMATIONS: "on" })).toBe(true);
    expect(automationsEnabled({ CLOUDHAL_AUTOMATIONS: "off" })).toBe(false);
    expect(automationsEnabled({ CLOUDHAL_AUTOMATIONS: " OFF " })).toBe(false);

    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-schedules-off-"));
    const projectDir = path.join(tmp, "site");
    const siteId = (await init({ dir: projectDir, name: "Switched Off" })).siteId;
    const local = await openLocalStore(
      path.join(projectDir, (await readProjectConfig(projectDir)).dataDir),
    );
    const before = process.env.CLOUDHAL_AUTOMATIONS;
    try {
      const created = new SqlScheduleStore(local.sql, {
        now: () => new Date("2026-10-12T09:00:00.000Z"),
      });
      const job = await created.createAutomation({
        siteId,
        name: "Stale",
        job: { kind: "builtin", builtin: "stale-content" },
        recurrence: {
          start: "2026-10-12T10:07",
          timeZone: "UTC",
          rule: presetRule("daily", "2026-10-12T10:07"),
        },
        owner: { id: "user_editor01" },
      });
      expect(job.nextRunAt).toBe("2026-10-12T10:07:00.000Z");
      const schedules = new SqlScheduleStore(local.sql);
      const tick = (at: string, automations?: boolean) =>
        runLocalTick({
          sql: local.sql,
          blobs: local.blobs,
          graph: local.store,
          trigger: "node",
          at: new Date(at),
          ...(automations === undefined ? {} : { automations }),
        });
      // the process environment is the default: off → the due occurrence does not run
      process.env.CLOUDHAL_AUTOMATIONS = "off";
      await tick("2026-10-12T10:07:20.000Z");
      expect(await schedules.listRuns(siteId, { subjectId: job.id })).toEqual([]);
      // on again (an explicit option wins over the environment): the occurrence runs
      await tick("2026-10-12T10:08:20.000Z", true);
      expect((await schedules.listRuns(siteId, { subjectId: job.id })).length).toBe(1);
    } finally {
      if (before === undefined) delete process.env.CLOUDHAL_AUTOMATIONS;
      else process.env.CLOUDHAL_AUTOMATIONS = before;
      await local.close();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
