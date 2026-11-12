/**
 * Release bundles (RFC-0046): the standard theme's built site and admin Workers as one
 * deterministic tarball, its `manifest.json` and the unsigned `release-statement.json`.
 *
 *   node scripts/release-bundle.ts build --version <X.Y.Z[-pre]> --project <dir> --studio <dir>
 *     --migrations-dir <dir> --commit <sha40> --key-id <id> --out <dir> [--security-release]
 *   node scripts/release-bundle.ts verify --dir <dir> --version <X.Y.Z[-pre]> [--channel stable|next]
 *     [--public-key <keyId>=<base64 raw Ed25519 key>]   # with a key, release-statement.sig must verify
 *
 * `build` reads what `cloudhal deploy --dry-run` left in `--project` (scripts/release-bundle/
 * read-build.ts), takes `createdAt` from the commit's committer time (whole seconds, UTC), refuses a
 * part that contains a value of the project's `.cloudhal/deploy/secrets.json`, validates both
 * documents and verifies its own output before it writes anything. Two builds of the same build
 * output and commit are byte-identical. It never signs: `release.yml`'s `bundle-sign` job does.
 * It prints names, sizes, SHA-256 and the key id, never key material or a secret.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildReleaseBundle, writeReleaseBundle } from "./release-bundle/build.ts";
import { sha256 } from "./release-bundle/manifest.ts";
import { migrationNames, readBuildOutput, readDeploySecrets } from "./release-bundle/read-build.ts";
import { verifyBundle } from "./release-bundle/verify.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$/;

const USAGE = `usage:
  node scripts/release-bundle.ts build --version <v> --project <dir> --studio <dir>
    --migrations-dir <dir> --commit <sha40> --key-id <id> --out <dir> [--security-release]
  node scripts/release-bundle.ts verify --dir <dir> --version <v> [--channel stable|next]
    [--public-key <keyId>=<base64>]`;

const OPTIONS = {
  version: { type: "string" },
  project: { type: "string" },
  studio: { type: "string" },
  "migrations-dir": { type: "string" },
  commit: { type: "string" },
  "key-id": { type: "string" },
  out: { type: "string" },
  dir: { type: "string" },
  channel: { type: "string" },
  "public-key": { type: "string" },
  "security-release": { type: "boolean" },
  help: { type: "boolean" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];

/** The committer time of `commit`, as whole-second UTC (`2026-11-12T08:00:00Z`). */
export function committedAt(commit: string, repo = ROOT): string {
  let iso: string;
  try {
    iso = execFileSync("git", ["log", "-1", "--format=%cI", commit], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`git does not know the commit ${commit}`);
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`git gave no committer time for ${commit}`);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function versionOf(file: string): string {
  try {
    return String((JSON.parse(readFileSync(file, "utf8")) as { version?: unknown }).version);
  } catch {
    return "unknown";
  }
}

/** `toolchain` entries beyond `producer` and `starter` (RFC-0046 §3). */
export function toolchainOf(project: string): Record<string, string> {
  return {
    node: process.versions.node,
    cli: versionOf(path.join(ROOT, "packages/cli/package.json")),
    astro: versionOf(path.join(project, "node_modules/astro/package.json")),
    wrangler: versionOf(path.join(project, "node_modules/wrangler/package.json")),
  };
}

function need(v: Values, ...names: (keyof Values)[]): void {
  const missing = names.filter((n) => !v[n]);
  if (missing.length) throw new Error(`missing --${missing.join(", --")}\n${USAGE}`);
  if (v.version && !VERSION.test(v.version)) throw new Error(`not a version: ${v.version}`);
}

async function build(v: Values): Promise<void> {
  need(v, "version", "project", "studio", "migrations-dir", "commit", "key-id", "out");
  const project = v.project as string;
  const secretsFile = path.join(project, ".cloudhal/deploy/secrets.json");
  if (!existsSync(secretsFile))
    throw new Error(
      `${secretsFile} is missing: run cloudhal deploy --dry-run in the project first`,
    );
  const commit = v.commit as string;
  const bundle = await buildReleaseBundle(
    readBuildOutput({ project, studio: v.studio as string }),
    {
      version: v.version as string,
      commit,
      createdAt: committedAt(commit),
      keyId: v["key-id"] as string,
      migrations: migrationNames(v["migrations-dir"] as string),
      securityRelease: v["security-release"] ?? false,
      toolchain: toolchainOf(project),
    },
    readDeploySecrets(secretsFile),
  );
  // Self-check in a scratch directory first, so a bad bundle never reaches --out.
  const scratch = mkdtempSync(path.join(os.tmpdir(), "release-bundle-"));
  try {
    writeReleaseBundle(bundle, scratch);
    await verifyBundle(scratch, { version: v.version as string });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  for (const p of writeReleaseBundle(bundle, v.out as string)) {
    const bytes = readFileSync(p);
    console.log(`wrote ${p} (${bytes.length} bytes, sha256 ${sha256(bytes)})`);
  }
  console.log(`${bundle.parts.length} parts; key id ${bundle.statement.signing.keyId}; unsigned`);
}

async function verify(v: Values): Promise<void> {
  need(v, "dir", "version");
  const pk = v["public-key"];
  const eq = pk ? pk.indexOf("=") : -1;
  if (pk && eq < 1) throw new Error("--public-key must be <keyId>=<base64>");
  const r = await verifyBundle(v.dir as string, {
    version: v.version as string,
    ...(v.channel ? { channel: v.channel } : {}),
    ...(pk ? { signed: true, publicKeys: { [pk.slice(0, eq)]: pk.slice(eq + 1) } } : {}),
  });
  const s = r.statement;
  console.log(
    `ok: ${s.version} (${s.channel}) commit ${s.commit}; ${r.parts} parts; tarball ${r.tarballBytes} bytes; ` +
      `${pk ? `signature verified with ${s.signing.keyId}` : "signature not checked"}`,
  );
}

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values } = parseArgs({ args: rest, options: OPTIONS });
  if (values.help || (command !== "build" && command !== "verify")) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  await (command === "build" ? build(values) : verify(values));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (e) {
    console.error(`release-bundle: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
