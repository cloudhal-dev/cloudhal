/**
 * RFC-0006 rollout step 9: `cloudhal.json` → `analytics`, the generated wrangler configs,
 * `cloudhal analytics status|rollup|seed|export` (local and `--remote` over the deployment token),
 * and `cloudhal studio` reading the project's SQLite through `SqlAnalytics` (L3).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnalyticsService } from "@cloudhal/analytics/service";
import { SqlAnalytics } from "@cloudhal/analytics/sql";
import { createApi } from "@cloudhal/api";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANALYTICS_CRON, adminWorkerConfig, siteWorkerConfig } from "../src/cloudflare/config.ts";
import { isCronLimitError, versionAtLeast } from "../src/cloudflare/wrangler.ts";
import { analyticsEnabled, parseAnalyticsConfig } from "../src/config.ts";
import {
  analyticsExport,
  analyticsRollup,
  analyticsSeed,
  analyticsStatus,
  describeStatus,
  init,
  readProjectConfig,
  snapshot,
  studio,
  writeProjectConfig,
} from "../src/index.ts";

describe("cloudhal.json analytics and the generated configs", () => {
  it("parses the block leniently; absent is off, present defaults to on", () => {
    expect(parseAnalyticsConfig(undefined)).toBeUndefined();
    expect(parseAnalyticsConfig("yes")).toBeUndefined();
    expect(
      parseAnalyticsConfig({
        enabled: "true",
        uniqueVisitors: true,
        vitalsOneIn: 3,
        queryBudget: 500,
        rawRetentionDays: 0,
        dev: true,
        extra: 1,
      }),
    ).toEqual({ uniqueVisitors: true, queryBudget: 500, dev: true });
    expect(analyticsEnabled({})).toBe(false);
    expect(analyticsEnabled({ analytics: {} })).toBe(true);
    expect(analyticsEnabled({ analytics: { enabled: false } })).toBe(false);
  });

  it("site and admin Worker configs carry the bindings, vars and cron only with analytics", () => {
    const names = { name: "newsroom" };
    const analytics = {
      dataset: "newsroom_events",
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 10 },
      budget: 8000,
      cron: true,
      siteHosts: ["news.example.com"],
    };
    expect(siteWorkerConfig({ ...names, siteId: "site_abcdefgh" })).not.toHaveProperty(
      "analytics_engine_datasets",
    );
    expect(siteWorkerConfig({ ...names, siteId: "site_abcdefgh", analytics })).toMatchObject({
      analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: "newsroom_events" }],
      vars: {
        CLOUDHAL_SITE_ID: "site_abcdefgh",
        CLOUDHAL_ANALYTICS: "on",
        CLOUDHAL_ANALYTICS_DEFAULTS: '{"enabled":true,"uniqueVisitors":false,"vitalsOneIn":10}',
        CLOUDHAL_SITE_HOSTS: "news.example.com",
      },
    });
    const admin = { ...names, studioDir: "studio", main: "./worker.ts" };
    expect(adminWorkerConfig(admin)).toMatchObject({ triggers: { crons: [] } });
    expect(adminWorkerConfig(admin)).not.toHaveProperty("analytics");
    expect(adminWorkerConfig({ ...admin, analytics })).toMatchObject({
      analytics: { binding: "ANALYTICS_SQL" },
      vars: { CLOUDHAL_ANALYTICS_DATASET: "newsroom_events", CLOUDHAL_ANALYTICS_BUDGET: "8000" },
      triggers: { crons: [ANALYTICS_CRON] },
    });
    expect(adminWorkerConfig({ ...admin, analytics: { ...analytics, cron: false } })).toMatchObject(
      {
        vars: { CLOUDHAL_ANALYTICS_CRON: "off" },
        triggers: { crons: [] },
      },
    );
  });

  it("compares wrangler versions and recognises the cron-limit refusal", () => {
    expect(versionAtLeast("4.148.0", "4.145.0")).toBe(true);
    expect(versionAtLeast("4.145.0", "4.145.0")).toBe(true);
    expect(versionAtLeast("4.120.3", "4.145.0")).toBe(false);
    expect(versionAtLeast("5.0.0-beta.1", "4.145.0")).toBe(true);
    expect(isCronLimitError("You have exceeded the limit of 5 cron triggers")).toBe(true);
    expect(isCronLimitError("Authentication error [code: 10000]")).toBe(false);
  });
});

describe("cloudhal analytics", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-analytics-cli-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Counted" })).siteId;
    await snapshot({ projectDir, label: "v1", publish: true });
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("init turns analytics on for new projects and writes keep other keys", async () => {
    const cfg = await readProjectConfig(projectDir);
    expect(cfg.analytics).toEqual({ enabled: true });
    const file = path.join(projectDir, "cloudhal.json");
    const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...raw, media: { transform: "none" } }));
    await writeProjectConfig(projectDir, { ...cfg, analytics: { enabled: true, dev: false } });
    const after = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    expect(after).toMatchObject({
      media: { transform: "none" },
      analytics: { enabled: true, dev: false },
    });
  });

  it("seed fills the local SQLite with demo traffic and rolls it up; status and export read it", async () => {
    const empty = await analyticsStatus({ projectDir });
    expect(empty).toMatchObject({ events: 0, lastRollup: null, feature: { store: "sql" } });

    const lines: string[] = [];
    const seeded = await analyticsSeed({
      projectDir,
      days: 10,
      views: 30,
      log: (l) => lines.push(l),
    });
    expect(seeded.events).toBeGreaterThan(200);
    expect(seeded.nodes).toBeGreaterThan(2);
    expect(seeded.rolledUp).toBe(10);
    expect(lines[0]).toMatch(/^seeded \d+ demo events over 10 day\(s\)/);

    const status = await analyticsStatus({ projectDir });
    expect(status.events).toBe(seeded.events);
    expect(status.lastRollup).not.toBeNull();
    expect(status.quota?.pageviews).toBeGreaterThan(0);
    const text = describeStatus(status).join("\n");
    expect(text).toMatch(/analytics: on for this deployment \(store sql, reader sql\)/);
    expect(text).toMatch(/raw events in SQLite: \d+/);

    const csv = await analyticsExport({ projectDir, out: "totals.csv" });
    expect(csv.split("\r\n")[0]).toBe(
      "day,dim,key,pageviews,visits,visitors,hits,value,samples,good,poor",
    );
    expect(csv).toMatch(/,total,all,\d+,\d+/);
    expect(await readFile(path.join(projectDir, "totals.csv"), "utf8")).toBe(csv);

    // a local rollup: nothing left to do, unless --redo
    expect(await analyticsRollup({ projectDir, days: 10 })).toMatchObject({ done: 0, pending: 0 });
    expect((await analyticsRollup({ projectDir, days: 3, redo: true })).done).toBe(3);
    await expect(analyticsRollup({ projectDir, days: 93 })).rejects.toThrow(/--days/);
  });

  it("--remote: status, backfill and export over the deployment token", async () => {
    const cfg = await readProjectConfig(projectDir);
    const deployDir = path.join(projectDir, cfg.dataDir, "deploy");
    await mkdir(deployDir, { recursive: true });
    const token = "analytics-cli-deploy-token-0123456789ab";
    await writeFile(
      path.join(deployDir, "secrets.json"),
      JSON.stringify({ CLOUDHAL_DEPLOY_TOKEN: token }),
    );
    await writeFile(
      path.join(deployDir, "state.json"),
      JSON.stringify({ name: "counted", adminUrl: "https://counted-admin.acme.workers.dev" }),
    );
    // the "deployment": the same data behind an API with the analytics routes
    const remote = await openLocalStore(path.join(projectDir, cfg.dataDir));
    await remote.sql.run("DELETE FROM analytics_rollup_runs");
    const app = createApi({
      store: remote.store,
      admin: { deployToken: token, storage: { sql: remote.sql, blobs: remote.blobs } },
      analytics: new AnalyticsService({
        sql: remote.sql,
        store: "sql",
        live: new SqlAnalytics(remote.sql),
        defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
      }),
    });
    const seen: string[] = [];
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      seen.push(`${req.method} ${new URL(req.url).pathname}`);
      return app.fetch(req);
    }) as typeof fetch;
    try {
      const status = await analyticsStatus({ projectDir, remote: true, fetch: f });
      expect(status.lastRollup).toBeNull();
      expect(status.events).toBeUndefined();
      const logs: string[] = [];
      const r = await analyticsRollup({
        projectDir,
        remote: true,
        days: 7,
        fetch: f,
        log: (l) => logs.push(l),
      });
      // three site-days per call until nothing is pending
      expect(r).toMatchObject({ done: 7, pending: 0, calls: 3 });
      expect(logs.at(-1)).toBe("rolled up 7 day(s), 0 pending");
      const csv = await analyticsExport({
        projectDir,
        remote: true,
        from: "2020-01-01",
        to: "2021-01-01",
        fetch: f,
      });
      expect(csv).toBe("day,dim,key,pageviews,visits,visitors,hits,value,samples,good,poor\r\n");
      expect(seen).toContain(`GET /api/admin/sites/${siteId}/analytics/status`);
      expect(seen.filter((s) => s.endsWith("/analytics/rollup"))).toHaveLength(3);
      await expect(
        analyticsRollup({ projectDir, remote: true, redo: true, fetch: f }),
      ).rejects.toThrow(/local data only/);
    } finally {
      await remote.close();
    }
  });

  it("cloudhal studio reads analytics from the project's SQLite", async () => {
    const s = await studio({ projectDir, noAuth: true, port: 0 });
    try {
      const base = s.url.replace(/\/$/, "");
      const instance = (await (await fetch(`${base}/api/instance`)).json()) as {
        features: { analytics: Record<string, unknown> };
      };
      expect(instance.features.analytics).toMatchObject({
        enabled: true,
        store: "sql",
        reader: "sql",
      });
      const res = await fetch(`${base}/api/sites/${siteId}/analytics/summary?range=30d`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { pageviews: number } };
      expect(body.data.pageviews).toBeGreaterThan(0);
    } finally {
      await s.stop();
    }
  });
});
