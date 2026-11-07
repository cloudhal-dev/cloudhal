/**
 * Moves cloudhal-template (the Deploy to Cloudflare button) to a Cloudhal release, issue #111.
 * .github/workflows/template-sync.yml runs it after each npm publish, then refreshes the
 * lockfile and opens the PR; scripts/template-plan.ts has the rules.
 *
 *   node scripts/template-sync.ts --template <dir> --version <x.y.z>
 *     [--starter <dir>] [--wait <seconds>] [--summary <file>] [--check] [--allow-downgrade]
 *   node scripts/template-sync.ts --template <dir> --version <x.y.z> --lock [--wait <seconds>]
 *
 * Without --starter it waits up to --wait seconds (default 0) for npm to serve
 * `@cloudhal/cli@<version>`, takes the blog starter out of `npm pack` of it (no package code
 * runs) and waits for every `@cloudhal/*` package that starter names. --starter reads a
 * published-layout starter from disk instead, offline (the repo's starters/blog is refused: its
 * specs are workspace:). --check writes nothing and exits 1 when the template is not current.
 * --summary writes the PR body. The sync itself never runs npm install, nor `cloudhal deploy`,
 * which rewrites the tracked wrangler.jsonc.
 *
 * --lock, run after a sync (an --allow-downgrade one too), refreshes package-lock.json with
 * `npm install --package-lock-only --ignore-scripts` and every `@cloudhal/*` at exactly <version>
 * (scripts/template-lock.ts), retrying for up to --wait seconds while npm catches up, and fails
 * unless the lock holds that version everywhere. Node built-ins only: the workflow runs it
 * without a pnpm install.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { onNpm, unpublished } from "./release-plan.ts";
import { lockPins, lockProblems } from "./template-lock.ts";
import {
  applySync,
  currentVersion,
  dependencyChanges,
  planSync,
  type SyncOp,
} from "./template-plan.ts";
import { prBody } from "./template-pr.ts";

/** Where the CLI tarball carries the starter `cloudhal init` copies. */
const STARTER_IN_TARBALL = "package/dist/assets/starters/blog";

function args() {
  const { values } = parseArgs({
    options: {
      template: { type: "string" },
      version: { type: "string" },
      starter: { type: "string" },
      wait: { type: "string", default: "0" },
      summary: { type: "string" },
      check: { type: "boolean", default: false },
      "allow-downgrade": { type: "boolean", default: false },
      lock: { type: "boolean", default: false },
    },
    strict: true,
  });
  const { template, version } = values;
  const wait = Number(values.wait);
  if (!template || !version) throw new Error("--template <dir> and --version <x.y.z> are required");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`--version must be x.y.z, not ${version}`);
  if (!Number.isInteger(wait) || wait < 0) throw new Error("--wait takes whole seconds");
  if (
    values.lock &&
    (values.starter || values.summary || values.check || values["allow-downgrade"])
  )
    throw new Error("--lock takes only --template, --version and --wait");
  return { ...values, template, version, wait };
}

/** Polls npm until it serves every package at `version`; throws once `seconds` have passed. */
async function waitForNpm(names: readonly string[], version: string, seconds: number) {
  const pkgs = names.map((name) => ({ dir: name, name, version }));
  const served = (name: string, v: string) => onNpm(name, v).catch(() => false);
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const missing = (await unpublished(pkgs, served)).map((p) => `${p.name}@${version}`);
    if (!missing.length) return;
    if (Date.now() >= deadline)
      throw new Error(`npm does not serve ${missing.join(", ")} (waited ${seconds} s)`);
    console.log(`waiting for npm to serve ${missing.join(", ")}`);
    await new Promise((r) => setTimeout(r, Math.min(15_000, Math.max(0, deadline - Date.now()))));
  }
}

/** Downloads `@cloudhal/cli@<version>` into `tmp` and extracts only its blog starter. */
async function fetchStarter(version: string, wait: number, tmp: string): Promise<string> {
  await waitForNpm(["@cloudhal/cli"], version, wait);
  const out = execFileSync(
    "npm",
    ["pack", `@cloudhal/cli@${version}`, "--pack-destination", tmp, "--ignore-scripts", "--json"],
    { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const [packed] = JSON.parse(out) as { filename?: string }[];
  if (!packed?.filename) throw new Error(`npm pack printed no tarball: ${out}`);
  const into = path.join(tmp, "x");
  await mkdir(into);
  const tgz = path.join(tmp, path.basename(packed.filename));
  execFileSync("tar", ["-xzf", tgz, "-C", into, STARTER_IN_TARBALL], { stdio: "inherit" });
  const starter = path.join(into, STARTER_IN_TARBALL);
  const pkg = JSON.parse(await readFile(path.join(starter, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const scoped = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((name) => name.startsWith("@cloudhal/"))
    .sort();
  await waitForNpm(scoped, version, wait);
  return starter;
}

const readJson = async (file: string) =>
  JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;

/** --lock: package-lock.json with every `@cloudhal/*` at exactly `version`, or an error. */
async function refreshLock(templateDir: string, version: string, wait: number): Promise<void> {
  const pkgFile = path.join(templateDir, "package.json");
  const npmArgs = [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--save-prefix=^",
    "--no-save-exact",
    ...lockPins(await readJson(pkgFile), version),
  ];
  // npm can serve a new version's metadata minutes after the publish.
  const deadline = Date.now() + wait * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("npm", npmArgs, { cwd: templateDir, stdio: "inherit" });
      break;
    } catch {
      if (Date.now() >= deadline)
        throw new Error(
          `npm install --package-lock-only failed (attempt ${attempt}, --wait ${wait})`,
        );
      console.log(`npm install failed (attempt ${attempt}); retrying in up to 60 s`);
      await new Promise((r) => setTimeout(r, Math.min(60_000, deadline - Date.now())));
    }
  }
  const lock = await readJson(path.join(templateDir, "package-lock.json"));
  const problems = lockProblems(await readJson(pkgFile), lock, version);
  if (problems.length)
    throw new Error(`the refreshed lock does not install ${version}:\n  ${problems.join("\n  ")}`);
  console.log(`package-lock.json locks every @cloudhal/* package at ${version}`);
}

function describe(op: SyncOp): string {
  if (op.kind === "delete") return `removed ${op.path}`;
  return `${op.added ? "added" : "updated"} ${op.path}`;
}

function runUrl(): string | undefined {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: run } = process.env;
  return server && repo && run ? `${server}/${repo}/actions/runs/${run}` : undefined;
}

async function main(): Promise<void> {
  const opts = args();
  const templateDir = path.resolve(opts.template);
  if (opts.lock) return refreshLock(templateDir, opts.version, opts.wait);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-template-sync-"));
  try {
    const starterDir = opts.starter
      ? path.resolve(opts.starter)
      : await fetchStarter(opts.version, opts.wait, tmp);
    const pkgFile = path.join(templateDir, "package.json");
    const before = await readJson(pkgFile);
    const ops = await planSync({
      starterDir,
      templateDir,
      version: opts.version,
      allowDowngrade: opts["allow-downgrade"],
    });
    for (const op of ops) console.log(describe(op));
    if (!ops.length) console.log(`cloudhal-template is current at ${opts.version}`);
    if (opts.check) {
      process.exitCode = ops.length ? 1 : 0;
      return;
    }
    await applySync(templateDir, ops);
    if (opts.summary) {
      const after = await readJson(pkgFile);
      const deps = dependencyChanges(before, after);
      const from = currentVersion(before);
      await writeFile(
        opts.summary,
        prBody({ ops, from, to: opts.version, deps, runUrl: runUrl() }),
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (e) {
  console.error(`template-sync: ${(e as Error).message}`);
  process.exitCode = 1;
}
