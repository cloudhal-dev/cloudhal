/**
 * The release statement (`cloudhal.release-statement@1`, RFC-0046 §2): the small canonical
 * document that pins the manifest and the tarball by name, SHA-256 and size, and the only file the
 * project key signs. The builder writes it unsigned; `bundle-sign` signs its exact bytes.
 */
import { canonicalJson, channelOf, LIMITS, sha256 } from "./manifest.ts";

export const STATEMENT_FILE = "release-statement.json";
export const SIGNATURE_FILE = "release-statement.sig";
export const MANIFEST_FILE = "manifest.json";
export const tarballName = (version: string): string => `cloudhal-release-${version}.tar.gz`;
export const sigstoreName = (version: string): string =>
  `cloudhal-release-${version}.sigstore.json`;

/** The five assets of a release (§1), in upload order. */
export const releaseAssetNames = (version: string): string[] => [
  tarballName(version),
  MANIFEST_FILE,
  STATEMENT_FILE,
  SIGNATURE_FILE,
  sigstoreName(version),
];

export interface StatementAsset {
  readonly name: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface Statement {
  readonly schemaVersion: 1;
  readonly format: "cloudhal.release-statement@1";
  readonly version: string;
  readonly channel: "stable" | "next";
  readonly securityRelease: boolean;
  readonly commit: string;
  readonly createdAt: string;
  readonly signing: {
    readonly keyId: string;
    readonly algorithm: "Ed25519";
    readonly signature: "release-statement.sig";
  };
  readonly manifest: StatementAsset;
  readonly tarball: StatementAsset;
}

/** The fields the statement shares with the manifest (§2 invariant 5). */
interface ManifestFacts {
  readonly version: string;
  readonly channel: "stable" | "next";
  readonly securityRelease: boolean;
  readonly commit: string;
  readonly createdAt: string;
  readonly signing: { readonly keyId: string };
}

const asset = (name: string, bytes: Uint8Array): StatementAsset => ({
  name,
  sha256: sha256(bytes),
  bytes: bytes.length,
});

/** The statement of `manifest` (its bytes) and `tarball`, as a document and canonical bytes. */
export function statementOf(
  manifest: ManifestFacts,
  manifestBytes: Uint8Array,
  tarball: Uint8Array,
): { statement: Statement; bytes: Uint8Array } {
  const statement: Statement = {
    schemaVersion: 1,
    format: "cloudhal.release-statement@1",
    version: manifest.version,
    channel: manifest.channel,
    securityRelease: manifest.securityRelease,
    commit: manifest.commit,
    createdAt: manifest.createdAt,
    signing: { keyId: manifest.signing.keyId, algorithm: "Ed25519", signature: SIGNATURE_FILE },
    manifest: asset(MANIFEST_FILE, manifestBytes),
    tarball: asset(tarballName(manifest.version), tarball),
  };
  const bytes = new TextEncoder().encode(canonicalJson(statement));
  checkStatement(statement, bytes.length);
  return { statement, bytes };
}

/** §2 invariants 1, 2, 3 and 6, which the schema cannot express. */
export function checkStatement(s: Statement, serialisedBytes: number): void {
  if (s.manifest.name !== MANIFEST_FILE)
    throw new Error(`statement.manifest.name is not ${MANIFEST_FILE}`);
  if (s.tarball.name !== tarballName(s.version))
    throw new Error(`statement.tarball.name is not ${tarballName(s.version)}`);
  if (s.manifest.bytes > LIMITS.manifestBytes)
    throw new Error(`the manifest is above ${LIMITS.manifestBytes} bytes`);
  if (s.channel !== channelOf(s.version))
    throw new Error(`channel ${s.channel} does not match version ${s.version}`);
  if (serialisedBytes > LIMITS.statementBytes)
    throw new Error(`the statement is above ${LIMITS.statementBytes} bytes`);
}

/** §2 invariants 4 and 5: the statement and the manifest describe the same release. */
export function checkStatementManifest(s: Statement, m: ManifestFacts): void {
  if (s.signing.keyId !== m.signing.keyId)
    throw new Error("the statement and the manifest name different keys");
  for (const k of ["version", "channel", "securityRelease", "commit", "createdAt"] as const)
    if (s[k] !== m[k]) throw new Error(`the statement's ${k} is not the manifest's`);
}

/** §2 invariant 7: the statement is for the version (and channel) that was asked for. */
export function checkRequested(s: Statement, version: string, channel?: string): void {
  if (s.version !== version) throw new Error(`the statement is for ${s.version}, not ${version}`);
  const want = channel ?? channelOf(version);
  if (s.channel !== want) throw new Error(`the statement is for channel ${s.channel}, not ${want}`);
}
