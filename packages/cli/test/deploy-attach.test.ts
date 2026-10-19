/**
 * RFC-0034 phase C2: `cloudhal deploy` in a project with `installation` deploys only a site Worker
 * on that installation's database and secrets, pushes its site there and registers itself; the
 * installation's next deploy binds it (`SITE_1`, `CLOUDHAL_SITE_ROUTES`).
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "@cloudhal/api";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { adminWorkerConfig } from "../src/cloudflare/config.ts";
import type { WranglerRunner } from "../src/cloudflare/wrangler.ts";
import { deploy, init, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const DEPLOY_TOKEN = "installation-deploy-token-0123456789abcdef";
const DB_ID = "99999999-8888-7777-6666-555555555555";
const tmps: string[] = [];
afterAll(async () => {
  for (const d of tmps) await rm(d, { recursive: true, force: true });
});

const jsonc = async (file: string) =>
  JSON.parse((await readFile(file, "utf8")).replace(/^\s*\/\/.*$/gm, "")) as Record<
    string,
    unknown
  >;

describe("an attached site Worker (RFC-0034 §4)", { timeout: 600_000 }, () => {
  it("joins the installation, pushes its site and registers itself", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-attach-"));
    tmps.push(tmp);
    // The installation: deployed earlier (state, secrets, its site Worker's D1 id).
    const instDir = path.join(tmp, "newsroom");
    await mkdir(path.join(instDir, ".cloudhal/deploy"), { recursive: true });
    await writeFile(
      path.join(instDir, "cloudhal.json"),
      JSON.stringify({ siteId: "site_newsroom01", dataDir: ".cloudhal" }),
    );
    await writeFile(
      path.join(instDir, ".cloudhal/deploy/state.json"),
      JSON.stringify({ name: "newsroom", adminUrl: "https://newsroom-admin.acme.workers.dev" }),
    );
    const instSecrets = {
      CLOUDHAL_PREVIEW_SECRET: "p".repeat(40),
      CLOUDHAL_PURGE_TOKEN: "u".repeat(40),
      CLOUDHAL_COMMENTS_KEY: "c".repeat(40),
      CLOUDHAL_DEPLOY_TOKEN: DEPLOY_TOKEN,
    };
    await writeFile(
      path.join(instDir, ".cloudhal/deploy/secrets.json"),
      JSON.stringify(instSecrets),
    );
    await writeFile(
      path.join(instDir, "wrangler.jsonc"),
      JSON.stringify({ d1_databases: [{ binding: "DB", database_id: DB_ID }] }),
    );
    // Its admin API, in process.
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    await seedStarterSite(remote, { name: "Newsroom", slug: "newsroom" });
    const app = createApi({
      store: remote,
      admin: { deployToken: DEPLOY_TOKEN, storage: { sql, blobs } },
    });
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init))) as typeof fetch;

    // The theme project that joins it.
    const projectDir = path.join(tmp, "docs");
    const docsId = (await init({ dir: projectDir, name: "Docs" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    const cfg = JSON.parse(await readFile(path.join(projectDir, "cloudhal.json"), "utf8"));
    await writeFile(
      path.join(projectDir, "cloudhal.json"),
      JSON.stringify({ ...cfg, installation: "../newsroom" }),
    );
    expect((await readProjectConfig(projectDir)).installation).toBe("../newsroom");

    const calls: string[][] = [];
    const wrangler: WranglerRunner = async (args) => {
      calls.push(args);
      const records =
        args[0] === "deploy"
          ? [{ type: "deploy", targets: ["https://newsroom-site-docs.acme.workers.dev"] }]
          : [];
      return { code: 0, stdout: "", stderr: "", records };
    };
    const lines: string[] = [];
    const r = await deploy({
      projectDir,
      wrangler,
      fetch: fakeFetch,
      wranglerVersion: "4.148.0",
      log: (l) => lines.push(l),
    });

    // Only the site Worker was deployed: no D1/R2 provisioning, no admin Worker.
    expect(calls.map((a) => a[0])).toEqual(["deploy"]);
    expect(r.names.site).toBe("newsroom-site-docs");
    const siteCfg = await jsonc(path.join(projectDir, "wrangler.jsonc"));
    expect(siteCfg.name).toBe("newsroom-site-docs");
    expect(
      (siteCfg.d1_databases as { database_id: string; database_name: string }[])[0],
    ).toMatchObject({
      database_id: DB_ID,
      database_name: "newsroom-db",
    });
    // The installation's secrets, so previews, purges and comments work across both Workers.
    const own = JSON.parse(
      await readFile(path.join(projectDir, ".cloudhal/deploy/secrets.json"), "utf8"),
    ) as Record<string, string>;
    expect(own.CLOUDHAL_PURGE_TOKEN).toBe(instSecrets.CLOUDHAL_PURGE_TOKEN);
    expect(own.CLOUDHAL_DEPLOY_TOKEN).toBe(DEPLOY_TOKEN);
    // Its site joined the installation, and the Worker is registered.
    expect(await remote.getSite(docsId)).toBeDefined();
    const workers = (await (
      await app.fetch(
        new Request("https://newsroom-admin.acme.workers.dev/api/admin/site-workers", {
          headers: { authorization: `Bearer ${DEPLOY_TOKEN}` },
        }),
      )
    ).json()) as { workers: { name: string; siteIds: string[]; theme: string }[] };
    expect(workers.workers).toEqual([
      expect.objectContaining({ name: "newsroom-site-docs", siteIds: [docsId], theme: "blog" }),
    ]);
    expect(lines.join("\n")).toMatch(/run `cloudhal deploy` in .*newsroom once/);

    // The installation's next deploy binds it.
    const admin = adminWorkerConfig({
      name: "newsroom",
      studioDir: "studio",
      main: "worker.ts",
      siteId: "site_newsroom01",
      siteWorkers: workers.workers,
    }) as { services: unknown; vars: Record<string, string> };
    expect(admin.services).toEqual([
      { binding: "SITE", service: "newsroom-site" },
      { binding: "SITE_1", service: "newsroom-site-docs" },
    ]);
    expect(JSON.parse(admin.vars.CLOUDHAL_SITE_ROUTES as string)).toEqual({ [docsId]: "SITE_1" });
  });
});
