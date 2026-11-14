/**
 * `@cloudhal/release-verify` (RFC-0046 §11a): the one verifier of Cloudhal release bundles for
 * hosts, tools and the CLI. Worker-safe: WebCrypto Ed25519, `DecompressionStream`, and an
 * incremental SHA-256 (`crypto.DigestStream`, else @noble/hashes). The second factor, the GitHub
 * build attestation, is the Node-only subpath `@cloudhal/release-verify/attestation`.
 */
export { type IncrementalSha256, incrementalSha256, sha256Hex, verifyEd25519 } from "./crypto.ts";
export type { ListedPart, Worker } from "./documents.ts";
export { ERROR_CODES, ReleaseVerifyError, type ReleaseVerifyErrorCode } from "./errors.ts";
export type { ReleaseManifest } from "./generated/release-manifest.ts";
export type { ReleaseStatement } from "./generated/release-statement.ts";
export { type KeyStatus, PINNED_KEYS, type ReleaseKey, type ReleaseKeys } from "./keys.ts";
export {
  channelOf,
  LIMITS,
  MANIFEST_FILE,
  SIGNATURE_FILE,
  STATEMENT_FILE,
  sigstoreName,
  tarballName,
} from "./limits.ts";
export { foldPath, type PathKind, unsafePathReason } from "./paths.ts";
export { IMPLIED_SCOPES, missingScopes } from "./scopes.ts";
export type { ByteSource } from "./tar.ts";
export { RELEASE_REPOSITORY, releaseAssetNames, releaseAssetUrls } from "./urls.ts";
export {
  type VerifiedEntry,
  type VerifiedRelease,
  type VerifyReleaseInput,
  verifyRelease,
} from "./verify.ts";
