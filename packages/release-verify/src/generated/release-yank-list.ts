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
 * This interface was referenced by `ReleaseYankList`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `ReleaseYankList`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * This interface was referenced by `ReleaseYankList`'s JSON-Schema
 * via the `definition` "CloudhalVersion".
 */
export type CloudhalVersion = string;
/**
 * This interface was referenced by `ReleaseYankList`'s JSON-Schema
 * via the `definition` "KeyId".
 */
export type KeyId = string;

/**
 * cloudhal.release-yank-list@1 (RFC-0046 §9): the yank list, published as yanked.json at https://cloudhal.dev/.well-known/cloudhal/yanked.json next to yanked.json.sig (a raw 64-byte Ed25519 signature by a yank-role key from keys.json over the exact bytes). It only reduces trust: versions no consumer may install, and release key ids every consumer must refuse. Re-signed weekly; it expires 30 days after issuedAt, and a stale list blocks new installs only.
 */
export interface ReleaseYankList {
  schemaVersion: SchemaVersion;
  format: "cloudhal.release-yank-list@1";
  issuedAt: Timestamp;
  /**
   * RFC 3339 / ISO 8601 instant in UTC.
   */
  expires: string;
  signing: {
    /**
     * The yank-role key that signed this list.
     */
    keyId: string;
    algorithm: "Ed25519";
    signature: "yanked.json.sig";
  };
  /**
   * @maxItems 1000
   */
  versions: {
    version: CloudhalVersion;
    yankedAt: Timestamp;
    reason: string;
  }[];
  /**
   * @maxItems 64
   */
  revokedKeys: {
    keyId: KeyId;
    revokedAt: Timestamp;
    reason: string;
  }[];
}
