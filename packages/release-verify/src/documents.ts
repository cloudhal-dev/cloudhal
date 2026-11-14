/**
 * The statement and the manifest (RFC-0046 §2 steps 1 to 5): sizes, the Ed25519 signature with a
 * trusted key, the binding to the request (invariant 7), both precompiled validators, the
 * invariants the schemas cannot express, and the manifest's listings (paths and §7 limits).
 */
import { refuse } from "./errors.ts";
import type { ReleaseManifest } from "./generated/release-manifest.ts";
import type { ReleaseStatement } from "./generated/release-statement.ts";
import { validateReleaseManifest, validateReleaseStatement } from "./generated/validators.js";
import { channelOf, LIMITS, MANIFEST_FILE, SIGNATURE_FILE, tarballName } from "./limits.ts";
import { checkNoFoldedDuplicates, checkPath } from "./paths.ts";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The JSON document in `bytes`, or the refusal `code`. */
export function parseJson(
  bytes: Uint8Array,
  code: "statement-invalid" | "manifest-invalid",
): unknown {
  try {
    return JSON.parse(utf8.decode(bytes));
  } catch {
    return refuse(
      code,
      `${code === "statement-invalid" ? "the statement" : "the manifest"} is not UTF-8 JSON`,
    );
  }
}

const firstError = (errors?: { instancePath: string; message?: string }[] | null) =>
  errors?.[0] ? `${errors[0].instancePath || "/"} ${errors[0].message ?? ""}`.trim() : "invalid";

/** §2 step 4: the schema, then invariants 1, 2, 3 and 6. */
export function checkStatementDoc(doc: unknown, serialisedBytes: number): ReleaseStatement {
  if (!validateReleaseStatement(doc))
    refuse("statement-invalid", `the statement: ${firstError(validateReleaseStatement.errors)}`);
  const s = doc;
  if (s.manifest.name !== MANIFEST_FILE)
    refuse("statement-invalid", `statement.manifest.name is not ${MANIFEST_FILE}`);
  if (s.tarball.name !== tarballName(s.version))
    refuse("statement-invalid", `statement.tarball.name is not ${tarballName(s.version)}`);
  if (s.manifest.bytes > LIMITS.manifestBytes)
    refuse("statement-invalid", `the manifest is above ${LIMITS.manifestBytes} bytes`);
  if (s.channel !== channelOf(s.version))
    refuse("statement-invalid", `channel ${s.channel} does not match version ${s.version}`);
  if (serialisedBytes > LIMITS.statementBytes)
    refuse("statement-too-large", `the statement is above ${LIMITS.statementBytes} bytes`);
  return s;
}

/** §2 step 3 (invariant 7): the statement is for the version and channel that were asked for. */
export function checkRequested(doc: unknown, version: string, channel?: "stable" | "next"): void {
  const s = (doc ?? {}) as { version?: unknown; channel?: unknown };
  if (s.version !== version)
    refuse("wrong-version", `the statement is for ${String(s.version)}, not ${version}`);
  const want = channel ?? channelOf(version);
  if (s.channel !== want)
    refuse("wrong-channel", `the statement is for channel ${String(s.channel)}, not ${want}`);
}

/** §2 step 5 after the digest: the schema, invariants 4 and 5, the signature form, planVersion. */
export function checkManifestDoc(
  doc: unknown,
  statement: ReleaseStatement,
  planVersion: number,
): ReleaseManifest {
  if (!validateReleaseManifest(doc))
    refuse("manifest-invalid", `the manifest: ${firstError(validateReleaseManifest.errors)}`);
  const m = doc;
  if (m.signing.keyId !== statement.signing.keyId)
    refuse("statement-manifest-mismatch", "the statement and the manifest name different keys");
  for (const k of ["version", "channel", "securityRelease", "commit", "createdAt"] as const)
    if (m[k] !== statement[k])
      refuse("statement-manifest-mismatch", `the statement's ${k} is not the manifest's`);
  // A project key never signs the legacy manifest.sig form (§1).
  if (m.signing.signature !== SIGNATURE_FILE)
    refuse("manifest-invalid", `the manifest does not name ${SIGNATURE_FILE}`);
  if (m.planVersion > planVersion)
    refuse("plan-version-unsupported", `planVersion ${m.planVersion} is above ${planVersion}`);
  checkListings(m);
  return m;
}

export type Worker = "site" | "admin";

/** One part the manifest lists, by its tar path. */
export interface ListedPart {
  readonly worker: Worker | null;
  readonly kind: "module" | "asset" | "starter";
  /** The module path, the asset path (`/x`), or the starter's `starter/<file>`. */
  readonly path: string;
  readonly type?: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Every part the manifest lists, keyed by its tar path (`site/modules/x.mjs`, …). */
export function listedParts(m: ReleaseManifest): Map<string, ListedPart> {
  const out = new Map<string, ListedPart>();
  for (const worker of ["site", "admin"] as const) {
    const w = m.workers[worker];
    for (const mod of w.modules)
      out.set(`${worker}/modules/${mod.path}`, { worker, kind: "module", ...mod });
    for (const f of w.assets.files)
      out.set(`${worker}/assets${f.path}`, {
        worker,
        kind: "asset",
        path: f.path,
        bytes: f.bytes,
        sha256: f.sha256,
      });
  }
  if (m.starter.kind === "bundle") {
    const s = m.starter;
    out.set(s.path, {
      worker: null,
      kind: "starter",
      path: s.path,
      bytes: s.bytes,
      sha256: s.sha256,
    });
  }
  return out;
}

/** Paths (§11a) and §7's limits over every listing, before the tarball is read. */
function checkListings(m: ReleaseManifest): void {
  let parts = 0;
  for (const worker of ["site", "admin"] as const) {
    const w = m.workers[worker];
    for (const mod of w.modules) {
      checkPath(mod.path, "module", `${worker} module`);
      if (mod.bytes > LIMITS.partBytes)
        refuse("limit-exceeded", `${worker} module ${mod.path} is above ${LIMITS.partBytes} bytes`);
    }
    checkNoFoldedDuplicates(
      w.modules.map((x) => x.path),
      `${worker} modules`,
    );
    const files = w.assets.files;
    if (files.length > LIMITS.assetsPerWorker)
      refuse("limit-exceeded", `${worker}: more than ${LIMITS.assetsPerWorker} assets`);
    for (const f of files) {
      checkPath(f.path, "asset", `${worker} asset`);
      if (f.bytes > LIMITS.assetBytes)
        refuse("limit-exceeded", `${worker} asset ${f.path} is above ${LIMITS.assetBytes} bytes`);
    }
    checkNoFoldedDuplicates(
      files.map((x) => x.path),
      `${worker} assets`,
    );
    parts += w.modules.length + files.length;
  }
  if (m.starter.kind === "bundle") {
    checkPath(m.starter.path, "entry", "starter");
    parts++;
  }
  if (parts > LIMITS.tarEntries)
    refuse("limit-exceeded", `the manifest lists more than ${LIMITS.tarEntries} parts`);
}
