/**
 * scripts/release-trust-assets.ts (RFC-0046 §1, §9): the key list and yank list a release
 * attaches, verified first; nothing before the root ceremony; a published release keeps its own.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rootInit, signKeys, signYanked, yankInit } from "../../../scripts/release-keys.ts";
import { trustAssets } from "../../../scripts/release-trust-assets.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "trust-assets-"));
  dirs.push(d);
  return d;
};
const NOW = Math.floor(Date.now() / 1000) * 1000;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const quiet = () => {};

/** A repo root with a signed security/keys.json, and the matching signed yank list bytes. */
async function repo() {
  const keysDir = tmp();
  const root = rootInit({
    keyId: "cloudhal-root-2026a",
    out: keysDir,
    passphrase: "a long passphrase",
    log: quiet,
  });
  const yank = yankInit({ keyId: "cloudhal-yank-2026a", out: keysDir, log: quiet });
  const repoRoot = tmp();
  mkdirSync(path.join(repoRoot, "security"));
  const keyList = {
    keys: [
      {
        keyId: "cloudhal-yank-2026a",
        publicKey: yank.publicKey,
        role: "yank",
        notBefore: iso(NOW - 86_400_000),
        notAfter: iso(NOW + 300 * 86_400_000),
        status: "active",
      },
    ],
  };
  const signedKeys = await signKeys({
    rootKey: readFileSync(path.join(keysDir, "cloudhal-root-2026a.key.enc"), "utf8"),
    passphrase: "a long passphrase",
    rootPub: root,
    source: keyList,
    out: path.join(repoRoot, "security"),
    now: NOW,
  });
  const roots = { [root.keyId]: { publicKey: root.publicKey } };
  const yanked = await signYanked({
    keyId: "cloudhal-yank-2026a",
    keyPem: readFileSync(path.join(keysDir, "cloudhal-yank-2026a.pem"), "utf8"),
    keyList: signedKeys,
    roots,
    source: { versions: [], revokedKeys: [] },
    published: undefined,
    out: tmp(),
    now: NOW,
  });
  return { repoRoot, roots, yanked };
}

const serve = (y: { document: Uint8Array; signature: Uint8Array }) => async (url: string) =>
  url.endsWith("yanked.json")
    ? new Response(y.document)
    : url.endsWith("yanked.json.sig")
      ? new Response(y.signature)
      : new Response("no", { status: 404 });

describe("trustAssets", () => {
  it("attaches nothing before the root ceremony (no security/keys.json)", async () => {
    expect(await trustAssets({ root: tmp(), release: null, log: quiet })).toEqual({ assets: [] });
  });

  it("attaches the verified key list and the verified yank list from cloudhal.dev", async () => {
    const r = await repo();
    const { assets, yanked } = await trustAssets({
      root: r.repoRoot,
      release: null,
      roots: r.roots,
      fetchImpl: serve(r.yanked),
      now: new Date(NOW),
      log: quiet,
    });
    expect(assets.map((a) => a.name)).toEqual([
      "keys.json",
      "keys.json.sig",
      "yanked.json",
      "yanked.json.sig",
    ]);
    expect(assets.every((a) => a.sha256.length === 64 && a.bytes > 0)).toBe(true);
    expect(readFileSync((assets[2] as { file: string }).file)).toEqual(
      Buffer.from(r.yanked.document),
    );
    // The verified yank list, for the consumer check of the bundle.
    expect((yanked as { document: { serial: number } }).document.serial).toBe(1);
  });

  it("refuses an unverifiable key list or yank list, and an unreachable one", async () => {
    const r = await repo();
    const base = { root: r.repoRoot, release: null, now: new Date(NOW), log: quiet };
    // Pinned roots (none yet) do not sign this list.
    await expect(trustAssets({ ...base, fetchImpl: serve(r.yanked) })).rejects.toMatchObject({
      code: "key-list-invalid",
    });
    const bad = { document: r.yanked.document, signature: new Uint8Array(64) };
    await expect(
      trustAssets({ ...base, roots: r.roots, fetchImpl: serve(bad) }),
    ).rejects.toMatchObject({
      code: "yank-list-invalid",
    });
    const down = async () => new Response("down", { status: 503 });
    await expect(trustAssets({ ...base, roots: r.roots, fetchImpl: down })).rejects.toThrow(/503/);
  });

  it("a published release keeps the trust assets it carries (never refetched)", async () => {
    let fetched = 0;
    const { assets } = await trustAssets({
      root: tmp(),
      release: {
        draft: false,
        prerelease: false,
        assets: [
          { name: "manifest.json", digest: "sha256:aa", size: 1 },
          { name: "keys.json", digest: `sha256:${"b".repeat(64)}`, size: 10 },
          { name: "yanked.json", digest: `sha256:${"c".repeat(64)}`, size: 20 },
        ],
      },
      fetchImpl: async () => {
        fetched++;
        return new Response("");
      },
      log: quiet,
    });
    expect(fetched).toBe(0);
    expect(assets).toEqual([
      { name: "keys.json", file: "", bytes: 10, sha256: "b".repeat(64) },
      { name: "yanked.json", file: "", bytes: 20, sha256: "c".repeat(64) },
    ]);
  });
});
