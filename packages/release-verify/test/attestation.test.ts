/**
 * The attestation subpath (RFC-0046 §11a) with a scripted `gh`: the probe (missing, too old,
 * lacking a flag, signed out → unavailable), the exact verify arguments, `--bundle` when the
 * Sigstore asset is there, and every way a verify call can fail.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTESTATION_FLAGS,
  ghVersionOf,
  MIN_GH_VERSION,
  type Runner,
  type RunResult,
  verifyAttestation,
  versionAtLeast,
} from "../src/attestation.ts";

const COMMIT = "6bfe74a17f3a941e68130bb3e05a866fd9f19df5";
const HELP = `Verify the integrity and provenance of an artifact\n${ATTESTATION_FLAGS.map((f) => `      ${f} string`).join("\n")}\n`;
const okRun = (stdout = ""): RunResult => ({
  code: 0,
  signal: null,
  timedOut: false,
  stdout,
  stderr: "",
});

/** A scripted gh: `answers` by the first two arguments; records every call. */
function gh(answers: Record<string, RunResult | Error> = {}) {
  const calls: string[][] = [];
  const run: Runner = async (cmd, args) => {
    expect(cmd).toBe("gh");
    calls.push([...args]);
    const key = args.slice(0, 2).join(" ");
    const a =
      answers[key] ??
      (key === "--version"
        ? okRun(
            "gh version 2.102.0 (2026-09-30)\nhttps://github.com/cli/cli/releases/tag/v2.102.0\n",
          )
        : key === "attestation verify" && args[2] === "--help"
          ? okRun(HELP)
          : okRun());
    if (a instanceof Error) throw a;
    return a;
  };
  return { run, calls };
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const dir = (withBundle: boolean) => {
  const d = mkdtempSync(path.join(os.tmpdir(), "attest-"));
  dirs.push(d);
  if (withBundle) writeFileSync(path.join(d, "cloudhal-release-0.9.0.sigstore.json"), "{}");
  return d;
};

describe("verifyAttestation", () => {
  it("verifies all three files with the exact flags, and --bundle when the asset is there", async () => {
    const d = dir(true);
    const { run, calls } = gh();
    expect(await verifyAttestation({ dir: d, version: "0.9.0", commit: COMMIT, run })).toEqual({
      status: "verified",
    });
    const verifies = calls.filter((c) => c[0] === "attestation" && c[2] !== "--help");
    expect(verifies.map((c) => path.basename(c[2] as string))).toEqual([
      "cloudhal-release-0.9.0.tar.gz",
      "manifest.json",
      "release-statement.json",
    ]);
    expect(verifies[0]?.slice(3)).toEqual([
      "--repo",
      "cloudhal-dev/cloudhal",
      "--signer-workflow",
      "cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml",
      "--source-ref",
      "refs/heads/main",
      "--source-digest",
      COMMIT,
      "--deny-self-hosted-runners",
      "--bundle",
      path.join(d, "cloudhal-release-0.9.0.sigstore.json"),
    ]);
    const second = gh();
    await verifyAttestation({ dir: dir(false), version: "0.9.0", commit: COMMIT, run: second.run });
    expect(second.calls.some((c) => c.includes("--bundle") && c[2] !== "--help")).toBe(false);
  });

  it("is unavailable, naming the version it needs, when gh is missing, old, lacking or signed out", async () => {
    const cases: Record<string, RunResult | Error>[] = [
      { "--version": new Error("spawn gh ENOENT") },
      { "--version": okRun("gh version 2.45.0 (2024-03-04)\n") },
      { "--version": okRun("gh version 2.67.9 (2025-02-01)\n") },
      { "attestation verify": okRun("--repo --signer-workflow --bundle") },
      {
        "auth status": {
          code: 1,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "not logged in",
        },
      },
    ];
    for (const answers of cases) {
      const { run, calls } = gh(answers);
      const r = await verifyAttestation({ dir: dir(false), version: "0.9.0", commit: COMMIT, run });
      expect(r.status, JSON.stringify(answers)).toBe("unavailable");
      if (!("auth status" in answers))
        expect((r as { reason: string }).reason).toContain(MIN_GH_VERSION);
      expect(calls.some((c) => c[0] === "attestation" && c[2] !== "--help")).toBe(false);
    }
  });

  it("fails on a non-zero exit, a signal or a timeout, naming the file", async () => {
    const verify = (r: RunResult): Record<string, RunResult> => ({ "attestation verify": r });
    const answers = [
      { code: 1, signal: null, timedOut: false, stdout: "", stderr: "x\nno matching attestation" },
      { code: null, signal: "SIGTERM", timedOut: false, stdout: "", stderr: "" },
      { code: null, signal: "SIGKILL", timedOut: true, stdout: "", stderr: "" },
    ];
    const want = ["no matching attestation", "stopped by SIGTERM", "no answer within 60 s"];
    for (const [i, a] of answers.entries()) {
      // The probe's `attestation verify --help` must still pass: answer only the real calls.
      const { run } = gh();
      const failing: Runner = (cmd, args, t) =>
        args[0] !== "attestation" || args[2] === "--help"
          ? run(cmd, args, t)
          : Promise.resolve(verify(a)["attestation verify"] as RunResult);
      const r = await verifyAttestation({
        dir: dir(false),
        version: "0.9.0",
        commit: COMMIT,
        run: failing,
      });
      expect(r).toEqual({
        status: "failed",
        file: "cloudhal-release-0.9.0.tar.gz",
        reason: want[i],
      });
    }
  });

  it("says exit N when gh prints nothing, and passes gh absolute paths only", async () => {
    const { run, calls } = gh();
    const quiet: Runner = (cmd, args, t) =>
      args[0] !== "attestation" || args[2] === "--help"
        ? run(cmd, args, t)
        : Promise.resolve({ code: 3, signal: null, timedOut: false, stdout: "", stderr: "  \n" });
    const rel = path.relative(process.cwd(), dir(false));
    const r = await verifyAttestation({ dir: rel, version: "0.9.0", commit: COMMIT, run: quiet });
    expect(r).toEqual({
      status: "failed",
      file: "cloudhal-release-0.9.0.tar.gz",
      reason: "exit 3",
    });
    const ok = gh();
    await verifyAttestation({ dir: rel, version: "0.9.0", commit: COMMIT, run: ok.run });
    const files = ok.calls
      .filter((c) => c[0] === "attestation" && c[2] !== "--help")
      .map((c) => c[2]);
    expect(files.every((f) => path.isAbsolute(f as string))).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("refuses a malformed version or commit before running anything", async () => {
    const { run, calls } = gh();
    await expect(
      verifyAttestation({ dir: "/x", version: "../1.0.0", commit: COMMIT, run }),
    ).rejects.toThrow(TypeError);
    await expect(
      verifyAttestation({ dir: "/x", version: "0.9.0", commit: "abc", run }),
    ).rejects.toThrow(TypeError);
    await expect(
      verifyAttestation({ dir: "/x", version: "0.9.0", commit: COMMIT.toUpperCase(), run }),
    ).rejects.toThrow(TypeError);
    expect(calls).toEqual([]);
  });
});

describe("gh version parsing", () => {
  it("reads gh's first line and compares numerically", () => {
    expect(ghVersionOf("gh version 2.102.0 (2026-09-30)\nhttps://…")).toBe("2.102.0");
    expect(ghVersionOf("something else")).toBeUndefined();
    expect(versionAtLeast("2.68.0", "2.68.0")).toBe(true);
    expect(versionAtLeast("2.102.0", "2.68.0")).toBe(true);
    expect(versionAtLeast("2.67.10", "2.68.0")).toBe(false);
    expect(versionAtLeast("3.0.0", "2.68.0")).toBe(true);
    expect(versionAtLeast("x.1.2", "2.68.0")).toBe(false);
  });
});
