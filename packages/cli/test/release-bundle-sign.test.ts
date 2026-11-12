/**
 * bundle-sign's inline scripts (release.yml, RFC-0046 §5), run as written over a bundle this test
 * builds, with throwaway keys only.
 */
import { execFileSync } from "node:child_process";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildReleaseBundle, writeReleaseBundle } from "../../../scripts/release-bundle/build.ts";
import { readBuildOutput, readDeploySecrets } from "../../../scripts/release-bundle/read-build.ts";
import { COMMIT, facts, fixtureProject } from "./fixtures/release-bundle/fixture.ts";
import { job, RELEASE, runs, step } from "./fixtures/release-bundle/workflow-text.ts";

describe("bundle-sign's inline scripts, run as written", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });
  const script = (name: string) => {
    const s = step(job(RELEASE, "bundle-sign"), name);
    expect(s).toContain("shell: node {0}");
    return runs(s)[0] as string;
  };

  async function workspace(keyId: string): Promise<string> {
    const fx = fixtureProject();
    roots.push(fx.root);
    const out = readBuildOutput({ project: fx.project, studio: fx.studio });
    const b = await buildReleaseBundle(
      out,
      facts({ keyId }),
      readDeploySecrets(path.join(fx.project, ".cloudhal/deploy/secrets.json")),
    );
    const ws = mkdtempSync(path.join(os.tmpdir(), "bundle-sign-"));
    roots.push(ws);
    mkdirSync(path.join(ws, "bundle"));
    writeReleaseBundle(b, path.join(ws, "bundle"));
    for (const name of ["Check the statement", "Sign the statement"])
      writeFileSync(path.join(ws, `${name.split(" ")[0]}.cjs`), script(name));
    return ws;
  }
  const exec = (ws: string, file: string, env: Record<string, string>) => {
    try {
      return {
        ok: true,
        out: execFileSync(process.execPath, [file], {
          cwd: ws,
          env: { PATH: process.env.PATH ?? "", ...env },
          encoding: "utf8",
          stdio: "pipe",
        }),
      };
    } catch (e) {
      return { ok: false, out: String((e as { stderr?: string }).stderr) };
    }
  };

  it("a dry run checks the statement and signs it with a throwaway key: a raw 64-byte signature", async () => {
    const ws = await workspace("dryrun-42");
    const env = {
      VERSION: "0.8.0",
      KEY_ID: "dryrun-42",
      GITHUB_SHA: COMMIT,
      DRY_RUN: "true",
      GITHUB_RUN_ID: "42",
      SECURITY_RELEASE: "false",
    };
    expect(exec(ws, "Check.cjs", env)).toMatchObject({ ok: true });
    const output = path.join(ws, "github-output");
    writeFileSync(output, "");
    const r = exec(ws, "Sign.cjs", { ...env, GITHUB_OUTPUT: output });
    expect(r.ok).toBe(true);
    const sig = readFileSync(path.join(ws, "bundle/release-statement.sig"));
    expect(sig.length).toBe(64);
    const raw = /public key ([A-Za-z0-9+/=]+)\)/.exec(r.out)?.[1] as string;
    // The public half reaches publish-ci (job output); nothing else is written there.
    expect(readFileSync(output, "utf8")).toBe(`public_key=${raw}\n`);
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(raw, "base64"),
      ]),
      format: "der",
      type: "spki",
    });
    expect(
      verify(null, readFileSync(path.join(ws, "bundle/release-statement.json")), key, sig),
    ).toBe(true);
  });

  it("refuses a statement for another commit or version, and a tampered tarball", async () => {
    const ws = await workspace("dryrun-42");
    const env = {
      VERSION: "0.8.0",
      KEY_ID: "dryrun-42",
      GITHUB_SHA: COMMIT,
      DRY_RUN: "true",
      GITHUB_RUN_ID: "42",
      SECURITY_RELEASE: "false",
    };
    expect(exec(ws, "Check.cjs", { ...env, GITHUB_SHA: "f".repeat(40) }).out).toContain(
      "not for this commit",
    );
    expect(exec(ws, "Check.cjs", { ...env, VERSION: "0.8.1" }).out).toContain(
      "not for the planned version",
    );
    expect(exec(ws, "Check.cjs", { ...env, KEY_ID: "dryrun-43" }).out).toContain(
      "does not name the signing key",
    );
    expect(exec(ws, "Check.cjs", { ...env, SECURITY_RELEASE: "true" }).out).toContain(
      "securityRelease is not the planned one",
    );
    writeFileSync(path.join(ws, "bundle/cloudhal-release-0.8.0.tar.gz"), "tampered");
    expect(exec(ws, "Check.cjs", env).out).toContain("is not the file the statement pins");
  });

  it("outside a dry run, refuses any key but the pinned one and never prints the key", async () => {
    const ws = await workspace("cloudhal-release-2026a");
    const pem = generateKeyPairSync("ed25519")
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString();
    const env = {
      VERSION: "0.8.0",
      KEY_ID: "cloudhal-release-2026a",
      GITHUB_SHA: COMMIT,
      DRY_RUN: "false",
      SECURITY_RELEASE: "false",
    };
    const wrong = exec(ws, "Sign.cjs", { ...env, RELEASE_SIGNING_KEY: pem });
    expect(wrong).toMatchObject({ ok: false });
    expect(wrong.out).toContain("the signing key is not cloudhal-release-2026a");
    expect(wrong.out).not.toContain("PRIVATE KEY");
    const missing = exec(ws, "Sign.cjs", env);
    expect(missing.out).toContain("RELEASE_SIGNING_KEY is missing or not a PKCS#8 PEM key");
    const garbage = exec(ws, "Sign.cjs", {
      ...env,
      RELEASE_SIGNING_KEY: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----",
    });
    expect(garbage.out).toBe(
      "bundle-sign: RELEASE_SIGNING_KEY is missing or not a PKCS#8 PEM key\n",
    );
  });
});
