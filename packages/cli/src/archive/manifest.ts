/**
 * `manifest.json`, the first entry of a site archive (RFC-0039 §1): its type, its canonical bytes
 * and the hand-written check of untrusted ones. Not a contract schema (like `SiteBundle`), so no
 * Ajv: the version gate runs first, so a newer archive is refused with the CLI version it needs
 * before its shape is judged; then the shape is checked strictly, unknown keys included.
 */
import { CONTRACT_SCHEMA_VERSION } from "@cloudhal/core-contracts";
import { SITE_BUNDLE_FORMAT } from "@cloudhal/core-ts";
import { ArchiveError } from "./errors.ts";
import type { ArchiveLimits } from "./limits.ts";
import { checkKeys, checkManifestFiles, isRecord, manifestError } from "./manifest-files.ts";

export const SITE_ARCHIVE_FORMAT = "cloudhal.site-archive@1" as const;

/** One file of the archive other than the manifest. */
export interface ArchiveFile {
  path: string;
  sha256: string;
  bytes: number;
}

/** Rows of the NDJSON parts, and the media files with their total size. */
export interface ArchiveCounts {
  nodes: number;
  snapshots: number;
  blobs: number;
  media: number;
  mediaBytes: number;
}

export interface SiteArchiveManifest {
  format: typeof SITE_ARCHIVE_FORMAT;
  /** The contracts' schemaVersion the rows were written with. */
  contracts: { schemaVersion: number };
  /** The bundle format the parts reassemble into. */
  bundle: typeof SITE_BUNDLE_FORMAT;
  siteId: string;
  siteName: string;
  /** The `@cloudhal/cli` version that wrote it. */
  createdBy: string;
  /** RFC 3339; from the content, never the wall clock (invariant 7). */
  createdAt: string;
  counts: ArchiveCounts;
  /** Every other file, in archive order, with its SHA-256 and size. */
  files: ArchiveFile[];
  /** Written without media: they must come from elsewhere. */
  mediaOmitted?: true;
}

const TOP_KEYS = [
  "format",
  "contracts",
  "bundle",
  "siteId",
  "siteName",
  "createdBy",
  "createdAt",
  "counts",
  "files",
  "mediaOmitted",
] as const;
const COUNT_KEYS = ["nodes", "snapshots", "blobs", "media", "mediaBytes"] as const;

const FORMAT = /^cloudhal\.site-archive@([1-9][0-9]{0,5})$/;
const BUNDLE = /^cloudhal\.site-bundle@([1-9][0-9]{0,5})$/;
/** A version as `createdBy` may carry it, safe to print. */
const VERSION_TOKEN = /^[0-9A-Za-z.+-]{1,64}$/;
/** common.schema.json `$defs/Id`. */
const ID = /^[a-z]+_[A-Za-z0-9]{6,32}$/;
const RFC3339 =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$/;
/** Site.name (site.schema.json). */
const MAX_SITE_NAME = 200;

/** The manifest's bytes: RFC key order, two-space JSON and a final newline, so it reads and diffs. */
export function encodeManifest(m: SiteArchiveManifest): Uint8Array {
  const { nodes, snapshots, blobs, media, mediaBytes } = m.counts;
  const canonical = {
    format: m.format,
    contracts: { schemaVersion: m.contracts.schemaVersion },
    bundle: m.bundle,
    siteId: m.siteId,
    siteName: m.siteName,
    createdBy: m.createdBy,
    createdAt: m.createdAt,
    counts: { nodes, snapshots, blobs, media, mediaBytes },
    files: m.files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
    ...(m.mediaOmitted === true ? { mediaOmitted: true } : {}),
  };
  return new TextEncoder().encode(`${JSON.stringify(canonical, null, 2)}\n`);
}

function versionNumber(value: unknown, pattern: RegExp): number | undefined {
  const match = typeof value === "string" ? pattern.exec(value) : null;
  return match ? Number(match[1]) : undefined;
}

/** What in `raw` is newer than this reader, if anything. */
function newerPart(raw: Record<string, unknown>, format: number): string | undefined {
  if (format > 1) return `archive format ${raw.format as string}`;
  const contracts = isRecord(raw.contracts) ? raw.contracts.schemaVersion : undefined;
  if (Number.isInteger(contracts) && (contracts as number) > CONTRACT_SCHEMA_VERSION)
    return `contracts schemaVersion ${contracts as number}`;
  const bundle = versionNumber(raw.bundle, BUNDLE);
  if (bundle !== undefined && bundle > 1) return `bundle format ${raw.bundle as string}`;
  return undefined;
}

/** Refuses what only a newer Cloudhal can read, naming the CLI version that wrote it. */
function checkVersion(raw: Record<string, unknown>): void {
  const format = versionNumber(raw.format, FORMAT);
  if (format === undefined)
    throw new ArchiveError("not_archive", "not a Cloudhal site archive (unknown manifest format)");
  const newer = newerPart(raw, format);
  if (newer === undefined) return;
  const version =
    typeof raw.createdBy === "string" && VERSION_TOKEN.test(raw.createdBy)
      ? `${raw.createdBy} or later`
      : "a newer version";
  throw new ArchiveError(
    "unsupported_version",
    `this archive was written by a newer Cloudhal (${newer}); update @cloudhal/cli to ${version}`,
  );
}

function checkCounts(raw: unknown): ArchiveCounts {
  if (!isRecord(raw)) throw manifestError("counts must be an object");
  checkKeys(raw, COUNT_KEYS, "counts");
  for (const key of COUNT_KEYS) {
    const n = raw[key];
    if (!Number.isSafeInteger(n) || (n as number) < 0)
      throw manifestError(`counts.${key} must be a non-negative integer`);
  }
  return raw as unknown as ArchiveCounts;
}

function checkStrings(raw: Record<string, unknown>): void {
  if (raw.bundle !== SITE_BUNDLE_FORMAT)
    throw manifestError(`bundle must be ${SITE_BUNDLE_FORMAT}`);
  if (typeof raw.siteId !== "string" || !ID.test(raw.siteId))
    throw manifestError("siteId must be a site id");
  const name = raw.siteName;
  if (typeof name !== "string" || name.length === 0 || [...name].length > MAX_SITE_NAME)
    throw manifestError(`siteName must be a string of 1-${MAX_SITE_NAME} characters`);
  if (typeof raw.createdBy !== "string" || !VERSION_TOKEN.test(raw.createdBy))
    throw manifestError("createdBy must be a version (letters, digits, '.', '+', '-')");
  const at = raw.createdAt;
  if (typeof at !== "string" || !RFC3339.test(at) || Number.isNaN(Date.parse(at)))
    throw manifestError("createdAt must be an RFC 3339 timestamp");
}

/** The shape check, after the version gate. */
function checkShape(
  raw: Record<string, unknown>,
  size: number,
  limits: ArchiveLimits,
): SiteArchiveManifest {
  checkKeys(raw, TOP_KEYS, "the manifest");
  for (const key of TOP_KEYS)
    if (key !== "mediaOmitted" && !(key in raw)) throw manifestError(`${key} is missing`);
  if (!isRecord(raw.contracts)) throw manifestError("contracts must be an object");
  checkKeys(raw.contracts, ["schemaVersion"], "contracts");
  const schemaVersion = raw.contracts.schemaVersion;
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 1)
    throw manifestError("contracts.schemaVersion must be a positive integer");
  checkStrings(raw);
  if (raw.mediaOmitted !== undefined && raw.mediaOmitted !== true)
    throw manifestError("mediaOmitted must be true when present");
  const counts = checkCounts(raw.counts);
  const mediaOmitted = raw.mediaOmitted === true;
  const files = checkManifestFiles(raw.files, {
    counts,
    mediaOmitted,
    limits,
    manifestBytes: size,
  });
  return {
    format: SITE_ARCHIVE_FORMAT,
    contracts: { schemaVersion: schemaVersion as number },
    bundle: SITE_BUNDLE_FORMAT,
    siteId: raw.siteId as string,
    siteName: raw.siteName as string,
    createdBy: raw.createdBy as string,
    createdAt: raw.createdAt as string,
    counts: {
      nodes: counts.nodes,
      snapshots: counts.snapshots,
      blobs: counts.blobs,
      media: counts.media,
      mediaBytes: counts.mediaBytes,
    },
    files,
    ...(mediaOmitted ? { mediaOmitted: true as const } : {}),
  };
}

/** Untrusted manifest bytes to a manifest, or the reason they are refused. */
export function parseManifest(bytes: Uint8Array, limits: ArchiveLimits): SiteArchiveManifest {
  if (bytes.length > limits.manifestBytes)
    throw new ArchiveError("too_large", `manifest.json is above ${limits.manifestBytes} bytes`, {
      path: "manifest.json",
    });
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    throw manifestError("it is not UTF-8 JSON");
  }
  if (!isRecord(raw))
    throw new ArchiveError(
      "not_archive",
      "not a Cloudhal site archive (the manifest is not an object)",
    );
  checkVersion(raw);
  return checkShape(raw, bytes.length, limits);
}
