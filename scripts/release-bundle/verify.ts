/**
 * Verifies a release bundle directory the way a consumer would (RFC-0046 §2), plus the producer's
 * own format checks: canonical bytes, both schemas, §2's invariants (including invariant 7 against
 * the requested version and channel), §7's limits and tar format, every listed part present with
 * its size and SHA-256, no unlisted entry, and, when asked, the Ed25519 signature with a pinned key.
 * The builder runs it over its own unsigned output; `release-bundle.ts verify` runs it on demand.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { assertValid, type ReleaseManifest } from "../../packages/core-contracts/src/index.ts";
import { canonicalJson, LIMITS, manifestParts, sha256 } from "./manifest.ts";
import { verifySignature } from "./signature.ts";
import {
  checkRequested,
  checkStatement,
  checkStatementManifest,
  MANIFEST_FILE,
  SIGNATURE_FILE,
  STATEMENT_FILE,
  type Statement,
  type StatementAsset,
  tarballName,
} from "./statement.ts";
import { checkGzipHeader, gunzipBytes, readTar } from "./tar-read.ts";

export interface VerifyOptions {
  /** The version the caller asked for (§2 invariant 7). */
  readonly version: string;
  /** The channel the caller asked for; default the one the version implies. */
  readonly channel?: string;
  /** Require `release-statement.sig` and verify it with `publicKeys[keyId]` (raw, base64). */
  readonly signed?: boolean;
  readonly publicKeys?: Readonly<Record<string, string>>;
}

export interface VerifyResult {
  readonly statement: Statement;
  readonly parts: number;
  readonly tarballBytes: number;
}

function read(dir: string, name: string, max: number): Uint8Array {
  const p = path.join(dir, name);
  if (!existsSync(p)) throw new Error(`${name} is missing`);
  const bytes = readFileSync(p);
  if (bytes.length > max) throw new Error(`${name} is above ${max} bytes`);
  return bytes;
}

const text = (b: Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(b);

/** The document of `bytes`, refused unless they are its canonical serialisation. */
function canonicalDoc(name: string, bytes: Uint8Array): unknown {
  const doc = JSON.parse(text(bytes)) as unknown;
  if (canonicalJson(doc) !== text(bytes)) throw new Error(`${name} is not canonical JSON`);
  return doc;
}

function checkAsset(name: string, bytes: Uint8Array, want: StatementAsset): void {
  if (bytes.length !== want.bytes || sha256(bytes) !== want.sha256)
    throw new Error(`${name} does not match the statement's size and SHA-256`);
}

/** Every tar entry is a listed part with its size and SHA-256, and every listed part is there. */
export function checkParts(
  entries: readonly { path: string; bytes: Uint8Array }[],
  manifest: ReleaseManifest,
): void {
  const listed = manifestParts(manifest);
  let previous = "";
  for (const e of entries) {
    if (e.path <= previous) throw new Error(`${e.path}: tar entries are not sorted and unique`);
    previous = e.path;
    const want = listed.get(e.path);
    if (!want) throw new Error(`${e.path} is in the tarball but not in the manifest`);
    if (e.bytes.length !== want.bytes || sha256(e.bytes) !== want.sha256)
      throw new Error(`${e.path} does not match the manifest's size and SHA-256`);
    listed.delete(e.path);
  }
  const left = [...listed.keys()];
  if (left.length) throw new Error(`${left[0]} is in the manifest but not in the tarball`);
}

/** Verifies the bundle in `dir` (see the file comment); throws on the first problem. */
export async function verifyBundle(dir: string, o: VerifyOptions): Promise<VerifyResult> {
  const statementBytes = read(dir, STATEMENT_FILE, LIMITS.statementBytes);
  const doc = canonicalDoc(STATEMENT_FILE, statementBytes);
  if (o.signed) {
    const keyId = (doc as { signing?: { keyId?: unknown } }).signing?.keyId;
    const sig = read(dir, SIGNATURE_FILE, 64);
    verifySignature(statementBytes, sig, String(keyId), o.publicKeys ?? {});
  }
  assertValid("release-statement", doc);
  const statement = doc as Statement;
  checkRequested(statement, o.version, o.channel);
  checkStatement(statement, statementBytes.length);

  const manifestBytes = read(dir, MANIFEST_FILE, LIMITS.manifestBytes);
  checkAsset(MANIFEST_FILE, manifestBytes, statement.manifest);
  const manifest = canonicalDoc(MANIFEST_FILE, manifestBytes);
  assertValid("release-manifest", manifest);
  checkStatementManifest(statement, manifest);
  if (manifest.signing.signature !== SIGNATURE_FILE)
    throw new Error(`${MANIFEST_FILE} does not name ${SIGNATURE_FILE}`);

  const name = tarballName(o.version);
  const tarball = read(dir, name, LIMITS.tarballBytes);
  checkAsset(name, tarball, statement.tarball);
  checkGzipHeader(tarball);
  const entries = readTar(await gunzipBytes(tarball), Date.parse(statement.createdAt) / 1000);
  checkParts(entries, manifest);
  return { statement, parts: entries.length, tarballBytes: tarball.length };
}
