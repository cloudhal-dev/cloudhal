/**
 * Old theme copies keep rendering. `cloudhal init` copies the starter's `src/` into the project,
 * so a site's theme keeps calling `@cloudhal/astro-renderer` and `@cloudhal/core-ts` as they
 * were when it was created. Each frozen copy in `fixtures/theme-v*` (never updated, see its
 * README) is built with today's packages: in 0.3.12 `entryPath(entry)` changed shape and every
 * pre-0.3.11 theme served empty pages.
 */
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { init } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");
const FROZEN = ["v0.3.10"];
const TITLE = "Old Theme Site";

/** Runs `cloudhal build` in its own process and returns its exit code and output. */
async function runBuild(projectDir: string): Promise<{ code: number | null; output: string }> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, "build"], {
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

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => path.join(e.parentPath, e.name));
}

/** The visible text of a page's <main> ("" without one). */
const mainText = (html: string) =>
  (html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe.each(FROZEN)("a theme copied at %s still builds with today's packages", (version) => {
  let tmp: string;
  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("renders the home page, an article and an archive, none of them empty", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-old-theme-"));
    const projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: TITLE });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await rm(path.join(projectDir, "src"), { recursive: true });
    await cp(path.join(here, "fixtures", `theme-${version}`, "src"), path.join(projectDir, "src"), {
      recursive: true,
    });

    const { code, output } = await runBuild(projectDir);
    expect(code, output.slice(-4000)).toBe(0);
    expect(output, "the build logged an error").not.toMatch(/\[ERROR\]|\bError:/);

    const dist = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(dist, ...p), "utf8");
    const pages = {
      home: await read("index.html"),
      article: await read("posts", "hello-world", "index.html"),
      archive: await read("category", "news", "index.html"),
    };
    for (const [name, html] of Object.entries(pages)) {
      expect(html, name).toContain(TITLE);
      expect(mainText(html).length, name).toBeGreaterThan(80);
    }
    expect(pages.home).toMatch(/<h1[^>]*>Old Theme Site<\/h1>/);
    expect(pages.home).toContain('href="/posts/hello-world"');
    expect(pages.archive).toContain('href="/posts/hello-world"');
    expect(pages.article).toContain("<title>Hello, world · ");

    // No page of the build is empty (a theme that throws mid-stream leaves a bare document).
    const files = await htmlFiles(dist);
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const html = await readFile(file, "utf8");
      if (html.includes('http-equiv="refresh"')) continue; // a redirect page
      expect(html, path.relative(dist, file)).toContain("</html>");
      expect(mainText(html).length, path.relative(dist, file)).toBeGreaterThan(10);
    }
  });
});
