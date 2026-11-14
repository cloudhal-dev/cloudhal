/**
 * Ed25519 and SHA-256 on every runtime (RFC-0046 §11a): WebCrypto for Ed25519 and one-shot
 * digests; for the streamed tarball, Workers' native `crypto.DigestStream` where it exists and
 * otherwise `@noble/hashes` (audited, zero dependencies), because WebCrypto's `digest` cannot
 * stream. test/crypto.test.ts checks both paths against the NIST vectors and `node:crypto`.
 */
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

const toHex = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
};

/** Pure Ed25519 over the exact `message` bytes. */
export async function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, [
      "verify",
    ]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signature, message);
  } catch {
    // A key that is not a valid Ed25519 point verifies nothing.
    return false;
  }
}

/** SHA-256 of `bytes`, lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export interface IncrementalSha256 {
  update(chunk: Uint8Array): Promise<void>;
  /** Lowercase hex; call once, after the last `update`. */
  digest(): Promise<string>;
}

/** Workers' `crypto.DigestStream` (a WritableStream whose `digest` resolves on close). */
export type DigestStreamConstructor = new (
  algorithm: string,
) => WritableStream<Uint8Array> & { readonly digest: Promise<ArrayBuffer> };

const nativeDigestStream = (): DigestStreamConstructor | undefined =>
  (globalThis as { crypto?: { DigestStream?: DigestStreamConstructor } }).crypto?.DigestStream;

/** An incremental SHA-256: `crypto.DigestStream` when the runtime has one, else @noble/hashes. */
export function incrementalSha256(
  DigestStream: DigestStreamConstructor | undefined = nativeDigestStream(),
): IncrementalSha256 {
  if (DigestStream) {
    const stream = new DigestStream("SHA-256");
    const writer = stream.getWriter();
    return {
      update: (chunk) => writer.write(chunk),
      async digest() {
        await writer.close();
        return toHex(new Uint8Array(await stream.digest));
      },
    };
  }
  const h = nobleSha256.create();
  return {
    update: async (chunk) => {
      h.update(chunk);
    },
    digest: async () => toHex(h.digest()),
  };
}
