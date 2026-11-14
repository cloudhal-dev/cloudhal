/**
 * The second factor (RFC-0046 §2, §9, §11a): the GitHub build-provenance attestation of a
 * release's files, checked with `gh attestation verify`. Node only (it runs `gh`).
 *
 * - `unavailable` (nothing verified): `gh` is missing, older than 2.68.0 (the first release with
 *   `--source-ref` and `--source-digest`), lacks one of the flags below in its `--help`, or is not
 *   signed in. Callers decide what that means; the CLI refuses unless told to rely on one factor.
 * - `failed`: any non-zero exit, a signal, or no exit within the timeout. Always a refusal.
 * - `verified`: all three files (tarball, manifest, statement) verified.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { MANIFEST_FILE, STATEMENT_FILE, sigstoreName, tarballName } from "./limits.ts";
import { RELEASE_REPOSITORY, releaseAssetNames } from "./urls.ts";

export const MIN_GH_VERSION = "2.68.0";
export const SIGNER_WORKFLOW = `${RELEASE_REPOSITORY}/.github/workflows/bundle-build.yml`;
/** Every flag the verify call passes; the probe requires each in `gh attestation verify --help`. */
export const ATTESTATION_FLAGS = [
  "--repo",
  "--signer-workflow",
  "--source-ref",
  "--source-digest",
  "--deny-self-hosted-runners",
  "--bundle",
] as const;

export type AttestationResult =
  | { readonly status: "verified" }
  | { readonly status: "failed"; readonly file: string; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

export interface RunResult {
  readonly code: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export type Runner = (
  cmd: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<RunResult>;

export interface AttestationOptions {
  /** The directory holding the downloaded assets. */
  readonly dir: string;
  readonly version: string;
  /** The verified statement's `commit` (40 hex), pinned with `--source-digest`. */
  readonly commit: string;
  readonly timeoutMs?: number;
  /** For tests: how commands run (default: spawn, no shell). */
  readonly run?: Runner;
}

/** The argument vector of the verify call for `file` (exact flags of §11a). */
export function attestationArgs(file: string, commit: string, bundle?: string): string[] {
  return [
    "attestation",
    "verify",
    file,
    "--repo",
    RELEASE_REPOSITORY,
    "--signer-workflow",
    SIGNER_WORKFLOW,
    "--source-ref",
    "refs/heads/main",
    "--source-digest",
    commit,
    "--deny-self-hosted-runners",
    ...(bundle ? ["--bundle", bundle] : []),
  ];
}

/** `a.b.c` ≥ `min`, comparing the numeric parts. */
export function versionAtLeast(version: string, min: string): boolean {
  const a = version.split(".").map((x) => Number.parseInt(x, 10));
  const b = min.split(".").map((x) => Number.parseInt(x, 10));
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Number.isNaN(x)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

/** The version `gh --version` prints first (`gh version 2.102.0 (2026-09-30)`). */
export function ghVersionOf(stdout: string): string | undefined {
  const first = stdout.split("\n", 1)[0] ?? "";
  const words = first.trim().split(" ");
  return words[0] === "gh" && words[1] === "version" ? words[2] : undefined;
}

const ok = (r: RunResult) => r.code === 0 && r.signal === null && !r.timedOut;

async function probe(run: Runner, timeoutMs: number): Promise<string | undefined> {
  const need = `gh ${MIN_GH_VERSION} or newer, signed in (gh auth login)`;
  const v = await run("gh", ["--version"], timeoutMs).catch(() => undefined);
  if (!v || !ok(v)) return `gh is not installed: install ${need}`;
  const version = ghVersionOf(v.stdout);
  if (!version || !versionAtLeast(version, MIN_GH_VERSION))
    return `gh ${version ?? "(unknown version)"} is too old: install ${need}`;
  const help = await run("gh", ["attestation", "verify", "--help"], timeoutMs).catch(
    () => undefined,
  );
  const text = help ? `${help.stdout}\n${help.stderr}` : "";
  const lacking = ATTESTATION_FLAGS.filter((f) => !text.includes(f));
  if (!help || !ok(help) || lacking.length)
    return `gh ${version} lacks gh attestation verify ${lacking.join(" ")}: install ${need}`;
  const auth = await run("gh", ["auth", "status"], timeoutMs).catch(() => undefined);
  if (!auth || !ok(auth)) return `gh is not signed in: run gh auth login`;
  return undefined;
}

/** Verifies the attestation of the tarball, the manifest and the statement in `o.dir`. */
export async function verifyAttestation(o: AttestationOptions): Promise<AttestationResult> {
  releaseAssetNames(o.version); // refuses a malformed version before anything runs
  if (o.commit.length !== 40 || [...o.commit].some((c) => !"0123456789abcdef".includes(c)))
    throw new TypeError("commit must be 40 lowercase hex characters");
  const run = o.run ?? spawnRunner;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const why = await probe(run, timeoutMs);
  if (why) return { status: "unavailable", reason: why };
  const bundle = path.join(o.dir, sigstoreName(o.version));
  const withBundle = existsSync(bundle) ? bundle : undefined;
  for (const name of [tarballName(o.version), MANIFEST_FILE, STATEMENT_FILE]) {
    const file = path.join(o.dir, name);
    const r = await run("gh", attestationArgs(file, o.commit, withBundle), timeoutMs).catch(
      (e: Error): RunResult => ({
        code: null,
        signal: null,
        timedOut: false,
        stdout: "",
        stderr: e.message,
      }),
    );
    if (!ok(r)) {
      const reason = r.timedOut
        ? `no answer within ${timeoutMs / 1000} s`
        : r.signal
          ? `stopped by ${r.signal}`
          : (r.stderr.trim().split("\n").pop() ?? `exit ${r.code}`);
      return { status: "failed", file: name, reason };
    }
  }
  return { status: "verified" };
}

/** Runs `cmd` without a shell; never throws for a non-zero exit. */
export const spawnRunner: Runner = (cmd, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
