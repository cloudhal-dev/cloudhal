/**
 * RFC-0008 rollout step 6 on real workerd (wrangler's test harness): the admin Worker as
 * `cloudhal deploy` generates it — the minute cron trigger, the `SchedulerClock` Durable Object
 * (SQLite-backed) and its migration — next to the site Worker, over one D1 and one R2.
 *
 * - **The alarm** (`CLOUDHAL_SCHEDULER=alarm`, a deployment without a cron slot): the first admin
 *   request finds no heartbeat, pokes the clock and ticks once (the backstop); the clock's alarm
 *   ticks, re-arms at the release's time, fires there and publishes it. `setAlarm` works in
 *   `createTestHarness` (RFC-0008 L3's local half).
 * - **The cron** (`/cdn-cgi/local/scheduled?time=…`): the minute tick at a chosen
 *   `scheduledTime` publishes the release due then, purges the site Worker's cache through the
 *   `SITE` binding within the shared budget, and the site serves the new version.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Release, Site } from "@cloudhal/core-contracts";
import { copySite, GATES_ENFORCED, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { type PersonApproval, ReleaseService } from "@cloudhal/core-ts/releases";
import { presetRule, runId } from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { prepareAdminWorker } from "../src/cloudflare/admin.ts";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import {
  MINUTE_CRON,
  siteConfigPath,
  siteWorkerConfig,
  workerNames,
  writeWranglerConfig,
} from "../src/cloudflare/config.ts";
import { init, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const names = { name: "sched", databaseId: "00000000-0000-0000-0000-00000005c4ed" };
const secrets = {
  BETTER_AUTH_SECRET: "sched-better-auth-secret-0123456789abcdef",
  MCP_STATE_KEY: "sched-mcp-state-key-0123456789abcdefghij",
  CLOUDHAL_PREVIEW_SECRET: "sched-preview-secret-0123456789abcdefgh",
  CLOUDHAL_PURGE_TOKEN: "sched-purge-token-0123456789abcdefghijk",
  CLOUDHAL_DEPLOY_TOKEN: "sched-deploy-token-0123456789abcdefghij",
};
const human = { kind: "human" as const, id: "user_schedtest01", name: "Halil" };

describe("the scheduler on workerd (RFC-0008 step 6)", () => {
  let tmp: string;
  let siteId: string;
  let harness: ReturnType<typeof createTestHarness>;
  let remote: SiteGraphStore;
  let sql: D1Driver;
  const W = workerNames(names);

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-schedules-"));
    const projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Scheduled Newsroom" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      siteWorkerConfig({ ...names, siteId }),
      "test",
    );
    const siteConfig = await buildSiteWorker(projectDir);
    const studioDir = path.join(tmp, "studio");
    await mkdir(studioDir);
    await writeFile(path.join(studioDir, "index.html"), "<!doctype html><title>Studio</title>");
    const cfg = await readProjectConfig(projectDir);
    // What `cloudhal deploy` generates (the cron trigger, the clock and its migration); the
    // harness overrides the ticker to the alarm, as a deploy without a cron slot sets it.
    const admin = await prepareAdminWorker({
      projectDir,
      dataDir: cfg.dataDir,
      names,
      siteId,
      studioDir,
    });
    harness = createTestHarness({
      root: projectDir,
      workers: [
        { configPath: admin.configPath, secrets, vars: { CLOUDHAL_SCHEDULER: "alarm" } },
        {
          configPath: siteConfig,
          secrets: {
            CLOUDHAL_PREVIEW_SECRET: secrets.CLOUDHAL_PREVIEW_SECRET,
            CLOUDHAL_PURGE_TOKEN: secrets.CLOUDHAL_PURGE_TOKEN,
          },
        },
      ],
    });
    await harness.listen();
    const env = (await harness.getWorker(W.admin).getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    sql = new D1Driver(env.DB);
    const target = { sql, blobs: new R2BlobStore(env.BLOBS) };
    await migrate(sql, migrations);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await copySite(local, target, siteId);
    await local.close();
    remote = new SiteGraphStore(target);
    const snap = await remote.createSnapshot(siteId, { actor: human, reason: "publish" });
    const site = await remote.getSite(siteId);
    if (!site) throw new Error("site not copied");
    await remote.publish(site, snap.id);
  });

  afterAll(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const adminFetch = (p: string, init?: RequestInit) =>
    harness
      .getWorker(W.admin)
      .fetch(`https://admin.example${p}`, init as never) as unknown as Promise<Response>;
  const siteFetch = (p: string) =>
    harness.getWorker(W.site).fetch(`https://news.example${p}`) as unknown as Promise<Response>;
  const approval = (): PersonApproval => ({
    kind: "person",
    by: { id: human.id, name: "Halil" },
    at: new Date().toISOString(),
  });
  /** A release of the seeded article retitled to `title`, due at `at`. */
  const release = async (title: string, at: number): Promise<Release> => {
    const entry = (await remote.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
    if (!entry) throw new Error("no hello-world");
    await remote.updateContentEntry({ ...entry, title });
    // the service's clock is two minutes behind, so a release seconds away passes the lead time
    const svc = new ReleaseService({ graph: remote, now: () => new Date(Date.now() - 120_000) });
    const { release: draft } = await svc.create({
      siteId,
      set: [entry.id],
      createdBy: human,
      when: { at: new Date(at).toISOString() },
    });
    return svc.schedule(siteId, draft.id, { expectedRev: draft.rev, approval: approval() });
  };
  const state = async (id: string) =>
    (await new SqlScheduleStore(sql).getRelease(siteId, id))?.state;
  const runOf = async (id: string) =>
    (await new SqlScheduleStore(sql).listRuns(siteId, { subjectId: id }))[0];

  it("the generated admin config has the minute trigger and the SQLite-backed clock", async () => {
    const admin = (await import("node:fs/promises")).readFile;
    expect(MINUTE_CRON).toBe("* * * * *");
    const cfg = JSON.parse(
      (await admin(path.join(tmp, "site/.cloudhal/deploy/admin/wrangler.jsonc"), "utf8")).replace(
        /^\s*\/\/.*$/gm,
        "",
      ),
    ) as Record<string, unknown>;
    expect(cfg).toMatchObject({
      triggers: { crons: ["* * * * *"] },
      durable_objects: {
        bindings: [
          { name: "SCHEDULER_CLOCK", class_name: "SchedulerClock" },
          { name: "BUILD_ROOMS", class_name: "BuildRoom" },
        ],
      },
      migrations: [
        { tag: "v1", new_sqlite_classes: ["SchedulerClock"] },
        { tag: "v2", new_sqlite_classes: ["BuildRoom"] },
      ],
    });
  });

  it("alarm: a request with no heartbeat pokes the clock; the alarm publishes the release at its time", async () => {
    const due = Date.now() + 6_000;
    const r = await release("Published by the clock", due);
    expect(r.state).toBe("scheduled");
    // the first admin request: no heartbeat yet → backstop tick (request) and a poke
    expect((await adminFetch("/api/health")).status).toBe(200);
    const deadline = Date.now() + 40_000;
    while ((await state(r.id)) !== "published" && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await state(r.id)).toBe("published");
    const run = await runOf(r.id);
    expect(run).toMatchObject({ state: "succeeded", trigger: "alarm" });
    expect(run?.latenessSeconds).toBeLessThan(15);
    // nothing ran early
    expect(Date.parse(run?.startedAt as string)).toBeGreaterThanOrEqual(due);
    const heartbeat = await new SqlScheduleStore(sql).heartbeat();
    expect(["alarm", "request"]).toContain(heartbeat?.trigger);
    const page = await siteFetch("/posts/hello-world");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Published by the clock");
  });

  it("cron: /cdn-cgi/local/scheduled at a chosen time publishes the release due then and purges through SITE", async () => {
    const due = Date.now() + 10 * 60_000;
    const r = await release("Published by the minute tick", due);
    const before = await sql.all<{ source: string }>(
      "SELECT source FROM cache_purge_log WHERE source = 'schedules'",
    );
    const res = (await harness.fetch(
      `http://admin.example/cdn-cgi/local/scheduled?cron=${encodeURIComponent("* * * * *")}&time=${due + 2_000}`,
    )) as unknown as Response;
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await state(r.id)).toBe("published");
    expect(await runOf(r.id)).toMatchObject({
      state: "succeeded",
      trigger: "cron",
      latenessSeconds: 2,
    });
    const done = await new SqlScheduleStore(sql).getRelease(siteId, r.id);
    expect(done?.outcome).toMatchObject({ kind: "published", purge: "tags" });
    const after = await sql.all<{ source: string }>(
      "SELECT source FROM cache_purge_log WHERE source = 'schedules'",
    );
    expect(after.length).toBe(before.length + 1);
    const page = await siteFetch("/posts/hello-world");
    expect(await page.text()).toContain("Published by the minute tick");
    // the operator's view of the same deployment
    const status = await adminFetch("/api/admin/schedules/status", {
      headers: { authorization: `Bearer ${secrets.CLOUDHAL_DEPLOY_TOKEN}` },
    });
    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await status.json()).toMatchObject({
      engine: { schedulesLevel: 1 },
      scheduler: { mode: "alarm" },
      sites: [{ siteId, openReleases: [], gatedNodes: 0 }],
    });
  });

  it("feed-check (step 9): the minute tick fetches the site's feed and sitemap through SITE; no gated node leaks", async () => {
    // an embargoed article, live but gated: the site Worker must leave it out of both documents
    const gated = new SiteGraphStore({
      sql,
      blobs: new R2BlobStore(
        ((await harness.getWorker(W.admin).getEnv()) as { BLOBS: R2Bucket }).BLOBS,
      ),
      gates: GATES_ENFORCED,
    });
    const hello = (await gated.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
    if (!hello) throw new Error("no hello-world");
    const { id: _id, rev: _rev, createdAt: _c, updatedAt: _u, schemaVersion: _s, ...rest } = hello;
    const secret = await gated.createContentEntry({
      ...rest,
      slug: "embargoed-results",
      title: "Embargoed results",
      availability: { from: new Date(Date.now() + 30 * 86_400_000).toISOString() },
    });
    const snap = await gated.createSnapshot(siteId, { actor: human, reason: "publish" });
    await gated.publish((await gated.getSite(siteId)) as Site, snap.id);
    const start = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 60 * 60_000);
    const local = start.toISOString().slice(0, 16);
    const store = new SqlScheduleStore(sql);
    const a = await store.createAutomation({
      siteId,
      name: "Feed check",
      job: { kind: "builtin", builtin: "feed-check" },
      recurrence: { start: local, timeZone: "UTC", rule: presetRule("hourly", local) },
      owner: { id: human.id },
    });
    expect(a.nextRunAt).toBe(start.toISOString());
    const scheduled = async (at: number) => {
      const res = (await harness.fetch(
        `http://admin.example/cdn-cgi/local/scheduled?cron=${encodeURIComponent("* * * * *")}&time=${at}`,
      )) as unknown as Response;
      expect(res.status, await res.clone().text()).toBe(200);
    };
    const id = await runId(a.id, start.toISOString());
    await scheduled(start.getTime() + 1_000); // the feed
    expect(await store.getRun(siteId, id)).toMatchObject({
      state: "running",
      taint: { tool: "feed_check" },
    });
    await scheduled(start.getTime() + 61_000); // the sitemap
    const run = await store.getRun(siteId, id);
    expect(run, JSON.stringify(await store.runFindings(siteId, id))).toMatchObject({
      state: "succeeded",
      outcome: "nothing-to-do",
      trigger: "cron",
      taint: { tool: "feed_check" },
      counts: { "documents-checked": 2, steps: 2 },
    });
    expect(run?.counts?.["feed-gated-node"]).toBeUndefined();
    // and the fetched documents really were the site's: the newest article is in the feed
    const rss = await (await siteFetch("/rss.xml")).text();
    expect(rss).toContain("/posts/hello-world");
    expect(rss).not.toContain(secret.slug);
  });
});
