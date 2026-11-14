/**
 * scripts/release-keys.ts (RFC-0046 §9, #226): the root and yank keys a ceremony makes, and the
 * lists it signs, checked with the consumer's own verifier. Throwaway keys in temp directories only.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkAppendOnly,
  main,
  type PublicKeyFile,
  rootInit,
  signKeys,
  signYanked,
  yankInit,
} from "../../../scripts/release-keys.ts";
import { verifyKeys, verifyYanked } from "../../release-verify/src/index.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), "release-keys-"));
  dirs.push(d);
  return d;
};
const PASS = "correct horse battery staple";
// The CLI signs with the real clock, so every window here is relative to it.
const NOW = Math.floor(Date.now() / 1000) * 1000;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const DAY = 86_400_000;
const inMonths = (ms: number, months: number) => {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
};
const quiet = () => {};

function ceremony() {
  const dir = tmp();
  const lines: string[] = [];
  const log = (l: string) => lines.push(l);
  const root = rootInit({ keyId: "cloudhal-root-2026a", out: dir, passphrase: PASS, log });
  const yank = yankInit({ keyId: "cloudhal-yank-2026a", out: dir, log });
  const source = {
    keys: [
      {
        keyId: "cloudhal-release-2026a",
        publicKey: "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=",
        role: "release",
        notBefore: iso(NOW - 30 * DAY),
        notAfter: iso(NOW + 330 * DAY),
        status: "active",
      },
      {
        keyId: "cloudhal-yank-2026a",
        publicKey: yank.publicKey,
        role: "yank",
        notBefore: iso(NOW - DAY),
        notAfter: iso(NOW + 360 * DAY),
        status: "active",
      },
    ],
  };
  return { dir, root, yank, source, lines };
}
const rootKeyOf = (dir: string) =>
  readFileSync(path.join(dir, "cloudhal-root-2026a.key.enc"), "utf8");
const roots = (root: PublicKeyFile) => ({ [root.keyId]: { publicKey: root.publicKey } });

describe("root-init and yank-init", () => {
  it("write the private keys encrypted or 0600, the public keys in JSON, and print no secret", () => {
    const { dir, root, yank, lines } = ceremony();
    const enc = rootKeyOf(dir);
    expect(enc).toContain("BEGIN ENCRYPTED PRIVATE KEY");
    expect(statSync(path.join(dir, "cloudhal-root-2026a.key.enc")).mode & 0o777).toBe(0o600);
    const pem = readFileSync(path.join(dir, "cloudhal-yank-2026a.pem"), "utf8");
    expect(statSync(path.join(dir, "cloudhal-yank-2026a.pem")).mode & 0o777).toBe(0o600);
    expect(
      JSON.parse(readFileSync(path.join(dir, "cloudhal-root-2026a.pub.json"), "utf8")),
    ).toEqual(root);
    const said = lines.join("\n");
    expect(said).toContain(root.publicKey);
    expect(said).toContain(yank.publicKey);
    expect(said).not.toContain("PRIVATE KEY");
    expect(said).not.toContain(pem.split("\n")[1] as string);
  });

  it("refuse to overwrite a key, a short passphrase and a key id without its role", () => {
    const { dir } = ceremony();
    expect(() => yankInit({ keyId: "cloudhal-yank-2026a", out: dir, log: quiet })).toThrow(
      /exists/,
    );
    expect(() =>
      rootInit({ keyId: "cloudhal-root-2026b", out: dir, passphrase: "short", log: quiet }),
    ).toThrow(/at least 12/);
    expect(() => yankInit({ keyId: "cloudhal-release-2026b", out: dir, log: quiet })).toThrow(
      /names its role/,
    );
  });
});

describe("sign-keys", () => {
  it("signs a key list the consumer verifies, valid for 12 months", async () => {
    const { dir, root, source } = ceremony();
    const out = tmp();
    const signed = signKeys({
      rootKey: rootKeyOf(dir),
      passphrase: PASS,
      rootPub: root,
      source,
      out,
      now: NOW,
    });
    const list = await verifyKeys({ ...signed, roots: roots(root), now: new Date(NOW) });
    expect(list.document.issuedAt).toBe(iso(NOW));
    expect(list.document.expires).toBe(iso(inMonths(NOW, 12)));
    expect(readFileSync(path.join(out, "keys.json.sig")).length).toBe(64);
  });

  it("refuses a wrong passphrase, another root's key, and more than 13 months", () => {
    const { dir, root, source } = ceremony();
    const out = tmp();
    const base = {
      rootKey: rootKeyOf(dir),
      passphrase: PASS,
      rootPub: root,
      source,
      out,
      now: NOW,
    };
    expect(() => signKeys({ ...base, passphrase: "wrong passphrase!" })).toThrow(/does not open/);
    const other = ceremony();
    expect(() => signKeys({ ...base, rootPub: other.root })).toThrow(/is not cloudhal-root-2026a/);
    expect(() => signKeys({ ...base, months: 14 })).toThrow(/1 to 13 months/);
  });
});

describe("sign-yanked", () => {
  async function setup() {
    const c = ceremony();
    const keysOut = tmp();
    const signedKeys = signKeys({
      rootKey: rootKeyOf(c.dir),
      passphrase: PASS,
      rootPub: c.root,
      source: c.source,
      out: keysOut,
      now: NOW,
    });
    const keys = await verifyKeys({ ...signedKeys, roots: roots(c.root), now: new Date(NOW) });
    const pem = readFileSync(path.join(c.dir, "cloudhal-yank-2026a.pem"), "utf8");
    return { ...c, keys, pem, keysDoc: keys.document };
  }
  const empty = { versions: [], revokedKeys: [] };

  it("signs a yank list the consumer verifies, expiring in exactly 30 days", async () => {
    const s = await setup();
    const source = {
      versions: [
        { version: "0.9.3", yankedAt: "2026-11-19T00:00:00Z", reason: "Broken migration." },
      ],
      revokedKeys: [],
    };
    const signed = signYanked({
      keyId: "cloudhal-yank-2026a",
      keyPem: s.pem,
      keys: s.keysDoc,
      source,
      published: undefined,
      out: tmp(),
      now: NOW,
    });
    const list = await verifyYanked({ ...signed, keys: s.keys, now: new Date(NOW) });
    expect(list.document.versions.map((v) => v.version)).toEqual(["0.9.3"]);
    expect(Date.parse(list.document.expires) - Date.parse(list.document.issuedAt)).toBe(
      30 * 86_400_000,
    );
  });

  it("refuses a key that is not keys.json's active yank key", async () => {
    const s = await setup();
    const otherDir = tmp();
    const other = yankInit({ keyId: "cloudhal-yank-2026b", out: otherDir, log: quiet });
    const otherPem = readFileSync(path.join(otherDir, "cloudhal-yank-2026b.pem"), "utf8");
    const base = {
      keyId: "cloudhal-yank-2026a",
      keyPem: s.pem,
      keys: s.keysDoc,
      source: empty,
      published: undefined,
      out: tmp(),
      now: NOW,
    };
    expect(other.keyId).toBe("cloudhal-yank-2026b");
    expect(() => signYanked({ ...base, keyPem: otherPem })).toThrow(/is not cloudhal-yank-2026a/);
    expect(() => signYanked({ ...base, keyPem: "" })).toThrow(/missing or not a PKCS#8/);
    const revoked = {
      keys: s.keysDoc.keys.map((k) => (k.role === "yank" ? { ...k, status: "revoked" } : k)),
    };
    expect(() => signYanked({ ...base, keys: revoked })).toThrow(
      /not list cloudhal-yank-2026a as an active yank key/,
    );
  });

  it("is append-only: refuses a list that drops a published yank or revocation", () => {
    const published = {
      versions: [{ version: "0.9.3", yankedAt: "2026-11-19T00:00:00Z", reason: "x" }],
      revokedKeys: [
        { keyId: "cloudhal-release-2025a", revokedAt: "2026-11-19T00:00:00Z", reason: "x" },
      ],
    };
    expect(() => checkAppendOnly(empty, published)).toThrow(/drops 0.9.3/);
    expect(() => checkAppendOnly({ ...published, revokedKeys: [] }, published)).toThrow(
      /drops the revoked key cloudhal-release-2025a/,
    );
    expect(() => checkAppendOnly(published, published)).not.toThrow();
    expect(() => checkAppendOnly(empty, undefined)).not.toThrow();
  });

  it("numbers each list one above the published one (rollback protection)", async () => {
    const s = await setup();
    const base = {
      keyId: "cloudhal-yank-2026a",
      keyPem: s.pem,
      keys: s.keysDoc,
      source: empty,
      out: tmp(),
      now: NOW,
    };
    const first = signYanked({ ...base, published: undefined });
    const firstDoc = JSON.parse(new TextDecoder().decode(first.document));
    expect(firstDoc.serial).toBe(1);
    const next = signYanked({ ...base, published: firstDoc });
    expect(JSON.parse(new TextDecoder().decode(next.document)).serial).toBe(2);
    expect(() => signYanked({ ...base, published: { ...empty } as never })).toThrow(/no serial/);
  });

  it("the CLI reads the key from RELEASE_YANK_KEY, never prints it, and needs --published or --first-run", async () => {
    const s = await setup();
    const work = tmp();
    const keysFile = path.join(work, "keys.json");
    writeFileSync(keysFile, JSON.stringify(s.keysDoc));
    const listFile = path.join(work, "yank-list.json");
    writeFileSync(listFile, JSON.stringify(empty));
    const out = path.join(work, "out");
    const args = [
      "sign-yanked",
      "--key-id",
      "cloudhal-yank-2026a",
      "--keys",
      keysFile,
      "--list",
      listFile,
      "--out",
      out,
    ];
    process.env.RELEASE_YANK_KEY = s.pem;
    await expect(main(args, quiet)).rejects.toThrow(/--published is required/);
    process.env.RELEASE_YANK_KEY = s.pem;
    const lines: string[] = [];
    await main([...args, "--first-run"], (l) => lines.push(l));
    expect(process.env.RELEASE_YANK_KEY).toBeUndefined();
    expect(lines.join("\n")).not.toContain("PRIVATE KEY");
    expect(readFileSync(path.join(out, "yanked.json.sig")).length).toBe(64);
  });
});
