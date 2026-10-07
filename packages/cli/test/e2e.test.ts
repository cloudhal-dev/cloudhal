import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");

/** Runs `cloudhal dev` as a real child process (Astro disables its dev middleware under Vitest). */
async function spawnDev(
  projectDir: string,
  port: number,
): Promise<{ child: ChildProcess; url: string }> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, "dev", "--port", String(port)], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`cloudhal dev did not start:\n${output}`)),
      60_000,
    );
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const m = output.match(/cloudhal dev → (http:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1] as string);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudhal dev exited with ${code}:\n${output}`));
    });
  });
  return { child, url };
}

describe("cloudhal init → dev → snapshot → build", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-e2e-"));
    projectDir = path.join(tmp, "my-site");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("init scaffolds the starter and seeds a site", async () => {
    const r = await init({ dir: projectDir, name: "E2E Site" });
    expect(r.siteId).toMatch(/^site_/);
    const cfg = await readProjectConfig(projectDir);
    expect(cfg.siteId).toBe(r.siteId);
    const pkg = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.name).toBe("e2e-site");
    // outside the monorepo workspace: workspace:* links were rewritten
    expect(pkg.dependencies["@cloudhal/astro-renderer"]).not.toMatch(/^workspace:/);
    await expect(init({ dir: projectDir })).rejects.toThrow(/not empty/);
    // Borrow the starter's installed dependencies so Astro can resolve packages in the temp dir.
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
  });

  it("dev serves live pages and reflects edits without restart", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    try {
      // Vite may answer the very first requests with a transient error page while it
      // (re)optimises dependencies; a browser would just reload. Retry briefly.
      let html = "";
      for (let i = 0; i < 40; i++) {
        const res = await fetch(server.url as string);
        html = await res.text();
        if (res.status === 200 && html.includes("<h1>")) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(
        html,
        html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 600),
      ).toMatch(/<h1[^>]*>E2E Site<\/h1>/); // dev mode adds data-astro-source-* attributes
      expect(html).toContain('href="/posts/hello-world"');

      const cfg = await readProjectConfig(projectDir);
      const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
      const about = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/about");
      await local.store.updatePage({
        ...(about as NonNullable<typeof about>),
        title: "About (edited live)",
      });
      await local.close();

      const edited = await (await fetch(new URL("/about", server.url))).text();
      expect(edited).toContain("<title>About (edited live)</title>");
      expect((await fetch(new URL("/nope", server.url))).status).toBe(404);

      // A brand-new page needs a new route: the integration watches the data dir and clears
      // Astro's dev route cache. Poll because the file watcher is asynchronous.
      const local2 = await openLocalStore(path.join(projectDir, cfg.dataDir));
      const site = await local2.store.getSite(cfg.siteId);
      await local2.store.createPage(site as NonNullable<typeof site>, {
        siteId: cfg.siteId,
        path: "/fresh",
        title: "Fresh page",
        locale: "en",
        status: "draft",
        sections: [{ id: "sec_fresh0000001", kind: "hero", heading: "Fresh" }],
      });
      await local2.close();
      let status = 404;
      for (let i = 0; i < 40 && status !== 200; i++) {
        await new Promise((r) => setTimeout(r, 250));
        status = (await fetch(new URL("/fresh", server.url))).status;
      }
      expect(status).toBe(200);
    } finally {
      server.child.kill("SIGTERM");
      await new Promise((r) => server.child.once("exit", r));
    }
  });

  it("build renders the published snapshot, not later edits", async () => {
    const snap = await snapshot({ projectDir, label: "v1", publish: true });
    expect(snap.summary.added).toBeGreaterThan(0);

    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const home = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/");
    await local.store.updatePage({
      ...(home as NonNullable<typeof home>),
      title: "Changed after publish",
    });
    await local.close();

    const r = await build({ projectDir });
    expect(r.snapshotId).toBe(snap.id);
    const index = await readFile(path.join(r.outDir, "index.html"), "utf8");
    expect(index).toContain("<h1>E2E Site</h1>");
    expect(index).not.toContain("Changed after publish");
    const post = await readFile(path.join(r.outDir, "posts", "hello-world", "index.html"), "utf8");
    expect(post).toContain("<title>Hello, world</title>");
  });
});
