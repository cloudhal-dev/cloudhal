/**
 * scripts/release-keys.ts (RFC-0046 §9, #226): the root and yank keys a ceremony makes, and the
 * lists it signs, checked with the consumer's own verifier. Throwaway keys in temp directories only.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkAppendOnly,
  main,
  mergeYankList,
  type PublicKeyFile,
  ROOT_KDF_ITERATIONS,
  readPbes2,
  rootInit,
  signKeys,
  signYanked,
  yankInit,
} from "../../../scripts/release-keys.ts";
import {
  validateReleaseKeys,
  validateReleaseYankList,
} from "../../release-verify/src/generated/validators.js";
import {
  PINNED_KEYS,
  rememberYanks,
  verifyKeys,
  verifyYanked,
} from "../../release-verify/src/index.ts";
import { job, RELEASE, step } from "./fixtures/release-bundle/workflow-text.ts";

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

  it("encrypt the root with PBKDF2-HMAC-SHA256 at 600,000 iterations and AES-256-CBC", () => {
    const { dir, root } = ceremony();
    const enc = rootKeyOf(dir);
    expect(ROOT_KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(readPbes2(enc)).toEqual({
      iterations: 600_000,
      saltBytes: 16,
      prf: "hmacWithSHA256",
      cipher: "aes-256-cbc",
    });
    // Node (OpenSSL) opens it with the passphrase, and it is the root that was announced.
    const key = createPrivateKey({ key: enc, passphrase: PASS });
    const raw = createPublicKey(key).export({ format: "der", type: "spki" }).subarray(12);
    expect(Buffer.from(raw).toString("base64")).toBe(root.publicKey);
    expect(() => createPrivateKey({ key: enc, passphrase: "wrong passphrase!" })).toThrow();
    // Each file has its own salt.
    expect(readPbes2(rootKeyOf(ceremony().dir))).toEqual(readPbes2(enc));
    expect(rootKeyOf(ceremony().dir)).not.toBe(enc);
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
    const signed = await signKeys({
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

  it("still opens a root written before the fix (2,048 iterations, Node's default export)", async () => {
    const { source } = ceremony();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const old = privateKey.export({
      format: "pem",
      type: "pkcs8",
      cipher: "aes-256-cbc",
      passphrase: PASS,
    });
    expect(readPbes2(old).iterations).toBe(2048);
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
    const oldRoot = {
      keyId: "cloudhal-root-2026a",
      publicKey: Buffer.from(raw).toString("base64"),
    };
    const signed = await signKeys({
      rootKey: old,
      passphrase: PASS,
      rootPub: oldRoot,
      source,
      out: tmp(),
      now: NOW,
    });
    await verifyKeys({ ...signed, roots: roots(oldRoot), now: new Date(NOW) });
  });

  it("refuses a wrong passphrase, another root's key, and more than 13 months", async () => {
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
    await expect(signKeys({ ...base, passphrase: "wrong passphrase!" })).rejects.toThrow(
      /does not open/,
    );
    const other = ceremony();
    await expect(signKeys({ ...base, rootPub: other.root })).rejects.toThrow(
      /is not cloudhal-root-2026a/,
    );
    await expect(signKeys({ ...base, months: 14 })).rejects.toThrow(/1 to 13 months/);
  });
});

describe("sign-yanked", () => {
  async function setup() {
    const c = ceremony();
    const keysOut = tmp();
    const signedKeys = await signKeys({
      rootKey: rootKeyOf(c.dir),
      passphrase: PASS,
      rootPub: c.root,
      source: c.source,
      out: keysOut,
      now: NOW,
    });
    const keys = await verifyKeys({ ...signedKeys, roots: roots(c.root), now: new Date(NOW) });
    const pem = readFileSync(path.join(c.dir, "cloudhal-yank-2026a.pem"), "utf8");
    return {
      ...c,
      keys,
      pem,
      keysDoc: keys.document,
      keyList: signedKeys,
      keysOut,
      rootsOf: roots(c.root),
    };
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
    const signed = await signYanked({
      keyId: "cloudhal-yank-2026a",
      keyPem: s.pem,
      keyList: s.keyList,
      roots: s.rootsOf,
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
      keyList: s.keyList,
      roots: s.rootsOf,
      source: empty,
      published: undefined,
      out: tmp(),
      now: NOW,
    };
    expect(other.keyId).toBe("cloudhal-yank-2026b");
    await expect(signYanked({ ...base, keyPem: otherPem })).rejects.toThrow(
      /is not cloudhal-yank-2026a/,
    );
    await expect(signYanked({ ...base, keyPem: "" })).rejects.toThrow(/missing or not a PKCS#8/);
    const revokedList = await signKeys({
      rootKey: rootKeyOf(s.dir),
      passphrase: PASS,
      rootPub: s.root,
      source: {
        keys: s.source.keys.map((k) => (k.role === "yank" ? { ...k, status: "revoked" } : k)),
      },
      out: tmp(),
      now: NOW,
    });
    await expect(signYanked({ ...base, keyList: revokedList })).rejects.toThrow(
      /not list cloudhal-yank-2026a as an active yank key/,
    );
    // keys.json must verify with the root given (here: none pinned yet).
    await expect(signYanked({ ...base, roots: {} })).rejects.toThrow(/not a pinned root/);
  });

  it("verifies the exact bytes before writing: an invalid source is never signed", async () => {
    const s = await setup();
    const out = tmp();
    const base = {
      keyId: "cloudhal-yank-2026a",
      keyPem: s.pem,
      keyList: s.keyList,
      roots: s.rootsOf,
      published: undefined,
      out,
      now: NOW,
    };
    const bad = {
      versions: [{ version: "0.9.3", yankedAt: "yesterday", reason: "x" }],
      revokedKeys: [],
    };
    await expect(signYanked({ ...base, source: bad })).rejects.toThrow(
      /does not verify, nothing written/,
    );
    const extra = { versions: [], revokedKeys: [], extra: true } as never;
    await expect(signYanked({ ...base, source: extra })).resolves.toBeDefined(); // only its two lists are signed
    const twice = { keys: [s.source.keys[0], s.source.keys[0]] as unknown[] };
    await expect(
      signKeys({
        rootKey: rootKeyOf(s.dir),
        passphrase: PASS,
        rootPub: s.root,
        source: twice,
        out: tmp(),
        now: NOW,
      }),
    ).rejects.toThrow(/does not verify, nothing written/);
    const window = {
      keys: [
        {
          ...(s.source.keys[0] as object),
          notAfter: (s.source.keys[0] as { notBefore: string }).notBefore,
        },
      ],
    };
    await expect(
      signKeys({
        rootKey: rootKeyOf(s.dir),
        passphrase: PASS,
        rootPub: s.root,
        source: window,
        out: tmp(),
        now: NOW,
      }),
    ).rejects.toThrow(/does not verify/);
    // Two active yank keys: rotation replaces the yank key, it never overlaps.
    const yank = s.source.keys[1] as Record<string, unknown>;
    const overlap = { keys: [...s.source.keys, { ...yank, keyId: "cloudhal-yank-2026b" }] };
    await expect(
      signKeys({
        rootKey: rootKeyOf(s.dir),
        passphrase: PASS,
        rootPub: s.root,
        source: overlap,
        out: tmp(),
        now: NOW,
      }),
    ).rejects.toThrow(/active yank keys.*at most one/);
    const before = readdirSync(out);
    await expect(signYanked({ ...base, out, source: bad })).rejects.toThrow();
    expect(readdirSync(out)).toEqual(before);
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

  it("carries every published entry forward and adds an emergency yank or revocation", () => {
    const published = {
      versions: [{ version: "0.9.3", yankedAt: "2026-11-19T00:00:00Z", reason: "a" }],
      revokedKeys: [],
    };
    const merged = mergeYankList(empty, published, { yank: "0.9.4", reason: "Data loss." }, NOW);
    expect(merged.versions.map((v) => v.version)).toEqual(["0.9.3", "0.9.4"]);
    expect(merged.versions[1]).toEqual({
      version: "0.9.4",
      yankedAt: iso(NOW),
      reason: "Data loss.",
    });
    const revoked = mergeYankList(
      empty,
      undefined,
      { revoke: "cloudhal-release-2026a", reason: "Exposed." },
      NOW,
    );
    expect(revoked.revokedKeys.map((k) => k.keyId)).toEqual(["cloudhal-release-2026a"]);
    // A yank already listed keeps its first date and reason.
    expect(
      mergeYankList(empty, published, { yank: "0.9.3", reason: "again" }, NOW).versions,
    ).toEqual(published.versions);
    expect(() => mergeYankList(empty, undefined, { yank: "0.9.4" }, NOW)).toThrow(/needs a reason/);
    expect(() =>
      mergeYankList(empty, undefined, { yank: "v0.9.4; rm -rf /", reason: "x" }, NOW),
    ).toThrow(/not a version/);
    expect(() => mergeYankList(empty, undefined, { revoke: "Bad Key", reason: "x" }, NOW)).toThrow(
      /not a key id/,
    );
  });

  it("numbers each list one above the published one (rollback protection)", async () => {
    const s = await setup();
    const base = {
      keyId: "cloudhal-yank-2026a",
      keyPem: s.pem,
      keyList: s.keyList,
      roots: s.rootsOf,
      source: empty,
      out: tmp(),
      now: NOW,
    };
    const first = await signYanked({ ...base, published: undefined });
    expect(JSON.parse(new TextDecoder().decode(first.document)).serial).toBe(1);
    const next = await signYanked({ ...base, published: first });
    expect(JSON.parse(new TextDecoder().decode(next.document)).serial).toBe(2);
  });

  describe("the published list is verified before anything of it is carried forward", () => {
    const yanks = {
      versions: [{ version: "0.9.3", yankedAt: "2026-11-19T00:00:00Z", reason: "Broken." }],
      revokedKeys: [],
    };
    async function published() {
      const s = await setup();
      const base = {
        keyId: "cloudhal-yank-2026a",
        keyPem: s.pem,
        keyList: s.keyList,
        roots: s.rootsOf,
        source: empty,
        out: tmp(),
        now: NOW,
      };
      // Published by an earlier run with an emergency yank that is not in the source yet.
      const pair = await signYanked({
        ...base,
        published: undefined,
        extra: { yank: "0.9.3", reason: "Broken." },
      });
      return { s, base, pair };
    }

    it("carries a list that verifies forward", async () => {
      const { base, pair } = await published();
      const next = await signYanked({ ...base, published: pair });
      const doc = JSON.parse(new TextDecoder().decode(next.document));
      expect(doc.versions.map((v: { version: string }) => v.version)).toEqual(["0.9.3"]);
    });

    it("refuses a crafted list pushed to the branch: wrong signature, edited bytes, another signer", async () => {
      const { base, pair } = await published();
      const out = tmp();
      // Someone with contents: write drops the yank and keeps the old signature.
      const edited = new TextEncoder().encode(
        new TextDecoder().decode(pair.document).replace('"0.9.3"', '"0.9.9"'),
      );
      await expect(
        signYanked({ ...base, out, published: { document: edited, signature: pair.signature } }),
      ).rejects.toThrow(/published yank list does not verify.*nothing signed/);
      const forged = new Uint8Array(pair.signature);
      forged[0] = (forged[0] as number) ^ 1;
      await expect(
        signYanked({ ...base, out, published: { document: pair.document, signature: forged } }),
      ).rejects.toThrow(/does not verify/);
      const crafted = new TextEncoder().encode(
        JSON.stringify({ ...yanks, serial: 9, signing: { keyId: "cloudhal-yank-2099a" } }),
      );
      await expect(
        signYanked({ ...base, out, published: { document: crafted, signature: forged } }),
      ).rejects.toThrow(
        /cloudhal-yank-2099a, which keys.json does not list as a yank key.*--rotate/,
      );
      expect(readdirSync(out)).toEqual([]);
    });

    it("refuses an expired published list unless the operator accepts it (still verified)", async () => {
      const { base, pair } = await published();
      const later = { ...base, now: NOW + 31 * DAY };
      await expect(signYanked({ ...later, published: pair })).rejects.toThrow(/stale-yank-list/);
      const next = await signYanked({ ...later, published: pair, acceptExpired: true });
      expect(JSON.parse(new TextDecoder().decode(next.document)).serial).toBe(2);
      const forged = new Uint8Array(pair.signature);
      forged[1] = (forged[1] as number) ^ 1;
      await expect(
        signYanked({
          ...later,
          published: { document: pair.document, signature: forged },
          acceptExpired: true,
        }),
      ).rejects.toThrow(/does not verify/);
    });

    it("--rotate starts the new key's list at serial 1 from the source alone", async () => {
      const { base, pair } = await published();
      // The same key cannot "rotate" (that would prune its own list).
      await expect(signYanked({ ...base, published: pair, rotate: true })).rejects.toThrow(
        /already signed by cloudhal-yank-2026a/,
      );
      await expect(signYanked({ ...base, published: undefined, rotate: true })).rejects.toThrow(
        /needs the published list/,
      );
      const oldKeyList = new TextEncoder().encode(
        new TextDecoder()
          .decode(pair.document)
          .replaceAll("cloudhal-yank-2026a", "cloudhal-yank-2025a"),
      );
      const fresh = await signYanked({
        ...base,
        source: yanks,
        published: { document: oldKeyList, signature: pair.signature },
        rotate: true,
      });
      const doc = JSON.parse(new TextDecoder().decode(fresh.document));
      expect(doc.serial).toBe(1);
      expect(doc.versions.map((v: { version: string }) => v.version)).toEqual(["0.9.3"]);
    });

    it("takes several comma-separated emergency entries, each validated", async () => {
      const merged = mergeYankList(
        empty,
        undefined,
        { yank: "0.9.4, 0.9.5", revoke: "cloudhal-release-2026a", reason: "Data loss." },
        NOW,
      );
      expect(merged.versions.map((v) => v.version)).toEqual(["0.9.4", "0.9.5"]);
      expect(merged.revokedKeys.map((k) => k.keyId)).toEqual(["cloudhal-release-2026a"]);
      expect(() =>
        mergeYankList(empty, undefined, { yank: "0.9.4,,0.9.5", reason: "x" }, NOW),
      ).toThrow(/empty item/);
      expect(() =>
        mergeYankList(empty, undefined, { yank: "0.9.4,-rf", reason: "x" }, NOW),
      ).toThrow(/not a version: -rf/);
      const many = Array.from({ length: 21 }, (_, i) => `0.9.${i}`).join(",");
      expect(() => mergeYankList(empty, undefined, { yank: many, reason: "x" }, NOW)).toThrow(
        /at most 20/,
      );
    });
  });

  it("the CLI reads the key from RELEASE_YANK_KEY, never prints it, and needs --published or --first-run", async () => {
    const s = await setup();
    const work = tmp();
    const keysFile = path.join(s.keysOut, "keys.json");
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
      "--root-pub",
      path.join(s.dir, "cloudhal-root-2026a.pub.json"),
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

describe("a yank-key rotation, end to end", () => {
  it("signs the new key's first list over the old one's, carrying every entry, and moves a CLI's memory", async () => {
    const c = ceremony();
    const T1 = NOW - 2 * 3_600_000;
    const T2 = NOW - 3_600_000;
    const sign = (source: { keys: unknown[] }, now: number) =>
      signKeys({
        rootKey: rootKeyOf(c.dir),
        passphrase: PASS,
        rootPub: c.root,
        source,
        out: tmp(),
        now,
      });
    const verified = (list: { document: Uint8Array; signature: Uint8Array }, now: number) =>
      verifyKeys({ ...list, roots: roots(c.root), now: new Date(now) });
    const yanks = {
      versions: [{ version: "0.9.3", yankedAt: iso(T1), reason: "Broken." }],
      revokedKeys: [{ keyId: "cloudhal-release-2025a", revokedAt: iso(T1), reason: "Old." }],
    };

    // 1. A list published under cloudhal-yank-2026a, with keys.json T1.
    const keysT1 = await sign(c.source, T1);
    const old = await signYanked({
      keyId: "cloudhal-yank-2026a",
      keyPem: readFileSync(path.join(c.dir, "cloudhal-yank-2026a.pem"), "utf8"),
      keyList: keysT1,
      roots: roots(c.root),
      source: yanks,
      published: undefined,
      out: tmp(),
      now: T1,
    });
    const k1 = await verified(keysT1, T1);
    const memoryT1 = rememberYanks(await verifyYanked({ ...old, keys: k1, now: new Date(T1) }), k1);

    // 2. The root signs T2: 2026a revoked, 2026b the only active yank key.
    const next = yankInit({ keyId: "cloudhal-yank-2026b", out: c.dir, log: quiet });
    const [release, yank] = c.source.keys as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    const keysT2 = await sign(
      {
        keys: [
          release,
          { ...yank, status: "revoked" },
          { ...yank, keyId: "cloudhal-yank-2026b", publicKey: next.publicKey },
        ],
      },
      T2,
    );

    // 3. sign-yanked with the new key over the published list: every entry carried forward.
    const base = {
      keyId: "cloudhal-yank-2026b",
      keyPem: readFileSync(path.join(c.dir, "cloudhal-yank-2026b.pem"), "utf8"),
      keyList: keysT2,
      roots: roots(c.root),
      published: old,
      out: tmp(),
      now: NOW,
    };
    // The old key's list is carried forward even when the source does not list its entries yet
    // (an emergency yank, say); a crafted one fails the old key's signature.
    const fresh = await signYanked({ ...base, source: { versions: [], revokedKeys: [] } });
    const forged = new Uint8Array(old.signature);
    forged[0] = (forged[0] as number) ^ 1;
    await expect(
      signYanked({ ...base, source: yanks, published: { ...old, signature: forged } }),
    ).rejects.toThrow(/signed by the replaced key cloudhal-yank-2026a\) does not verify/);
    const doc = JSON.parse(new TextDecoder().decode(fresh.document));
    expect(doc.signing.keyId).toBe("cloudhal-yank-2026b");
    expect(doc.serial).toBe(2);
    expect(doc.versions).toEqual(yanks.versions);
    expect(doc.revokedKeys).toEqual(yanks.revokedKeys);

    // 4. A CLI that remembers 2026a at T1 accepts it and moves its memory to 2026b at T2.
    const k2 = await verifyKeys({
      ...keysT2,
      roots: roots(c.root),
      now: new Date(NOW),
      memory: memoryT1,
    });
    const accepted = await verifyYanked({
      ...fresh,
      keys: k2,
      now: new Date(NOW),
      memory: memoryT1,
    });
    const memoryT2 = rememberYanks(accepted, k2, memoryT1);
    expect(memoryT2).toMatchObject({
      keyId: "cloudhal-yank-2026b",
      serial: 2,
      keysIssuedAt: iso(T2),
      retiredYankKeys: ["cloudhal-yank-2026a"],
    });

    // 5. The old key's list is refused from then on, with either key list.
    await expect(
      verifyYanked({ ...old, keys: k1, now: new Date(T1), memory: memoryT2 }),
    ).rejects.toMatchObject({ code: "key-list-invalid" });
    await expect(
      verifyYanked({ ...old, keys: k2, now: new Date(T1), memory: memoryT2 }),
    ).rejects.toMatchObject({ code: "yank-list-invalid" });
  });
});

describe("the committed sources under security/ (CI)", () => {
  const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
  const read = (f: string) => JSON.parse(readFileSync(path.join(ROOT_DIR, "security", f), "utf8"));
  const wrapKeys = (keys: unknown) => ({
    schemaVersion: 1,
    format: "cloudhal.release-keys@1",
    issuedAt: "2026-11-20T00:00:00Z",
    expires: "2027-11-20T00:00:00Z",
    signing: { keyId: "cloudhal-root-2026a", algorithm: "Ed25519", signature: "keys.json.sig" },
    keys,
  });

  it("keys.source.json is a valid key list with unique ids and real windows", () => {
    const source = read("keys.source.json");
    expect(Object.keys(source)).toEqual(["keys"]);
    expect(
      validateReleaseKeys(wrapKeys(source.keys)),
      JSON.stringify(validateReleaseKeys.errors),
    ).toBe(true);
    const ids = source.keys.map((k: { keyId: string }) => k.keyId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of source.keys)
      expect(Date.parse(k.notBefore)).toBeLessThan(Date.parse(k.notAfter));
  });

  it("its release keys are PINNED_KEYS and bundle-sign's inline key and window", () => {
    const release = read("keys.source.json").keys.filter(
      (k: { role: string }) => k.role === "release",
    );
    const fromSource = Object.fromEntries(
      release.map(
        (k: {
          keyId: string;
          publicKey: string;
          status: string;
          notBefore: string;
          notAfter: string;
        }) => [
          k.keyId,
          {
            publicKey: k.publicKey,
            status: k.status,
            notBefore: k.notBefore,
            notAfter: k.notAfter,
          },
        ],
      ),
    );
    expect(fromSource).toEqual(PINNED_KEYS);
    const sign = step(job(RELEASE, "bundle-sign"), "Sign the statement");
    const id = /const PINNED_KEY_ID = "([^"]+)";/.exec(sign)?.[1] as string;
    const pinned = fromSource[id] as { notBefore: string; notAfter: string };
    expect(sign).toContain(`const PINNED_NOT_BEFORE = "${pinned.notBefore}";`);
    expect(sign).toContain(`const PINNED_NOT_AFTER = "${pinned.notAfter}";`);
  });

  it("yank-list.json is a valid yank list source with unique entries", () => {
    const list = read("yank-list.json");
    expect(Object.keys(list).sort()).toEqual(["revokedKeys", "versions"]);
    const doc = {
      schemaVersion: 1,
      format: "cloudhal.release-yank-list@1",
      serial: 1,
      issuedAt: "2026-11-20T00:00:00Z",
      expires: "2026-12-20T00:00:00Z",
      signing: { keyId: "cloudhal-yank-2026a", algorithm: "Ed25519", signature: "yanked.json.sig" },
      ...list,
    };
    expect(validateReleaseYankList(doc), JSON.stringify(validateReleaseYankList.errors)).toBe(true);
    const versions = list.versions.map((v: { version: string }) => v.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
