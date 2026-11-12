/**
 * Builds a release bundle in memory (RFC-0046 §4 step 4): the manifest, the sorted tarball and
 * the **unsigned** statement, each validated with the precompiled `@cloudhal/core-contracts`
 * validators and checked against §7's limits. A part (or the manifest, which carries the
 * `_headers` text) that contains a value of the project's generated deploy secrets is refused;
 * the error names the part and the secret's position, never the value.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertValid } from "../../packages/core-contracts/src/index.ts";
import {
  bundleEntries,
  canonicalJson,
  checkLimits,
  LIMITS,
  manifestOf,
  type ReleaseFacts,
} from "./manifest.ts";
import type { BuildOutput, SourceFile } from "./read-build.ts";
import {
  MANIFEST_FILE,
  STATEMENT_FILE,
  type Statement,
  statementOf,
  tarballName,
} from "./statement.ts";
import { gzipBytes, tarArchive } from "./tar.ts";

export interface ReleaseBundle {
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly manifestBytes: Uint8Array;
  readonly tarball: Uint8Array;
  readonly statement: Statement;
  readonly statementBytes: Uint8Array;
  /** The three unsigned assets by file name. */
  readonly files: Readonly<Record<string, Uint8Array>>;
  /** Bundle paths of every part, in tar (sorted) order. */
  readonly parts: readonly string[];
}

/** Project keys and dry-run keys; a `dev-` key belongs to the legacy `manifest.sig` form. */
const RELEASE_KEY_ID = /^(?!dev-)[a-z0-9][a-z0-9-]{2,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const WHOLE_SECOND_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** Refuses any part (or the manifest) that contains one of `secrets`. */
export function scanForSecrets(
  parts: readonly SourceFile[],
  manifestBytes: Uint8Array,
  secrets: readonly string[],
): void {
  const needles = secrets.map((s) => Buffer.from(s, "utf8"));
  const all = [...parts, { path: MANIFEST_FILE, bytes: manifestBytes }];
  for (const part of all) {
    const hay = Buffer.from(part.bytes.buffer, part.bytes.byteOffset, part.bytes.byteLength);
    const hit = needles.findIndex((n) => hay.indexOf(n) !== -1);
    if (hit !== -1)
      throw new Error(
        `${part.path} contains generated deploy secret #${hit + 1}; a bundle must carry no secret`,
      );
  }
}

function checkFacts(facts: ReleaseFacts): void {
  if (!COMMIT.test(facts.commit)) throw new Error("--commit must be 40 lowercase hex digits");
  if (!WHOLE_SECOND_UTC.test(facts.createdAt) || Number.isNaN(Date.parse(facts.createdAt)))
    throw new Error("createdAt must be a whole-second UTC time (YYYY-MM-DDTHH:MM:SSZ)");
  if (!RELEASE_KEY_ID.test(facts.keyId))
    throw new Error(`--key-id must match ${RELEASE_KEY_ID} (dev- keys sign manifest.sig only)`);
}

/** The manifest, the tarball and the unsigned statement of `build` (see the file comment). */
export async function buildReleaseBundle(
  build: BuildOutput,
  facts: ReleaseFacts,
  secrets: readonly string[],
): Promise<ReleaseBundle> {
  checkFacts(facts);
  const manifest = manifestOf(build, facts);
  assertValid("release-manifest", manifest);
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
  if (manifestBytes.length > LIMITS.manifestBytes)
    throw new Error(
      `the manifest is ${manifestBytes.length} bytes; at most ${LIMITS.manifestBytes}`,
    );
  const entries = bundleEntries(build);
  checkLimits(build, entries);
  scanForSecrets(entries, manifestBytes, secrets);
  const mtime = Date.parse(facts.createdAt) / 1000;
  const tarball = await gzipBytes(tarArchive(entries, mtime));
  if (tarball.length > LIMITS.tarballBytes)
    throw new Error(`the tarball is ${tarball.length} bytes; at most ${LIMITS.tarballBytes}`);
  const { statement, bytes: statementBytes } = statementOf(manifest, manifestBytes, tarball);
  assertValid("release-statement", statement);
  return {
    manifest,
    manifestBytes,
    tarball,
    statement,
    statementBytes,
    files: {
      [tarballName(facts.version)]: tarball,
      [MANIFEST_FILE]: manifestBytes,
      [STATEMENT_FILE]: statementBytes,
    },
    parts: entries.map((e) => e.path),
  };
}

/** Writes the three unsigned assets into `outDir`; returns their paths. */
export function writeReleaseBundle(bundle: ReleaseBundle, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  return Object.entries(bundle.files).map(([name, bytes]) => {
    const p = path.join(outDir, name);
    writeFileSync(p, bytes);
    return p;
  });
}
