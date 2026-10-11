/**
 * `cloudhal deploy` / `push` / `pull` orchestration. The real wrangler runs in `--dry-run` mode
 * (bundles both Workers, no account needed); the full flow uses a recording wrangler stand-in and
 * an in-process admin API so ordering, idempotency and the first-deploy push are checked.
 */
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "@cloudhal/api";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WranglerRunner } from "../src/cloudflare/wrangler.ts";
import { domain } from "../src/commands/domain.ts";
import { deploy, init, pullSite, pushSite, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const jsonc = async (file: string) =>
  JSON.parse((await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, "")) as Record<
    string,
    unknown
  >;

describe("cloudhal deploy", () => {
  let tmp: string;
  let projectDir: string;
  let studioDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-deploycmd-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Deploy Me" });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    studioDir = path.join(tmp, "studio");
    await mkdir(studioDir);
    await writeFile(path.join(studioDir, "index.html"), "<!doctype html><title>Studio</title>");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("--dry-run bundles both Workers with the real wrangler and generates configs and secrets", async () => {
    const r = await deploy({ projectDir, studioDir, dryRun: true });
    expect(r.names).toEqual({
      site: "deploy-me-site",
      admin: "deploy-me-admin",
      database: "deploy-me-db",
      bucket: "deploy-me-blobs",
    });
    const cfg = await readProjectConfig(projectDir);
    const deployDir = path.join(projectDir, cfg.dataDir, "deploy");
    expect((await stat(path.join(deployDir, "out/site/entry.mjs"))).isFile()).toBe(true);
    expect((await stat(path.join(deployDir, "out/admin/worker.js"))).isFile()).toBe(true);

    const site = await jsonc(path.join(projectDir, "wrangler.jsonc"));
    expect(site).toMatchObject({
      name: "deploy-me-site",
      main: "@cloudhal/astro-renderer/cloudflare-entry",
      cache: { enabled: true },
      // RFC-0006 §11: `cloudhal init` turns analytics on, so the Site Worker writes to WAE
      analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: "deploy_me_events" }],
      vars: {
        CLOUDHAL_SITE_ID: cfg.siteId,
        CLOUDHAL_ANALYTICS: "on",
        CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify({
          enabled: true,
          uniqueVisitors: false,
          vitalsOneIn: 5,
        }),
      },
    });
    expect(r.analytics).toEqual({ enabled: true, dataset: "deploy_me_events", cron: true });
    const admin = await jsonc(r.adminConfig);
    expect(admin).toMatchObject({
      name: "deploy-me-admin",
      compatibility_flags: ["nodejs_compat"],
      services: [{ binding: "SITE", service: "deploy-me-site" }],
      assets: {
        not_found_handling: "none",
        run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"],
      },
      // …and the admin Worker reads it through the Analytics SQL binding, with the hourly job
      analytics: { binding: "ANALYTICS_SQL" },
      vars: {
        CLOUDHAL_ANALYTICS_DATASET: "deploy_me_events",
        CLOUDHAL_ANALYTICS_BUDGET: "8000",
        CLOUDHAL_ANALYTICS_DEFAULTS: JSON.stringify({
          enabled: true,
          uniqueVisitors: false,
          vitalsOneIn: 5,
        }),
      },
      triggers: { crons: ["17 * * * *"] },
    });
    const secretsFile = path.join(deployDir, "secrets.json");
    expect((await stat(secretsFile)).mode & 0o777).toBe(0o600);
    const secrets = JSON.parse(await readFile(secretsFile, "utf8")) as Record<string, string>;
    expect(Object.keys(secrets).sort()).toEqual([
      "BETTER_AUTH_SECRET",
      "CLOUDHAL_DEPLOY_TOKEN",
      "CLOUDHAL_PREVIEW_SECRET",
      "CLOUDHAL_PURGE_TOKEN",
      "CLOUDHAL_SETUP_TOKEN",
      "MCP_STATE_KEY",
    ]);
    for (const v of Object.values(secrets)) expect(v.length).toBeGreaterThanOrEqual(32);
    // stable across runs
    await deploy({ projectDir, studioDir, dryRun: true });
    expect(JSON.parse(await readFile(secretsFile, "utf8"))).toEqual(secrets);
  });

  it("provisions, deploys site before admin, pushes once, and keeps the deployment as source of truth", async () => {
    // an in-process "deployed" admin API
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    const cfg = await readProjectConfig(projectDir);
    const secrets = JSON.parse(
      await readFile(path.join(projectDir, cfg.dataDir, "deploy/secrets.json"), "utf8"),
    ) as Record<string, string>;
    const app = createApi({
      store: remote,
      admin: { deployToken: secrets.CLOUDHAL_DEPLOY_TOKEN as string, storage: { sql, blobs } },
    });
    const purges: string[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      // the Site Worker's purge endpoint (analytics switched on: the script tag must appear)
      if (new URL(req.url).pathname === "/__cloudhal/purge") {
        purges.push(`${new URL(req.url).host} ${req.headers.get("authorization")}`);
        return new Response("ok");
      }
      return app.fetch(req);
    }) as typeof fetch;

    const calls: string[] = [];
    let databaseCreated = false;
    const wrangler: WranglerRunner = async (args) => {
      calls.push(args.filter((a) => !a.includes("/")).join(" "));
      const ok = (stdout = "", records: Record<string, unknown>[] = []) => ({
        code: 0,
        stdout,
        stderr: "",
        records,
      });
      if (args[0] === "d1" && args[1] === "info")
        return databaseCreated
          ? ok(JSON.stringify({ uuid: "11111111-2222-3333-4444-555555555555" }))
          : { code: 1, stdout: "", stderr: "not found", records: [] };
      if (args[0] === "d1" && args[1] === "create") {
        databaseCreated = true;
        return ok();
      }
      if (args[0] === "deploy" && args.includes("-c"))
        return ok("", [{ type: "deploy", targets: ["deploy-me-admin.acme.workers.dev"] }]);
      if (args[0] === "deploy")
        return ok("", [{ type: "deploy", targets: ["https://deploy-me-site.acme.workers.dev"] }]);
      return ok();
    };

    const first = await deploy({
      projectDir,
      studioDir,
      wrangler,
      fetch: fakeFetch,
      healthTimeoutMs: 5000,
    });
    expect(calls).toEqual([
      "d1 info deploy-me-db --json",
      "d1 create deploy-me-db",
      "d1 info deploy-me-db --json",
      "r2 bucket create deploy-me-blobs",
      "deploy --secrets-file",
      "deploy -c --secrets-file",
    ]);
    expect(first).toMatchObject({
      siteUrl: "https://deploy-me-site.acme.workers.dev",
      adminUrl: "https://deploy-me-admin.acme.workers.dev",
      pushed: true,
    });
    // analytics went on with this deploy: one purge of the site's cache, with the purge token
    expect(first.analytics).toEqual({
      enabled: true,
      dataset: "deploy_me_events",
      cron: true,
      purged: true,
    });
    expect(purges).toEqual([
      `deploy-me-site.acme.workers.dev Bearer ${secrets.CLOUDHAL_PURGE_TOKEN}`,
    ]);
    // the owner account can only be created through the one-time setup link
    expect(first.setupUrl).toBe(
      `https://deploy-me-admin.acme.workers.dev/login?setup=${secrets.CLOUDHAL_SETUP_TOKEN}`,
    );
    // wrangler's secret files existed only during the deploy
    const leftovers = (await import("node:fs/promises")).readdir(
      path.join(projectDir, cfg.dataDir, "deploy"),
    );
    expect((await leftovers).filter((f) => f.endsWith("-secrets.json"))).toEqual([]);
    const siteCfg = await jsonc(path.join(projectDir, "wrangler.jsonc"));
    expect((siteCfg.d1_databases as { database_id: string }[])[0]?.database_id).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    // the deployment got the site, with its public hostname for preview links
    expect((await remote.getSite(cfg.siteId))?.domains).toEqual([
      { hostname: "deploy-me-site.acme.workers.dev", primary: true },
    ]);

    // an agent edits the deployment; a redeploy must not push over it
    const about = (await remote.listPages(cfg.siteId)).find((p) => p.path === "/about");
    await remote.updatePage({
      ...(about as NonNullable<typeof about>),
      title: "Edited in production",
    });
    calls.length = 0;
    const second = await deploy({
      projectDir,
      studioDir,
      wrangler,
      fetch: fakeFetch,
      healthTimeoutMs: 5000,
    });
    expect(second.pushed).toBe(false);
    expect(second.setupUrl).toBeUndefined();
    // analytics stayed on: no second purge
    expect(second.analytics.purged).toBe(false);
    expect(purges).toHaveLength(1);
    expect(calls[0]).toBe("d1 info deploy-me-db --json");
    expect(calls).not.toContain("d1 create deploy-me-db");
    expect((await remote.getPage(about?.id as string))?.title).toBe("Edited in production");

    // push refuses to overwrite; pull brings production home; push --replace would win
    await expect(pushSite({ projectDir, fetch: fakeFetch })).rejects.toThrow(/diverged/);
    await pullSite({ projectDir, fetch: fakeFetch, replace: true });
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    expect((await local.store.getPage(about?.id as string))?.title).toBe("Edited in production");
    await local.close();
    const same = await pushSite({ projectDir, fetch: fakeFetch });
    expect(same.message).toContain('"unchanged":true');
  });

  it("routes custom domains to both Workers and makes the site's one primary; removing restores workers.dev", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    const cfg = await readProjectConfig(projectDir);
    const secrets = JSON.parse(
      await readFile(path.join(projectDir, cfg.dataDir, "deploy/secrets.json"), "utf8"),
    ) as Record<string, string>;
    const app = createApi({
      store: remote,
      admin: { deployToken: secrets.CLOUDHAL_DEPLOY_TOKEN as string, storage: { sql, blobs } },
    });
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init))) as typeof fetch;
    // The first `d1 info` fails as a transient API error would; `d1 create` then finds the
    // database already there, and the deploy reads its id again instead of stopping.
    let infoFailures = 1;
    const wrangler: WranglerRunner = async (args) => {
      const ok = (stdout = "", records: Record<string, unknown>[] = []) => ({
        code: 0,
        stdout,
        stderr: "",
        records,
      });
      if (args[0] === "d1" && args[1] === "info" && infoFailures-- > 0)
        return {
          code: 1,
          stdout: "",
          stderr: "A request to the Cloudflare API failed",
          records: [],
        };
      if (args[0] === "d1" && args[1] === "create")
        return {
          code: 1,
          stdout: "",
          stderr: "A database with that name already exists",
          records: [],
        };
      if (args[0] === "d1" && args[1] === "info")
        return ok(JSON.stringify({ uuid: "11111111-2222-3333-4444-555555555555" }));
      if (args[0] === "deploy" && args.includes("-c"))
        return ok("", [{ type: "deploy", targets: ["deploy-me-admin.acme.workers.dev"] }]);
      if (args[0] === "deploy")
        return ok("", [{ type: "deploy", targets: ["https://deploy-me-site.acme.workers.dev"] }]);
      return ok();
    };
    const run = () =>
      deploy({ projectDir, studioDir, wrangler, fetch: fakeFetch, healthTimeoutMs: 5000 });

    // the command validates and normalises what a person types
    await expect(domain({ projectDir, set: { site: "not a host" } })).rejects.toThrow(
      /not a hostname/,
    );
    await expect(domain({ projectDir, set: { site: "x.acme.workers.dev" } })).rejects.toThrow(
      /workers\.dev/,
    );
    await expect(
      domain({ projectDir, set: { site: "a.example.com", studio: "A.example.com" } }),
    ).rejects.toThrow(/different hostnames/);
    expect(
      await domain({
        projectDir,
        set: { site: "https://News.Example.com/", studio: "studio.example.com" },
      }),
    ).toEqual({ site: "news.example.com", studio: "studio.example.com" });
    expect((await readProjectConfig(projectDir)).domains).toEqual({
      site: "news.example.com",
      studio: "studio.example.com",
    });

    const r = await run();
    expect(r).toMatchObject({
      customSiteUrl: "https://news.example.com",
      customStudioUrl: "https://studio.example.com",
    });
    const siteCfg = await jsonc(path.join(projectDir, "wrangler.jsonc"));
    expect(siteCfg.routes).toEqual([{ pattern: "news.example.com", custom_domain: true }]);
    const adminCfg = await jsonc(r.adminConfig);
    expect(adminCfg.routes).toEqual([{ pattern: "studio.example.com", custom_domain: true }]);
    // the custom domain is primary on the deployment and locally; workers.dev stays secondary
    const expected = [
      { hostname: "news.example.com", primary: true },
      { hostname: "deploy-me-site.acme.workers.dev", primary: false },
    ];
    expect((await remote.getSite(cfg.siteId))?.domains).toEqual(expected);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    expect((await local.store.getSite(cfg.siteId))?.domains).toEqual(expected);
    await local.close();

    // removing it: no routes, and workers.dev is primary again
    expect(await domain({ projectDir, remove: ["site", "studio"] })).toBeUndefined();
    expect((await readProjectConfig(projectDir)).domains).toBeUndefined();
    const again = await run();
    expect(again.customSiteUrl).toBeUndefined();
    expect((await jsonc(path.join(projectDir, "wrangler.jsonc"))).routes).toBeUndefined();
    expect((await remote.getSite(cfg.siteId))?.domains[0]).toEqual({
      hostname: "deploy-me-site.acme.workers.dev",
      primary: true,
    });
  });

  it("analytics: existing projects are asked (non-interactive: off), wrangler is checked, the cron limit is survived", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    const cfg = await readProjectConfig(projectDir);
    const secrets = JSON.parse(
      await readFile(path.join(projectDir, cfg.dataDir, "deploy/secrets.json"), "utf8"),
    ) as Record<string, string>;
    const app = createApi({
      store: remote,
      admin: { deployToken: secrets.CLOUDHAL_DEPLOY_TOKEN as string, storage: { sql, blobs } },
    });
    const purges: string[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (new URL(req.url).pathname === "/__cloudhal/purge") {
        purges.push(req.url);
        return new Response("ok");
      }
      return app.fetch(req);
    }) as typeof fetch;
    let cronRefusals = 0;
    const adminDeploys: string[] = [];
    const wrangler: WranglerRunner = async (args) => {
      const ok = (stdout = "", records: Record<string, unknown>[] = []) => ({
        code: 0,
        stdout,
        stderr: "",
        records,
      });
      if (args[0] === "d1" && args[1] === "info")
        return ok(JSON.stringify({ uuid: "11111111-2222-3333-4444-555555555555" }));
      if (args[0] === "deploy" && args.includes("-c")) {
        const config = await jsonc(args[args.indexOf("-c") + 1] as string);
        adminDeploys.push(JSON.stringify((config.triggers as { crons: string[] }).crons));
        if (cronRefusals-- > 0 && (config.triggers as { crons: string[] }).crons.length > 0)
          return {
            code: 1,
            stdout: "",
            stderr:
              "✘ [ERROR] A request to the Cloudflare API failed: You have exceeded the limit of 5 cron triggers. [code: 10057]",
            records: [],
          };
        return ok("", [{ type: "deploy", targets: ["deploy-me-admin.acme.workers.dev"] }]);
      }
      if (args[0] === "deploy")
        return ok("", [{ type: "deploy", targets: ["https://deploy-me-site.acme.workers.dev"] }]);
      return ok();
    };
    const lines: string[] = [];
    const run = (extra: Partial<Parameters<typeof deploy>[0]> = {}) =>
      deploy({
        projectDir,
        studioDir,
        wrangler,
        fetch: fakeFetch,
        healthTimeoutMs: 5000,
        log: (l) => lines.push(l),
        ...extra,
      });

    // A project from before RFC-0006 has no `analytics` key; `media` (the starter's) survives.
    const file = path.join(projectDir, "cloudhal.json");
    const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    const { analytics: _a, ...old } = raw;
    await writeFile(file, JSON.stringify({ ...old, media: { transform: "none" } }));

    // Non-interactive: analytics stay off and the deploy says how to turn them on. The bindings,
    // vars and cron are gone, and the site cache is purged once so the script tag disappears.
    const off = await run();
    expect(off.analytics).toEqual({ enabled: false, purged: true });
    expect(lines.join("\n")).toMatch(/analytics: off\. Turn on cookie-less analytics/);
    const siteOff = await jsonc(path.join(projectDir, "wrangler.jsonc"));
    expect(siteOff.analytics_engine_datasets).toBeUndefined();
    expect(siteOff.vars).toEqual({ CLOUDHAL_SITE_ID: cfg.siteId });
    const adminOff = await jsonc(off.adminConfig);
    expect(adminOff.analytics).toBeUndefined();
    expect(adminOff.triggers).toEqual({ crons: [] });
    expect(JSON.parse(await readFile(file, "utf8")).analytics).toBeUndefined();
    expect(purges).toHaveLength(1);

    // Interactive: the question is asked once and the answer saved. An old wrangler stops the
    // deploy before anything is generated, with what to do.
    const asked: string[] = [];
    await expect(
      run({
        prompt: async (q) => {
          asked.push(q);
          return true;
        },
        wranglerVersion: "4.120.0",
      }),
    ).rejects.toThrow(
      "Analytics needs wrangler 4.145 or newer (found 4.120.0). Run `pnpm add -D wrangler@^4.148`, or set `analytics.enabled: false` in cloudhal.json.",
    );
    expect(asked).toEqual(["Turn on cookie-less analytics for Deploy Me? (Y/n) "]);
    const saved = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    expect(saved.analytics).toEqual({ enabled: true });
    expect(saved.media).toEqual({ transform: "none" });

    // The account has no free cron slot: the admin Worker goes without the trigger and says so.
    cronRefusals = 1;
    adminDeploys.length = 0;
    const on = await run({ prompt: async () => false, wranglerVersion: "4.148.0" });
    expect(adminDeploys).toEqual(['["17 * * * *"]', "[]"]);
    expect(on.analytics).toEqual({
      enabled: true,
      dataset: "deploy_me_events",
      cron: false,
      purged: true,
    });
    expect(lines.join("\n")).toMatch(/Cloudflare refused the hourly analytics trigger/);
    const adminOn = await jsonc(on.adminConfig);
    expect(adminOn.triggers).toEqual({ crons: [] });
    expect(adminOn.vars).toMatchObject({ CLOUDHAL_ANALYTICS_CRON: "off" });
    expect(purges).toHaveLength(2);
  });
});
