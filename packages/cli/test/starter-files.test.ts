import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { starterFilter } from "../src/starter-files.ts";

async function files(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort();
}

async function starter(root: string): Promise<string> {
  const dir = path.join(root, "starter");
  await mkdir(path.join(dir, "src/pages"), { recursive: true });
  await mkdir(path.join(dir, "node_modules/x"), { recursive: true });
  await mkdir(path.join(dir, "Users/someone/leftover"), { recursive: true });
  await writeFile(path.join(dir, ".gitignore"), "Users/\n");
  await writeFile(path.join(dir, "package.json"), "{}");
  await writeFile(path.join(dir, "src/pages/index.astro"), "---\n---\n");
  await writeFile(path.join(dir, "node_modules/x/index.js"), "");
  await writeFile(path.join(dir, "Users/someone/leftover/data.db"), "");
  return dir;
}

const roots: string[] = [];
afterEach(async () => {
  for (const d of roots.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("starterFilter", () => {
  it("copies what git knows and leaves ignored leftovers behind", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cloudhal-starter-"));
    roots.push(root);
    const dir = await starter(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "starter/package.json", "starter/.gitignore"], { cwd: root });
    // src/pages/index.astro stays untracked but not ignored: still part of the starter
    const out = path.join(root, "out");
    await cp(dir, out, { recursive: true, filter: await starterFilter(dir) });
    expect(await files(out)).toEqual([".gitignore", "package.json", "src/pages/index.astro"]);
  });

  it("outside git copies everything but the build directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cloudhal-starter-"));
    roots.push(root);
    const dir = await starter(root);
    const out = path.join(root, "out");
    await cp(dir, out, { recursive: true, filter: await starterFilter(dir) });
    expect(await files(out)).toEqual([
      ".gitignore",
      "Users/someone/leftover/data.db",
      "package.json",
      "src/pages/index.astro",
    ]);
  });
});
