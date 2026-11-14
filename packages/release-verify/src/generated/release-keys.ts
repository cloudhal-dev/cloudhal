/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/release-{manifest,statement,keys,yank-list}.schema.json
 * (run `pnpm gen`; packages/release-verify/scripts/gen-validators.ts)
 */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `ReleaseKeys`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `ReleaseKeys`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * This interface was referenced by `ReleaseKeys`'s JSON-Schema
 * via the `definition` "KeyId".
 */
export type KeyId = string;

/**
 * cloudhal.release-keys@1 (RFC-0046 §9): the root-signed list of Cloudhal's release and yank keys, published as keys.json at https://cloudhal.dev/.well-known/cloudhal/keys.json next to keys.json.sig (a raw 64-byte Ed25519 signature by the offline root over the exact bytes). A consumer uses it only to reduce trust in the keys it pins: revoke, mark retiring, narrow a validity window; it never adds a key. Canonical bytes as for the release statement.
 */
export interface ReleaseKeys {
  schemaVersion: SchemaVersion;
  format: "cloudhal.release-keys@1";
  issuedAt: Timestamp;
  /**
   * RFC 3339 / ISO 8601 instant in UTC.
   */
  expires: string;
  signing: {
    /**
     * The root key that signed this list.
     */
    keyId: string;
    algorithm: "Ed25519";
    signature: "keys.json.sig";
  };
  /**
   * @maxItems 64
   */
  keys: ListedKey[];
}
/**
 * This interface was referenced by `ReleaseKeys`'s JSON-Schema
 * via the `definition` "ListedKey".
 */
export interface ListedKey {
  keyId: KeyId;
  /**
   * The raw 32-byte Ed25519 public key, base64.
   */
  publicKey: string;
  role: "release" | "yank";
  notBefore: Timestamp;
  notAfter: Timestamp;
  status: "active" | "retiring" | "revoked";
}
