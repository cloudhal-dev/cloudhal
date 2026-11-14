/**
 * RFC-0046 §9 (#226): the signed key list and yank list, reduce-only merging, the expiry rule
 * and yanked versions, with throwaway root, yank and release keys made in the test.
 */
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../../scripts/release-bundle/manifest.ts";
import {
  addMonths,
  mergeTrust,
  PINNED_KEYS,
  type ReleaseKeys,
  type ReleaseVerifyErrorCode,
  rememberYanks,
  verifyKeys,
  verifyRelease,
  verifyYanked,
} from "../src/index.ts";
import { realInput, synthetic } from "./helpers.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
function keyPair(): { privateKey: KeyObject; raw: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, raw: Buffer.from(der.subarray(12)).toString("base64") };
}
const signed = (doc: unknown, key: KeyObject) => {
  const bytes = utf8(canonicalJson(doc));
  return { document: bytes, signature: new Uint8Array(sign(null, bytes, key)) };
};
async function codeOf(p: Promise<unknown>): Promise<ReleaseVerifyErrorCode | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    const code = (e as { code?: ReleaseVerifyErrorCode }).code;
    if (!code) throw e;
    return code;
  }
}

const ROOT = keyPair();
const YANK = keyPair();
const ROOTS = { "test-root-2026a": { publicKey: ROOT.raw } };
const NOW = new Date("2026-12-01T00:00:00Z");
const RELEASE_2026A = PINNED_KEYS["cloudhal-release-2026a"] as { publicKey: string };

function keysDoc(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    format: "cloudhal.release-keys@1",
    issuedAt: "2026-11-20T00:00:00Z",
    expires: "2027-11-20T00:00:00Z",
    signing: { keyId: "test-root-2026a", algorithm: "Ed25519", signature: "keys.json.sig" },
    keys: [
      {
        keyId: "cloudhal-release-2026a",
        publicKey: RELEASE_2026A.publicKey,
        role: "release",
        notBefore: "2026-11-12T00:00:00Z",
        notAfter: "2027-11-12T00:00:00Z",
        status: "active",
      },
      {
        keyId: "test-yank-2026a",
        publicKey: YANK.raw,
        role: "yank",
        notBefore: "2026-11-20T00:00:00Z",
        notAfter: "2027-11-20T00:00:00Z",
        status: "active",
      },
    ],
    ...over,
  };
}
function yankDoc(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    format: "cloudhal.release-yank-list@1",
    serial: 5,
    issuedAt: "2026-11-25T00:00:00Z",
    expires: "2026-12-25T00:00:00Z",
    signing: { keyId: "test-yank-2026a", algorithm: "Ed25519", signature: "yanked.json.sig" },
    versions: [],
    revokedKeys: [],
    ...over,
  };
}
const keysAt = (doc: unknown, now = NOW) =>
  verifyKeys({ ...signed(doc, ROOT.privateKey), roots: ROOTS, now });

describe("verifyKeys", () => {
  it("accepts a fresh list signed by a pinned root", async () => {
    const list = await keysAt(keysDoc());
    expect(list.document.keys.map((k) => k.keyId)).toEqual([
      "cloudhal-release-2026a",
      "test-yank-2026a",
    ]);
    expect(list.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an unpinned root, a wrong signature, tampered bytes and no roots at all", async () => {
    const s = signed(keysDoc(), ROOT.privateKey);
    expect(await codeOf(verifyKeys({ ...s, now: NOW }))).toBe("key-list-invalid"); // PINNED_ROOTS is empty
    const other = signed(keysDoc(), keyPair().privateKey);
    expect(await codeOf(verifyKeys({ ...other, roots: ROOTS, now: NOW }))).toBe("key-list-invalid");
    const tampered = new Uint8Array(s.document);
    const at = new TextDecoder().decode(tampered).indexOf("2027-11-20");
    tampered[at + 3] = "8".charCodeAt(0); // expires 2028: valid JSON, wrong bytes
    expect(
      await codeOf(
        verifyKeys({ document: tampered, signature: s.signature, roots: ROOTS, now: NOW }),
      ),
    ).toBe("key-list-invalid");
    expect(
      await codeOf(
        verifyKeys({ document: s.document, signature: s.signature.subarray(1), roots: ROOTS }),
      ),
    ).toBe("key-list-invalid");
  });

  it("refuses an expired list, one issued in the future, one valid for more than 13 months", async () => {
    expect(await codeOf(keysAt(keysDoc(), new Date("2027-11-20T00:00:00Z")))).toBe(
      "key-list-expired",
    );
    expect(await codeOf(keysAt(keysDoc({ issuedAt: "2026-12-02T00:00:00Z" })))).toBe(
      "key-list-invalid",
    );
    expect(await codeOf(keysAt(keysDoc({ expires: "2027-12-21T00:00:00Z" })))).toBe(
      "key-list-invalid",
    );
    expect(await codeOf(keysAt(keysDoc({ expires: "2027-12-20T00:00:00Z" })))).toBe("ok");
  });

  it("refuses a schema violation, a duplicate key id and an empty window", async () => {
    expect(await codeOf(keysAt(keysDoc({ extra: 1 })))).toBe("key-list-invalid");
    const doc = keysDoc();
    const first = doc.keys[0] as (typeof doc.keys)[number];
    const twice = { ...doc, keys: [first, first] };
    expect(await codeOf(keysAt(twice))).toBe("key-list-invalid");
    const empty = { ...doc, keys: [{ ...first, notAfter: "2026-11-12T00:00:00Z" }] };
    expect(await codeOf(keysAt(empty))).toBe("key-list-invalid");
  });
});

describe("verifyYanked", () => {
  const yankedAt = async (doc: unknown, key = YANK.privateKey, now = NOW, keys = keysDoc()) =>
    verifyYanked({ ...signed(doc, key), keys: await keysAt(keys), now });

  it("accepts a fresh list signed by an active yank key the key list names", async () => {
    const list = await yankedAt(yankDoc());
    expect(list.document.versions).toEqual([]);
  });

  it("is stale 30 days after issuedAt: new installs wait (stale-yank-list)", async () => {
    expect(
      await codeOf(yankedAt(yankDoc(), YANK.privateKey, new Date("2026-12-25T00:00:00Z"))),
    ).toBe("stale-yank-list");
  });

  it("a consumer with memory refuses a rollback or a dropped entry (stale-yank-list)", async () => {
    const keys = await keysAt(keysDoc());
    const yanks = {
      versions: [{ version: "0.9.3", yankedAt: "2026-11-20T00:00:00Z", reason: "Broken." }],
      revokedKeys: [
        { keyId: "cloudhal-release-2025a", revokedAt: "2026-11-20T00:00:00Z", reason: "Old." },
      ],
    };
    const first = await verifyYanked({
      ...signed(yankDoc(yanks), YANK.privateKey),
      keys,
      now: NOW,
    });
    const memory = rememberYanks(first);
    expect(memory).toEqual({
      keyId: "test-yank-2026a",
      serial: 5,
      versions: ["0.9.3"],
      revokedKeys: ["cloudhal-release-2025a"],
    });
    const later = (over: Record<string, unknown>) =>
      verifyYanked({
        ...signed(yankDoc({ ...yanks, ...over }), YANK.privateKey),
        keys,
        now: NOW,
        memory,
      });
    expect(await codeOf(later({ serial: 6 }))).toBe("ok");
    expect(await codeOf(later({ serial: 5 }))).toBe("ok");
    expect(await codeOf(later({ serial: 4 }))).toBe("stale-yank-list");
    // A stolen yank key signing a fresh list that un-yanks or un-revokes: refused.
    expect(await codeOf(later({ serial: 6, versions: [] }))).toBe("stale-yank-list");
    expect(await codeOf(later({ serial: 6, revokedKeys: [] }))).toBe("stale-yank-list");
  });

  it("a list from another, root-listed yank key starts a new memory (the root's rotation)", async () => {
    const next = keyPair();
    const doc = keysDoc();
    const rotated = {
      ...doc,
      keys: [
        ...doc.keys,
        {
          ...(doc.keys[1] as (typeof doc.keys)[number]),
          keyId: "test-yank-2027a",
          publicKey: next.raw,
        },
      ],
    };
    const keys = await keysAt(rotated);
    const memory = { keyId: "test-yank-2026a", serial: 40, versions: ["0.9.3"], revokedKeys: [] };
    const fresh = yankDoc({
      serial: 1,
      signing: { keyId: "test-yank-2027a", algorithm: "Ed25519", signature: "yanked.json.sig" },
    });
    expect(
      await codeOf(verifyYanked({ ...signed(fresh, next.privateKey), keys, now: NOW, memory })),
    ).toBe("ok");
  });

  it("addMonths clamps to the last day of the target month", () => {
    expect(new Date(addMonths("2027-01-31T10:00:00Z", 13)).toISOString()).toBe(
      "2028-02-29T10:00:00.000Z",
    );
    expect(new Date(addMonths("2026-01-31T00:00:00Z", 1)).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(new Date(addMonths("2026-11-20T12:00:00Z", 12)).toISOString()).toBe(
      "2027-11-20T12:00:00.000Z",
    );
  });

  it("refuses expires other than 30 days, a non-yank signer, a revoked yank key", async () => {
    expect(await codeOf(yankedAt(yankDoc({ expires: "2026-12-26T00:00:00Z" })))).toBe(
      "yank-list-invalid",
    );
    // Signed by the release key's id: listed, but not a yank key.
    const asRelease = yankDoc({
      signing: {
        keyId: "cloudhal-release-2026a",
        algorithm: "Ed25519",
        signature: "yanked.json.sig",
      },
    });
    expect(await codeOf(yankedAt(asRelease))).toBe("yank-list-invalid");
    const doc = keysDoc();
    const [release, yank] = doc.keys as [(typeof doc.keys)[number], (typeof doc.keys)[number]];
    const revoked = { ...doc, keys: [release, { ...yank, status: "revoked" }] };
    expect(await codeOf(yankedAt(yankDoc(), YANK.privateKey, NOW, revoked))).toBe(
      "yank-list-invalid",
    );
    expect(await codeOf(yankedAt(yankDoc(), keyPair().privateKey))).toBe("yank-list-invalid");
  });
});

describe("mergeTrust: reduce-only", () => {
  it("revokes, marks retiring, narrows windows; never adds a key", async () => {
    const pinned: ReleaseKeys = {
      "key-a": {
        publicKey: RELEASE_2026A.publicKey,
        status: "active",
        notBefore: "2026-01-01T00:00:00Z",
        notAfter: "2028-01-01T00:00:00Z",
      },
      "key-b": { publicKey: YANK.raw, status: "active" },
      "key-c": { publicKey: ROOT.raw, status: "active", listed: true },
    };
    const keys = await keysAt(
      keysDoc({
        keys: [
          {
            keyId: "key-a",
            publicKey: RELEASE_2026A.publicKey,
            role: "release",
            notBefore: "2026-06-01T00:00:00Z",
            notAfter: "2027-06-01T00:00:00Z",
            status: "retiring",
          },
          // Same id, another public key: a conflict revokes.
          {
            keyId: "key-b",
            publicKey: ROOT.raw,
            role: "release",
            notBefore: "2026-01-01T00:00:00Z",
            notAfter: "2028-01-01T00:00:00Z",
            status: "active",
          },
          {
            keyId: "new-key",
            publicKey: ROOT.raw,
            role: "release",
            notBefore: "2026-01-01T00:00:00Z",
            notAfter: "2028-01-01T00:00:00Z",
            status: "active",
          },
          {
            keyId: "test-yank-2026a",
            publicKey: YANK.raw,
            role: "yank",
            notBefore: "2026-11-20T00:00:00Z",
            notAfter: "2027-11-20T00:00:00Z",
            status: "active",
          },
        ],
      }),
    );
    const merged = mergeTrust(pinned, { keys });
    expect(merged["key-a"]).toEqual({
      publicKey: RELEASE_2026A.publicKey,
      status: "retiring",
      notBefore: "2026-06-01T00:00:00Z",
      notAfter: "2027-06-01T00:00:00Z",
      listed: true,
    });
    expect(merged["key-b"]?.status).toBe("revoked");
    // `key-c` is not in the list: a caller's own `listed` flag does not survive.
    expect(merged["key-c"]).toMatchObject({ status: "active", listed: false });
    expect(Object.keys(merged)).toEqual(["key-a", "key-b", "key-c"]);
    // A list can never re-activate: an active listing of a revoked pin stays revoked.
    const revokedPin = { ...(pinned["key-a"] as ReleaseKeys[string]), status: "revoked" as const };
    const again = mergeTrust({ "key-a": revokedPin }, { keys });
    expect(again["key-a"]?.status).toBe("revoked");
  });

  it("a yank list revokes a pinned key", async () => {
    const keys = await keysAt(keysDoc());
    const yanked = await verifyYanked({
      ...signed(
        yankDoc({
          revokedKeys: [
            {
              keyId: "cloudhal-release-2026a",
              revokedAt: "2026-11-30T00:00:00Z",
              reason: "Exposed.",
            },
          ],
        }),
        YANK.privateKey,
      ),
      keys,
      now: NOW,
    });
    const merged = mergeTrust(PINNED_KEYS, { keys, yanked });
    expect(merged["cloudhal-release-2026a"]?.status).toBe("revoked");
    expect(await codeOf(verifyRelease(realInput({ keys: merged })))).toBe("key-revoked");
  });
});

describe("expiry and yanked versions in verifyRelease", () => {
  it("the real v0.9.0 statement verifies inside its key's window (steps 1 to 5 pass)", async () => {
    expect(await codeOf(verifyRelease(realInput()))).toBe("tarball-mismatch");
  });

  it("past notAfter, pinned keys alone refuse (key-expired)", async () => {
    const late = new Date("2027-12-01T00:00:00Z");
    expect(await codeOf(verifyRelease(realInput({ now: late })))).toBe("key-expired");
  });

  it("past notAfter, a fresh key list that marks it retiring keeps old statements valid", async () => {
    const late = new Date("2027-12-01T00:00:00Z");
    const doc = keysDoc({ issuedAt: "2027-11-15T00:00:00Z", expires: "2028-11-15T00:00:00Z" });
    doc.keys[0] = { ...doc.keys[0], status: "retiring" } as (typeof doc.keys)[0];
    const keys = await keysAt(doc, late);
    const merged = mergeTrust(PINNED_KEYS, { keys });
    expect(await codeOf(verifyRelease(realInput({ now: late, keys: merged })))).toBe(
      "tarball-mismatch",
    );
    // Listed as active instead of retiring: still refused after notAfter.
    const active = await keysAt(
      keysDoc({ issuedAt: "2027-11-15T00:00:00Z", expires: "2028-11-15T00:00:00Z" }),
      late,
    );
    expect(
      await codeOf(
        verifyRelease(realInput({ now: late, keys: mergeTrust(PINNED_KEYS, { keys: active }) })),
      ),
    ).toBe("key-expired");
  });

  it("a statement created outside its key's window is refused", async () => {
    const window = (notBefore: string, notAfter: string): ReleaseKeys => ({
      "cloudhal-release-2026a": {
        ...(PINNED_KEYS["cloudhal-release-2026a"] as ReleaseKeys[string]),
        notBefore,
        notAfter,
      },
    });
    // v0.9.0 was created 2026-11-13T16:13:20Z.
    expect(
      await codeOf(
        verifyRelease(realInput({ keys: window("2026-11-14T00:00:00Z", "2027-11-12T00:00:00Z") })),
      ),
    ).toBe("key-expired");
    expect(
      await codeOf(
        verifyRelease(
          realInput({
            keys: window("2026-01-01T00:00:00Z", "2026-11-13T00:00:00Z"),
            now: new Date("2026-11-12T00:00:00Z"),
          }),
        ),
      ),
    ).toBe("key-expired");
  });

  it("refuses a yanked version, before anything else is read", async () => {
    const keys = await keysAt(keysDoc());
    const yanked = await verifyYanked({
      ...signed(
        yankDoc({
          versions: [
            { version: "0.9.0", yankedAt: "2026-11-30T00:00:00Z", reason: "Broken migration." },
          ],
        }),
        YANK.privateKey,
      ),
      keys,
      now: NOW,
    });
    const e = await verifyRelease(realInput({ yanked })).catch(
      (x: { code: string; message: string }) => x,
    );
    expect(e).toMatchObject({ code: "yanked", message: "0.9.0 is yanked: Broken migration." });
    const b = await synthetic();
    expect(await codeOf(verifyRelease({ ...b.input, yanked }))).toBe("yanked");
  });
});
