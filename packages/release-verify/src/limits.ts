/**
 * RFC-0046 §1 asset names and §7's normative limits. `scripts/release-bundle/manifest.ts` (the
 * producer) holds the same numbers; test/limits.test.ts keeps the two equal.
 */
export const LIMITS = {
  manifestBytes: 1_900_000,
  statementBytes: 4096,
  tarballBytes: 104_857_600,
  partBytes: 64 * 1024 * 1024,
  assetBytes: 25 * 1024 * 1024,
  assetsPerWorker: 20_000,
  tarEntries: 30_000,
} as const;

/** The largest decompressed tar a release may hold: every part at its limit is far beyond it. */
export const MAX_TAR_BYTES = 1024 * 1024 * 1024;

/** The longest path, in UTF-8 bytes, a manifest listing or a tar entry may carry (§11a). */
export const MAX_PATH_BYTES = 512;

export const STATEMENT_FILE = "release-statement.json";
export const SIGNATURE_FILE = "release-statement.sig";
export const MANIFEST_FILE = "manifest.json";
export const tarballName = (version: string): string => `cloudhal-release-${version}.tar.gz`;
export const sigstoreName = (version: string): string =>
  `cloudhal-release-${version}.sigstore.json`;

/** `X.Y.Z-<pre>` ⇔ `next` (§2 invariant 3, §6). */
export const channelOf = (version: string): "stable" | "next" =>
  version.includes("-") ? "next" : "stable";
