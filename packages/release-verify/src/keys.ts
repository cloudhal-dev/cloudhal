/**
 * The release keys this package trusts (RFC-0046 §9, §11a): the table of
 * docs/security/release-signing-keys.md, kept equal to it by test/keys.test.ts.
 *
 * `PINNED_KEYS` is frozen into each published version and cannot learn about a revocation by
 * itself. A caller may only reduce trust: `revoked` withdraws key ids. A caller that trusts a key
 * outside this table passes a whole `keys` map, which is a reviewed change on its side. Once the
 * signed `keys.json` of #226 exists, it feeds the same reduce-only path.
 */
import { refuse } from "./errors.ts";

export type KeyStatus = "active" | "retiring" | "revoked";

export interface ReleaseKey {
  /** The raw 32-byte Ed25519 public key, base64. */
  readonly publicKey: string;
  readonly status: KeyStatus;
}

export type ReleaseKeys = Readonly<Record<string, ReleaseKey>>;

export const PINNED_KEYS: ReleaseKeys = Object.freeze({
  "cloudhal-release-2026a": Object.freeze({
    publicKey: "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=",
    status: "active",
  }),
});

/** The raw public key `keyId` verifies with, or a refusal (unknown, revoked, malformed). */
export function trustedKey(
  keys: ReleaseKeys,
  revoked: readonly string[],
  keyId: string,
): Uint8Array {
  const key = Object.hasOwn(keys, keyId) ? keys[keyId] : undefined;
  if (!key) return refuse("key-unknown", `no trusted release key ${keyId}`);
  if (key.status === "revoked" || revoked.includes(keyId))
    return refuse("key-revoked", `release key ${keyId} is revoked`);
  const raw = fromBase64(key.publicKey);
  if (raw?.length !== 32)
    return refuse("key-unknown", `the trusted key ${keyId} is not a 32-byte Ed25519 key`);
  return raw;
}

function fromBase64(s: string): Uint8Array | undefined {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}
