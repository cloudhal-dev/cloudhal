/**
 * RFC-0006 §11 in a real `cloudhal dev` (a child process: Astro disables its dev middleware under
 * Vitest): with `analytics.dev` the integration's middleware injects the script tag, serves the
 * hashed script and records beacons for published paths into the local SQLite store.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");
const CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

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

describe("cloudhal dev with analytics.dev (RFC-0006 §11)", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-dev-analytics-"));
    projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: "Dev Analytics" });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await snapshot({ projectDir, label: "v1", publish: true });
    // cloudhal.json's analytics block, as `cloudhal init` will write it (rollout step 9) plus `dev`
    const file = path.join(projectDir, "cloudhal.json");
    const cfg = JSON.parse(await readFile(file, "utf8"));
    await writeFile(
      file,
      JSON.stringify({ ...cfg, analytics: { enabled: true, dev: true } }, null, 2),
    );
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("injects the tag, serves the script and records published page views into SQLite", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    try {
      let html = "";
      for (let i = 0; i < 40; i++) {
        const res = await fetch(new URL("/about", server.url));
        html = await res.text();
        if (res.status === 200 && html.includes("<h1")) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const tag = html.match(
        /<script type="module" src="(\/_cloudhal\/p\.[0-9a-f]{8}\.js)" data-v="5"><\/script><\/head>/,
      );
      expect(
        tag,
        html.slice(html.indexOf("</head>") - 600, html.indexOf("</head>") + 20),
      ).not.toBeNull();
      const script = await fetch(new URL(tag?.[1] as string, server.url));
      expect(script.headers.get("content-type")).toContain("javascript");
      expect(await script.text()).toContain("/__cloudhal/e");

      const beacon = (p: string) =>
        fetch(new URL("/__cloudhal/e", server.url), {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: 1,
            kind: "pageview",
            path: p,
            referrer: "",
            navType: "navigate",
          }),
          headers: {
            "sec-fetch-site": "same-origin",
            "user-agent": CHROME,
            "content-type": "text/plain",
          },
        });
      expect((await beacon("/about")).status).toBe(204);
      expect((await beacon("/not-published")).status).toBe(204);
    } finally {
      server.child.kill();
    }
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    try {
      const rows = await local.sql.all<{ kind: string; path: string; node_id: string }>(
        "SELECT kind, path, node_id FROM analytics_events WHERE kind = 'pageview'",
      );
      const about = (await local.store.listPages(cfg.siteId)).find((p) => p.path === "/about");
      expect(rows).toEqual([{ kind: "pageview", path: "/about", node_id: about?.id }]);
    } finally {
      await local.close();
    }
  });
});
