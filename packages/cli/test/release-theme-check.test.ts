/**
 * The theme check of `deploy --release` (RFC-0046 §11b, "Tests for the check"): a copy of this
 * CLI's own starter passes (also with CRLF line endings); every build input that differs is
 * named; OS metadata files, `vite.config.*`, `.env` and non-build files pass; PostCSS configs are
 * searched from the project up to Vite's workspace root, and no further.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cliStarter,
  postcssSearchDirs,
  type ThemeDifference,
  themeDifferences,
} from "../src/commands/deploy/release/theme-check.ts";
import { cleanup, tmp } from "./fixtures/release-deploy.ts";

let starter: Awaited<ReturnType<typeof cliStarter>>;
beforeAll(async () => {
  starter = await cliStarter();
});
afterEach(cleanup);

/** A copy of the starter as `cloudhal init` copies it, standalone (its own pnpm-workspace.yaml). */
async function copy(inWorkspace?: string): Promise<string> {
  const parent = inWorkspace ?? tmp("theme-check-");
  const dir = path.join(parent, "site");
  await cp(starter.dir, dir, { recursive: true, filter: starter.keep });
  if (!inWorkspace) await writeFile(path.join(dir, "pnpm-workspace.yaml"), "packages: []\n");
  await writeFile(path.join(dir, "cloudhal.json"), "{}\n");
  return dir;
}

const named = (diffs: ThemeDifference[]) => diffs.map((d) => `${d.change}: ${d.path}`);

describe("the theme check", () => {
  it("passes an unmodified starter, also with CRLF line endings", async () => {
    const dir = await copy();
    expect(await themeDifferences(dir, starter)).toEqual([]);
    const file = path.join(dir, "astro.config.mjs");
    await writeFile(file, (await readFile(file, "utf8")).replaceAll("\n", "\r\n"));
    expect(await themeDifferences(dir, starter)).toEqual([]);
  });

  it("names an edited src file, an added public file, a deleted starter file, an edited astro.config.mjs and an added skill", async () => {
    const dir = await copy();
    await writeFile(path.join(dir, "src/DESIGN.md"), "# Mine\n");
    await writeFile(path.join(dir, "public/extra.txt"), "x\n");
    await rm(path.join(dir, "src/blocks.ts"));
    await writeFile(path.join(dir, "astro.config.mjs"), "export default {};\n");
    await mkdir(path.join(dir, "skills/x"), { recursive: true });
    await writeFile(path.join(dir, "skills/x/SKILL.md"), "---\nname: x\n---\n");
    expect(named(await themeDifferences(dir, starter))).toEqual([
      "changed: astro.config.mjs",
      "added: public/extra.txt",
      "added: skills/x/SKILL.md",
      "changed: src/DESIGN.md",
      "missing: src/blocks.ts",
    ]);
  });

  it("names an edited tsconfig.json, an added jsconfig.json, PostCSS files and a postcss key", async () => {
    const dir = await copy();
    await writeFile(path.join(dir, "tsconfig.json"), "{}\n");
    await writeFile(path.join(dir, "jsconfig.json"), "{}\n");
    await writeFile(path.join(dir, "postcss.config.mjs"), "export default {};\n");
    await writeFile(path.join(dir, ".postcssrc.json"), "{}\n");
    const pkgFile = path.join(dir, "package.json");
    const pkg = JSON.parse(await readFile(pkgFile, "utf8")) as Record<string, unknown>;
    await writeFile(pkgFile, JSON.stringify({ ...pkg, postcss: { plugins: {} } }));
    expect(named(await themeDifferences(dir, starter))).toEqual([
      "added: .postcssrc.json",
      "added: jsconfig.json",
      "added: postcss.config.mjs",
      "changed: tsconfig.json",
      "added: package.json#postcss",
    ]);
  });

  it("searches PostCSS configs up to a pnpm workspace root, including package.json keys between", async () => {
    const ws = tmp("theme-check-ws-");
    await writeFile(path.join(ws, "pnpm-workspace.yaml"), "packages: ['apps/*']\n");
    await writeFile(path.join(ws, "postcss.config.cjs"), "module.exports = {};\n");
    await mkdir(path.join(ws, "apps"));
    await writeFile(path.join(ws, "apps/package.json"), JSON.stringify({ postcss: {} }));
    const dir = await copy(path.join(ws, "apps"));
    expect(await postcssSearchDirs(dir)).toEqual([dir, path.join(ws, "apps"), ws]);
    expect(named(await themeDifferences(dir, starter))).toEqual([
      "added: ../package.json#postcss",
      "added: ../../postcss.config.cjs",
    ]);
  });

  it("ignores PostCSS configs above the workspace root, and above a standalone project", async () => {
    const outer = tmp("theme-check-outer-");
    await writeFile(path.join(outer, "postcss.config.cjs"), "module.exports = {};\n");
    const ws = path.join(outer, "ws");
    await mkdir(ws);
    await writeFile(path.join(ws, "pnpm-workspace.yaml"), "packages: []\n");
    const inside = await copy(ws);
    expect(await themeDifferences(inside, starter)).toEqual([]);
    // Standalone (its own pnpm-workspace.yaml, as `cloudhal init` writes): the project alone.
    const alone = path.join(outer, "alone");
    await mkdir(alone);
    const dir = await copy(alone);
    expect(await postcssSearchDirs(dir)).toEqual([dir]);
    expect(await themeDifferences(dir, starter)).toEqual([]);
  });

  it("passes OS metadata files, vite.config.ts, .env and files outside the build inputs", async () => {
    const dir = await copy();
    await mkdir(path.join(dir, "public/fonts/v1"), { recursive: true });
    await writeFile(path.join(dir, "public/fonts/v1/.DS_Store"), "x");
    await writeFile(path.join(dir, "src/Thumbs.db"), "x");
    await writeFile(path.join(dir, "src/desktop.ini"), "x");
    await writeFile(path.join(dir, "vite.config.ts"), "export default {};\n");
    await writeFile(path.join(dir, ".env"), "X=1\n");
    await writeFile(path.join(dir, "README.md"), "# Mine\n");
    await writeFile(path.join(dir, ".gitignore"), "x\n");
    await writeFile(path.join(dir, "wrangler.jsonc"), "{}\n");
    expect(await themeDifferences(dir, starter)).toEqual([]);
  });

  it("refuses a starter from another version until --discard-local-theme (a changed starter file)", async () => {
    // An older project's starter differs wherever the starter changed between the versions; the
    // check sees that as a difference like any edit.
    const dir = await copy();
    const file = path.join(dir, "src/blocks.ts");
    await writeFile(file, `${await readFile(file, "utf8")}\n// from an older starter\n`);
    expect(named(await themeDifferences(dir, starter))).toEqual(["changed: src/blocks.ts"]);
  });
});

describe("the theme check: skills/", () => {
  it("refuses a skills/ directory even when it is empty", async () => {
    const dir = await copy();
    await mkdir(path.join(dir, "skills"));
    expect(named(await themeDifferences(dir, starter))).toEqual(["added: skills/"]);
    await writeFile(path.join(dir, "skills/.DS_Store"), "x");
    expect(named(await themeDifferences(dir, starter))).toEqual(["added: skills/"]);
  });
});
