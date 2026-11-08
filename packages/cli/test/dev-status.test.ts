/**
 * RFC-0043 §1.8 in a real `cloudhal dev` (a child process: Astro disables its dev middleware
 * under Vitest): dev renders the working copy, so real pages never get a status page, and the
 * status middleware draws each state on demand at `/__cloudhal/status/<state>` through the
 * same module and the project's theme hook.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { appendFile, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");

const THEME_HOOK = `
// test: the status pages' theme hook (RFC-0043 §1.7)
import type { StatusPageHook } from "@cloudhal/astro-renderer/status-page";
export const statusPage: StatusPageHook = (state, ctx) =>
  state === "maintenance" ? undefined : ctx.defaultHtml({ css: "/* hooked in dev */" });
`;

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

describe("cloudhal dev status pages (RFC-0043 §1.8)", () => {
  let tmp: string;
  let projectDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-dev-status-"));
    projectDir = path.join(tmp, "site");
    // never published: dev still renders the working copy
    await init({ dir: projectDir, name: "Dev Status" });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await appendFile(path.join(projectDir, "src/theme.ts"), THEME_HOOK);
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("renders real pages, and draws each status page on demand with the theme hook", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = await spawnDev(projectDir, port);
    try {
      let home: Response | undefined;
      for (let i = 0; i < 40; i++) {
        home = await fetch(new URL("/", server.url));
        if (home.status === 200 && (await home.clone().text()).includes("<h1")) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(home?.status).toBe(200);

      const tr = await fetch(new URL("/__cloudhal/status/not-published?locale=tr", server.url));
      const trHtml = await tr.text();
      expect(tr.status).toBe(503);
      expect(tr.headers.get("x-cloudhal-state")).toBe("not-published");
      expect(tr.headers.get("retry-after")).toBe("3600");
      expect(tr.headers.get("cache-control")).toBe("no-store");
      expect(trHtml).toContain('<html lang="tr" dir="ltr">');
      expect(trHtml).toContain("Çok yakında");
      expect(trHtml).toContain("Dev Status");
      expect(trHtml).toContain("/* hooked in dev */");

      const until = new Date(Date.now() + 3600_000).toISOString();
      const m = await fetch(
        new URL(
          `/__cloudhal/status/maintenance?page=coming-soon&message=Launching%20soon&until=${until}`,
          server.url,
        ),
      );
      const mHtml = await m.text();
      expect(m.status).toBe(503);
      expect(m.headers.get("x-robots-tag")).toBeNull();
      expect(Number(m.headers.get("retry-after"))).toBeGreaterThan(3000);
      // the hook left maintenance to the built-in page: its own CSP, no theme CSS
      expect(m.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(mHtml).not.toContain("/* hooked in dev */");
      expect(mHtml).toContain("Launching soon");
      expect(mHtml).toContain("Back by ");
      expect(mHtml).toContain("<h1>Coming soon</h1>");

      const ar = await fetch(new URL("/__cloudhal/status/preview-expired?locale=ar", server.url));
      expect(ar.status).toBe(410);
      expect(await ar.text()).toContain('<html lang="ar" dir="rtl">');

      const error = await fetch(new URL("/__cloudhal/status/error", server.url));
      expect(error.status).toBe(500);
      expect(await error.text()).toContain("Reference: dev-preview");

      expect((await fetch(new URL("/__cloudhal/status/nope", server.url))).status).toBe(404);
    } finally {
      server.child.kill("SIGTERM");
      await new Promise((r) => server.child.once("exit", r));
    }
  });
});
