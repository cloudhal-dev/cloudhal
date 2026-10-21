/**
 * Publishes a release from CI (`.github/workflows/release.yml`, after the `npm-publish`
 * environment's approval): npm trusted publishing (OIDC) with provenance, then one `v<version>`
 * tag and one GitHub Release for the whole fixed group.
 *
 *   node scripts/publish-ci.ts --plan      # prints `publish=true|false` and `version=` for $GITHUB_OUTPUT
 *   node scripts/publish-ci.ts             # build, smoke-test, publish what npm lacks, tag, release
 *
 * Re-runnable: packages npm already has are skipped, an existing tag or release is left alone.
 * The tarballs published are the ones the smoke test installed (`smoke-pack.ts --tarballs`).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPackages, releaseNotes, sharedVersion, unpublished } from "./release-plan.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sh = (cmd: string, args: string[], quiet = false) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });

async function onNpm(name: string, version: string): Promise<boolean> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${version}`);
  return res.ok;
}

const pkgs = readPackages(ROOT);
const version = sharedVersion(pkgs);
const missing = await unpublished(pkgs, onNpm);

if (process.argv.includes("--plan")) {
  const out = `publish=${missing.length > 0}\nversion=${version}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  console.log(missing.length ? `to publish: ${missing.map((p) => p.name).join(", ")}` : out);
  process.exit(0);
}

if (missing.length) {
  const tarballs = mkdtempSync(path.join(os.tmpdir(), "cloudhal-release-"));
  // Builds, packs and installs every package from scratch with npm; fails the release on error.
  sh(process.execPath, ["scripts/smoke-pack.ts", "--tarballs", tarballs]);
  const files = readdirSync(tarballs);
  for (const p of missing) {
    const tgz = `${p.name.replace("@", "").replace("/", "-")}-${p.version}.tgz`;
    if (!files.includes(tgz)) throw new Error(`no tarball ${tgz} in ${tarballs}`);
    // OIDC: npm exchanges the workflow's identity token; provenance is attached automatically.
    sh("npm", [
      "publish",
      path.join(tarballs, tgz),
      "--access",
      "public",
      "--provenance",
      "--ignore-scripts",
    ]);
  }
  for (let i = 0; i < 30 && (await unpublished(pkgs, onNpm)).length; i++)
    await new Promise((r) => setTimeout(r, 10_000));
  // `npm publish` succeeded for each, so the registry has them; it can take longer than five
  // minutes to serve one (0.3.8, 0.3.10). That must not keep the tag and the release back.
  const left = await unpublished(pkgs, onNpm);
  if (left.length)
    console.warn(`npm does not serve yet: ${left.map((p) => p.name).join(", ")}; tagging anyway`);
} else console.log(`npm already has every package at ${version}`);

const tag = `v${version}`;
if (!sh("git", ["tag", "--list", tag], true).trim()) {
  sh("git", [
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "tag",
    "-a",
    tag,
    "-m",
    `Cloudhal ${version}`,
  ]);
  sh("git", ["push", "origin", tag]);
}
let released = true;
try {
  sh("gh", ["release", "view", tag], true);
} catch {
  released = false;
}
if (!released) {
  const changelogs = pkgs.map((p) =>
    readFileSync(path.join(ROOT, "packages", p.dir, "CHANGELOG.md"), "utf8"),
  );
  const notes = path.join(os.tmpdir(), `cloudhal-${version}-notes.md`);
  writeFileSync(notes, releaseNotes(changelogs, version));
  sh("gh", [
    "release",
    "create",
    tag,
    "--title",
    `Cloudhal ${version}`,
    "--notes-file",
    notes,
    "--verify-tag",
    "--latest",
  ]);
}
console.log(`released ${tag}`);
