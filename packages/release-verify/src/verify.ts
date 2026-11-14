/**
 * `verifyRelease` (RFC-0046 §2, §11a): the six steps of §2 in order, with no soft-fail anywhere.
 *
 *   1. sizes: the statement at most 4096 bytes, the signature exactly 64;
 *   2. Ed25519 over the exact statement bytes with a trusted key for `signing.keyId`;
 *   3. the statement is for the requested version and channel (invariant 7);
 *   4. the statement's schema and invariants 1, 2, 3 and 6;
 *   5. the manifest: size and SHA-256 equal the statement's, schema, invariants 4 and 5, the
 *      signature form, `planVersion`, and every listing (paths, §7 limits);
 *   6. the tarball, read once: size and SHA-256 equal the statement's.
 *
 * `entries()` then reads the tarball a second time and yields each entry only after its path is
 * safe and its size and SHA-256 equal its listing; it throws on an unlisted entry, on anything
 * outside §7's tar format and, at the end, on a listed entry that never came. A consumer may upload
 * entries while it iterates; it must not activate a deployment until the iteration has finished.
 */

import { incrementalSha256, sha256Hex, verifyEd25519 } from "./crypto.ts";
import {
  checkManifestDoc,
  checkRequested,
  checkStatementDoc,
  type ListedPart,
  listedParts,
  parseJson,
  type Worker,
} from "./documents.ts";
import { refuse } from "./errors.ts";
import type { ReleaseManifest } from "./generated/release-manifest.ts";
import type { ReleaseStatement } from "./generated/release-statement.ts";
import { PINNED_KEYS, type ReleaseKeys, trustedKey } from "./keys.ts";
import { LIMITS } from "./limits.ts";
import { checkPath } from "./paths.ts";
import { type ByteSource, chunksOf, gunzip, readTar } from "./tar.ts";

export interface VerifyReleaseInput {
  /** What the consumer asked for; `channel` defaults to the one the version implies. */
  readonly request: { readonly version: string; readonly channel?: "stable" | "next" };
  /** The exact downloaded bytes; nothing is re-serialised. */
  readonly statement: Uint8Array;
  readonly signature: Uint8Array;
  readonly manifest: Uint8Array;
  /** Opens the tarball; called twice (the digest pass, then `entries()`). */
  readonly tarball: () => ByteSource | Promise<ByteSource>;
  /** The highest `planVersion` the caller supports. */
  readonly planVersion: number;
  /** The trusted keys (default `PINNED_KEYS`); see keys.ts. */
  readonly keys?: ReleaseKeys;
  /** Key ids to distrust on top of `keys` (reduce-only). */
  readonly revoked?: readonly string[];
}

export interface VerifiedEntry {
  readonly worker: Worker | null;
  readonly kind: "module" | "asset" | "starter";
  /** The module path, the asset path (`/x`), or `starter/<file>`. */
  readonly path: string;
  /** The tar path (`site/modules/x.mjs`). */
  readonly tarPath: string;
  /** A module's type from the manifest (`esm`, `cjs`, `wasm`, `text`, `data`). */
  readonly type?: string;
  readonly bytes: Uint8Array;
}

export interface VerifiedRelease {
  readonly statement: ReleaseStatement;
  readonly manifest: ReleaseManifest;
  entries(): AsyncGenerator<VerifiedEntry>;
}

export async function verifyRelease(input: VerifyReleaseInput): Promise<VerifiedRelease> {
  // 1.
  if (input.statement.length > LIMITS.statementBytes)
    refuse("statement-too-large", `the statement is above ${LIMITS.statementBytes} bytes`);
  if (input.signature.length !== 64)
    refuse("signature-size", `the signature is ${input.signature.length} bytes, not 64`);
  // 2.
  const doc = parseJson(input.statement, "statement-invalid");
  const keyId = (doc as { signing?: { keyId?: unknown } } | null)?.signing?.keyId;
  if (typeof keyId !== "string") refuse("statement-invalid", "the statement names no key");
  const key = trustedKey(input.keys ?? PINNED_KEYS, input.revoked ?? [], keyId);
  if (!(await verifyEd25519(key, input.statement, input.signature)))
    refuse("signature-invalid", `the signature does not verify with ${keyId}`);
  // 3. and 4.
  checkRequested(doc, input.request.version, input.request.channel);
  const statement = checkStatementDoc(doc, input.statement.length);
  // 5.
  if (
    input.manifest.length !== statement.manifest.bytes ||
    (await sha256Hex(input.manifest)) !== statement.manifest.sha256
  )
    refuse("manifest-mismatch", "manifest.json is not the file the statement pins");
  const manifest = checkManifestDoc(
    parseJson(input.manifest, "manifest-invalid"),
    statement,
    input.planVersion,
  );
  // 6.
  await checkTarballDigest(await input.tarball(), statement.tarball);
  const listed = listedParts(manifest);
  const mtime = Date.parse(statement.createdAt) / 1000;
  return {
    statement,
    manifest,
    entries: () => verifiedEntries(input.tarball, listed, mtime),
  };
}

async function checkTarballDigest(
  source: ByteSource,
  want: { readonly bytes: number; readonly sha256: string },
): Promise<void> {
  const h = incrementalSha256();
  let bytes = 0;
  for await (const chunk of chunksOf(source)) {
    bytes += chunk.length;
    if (bytes > want.bytes) refuse("tarball-mismatch", "the tarball is larger than its statement");
    await h.update(chunk);
  }
  if (bytes !== want.bytes || (await h.digest()) !== want.sha256)
    refuse("tarball-mismatch", "the tarball is not the file the statement pins");
}

/**
 * The second pass (step 6's entries), exported for the producer's self-check
 * (scripts/release-bundle/verify.ts); not part of the package's public exports.
 */
export async function* verifiedEntries(
  open: VerifyReleaseInput["tarball"],
  listed: ReadonlyMap<string, ListedPart>,
  mtime: number,
): AsyncGenerator<VerifiedEntry> {
  const left = new Map(listed);
  let previous = "";
  const admit = (tarPath: string, size: number) => {
    checkPath(tarPath, "entry", "tar entry");
    if (tarPath <= previous)
      refuse("tar-format", `${tarPath}: tar entries are not sorted and unique`);
    previous = tarPath;
    const part = left.get(tarPath);
    if (!part) refuse("entry-unlisted", `${tarPath} is in the tarball but not in the manifest`);
    if (size !== part.bytes)
      refuse("entry-mismatch", `${tarPath} is not the size its listing says`);
  };
  for await (const e of readTar(gunzip(await open()), mtime, admit)) {
    const part = left.get(e.path) as ListedPart;
    if ((await sha256Hex(e.bytes)) !== part.sha256)
      refuse("entry-mismatch", `${e.path} does not match the manifest's SHA-256`);
    left.delete(e.path);
    yield {
      worker: part.worker,
      kind: part.kind,
      path: part.path,
      tarPath: e.path,
      ...(part.type !== undefined ? { type: part.type } : {}),
      bytes: e.bytes,
    };
  }
  const missing = left.keys().next();
  if (!missing.done) refuse("entry-missing", `${missing.value} is listed but not in the tarball`);
}
