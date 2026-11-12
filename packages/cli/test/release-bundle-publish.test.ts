/** `scripts/publish-ci.ts` reads and checks the signed bundle it uploads (RFC-0046 §6 step 3). */
import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBundle, publicKeysFor, RELEASE_KEY } from "../../../scripts/publish-ci.ts";
import { buildReleaseBundle, writeReleaseBundle } from "../../../scripts/release-bundle/build.ts";
import { readBuildOutput, readDeploySecrets } from "../../../scripts/release-bundle/read-build.ts";
import { releaseAssetNames } from "../../../scripts/release-bundle/statement.ts";
import { COMMIT, facts, fixtureProject } from "./fixtures/release-bundle/fixture.ts";

const NAMES = releaseAssetNames("0.8.0");
const KEY_ID = "dryrun-42";

/** A throwaway Ed25519 key per run, and its raw public key in base64. */
function throwawayKey(): { privateKey: KeyObject; raw: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const raw = btoa(String.fromCharCode(...spki.subarray(12)));
  return { privateKey, raw };
}

describe("publish-ci loadBundle", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  /** A bundle signed as bundle-sign signs it, with `key`. */
  async function signedDir(key: KeyObject, keyId = KEY_ID): Promise<string> {
    const fx = fixtureProject();
    roots.push(fx.root);
    const out = readBuildOutput({ project: fx.project, studio: fx.studio });
    const secrets = readDeploySecrets(path.join(fx.project, ".cloudhal/deploy/secrets.json"));
    const b = await buildReleaseBundle(out, facts({ keyId }), secrets);
    const dir = path.join(fx.root, "signed");
    writeReleaseBundle(b, dir);
    const statement = readFileSync(path.join(dir, "release-statement.json"));
    writeFileSync(path.join(dir, "release-statement.sig"), sign(null, statement, key));
    writeFileSync(path.join(dir, "cloudhal-release-0.8.0.sigstore.json"), "{}\n");
    return dir;
  }

  it("reads the five assets in upload order with their digests, and the statement", async () => {
    const k = throwawayKey();
    const dir = await signedDir(k.privateKey);
    const b = loadBundle(dir, "0.8.0", { [KEY_ID]: k.raw });
    expect(b.assets.map((a) => a.name)).toEqual(NAMES);
    expect(b.statement).toMatchObject({ version: "0.8.0", channel: "stable", commit: COMMIT });
    const manifest = readFileSync(path.join(dir, "manifest.json"));
    expect(b.assets[1]).toMatchObject({
      sha256: createHash("sha256").update(manifest).digest("hex"),
      bytes: manifest.length,
    });
  });

  it("refuses a signature by another key, over other bytes, or for an unpinned key id", async () => {
    const k = throwawayKey();
    const dir = await signedDir(k.privateKey);
    expect(() => loadBundle(dir, "0.8.0", { [KEY_ID]: throwawayKey().raw })).toThrow(
      /release-statement\.sig does not verify with dryrun-42/,
    );
    expect(() => loadBundle(dir, "0.8.0", { "dryrun-43": k.raw })).toThrow(
      /no pinned public key for dryrun-42/,
    );
    // The release key pin never accepts a dry-run statement.
    expect(() => loadBundle(dir, "0.8.0", RELEASE_KEY)).toThrow(/no pinned public key/);
    const file = path.join(dir, "release-statement.json");
    writeFileSync(file, readFileSync(file, "utf8").replace('"stable"', '"stable" '));
    expect(() => loadBundle(dir, "0.8.0", { [KEY_ID]: k.raw })).toThrow(/does not verify/);
  });

  it("refuses a manifest the statement does not pin, a short signature and a missing file", async () => {
    const k = throwawayKey();
    const dir = await signedDir(k.privateKey);
    const keys = { [KEY_ID]: k.raw };
    const sig = readFileSync(path.join(dir, "release-statement.sig"));
    writeFileSync(path.join(dir, "release-statement.sig"), sig.subarray(0, 63));
    expect(() => loadBundle(dir, "0.8.0", keys)).toThrow(/not a 64-byte signature/);
    writeFileSync(path.join(dir, "release-statement.sig"), sig);
    writeFileSync(path.join(dir, "manifest.json"), "{}\n");
    expect(() => loadBundle(dir, "0.8.0", keys)).toThrow(
      /manifest\.json is not the file the statement signs/,
    );
    expect(() => loadBundle(dir, "0.8.1", keys)).toThrow(/ENOENT/);
  });
});

describe("publish-ci publicKeysFor", () => {
  it("pins the release key outside a dry run, whatever the environment says", () => {
    expect(publicKeysFor({ dryRun: false, runId: "42", dryRunPublicKey: "x" })).toEqual({
      "cloudhal-release-2026a": "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=",
    });
  });

  it("a dry run accepts only its own dryrun-<run id> key and needs it", () => {
    const k = throwawayKey();
    expect(publicKeysFor({ dryRun: true, runId: "42", dryRunPublicKey: k.raw })).toEqual({
      "dryrun-42": k.raw,
    });
    expect(() => publicKeysFor({ dryRun: true, runId: "42" })).toThrow(/RELEASE_DRYRUN_PUBLIC_KEY/);
    expect(() => publicKeysFor({ dryRun: true, dryRunPublicKey: k.raw })).toThrow(/GITHUB_RUN_ID/);
  });
});
