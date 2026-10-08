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
      vars: { CLOUDHAL_SITE_ID: cfg.siteId },
    });
    const admin = await jsonc(r.adminConfig);
    expect(admin).toMatchObject({
      name: "deploy-me-admin",
      compatibility_flags: ["nodejs_compat"],
      services: [{ binding: "SITE", service: "deploy-me-site" }],
      assets: {
        not_found_handling: "none",
        run_worker_first: ["/api/*", "/mcp", "/mcp/*", "/.well-known/*"],
      },
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
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init))) as typeof fetch;

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
});
