/**
 * `cloudhal deploy` in Cloudflare Workers Builds (the Deploy to Cloudflare button): every build is a
 * fresh clone with no local store and no secrets, so the names come from the committed
 * `wrangler.jsonc`, the starter is seeded under `cloudhal.json`'s `siteId`, the secrets stay on the
 * Workers and the setup link is never printed. A recording wrangler stand-in plays Cloudflare.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "@cloudhal/api";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WranglerRunner } from "../src/cloudflare/wrangler.ts";
import { committedNames } from "../src/commands/deploy/workers-builds.ts";
import { deploy, init, readProjectConfig } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const DB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** The root config as the button leaves it: the Worker and resources renamed by the person. */
const BUTTON_CONFIG = `// committed by the Deploy to Cloudflare button
{
  "name": "my-blog",
  "main": "@cloudhal/astro-renderer/cloudflare-entry",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{ "binding": "DB", "database_name": "my-blog-db", "database_id": "${DB_ID}" }],
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "my-blog-files" }]
}
`;

describe("cloudhal deploy in Workers Builds", () => {
  let tmp: string;
  let projectDir: string;
  let studioDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-builds-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Template" });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    studioDir = path.join(tmp, "studio");
    await mkdir(studioDir);
    await writeFile(path.join(studioDir, "index.html"), "<!doctype html><title>Studio</title>");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("reads the button's names; a placeholder id is no id, `-site` names the base", async () => {
    const file = path.join(tmp, "names.jsonc");
    await writeFile(file, BUTTON_CONFIG);
    expect(await committedNames(file)).toEqual({
      name: "my-blog",
      siteName: "my-blog",
      databaseName: "my-blog-db",
      databaseId: DB_ID,
      bucketName: "my-blog-files",
    });
    await writeFile(
      file,
      JSON.stringify({
        name: "cloudhal-site",
        d1_databases: [
          {
            binding: "DB",
            database_name: "cloudhal-db",
            database_id: "00000000-0000-0000-0000-000000000000",
          },
        ],
      }),
    );
    expect(await committedNames(file)).toEqual({ name: "cloudhal", databaseName: "cloudhal-db" });
    await rm(file);
    await expect(committedNames(file)).rejects.toThrow(/missing or not JSON/);
  });

  it("seeds, deploys with the button's names, keeps the Workers' secrets and never prints the setup link", async () => {
    const { siteId, dataDir } = await readProjectConfig(projectDir);
    // a fresh clone: the committed config, no local store
    const freshClone = async () => {
      await rm(path.join(projectDir, dataDir), { recursive: true, force: true });
      await writeFile(path.join(projectDir, "wrangler.jsonc"), BUTTON_CONFIG);
    };

    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const remote = new SiteGraphStore({ sql, blobs });
    await remote.init();
    // the secrets each "Worker" holds; the admin API answers to its current deployment token
    const workers = new Map<string, Record<string, string>>();
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const deployToken = workers.get("my-blog-admin")?.CLOUDHAL_DEPLOY_TOKEN ?? "none";
      const app = createApi({ store: remote, admin: { deployToken, storage: { sql, blobs } } });
      return app.fetch(new Request(input, init));
    }) as typeof fetch;

    const calls: string[] = [];
    const sent: Record<string, string[]> = {};
    let listFailure: string | undefined;
    const wrangler: WranglerRunner = async (args) => {
      calls.push(args.filter((a) => !a.includes("/")).join(" "));
      const ok = (stdout = "", records: Record<string, unknown>[] = []) => ({
        code: 0,
        stdout,
        stderr: "",
        records,
      });
      if (args[0] === "secret" && args[1] === "list") {
        if (listFailure) return { code: 1, stdout: "", stderr: listFailure, records: [] };
        const held = workers.get(args[3] as string);
        if (!held)
          return { code: 1, stdout: "", stderr: `Worker "${args[3]}" not found.`, records: [] };
        return ok(JSON.stringify(Object.keys(held).map((name) => ({ name }))));
      }
      if (args[0] === "deploy") {
        const worker = args.includes("-c") ? "my-blog-admin" : "my-blog";
        const file = args.includes("--secrets-file")
          ? (args[args.indexOf("--secrets-file") + 1] as string)
          : undefined;
        const values = file
          ? (JSON.parse(await readFile(file, "utf8")) as Record<string, string>)
          : {};
        sent[worker] = Object.keys(values).sort();
        workers.set(worker, { ...workers.get(worker), ...values });
        return ok("", [{ type: "deploy", targets: [`${worker}.acme.workers.dev`] }]);
      }
      return ok();
    };
    const run = (lines: string[] = []) =>
      deploy({
        projectDir,
        studioDir,
        wrangler,
        fetch: fakeFetch,
        healthTimeoutMs: 5000,
        workersBuilds: true,
        log: (l) => lines.push(l),
      });

    await freshClone();
    const lines: string[] = [];
    const first = await run(lines);
    expect(first.names).toEqual({
      site: "my-blog",
      admin: "my-blog-admin",
      database: "my-blog-db",
      bucket: "my-blog-files",
    });
    // the button provisioned the database: no D1 call (its build token may not read D1)
    expect(calls).toEqual([
      "r2 bucket create my-blog-files",
      "r2 bucket lifecycle list my-blog-files",
      "r2 bucket lifecycle add my-blog-files cloudhal-bundles --expire-days 30 --force",
      "secret list --name my-blog --format json",
      "secret list --name my-blog-admin --format json",
      "deploy --secrets-file",
      "deploy -c --secrets-file",
    ]);
    expect(sent).toEqual({
      "my-blog": ["CLOUDHAL_COMMENTS_KEY", "CLOUDHAL_PREVIEW_SECRET", "CLOUDHAL_PURGE_TOKEN"],
      "my-blog-admin": [
        "BETTER_AUTH_SECRET",
        "CLOUDHAL_COMMENTS_KEY",
        "CLOUDHAL_DEPLOY_TOKEN",
        "CLOUDHAL_PREVIEW_SECRET",
        "CLOUDHAL_PURGE_TOKEN",
        "CLOUDHAL_SETUP_TOKEN",
        "MCP_STATE_KEY",
      ],
    });
    const site = workers.get("my-blog") as Record<string, string>;
    const admin = workers.get("my-blog-admin") as Record<string, string>;
    expect(site.CLOUDHAL_COMMENTS_KEY).toBe(admin.CLOUDHAL_COMMENTS_KEY);
    // the starter was seeded under cloudhal.json's id and pushed
    expect(first.pushed).toBe(true);
    expect((await remote.getSite(siteId))?.name).toBe("my-blog");
    const generated = JSON.parse(
      (await readFile(path.join(projectDir, "wrangler.jsonc"), "utf8")).replace(
        /^\s*\/\/.*$/gm,
        "",
      ),
    ) as { name: string; d1_databases: { database_id: string }[] };
    expect(generated.name).toBe("my-blog");
    expect(generated.d1_databases[0]?.database_id).toBe(DB_ID);
    // the owner sets their own setup token: the generated one appears nowhere
    expect(first.setupUrl).toBeUndefined();
    expect(first.setupInstructions).toContain("my-blog-admin");
    expect(first.setupInstructions).toContain(
      "https://my-blog-admin.acme.workers.dev/login#setup=",
    );
    expect(`${lines.join("\n")}${first.setupInstructions}`).not.toContain(
      admin.CLOUDHAL_SETUP_TOKEN,
    );

    // the next build: another fresh clone; the deployment keeps its content and its secrets
    const page = (await remote.listPages(siteId)).find((p) => p.path === "/about");
    await remote.updatePage({ ...(page as NonNullable<typeof page>), title: "Edited live" });
    const before = { ...admin };
    await freshClone();
    calls.length = 0;
    const second = await run();
    expect(sent).toEqual({ "my-blog": [], "my-blog-admin": ["CLOUDHAL_DEPLOY_TOKEN"] });
    expect(calls).toContain("deploy");
    expect(second.pushed).toBe(false);
    expect(second.setupInstructions).toBeUndefined();
    const after = workers.get("my-blog-admin") as Record<string, string>;
    expect(after.CLOUDHAL_DEPLOY_TOKEN).not.toBe(before.CLOUDHAL_DEPLOY_TOKEN);
    expect({ ...after, CLOUDHAL_DEPLOY_TOKEN: "" }).toEqual({
      ...before,
      CLOUDHAL_DEPLOY_TOKEN: "",
    });
    expect((await remote.getPage(page?.id as string))?.title).toBe("Edited live");

    // a secret list that fails for another reason stops the deploy before anything is replaced
    await freshClone();
    listFailure = "Authentication error [code: 10000]";
    calls.length = 0;
    await expect(run()).rejects.toThrow(/could not list the secrets of my-blog/);
    expect(calls.some((c) => c.startsWith("deploy"))).toBe(false);
  });
});
