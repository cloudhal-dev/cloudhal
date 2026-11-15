/**
 * #239 (RFC-0046 §11b): the Site Worker never reads `cloudhal.json` `dataDir`. A release bundle is
 * built in CI, so a dataDir in the build would be that machine's absolute path. Two builds of the
 * starter that differ only in `dataDir` are the same bytes, neither carries the path, and the built
 * Worker serves the site on real workerd (wrangler's test harness, local D1 and R2) with no data
 * directory left on disk at all.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copySite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { buildSiteWorker } from "../src/cloudflare/build.ts";
import { siteConfigPath, siteWorkerConfig, writeWranglerConfig } from "../src/cloudflare/config.ts";
import { init, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
/**
 * Astro writes a random per-build `key` (server islands, actions) into the manifest unless
 * `ASTRO_KEY` sets it; fixed here so the two builds can be compared byte for byte. With the key
 * fixed, the build is deterministic.
 */
const ASTRO_KEY = Buffer.alloc(32, 7).toString("base64");
/** A dataDir no machine has: the build must not need it, nor carry it. */
const ELSEWHERE = "/nonexistent/cloudhal-ci-runner/data";

/** SHA-256 of every file the build wrote, by path. */
async function digests(dir: string, rel = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await digests(dir, r));
    else
      out[r] = createHash("sha256")
        .update(await readFile(path.join(dir, r)))
        .digest("hex");
  }
  return out;
}

/** Whether any built file contains `needle`. */
async function anyFileContains(dir: string, needle: string, rel = ""): Promise<string | undefined> {
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const found = await anyFileContains(dir, needle, r);
      if (found) return found;
    } else if ((await readFile(path.join(dir, r), "latin1")).includes(needle)) return r;
  }
  return undefined;
}

describe("the Site Worker ignores dataDir (#239)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;
  let first: Record<string, string>;
  let second: Record<string, string>;
  let firstCarries: string | undefined;
  let harness: ReturnType<typeof createTestHarness>;

  const setDataDir = async (dataDir: string) => {
    const file = path.join(projectDir, "cloudhal.json");
    const cfg = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...cfg, dataDir }, null, 2));
  };

  const savedKey = process.env.ASTRO_KEY;
  beforeAll(async () => {
    process.env.ASTRO_KEY = ASTRO_KEY;
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-datadir-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Datadir Site" })).siteId;
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await snapshot({ projectDir, label: "v1", publish: true });
    await writeWranglerConfig(
      siteConfigPath(projectDir),
      siteWorkerConfig({
        name: "datadir-test",
        siteId,
        databaseId: "00000000-0000-0000-0000-00000000da7a",
      }),
      "test",
    );
    await buildSiteWorker(projectDir);
    first = await digests(path.join(projectDir, "dist"));
    // Scanned now, before the second build replaces dist: the first build and its own data path.
    firstCarries = await anyFileContains(
      path.join(projectDir, "dist"),
      path.join(projectDir, ".cloudhal"),
    );
    await setDataDir(ELSEWHERE);
    const config = await buildSiteWorker(projectDir);
    second = await digests(path.join(projectDir, "dist"));

    harness = createTestHarness({ root: projectDir, workers: [{ configPath: config }] });
    await harness.listen();
    const env = (await harness.getWorker().getEnv()) as { DB: D1Database; BLOBS: R2Bucket };
    const target = { sql: new D1Driver(env.DB), blobs: new R2BlobStore(env.BLOBS) };
    await migrate(target.sql, migrations);
    const local = await openLocalStore(path.join(projectDir, ".cloudhal"));
    await copySite(local, target, siteId);
    await local.close();
    // No data directory anywhere now: neither the built one nor the configured one exists.
    await rename(path.join(projectDir, ".cloudhal"), path.join(tmp, "moved-away"));
  }, 600_000);

  afterAll(async () => {
    if (savedKey === undefined) delete process.env.ASTRO_KEY;
    else process.env.ASTRO_KEY = savedKey;
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it("two builds that differ only in dataDir are the same bytes", () => {
    expect(Object.keys(second).length).toBeGreaterThan(10);
    expect(second).toEqual(first);
  });

  it("no built file carries either data directory", async () => {
    // The first build (dataDir .cloudhal), scanned before it was replaced.
    expect(firstCarries).toBeUndefined();
    // The second build (the absolute ELSEWHERE), and neither path in it.
    const dist = path.join(projectDir, "dist");
    expect(await anyFileContains(dist, ELSEWHERE)).toBeUndefined();
    expect(await anyFileContains(dist, path.join(projectDir, ".cloudhal"))).toBeUndefined();
  });

  it("the built Worker serves the site from its bindings with no data directory on disk", async () => {
    const res = await harness.fetch("https://datadir.example/");
    const html = await res.text();
    expect(res.status, html.slice(0, 500)).toBe(200);
    expect(html).toMatch(/<h1[^>]*>Datadir Site<\/h1>/);
    expect((await harness.fetch("https://datadir.example/posts/hello-world")).status).toBe(200);
  });
});
