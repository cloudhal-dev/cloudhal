/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/release-{manifest,statement}.schema.json
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
 * This interface was referenced by `ReleaseStatement`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * This interface was referenced by `ReleaseStatement`'s JSON-Schema
 * via the `definition` "CloudhalVersion".
 */
export type CloudhalVersion = string;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `ReleaseStatement`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * This interface was referenced by `ReleaseStatement`'s JSON-Schema
 * via the `definition` "Sha256Hex".
 */
export type Sha256Hex = string;

/**
 * cloudhal.release-statement@1 (RFC-0046): the small canonical document a Cloudhal release signs, published as the release asset release-statement.json next to release-statement.sig (a raw 64-byte Ed25519 signature over the exact bytes, at most 4096 of them). It names the version, channel, commit and key id and pins the SHA-256 and size of manifest.json and of the tarball, so a remote deployer verifies one small file and then checks every other asset by digest. Canonical bytes: keys sorted recursively, 2-space indent, a trailing newline; a consumer verifies the bytes it downloaded and never re-serialises them. Portable on purpose: it references common only for SchemaVersion and Timestamp.
 */
export interface ReleaseStatement {
  schemaVersion: SchemaVersion;
  format: "cloudhal.release-statement@1";
  version: CloudhalVersion;
  channel: "stable" | "next";
  securityRelease: boolean;
  commit: string;
  createdAt: Timestamp;
  signing: {
    keyId: string;
    algorithm: "Ed25519";
    signature: "release-statement.sig";
  };
  manifest: StatementAsset;
  tarball: StatementAsset;
}
/**
 * This interface was referenced by `ReleaseStatement`'s JSON-Schema
 * via the `definition` "StatementAsset".
 */
export interface StatementAsset {
  name: string;
  sha256: Sha256Hex;
  bytes: number;
}
