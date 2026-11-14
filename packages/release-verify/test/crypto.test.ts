/**
 * Both SHA-256 paths (RFC-0046 §11a) against the NIST vectors and `node:crypto`: @noble/hashes
 * (Node has no `crypto.DigestStream`) and the DigestStream adapter, driven here by a stand-in
 * with workerd's shape. Ed25519 through WebCrypto against node:crypto signatures.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type DigestStreamConstructor,
  incrementalSha256,
  sha256Hex,
  verifyEd25519,
} from "../src/crypto.ts";

const NIST: [string, string][] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
  ],
];
const MILLION_A = "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0";

/** workerd's DigestStream, stood in for by node:crypto: a WritableStream whose digest resolves on close. */
const FakeDigestStream = class extends WritableStream<Uint8Array> {
  readonly digest: Promise<ArrayBuffer>;
  constructor(algorithm: string) {
    if (algorithm !== "SHA-256") throw new Error(algorithm);
    const h = createHash("sha256");
    let done: (b: ArrayBuffer) => void = () => {};
    const digest = new Promise<ArrayBuffer>((r) => {
      done = r;
    });
    super({
      write: (chunk) => {
        h.update(chunk);
      },
      close: () => {
        const b = h.digest();
        done(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
      },
    });
    this.digest = digest;
  }
} as unknown as DigestStreamConstructor;

const paths = [
  ["@noble/hashes", undefined],
  ["DigestStream", FakeDigestStream],
] as const;

async function hashInChunks(
  bytes: Uint8Array,
  sizes: number[],
  ds: DigestStreamConstructor | undefined,
): Promise<string> {
  const h = incrementalSha256(ds);
  let at = 0;
  let i = 0;
  while (at < bytes.length) {
    const n = sizes[i++ % sizes.length] as number;
    await h.update(bytes.subarray(at, at + n));
    at += n;
  }
  return h.digest();
}

describe.each(paths)("incremental SHA-256 through %s", (_, ds) => {
  it("matches the NIST vectors, whole and split", async () => {
    for (const [msg, want] of NIST) {
      const b = new TextEncoder().encode(msg);
      expect(await hashInChunks(b, [b.length || 1], ds)).toBe(want);
      expect(await hashInChunks(b, [1, 3, 7], ds)).toBe(want);
    }
    const million = new Uint8Array(1_000_000).fill(0x61);
    expect(await hashInChunks(million, [65_536, 1, 4099], ds)).toBe(MILLION_A);
  });

  it("matches node:crypto on random inputs and splits", async () => {
    for (let i = 0; i < 20; i++) {
      const b = randomBytes(1 + Math.floor(Math.random() * 200_000));
      const sizes = [1 + Math.floor(Math.random() * 5000), 1 + Math.floor(Math.random() * 70)];
      expect(await hashInChunks(b, sizes, ds)).toBe(createHash("sha256").update(b).digest("hex"));
    }
  });
});

describe("one-shot SHA-256 and Ed25519", () => {
  it("sha256Hex matches node:crypto", async () => {
    const b = randomBytes(10_000);
    expect(await sha256Hex(b)).toBe(createHash("sha256").update(b).digest("hex"));
  });

  it("verifies node:crypto Ed25519 signatures and refuses anything else", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const raw = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(12));
    const msg = randomBytes(300);
    const sig = new Uint8Array(sign(null, msg, privateKey));
    expect(await verifyEd25519(raw, msg, sig)).toBe(true);
    const bad = new Uint8Array(sig);
    bad[0] = (bad[0] as number) ^ 1;
    expect(await verifyEd25519(raw, msg, bad)).toBe(false);
    expect(await verifyEd25519(raw, randomBytes(300), sig)).toBe(false);
    expect(await verifyEd25519(new Uint8Array(31), msg, sig)).toBe(false);
  });
});
