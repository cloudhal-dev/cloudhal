/**
 * `cloudhal build --published` (RFC-0043 §1.10, rollout PR 2): a site that was never published
 * builds the `not-published` status page as its whole output — never the latest snapshot or the
 * drafts — with the marker the Docker image's Caddyfile turns into a 503; once published, the
 * published snapshot is built and the marker is gone. The status output needs no Astro run, so
 * its cases run in this process; the published build spawns the bin as old-theme-compat does.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATUS_CSP } from "@cloudhal/astro-renderer/status-page";
import type { Snapshot } from "@cloudhal/core-contracts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  STATUS_MARKER,
  statusHeadersFile,
  writeStatusBuild,
} from "../src/commands/build-status.ts";
import { build, init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");
const TITLE = "Unpublished Site";
const STATUS_FILES = [STATUS_MARKER, "404.html", "_headers", "index.html", "robots.txt"];

async function runCli(
  projectDir: string,
  args: string[],
): Promise<{ code: number | null; output: string }> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, ...args], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (c: Buffer) => (output += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (output += c.toString()));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { code, output };
}

describe("writeStatusBuild", () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-status-build-"));
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes the page in the site's default locale, with its headers and marker", async () => {
    const outDir = path.join(tmp, "tr");
    const files = await writeStatusBuild({
      outDir,
      state: "not-published",
      site: { name: "Türkçe Site", defaultLocale: "tr" },
      now: 0,
    });
    expect([...files].sort()).toEqual(STATUS_FILES);
    expect((await readdir(outDir)).sort()).toEqual(STATUS_FILES);
    const html = await readFile(path.join(outDir, "index.html"), "utf8");
    expect(html).toContain('<html lang="tr"');
    expect(html).toContain("Türkçe Site");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(await readFile(path.join(outDir, "404.html"), "utf8")).toBe(html);
    expect(await readFile(path.join(outDir, "robots.txt"), "utf8")).toBe(
      "User-agent: *\nDisallow: /\n",
    );
    expect(await readFile(path.join(outDir, STATUS_MARKER), "utf8")).toBe("not-published\n");
    const headers = await readFile(path.join(outDir, "_headers"), "utf8");
    expect(headers).toBe(statusHeadersFile("not-published"));
    expect(headers).toContain("/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex\n");
    expect(headers).toContain(`  Content-Security-Policy: ${STATUS_CSP}\n`);
  });

  it("empties the folder first and removes a link there without following it", async () => {
    const served = path.join(tmp, "served");
    await mkdir(served);
    await writeFile(path.join(served, "keep.html"), "the served build");
    const outDir = path.join(tmp, "linked");
    await symlink(served, outDir, "dir");
    await writeStatusBuild({
      outDir,
      state: "not-published",
      site: { name: "Site", defaultLocale: "en" },
      now: 0,
    });
    expect((await readdir(outDir)).sort()).toEqual(STATUS_FILES);
    expect(await readFile(path.join(served, "keep.html"), "utf8")).toBe("the served build");
  });

  it("falls back to English for a locale without a catalog", async () => {
    const outDir = path.join(tmp, "xx");
    await writeStatusBuild({
      outDir,
      state: "not-published",
      site: { name: "Site", defaultLocale: "xx-YY" },
      now: 0,
    });
    expect(await readFile(path.join(outDir, "index.html"), "utf8")).toContain('<html lang="en"');
  });
});

describe("cloudhal build --published", () => {
  let tmp: string;
  let projectDir: string;
  let dist: string;
  /** The snapshot the second case publishes; the rollback case returns to it. */
  let published: Snapshot | undefined;
  const DRAFT_NAME = "Renamed In Draft";

  async function withStore<T>(
    fn: (store: LocalStore["store"], siteId: string) => Promise<T>,
  ): Promise<T> {
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    try {
      return await fn(local.store, cfg.siteId);
    } finally {
      await local.close();
    }
  }

  /** A draft change the home page shows: the starter's `<h1>` is the site name. */
  const renameSite = (name: string) =>
    withStore(async (store, siteId) => {
      const site = await store.getSite(siteId);
      if (!site) throw new Error("no site");
      await store.updateSite({ ...site, name });
    });

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-build-published-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: TITLE });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    dist = path.join(projectDir, "dist");
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("refuses --snapshot alongside it", async () => {
    await expect(build({ projectDir, published: true, snapshotId: "snap_x" })).rejects.toThrow(
      /--published/,
    );
  });

  it("writes the status page while nothing is published, never the latest snapshot", async () => {
    // a stale build in dist is replaced, as an Astro build replaces it
    await mkdir(dist, { recursive: true });
    await writeFile(path.join(dist, "stale.html"), "old");
    // a snapshot nobody published: plain `cloudhal build` would render it
    const draft = await snapshot({ projectDir, label: "draft" });
    const { code, output } = await runCli(projectDir, ["build", "--published"]);
    expect(code, output).toBe(0);
    expect(output).toContain("not-published: nothing is published yet");
    expect(output).toContain("Retry-After: 3600");
    expect(output).not.toContain(draft.id);
    expect((await readdir(dist)).sort()).toEqual(STATUS_FILES);
    const html = await readFile(path.join(dist, "index.html"), "utf8");
    expect(html).toContain('data-state="not-published"');
    expect(html).toContain(TITLE);
    expect(html).toContain('<html lang="en"');
    expect(html).not.toContain("Hello, world"); // the seeded post, unpublished with the site
    // the build made no snapshot of its own: the latest is still the unpublished one
    expect((await withStore((store, siteId) => store.latestSnapshot(siteId)))?.id).toBe(draft.id);
  });

  it("builds the published snapshot, not a later unpublished one, without the marker", async () => {
    published = await snapshot({ projectDir, publish: true, label: "launch" });
    await renameSite(DRAFT_NAME);
    const later = await snapshot({ projectDir, label: "draft rename" });
    const { code, output } = await runCli(projectDir, ["build", "--published"]);
    expect(code, output.slice(-4000)).toBe(0);
    expect(output).toContain(`from ${published.id} (published)`);
    expect(output).not.toContain(later.id);
    const files = await readdir(dist);
    expect(files).not.toContain(STATUS_MARKER);
    const home = await readFile(path.join(dist, "index.html"), "utf8");
    expect(home).toMatch(/<h1[^>]*>Unpublished Site<\/h1>/);
    expect(home).toContain('href="/posts/hello-world"');
    expect(home).not.toContain(DRAFT_NAME);
  }, 180_000);

  it("follows a rollback: publish s1, publish s2, roll back to s1, build s1", async () => {
    const s1 = published;
    if (!s1) throw new Error("the previous case publishes s1");
    const s2 = await snapshot({ projectDir, publish: true, label: "second" }); // the rename
    expect(s2.id).not.toBe(s1.id);
    await withStore(async (store, siteId) => {
      const site = await store.getSite(siteId);
      if (!site) throw new Error("no site");
      await store.rollback(site, s1.id, { kind: "human", id: "user_localcli0001", name: "test" });
    });
    const { code, output } = await runCli(projectDir, ["build", "--published"]);
    expect(code, output.slice(-4000)).toBe(0);
    expect(output).toContain(`from ${s1.id} (published)`);
    const home = await readFile(path.join(dist, "index.html"), "utf8");
    expect(home).toMatch(/<h1[^>]*>Unpublished Site<\/h1>/);
    expect(home).not.toContain(DRAFT_NAME);
  }, 180_000);
});
