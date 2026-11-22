/**
 * The `edge` self-host image's bundle (RFC-0047 §9; .github/workflows/docker.yml): this ref's site
 * and admin Workers, built the way .github/workflows/bundle-build.yml builds a release's, then
 * extracted next to its manifest into `<out>` for deploy/docker/install.mjs. The bundle is
 * unsigned (key id `edge-<sha>`): the image checks every file against the manifest, nothing more.
 * A release image never uses this; it verifies the signed bundle of its version.
 *
 *   node scripts/selfhost-edge-bundle.ts <out> [--no-build]
 *
 * Expects `pnpm install` done and, without --no-build, builds the packages and Studio first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [outArg, ...flags] = process.argv.slice(2);
if (!outArg) throw new Error("usage: node scripts/selfhost-edge-bundle.ts <out> [--no-build]");
const out = path.resolve(outArg);
if (existsSync(out)) throw new Error(`${out} exists`);

const run = (cmd: string, args: string[], cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
const node = (...args: string[]) => run(process.execPath, args);
const cli = path.join(ROOT, "packages/cli/bin/cloudhal.ts");

if (!flags.includes("--no-build")) {
  node("scripts/build-packages.ts");
  run("pnpm", ["--filter", "@cloudhal/studio", "build"]);
}
const version = (
  JSON.parse(readFileSync(path.join(ROOT, "packages/cli/package.json"), "utf8")) as {
    version: string;
  }
).version;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
const work = mkdtempSync(path.join(os.tmpdir(), "selfhost-edge-"));
try {
  // The standard starter, as bundle-build.yml makes it, with the starter's own dependencies.
  const project = path.join(work, "release-std");
  node(cli, "init", project);
  symlinkSync(path.join(ROOT, "starters/blog/node_modules"), path.join(project, "node_modules"));
  run(process.execPath, [cli, "deploy", "--dry-run"], project);
  const built = path.join(work, "bundle");
  node(
    "scripts/release-bundle.ts",
    "build",
    "--version",
    version,
    "--project",
    project,
    "--studio",
    path.join(ROOT, "apps/studio/dist"),
    "--migrations-dir",
    path.join(ROOT, "packages/storage/migrations"),
    "--commit",
    commit,
    "--key-id",
    `edge-${commit.slice(0, 12)}`,
    "--out",
    built,
  );
  // Extracted as `extractRelease` lays it out: the tarball's files, each role's `_headers` from
  // the manifest, and the manifest itself; `cloudhal selfhost check` then compares every file.
  run("mkdir", ["-p", out]);
  run("tar", ["-xzf", path.join(built, `cloudhal-release-${version}.tar.gz`), "-C", out]);
  const manifest = readFileSync(path.join(built, "manifest.json"));
  const m = JSON.parse(manifest.toString()) as {
    workers: Record<"site" | "admin", { assets: { headers?: string } }>;
  };
  for (const role of ["site", "admin"] as const) {
    const headers = m.workers[role].assets.headers;
    if (headers) writeFileSync(path.join(out, role, "assets", "_headers"), headers);
  }
  writeFileSync(path.join(out, "manifest.json"), manifest);
  node(cli, "selfhost", "check", "--in", out);
} finally {
  rmSync(work, { recursive: true, force: true });
}
