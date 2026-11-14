/**
 * The release keys this package trusts (RFC-0046 §9, §11a): the table of
 * docs/security/release-signing-keys.md, kept equal to it by test/package.test.ts.
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
  /** The key signs statements created in `[notBefore, notAfter]` (RFC 3339, UTC). */
  readonly notBefore?: string;
  readonly notAfter?: string;
  /**
   * Set by `mergeTrust` when a fresh, root-signed `keys.json` lists this key (and does not revoke
   * it). Only then may a `retiring` key verify after its `notAfter` (RFC-0046 §9).
   */
  readonly listed?: boolean;
}

export type ReleaseKeys = Readonly<Record<string, ReleaseKey>>;

export const PINNED_KEYS: ReleaseKeys = Object.freeze({
  "cloudhal-release-2026a": Object.freeze({
    publicKey: "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=",
    status: "active",
    notBefore: "2026-11-12T00:00:00Z",
    notAfter: "2027-11-12T00:00:00Z",
  }),
});

/** The raw public key `keyId` verifies with and its record, or a refusal (unknown, revoked, malformed). */
export function trustedKey(
  keys: ReleaseKeys,
  revoked: readonly string[],
  keyId: string,
): { raw: Uint8Array; key: ReleaseKey } {
  const key = Object.hasOwn(keys, keyId) ? keys[keyId] : undefined;
  if (!key) return refuse("key-unknown", `no trusted release key ${keyId}`);
  if (key.status === "revoked" || revoked.includes(keyId))
    return refuse("key-revoked", `release key ${keyId} is revoked`);
  const raw = fromBase64(key.publicKey);
  if (raw?.length !== 32)
    return refuse("key-unknown", `the trusted key ${keyId} is not a 32-byte Ed25519 key`);
  return { raw, key };
}

/**
 * RFC-0046 §9's expiry rule for the key that signed a statement created at `createdAt`: it must
 * lie within the key's `[notBefore, notAfter]`, and after `notAfter` the key verifies only while a
 * fresh `keys.json` lists it as `retiring` (`listed`). Pinned keys alone refuse after `notAfter`.
 */
export function checkKeyWindow(keyId: string, key: ReleaseKey, createdAt: string, now: Date): void {
  const created = Date.parse(createdAt);
  if (key.notBefore !== undefined && created < Date.parse(key.notBefore))
    refuse("key-expired", `${keyId} was not yet valid when this release was created`);
  if (key.notAfter === undefined) return;
  const notAfter = Date.parse(key.notAfter);
  if (created > notAfter)
    refuse("key-expired", `${keyId} had expired when this release was created`);
  if (now.getTime() > notAfter && !(key.status === "retiring" && key.listed === true))
    refuse(
      "key-expired",
      `${keyId} expired on ${key.notAfter.slice(0, 10)}; a fresh keys.json must list it as retiring`,
    );
}

export function fromBase64(s: string): Uint8Array | undefined {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}
