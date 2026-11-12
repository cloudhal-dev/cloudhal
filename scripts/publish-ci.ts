/**
 * Publishes a release from CI (`.github/workflows/release.yml`, after the `npm-publish`
 * environment's approval), in the order immutable GitHub Releases require (RFC-0046 §6;
 * `scripts/release-publish-plan.ts` plans it and resumes a half-done run):
 *
 *   1 tag `v<version>` on HEAD (= the signed statement's commit)
 *   2 `gh release create --draft --verify-tag` (never Latest)
 *   3 upload the five bundle assets to the draft (`--clobber`), re-read it, compare names + digests
 *   4 smoke-test and npm publish the fixed group (trusted publishing, OIDC, provenance)
 *   5 re-check the draft's assets   6 `gh release edit --draft=false` (`--latest` only when highest)
 *
 *   node scripts/publish-ci.ts --plan [--dry-run]   # `publish=`, `version=`, `dry_run=`,
 *                                                   # `security_release=` for $GITHUB_OUTPUT
 *   node scripts/publish-ci.ts [--bundle-dir <dir>] [--dry-run]
 *
 * With `--bundle-dir`, nothing is created before the bundle checks out: the five files are there,
 * the statement pins the manifest and the tarball, and `release-statement.sig` verifies with the
 * pinned release key (a dry run: with the `dryrun-<run id>` key bundle-sign generated, whose public
 * half reaches this job as RELEASE_DRYRUN_PUBLIC_KEY). Without it (repository variable
 * RELEASE_BUNDLES off) the same order runs with no assets. `--dry-run` (workflow_dispatch
 * `dry_run`) drafts `v<version>-dryrun.<run number>` on HEAD without pushing a tag, uploads and
 * re-checks the assets, runs `npm publish --dry-run` (see `npmFlags`), and deletes the draft.
 * Node built-ins only (the `plan` job runs it without a pnpm install).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { verifySignature } from "./release-bundle/signature.ts";
import {
  isSecurityRelease,
  onNpm,
  type Pkg,
  readPackages,
  releaseNotes,
  sharedVersion,
  unpublished,
} from "./release-plan.ts";
import {
  type LocalAsset,
  type NpmPublish,
  type PublishInput,
  type PublishPort,
  type ReleaseView,
  runPublish,
  tagFor,
} from "./release-publish-plan.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.GITHUB_REPOSITORY ?? "cloudhal-dev/cloudhal";
const BOT = [
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
];
const sh = (cmd: string, args: string[], quiet = false) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" }) ?? "";

/**
 * The release key `bundle-sign` signs with (docs/security/release-signing-keys.md). It equals
 * release.yml's PINNED_KEY_ID and PINNED_PUBLIC_KEY; release-workflows.test.ts keeps them equal.
 */
export const RELEASE_KEY = {
  "cloudhal-release-2026a": "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=",
} as const;

/** The one key a run's statement may be signed with: the release key, or the dry run's own. */
export function publicKeysFor(o: {
  dryRun: boolean;
  runId?: string | undefined;
  dryRunPublicKey?: string | undefined;
}): Record<string, string> {
  if (!o.dryRun) return { ...RELEASE_KEY };
  if (!o.runId || !/^\d+$/.test(o.runId)) throw new Error("a dry run needs GITHUB_RUN_ID");
  if (!o.dryRunPublicKey) throw new Error("a dry run needs RELEASE_DRYRUN_PUBLIC_KEY");
  return { [`dryrun-${o.runId}`]: o.dryRunPublicKey };
}

/** The five assets of a signed bundle directory, checked against its statement and signature. */
export function loadBundle(
  dir: string,
  version: string,
  publicKeys: Readonly<Record<string, string>>,
): NonNullable<PublishInput["bundle"]> {
  const names = [
    `cloudhal-release-${version}.tar.gz`,
    "manifest.json",
    "release-statement.json",
    "release-statement.sig",
    `cloudhal-release-${version}.sigstore.json`,
  ];
  const assets: LocalAsset[] = names.map((name) => {
    const file = path.join(dir, name);
    const bytes = readFileSync(file);
    return {
      name,
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const [tarball, manifest, , sig] = assets as [LocalAsset, LocalAsset, LocalAsset, LocalAsset];
  if (sig.bytes !== 64) throw new Error("release-statement.sig is not a 64-byte signature");
  const statementBytes = readFileSync(path.join(dir, "release-statement.json"));
  const statement = JSON.parse(new TextDecoder().decode(statementBytes)) as {
    version: string;
    channel: string;
    commit: string;
    manifest: { sha256: string; bytes: number };
    tarball: { sha256: string; bytes: number };
    signing?: { keyId?: unknown };
  };
  // Before anything is created or uploaded: a release is immutable once published.
  const keyId = statement.signing?.keyId;
  if (typeof keyId !== "string") throw new Error("release-statement.json names no signing key");
  verifySignature(statementBytes, readFileSync(sig.file), keyId, publicKeys);
  for (const [a, want] of [
    [manifest, statement.manifest],
    [tarball, statement.tarball],
  ] as const)
    if (a.sha256 !== want?.sha256 || a.bytes !== want.bytes)
      throw new Error(`${a.name} is not the file the statement signs`);
  return { statement, assets };
}

/** The commit the remote tag names (peeled), or null. */
function remoteTagCommit(tag: string): string | null {
  const out = sh(
    "git",
    ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    true,
  );
  const lines = out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t") as [string, string]);
  const peeled = lines.find(([, ref]) => ref.endsWith("^{}"));
  return (peeled ?? lines[0])?.[0] ?? null;
}

async function npmPublish(pkgs: readonly Pkg[], publishes: readonly NpmPublish[], dryRun: boolean) {
  const tarballs = mkdtempSync(path.join(os.tmpdir(), "cloudhal-release-"));
  // Builds, packs and installs every package from scratch with npm; fails the release on error.
  sh(process.execPath, ["scripts/smoke-pack.ts", "--tarballs", tarballs]);
  const files = readdirSync(tarballs);
  for (const { name, flags } of publishes) {
    const p = pkgs.find((x) => x.name === name);
    if (!p) throw new Error(`${name} is not a package of the fixed group`);
    const tgz = `${p.name.replace("@", "").replace("/", "-")}-${p.version}.tgz`;
    if (!files.includes(tgz)) throw new Error(`no tarball ${tgz} in ${tarballs}`);
    if (flags.includes("--force"))
      console.log(`publish-ci: npm has ${name}@${p.version}; --force skips that check only`);
    sh("npm", ["publish", path.join(tarballs, tgz), ...flags]);
  }
  if (dryRun) return;
  for (let i = 0; i < 30 && (await unpublished(pkgs, onNpm)).length; i++)
    await new Promise((r) => setTimeout(r, 10_000));
  // `npm publish` succeeded for each, so the registry has them; it can take longer than five
  // minutes to serve one (0.3.8, 0.3.10). That must not keep the release back.
  const left = await unpublished(pkgs, onNpm);
  if (left.length)
    console.warn(
      `npm does not serve yet: ${left.map((p) => p.name).join(", ")}; publishing anyway`,
    );
}

function releasesOf(tag: string): ReleaseView[] {
  const pages = JSON.parse(
    sh("gh", ["api", "--paginate", "--slurp", `repos/${REPO}/releases?per_page=100`], true),
  ) as { tag_name: string; draft: boolean; prerelease: boolean; assets: RemoteAssetJson[] }[][];
  return pages
    .flat()
    .filter((r) => r.tag_name === tag)
    .map((r) => ({
      draft: r.draft,
      prerelease: r.prerelease,
      assets: r.assets.map((a) => ({ name: a.name, digest: a.digest ?? null, size: a.size })),
    }));
}
interface RemoteAssetJson {
  name: string;
  digest?: string | null;
  size: number;
}

function githubPort(pkgs: readonly Pkg[], version: string, dryRun: boolean): PublishPort {
  return {
    pushTag(tag, commit) {
      if (!sh("git", ["tag", "--list", tag], true).trim())
        sh("git", [...BOT, "tag", "-a", tag, commit, "-m", `Cloudhal ${version}`]);
      sh("gh", ["auth", "setup-git"]); // the checkout keeps no credentials
      sh("git", ["push", "origin", `refs/tags/${tag}`]);
    },
    releases: releasesOf,
    createDraft(tag, o) {
      const changelogs = pkgs.map((p) =>
        readFileSync(path.join(ROOT, "packages", p.dir, "CHANGELOG.md"), "utf8"),
      );
      const notes = path.join(os.tmpdir(), `cloudhal-${tag}-notes.md`);
      writeFileSync(notes, releaseNotes(changelogs, version));
      const title = dryRun
        ? `Cloudhal ${version} (dry run, deleted after the run)`
        : `Cloudhal ${version}`;
      sh("gh", [
        "release",
        "create",
        tag,
        "--draft",
        "--latest=false",
        "--title",
        title,
        "--notes-file",
        notes,
        ...(o.prerelease ? ["--prerelease"] : []),
        ...(o.target ? ["--target", o.target] : ["--verify-tag"]),
      ]);
    },
    upload: (tag, assets) =>
      sh("gh", ["release", "upload", tag, ...assets.map((a) => a.file), "--clobber"]),
    deleteAsset: (tag, name) => sh("gh", ["release", "delete-asset", tag, name, "--yes"]),
    npmPublish: (publishes, dry) => npmPublish(pkgs, publishes, dry),
    publishRelease: (tag, o) =>
      sh("gh", [
        "release",
        "edit",
        tag,
        "--draft=false",
        o.latest ? "--latest" : "--latest=false",
        o.prerelease ? "--prerelease" : "--prerelease=false",
      ]),
    deleteRelease: (tag) => sh("gh", ["release", "delete", tag, "--yes"]),
    log: (m) => console.log(`publish-ci: ${m}`),
  };
}

export async function main(argv: readonly string[]): Promise<void> {
  const { values: v } = parseArgs({
    args: [...argv],
    options: {
      plan: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "bundle-dir": { type: "string" },
    },
  });
  const dryRun = v["dry-run"] === true || process.env.RELEASE_DRY_RUN === "true";
  const pkgs = readPackages(ROOT);
  const version = sharedVersion(pkgs);
  const missing = await unpublished(pkgs, onNpm);
  if (v.plan) {
    const changelogs = pkgs.map((p) =>
      readFileSync(path.join(ROOT, "packages", p.dir, "CHANGELOG.md"), "utf8"),
    );
    const security = isSecurityRelease(changelogs, version);
    const out = `publish=${dryRun || missing.length > 0}\nversion=${version}\ndry_run=${dryRun}\nsecurity_release=${security}\n`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
    console.log(missing.length ? `to publish: ${missing.map((p) => p.name).join(", ")}` : out);
    return;
  }
  const runNumber = process.env.GITHUB_RUN_NUMBER;
  const tag = tagFor({ version, dryRun, ...(runNumber ? { runNumber } : {}) });
  const port = githubPort(pkgs, version, dryRun);
  const steps = await runPublish(port, {
    version,
    head: sh("git", ["rev-parse", "HEAD"], true).trim(),
    dryRun,
    ...(runNumber ? { runNumber } : {}),
    bundle: v["bundle-dir"]
      ? loadBundle(
          v["bundle-dir"],
          version,
          publicKeysFor({
            dryRun,
            runId: process.env.GITHUB_RUN_ID,
            dryRunPublicKey: process.env.RELEASE_DRYRUN_PUBLIC_KEY,
          }),
        )
      : null,
    tagCommit: dryRun ? null : remoteTagCommit(tag),
    releases: port.releases(tag),
    packages: pkgs.map((p) => p.name),
    npmMissing: missing.map((p) => p.name),
    tags: sh("git", ["tag", "--list", "v*"], true).split("\n").filter(Boolean),
  });
  console.log(
    steps.length ? `${dryRun ? "dry run of" : "released"} ${tag}` : `${tag}: nothing left to do`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    console.error(`publish-ci: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
