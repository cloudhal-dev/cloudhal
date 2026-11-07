/**
 * The manifest's `files` list against the layout: every path in it, in archive order, once; part
 * numbers contiguous from 0001; each size within its cap; media named by their own hash; and the
 * media counts equal to the media listed.
 */
import { ArchiveError, printable } from "./errors.ts";
import {
  type ArchiveSlot,
  classifyPath,
  compareSlots,
  MANIFEST_PATH,
  type PartKind,
  SHA256_HEX,
} from "./layout.ts";
import type { ArchiveLimits } from "./limits.ts";
import type { ArchiveCounts, ArchiveFile } from "./manifest.ts";
import { tarLength } from "./tar.ts";

const FILE_KEYS = ["path", "sha256", "bytes"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An `invalid_manifest` error about `manifest.json`. */
export function manifestError(message: string): ArchiveError {
  return new ArchiveError("invalid_manifest", `manifest.json: ${message}`, {
    path: MANIFEST_PATH,
  });
}

/** What an unknown key that is not safe to print is replaced with. */
const HIDDEN_KEY = "(not shown: it has spaces, controls or non-ASCII characters)";

/** Refuses a key of `value` that is not `allowed`, echoing it only when that is safe. */
export function checkKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw manifestError(`${where} has an unknown key ${printable(key, HIDDEN_KEY)}`);
}

function tooLarge(message: string): ArchiveError {
  return new ArchiveError("too_large", `manifest.json: ${message}`, { path: MANIFEST_PATH });
}

/** One entry of `files`: its shape, its path, its hash and its size cap. */
function checkEntry(
  raw: unknown,
  at: string,
  limits: ArchiveLimits,
): { file: ArchiveFile; slot: ArchiveSlot } {
  if (!isRecord(raw)) throw manifestError(`${at} must be an object`);
  checkKeys(raw, FILE_KEYS, at);
  const { path, sha256, bytes } = raw;
  if (typeof path !== "string") throw manifestError(`${at}.path must be a string`);
  const slot = classifyPath(path);
  if (slot === undefined || slot.kind === "manifest")
    throw manifestError(`${at} names ${printable(path)}, which is not a path a site archive holds`);
  if (typeof sha256 !== "string" || !SHA256_HEX.test(sha256))
    throw manifestError(`${at} (${path}) needs a lowercase hex SHA-256`);
  if (slot.kind === "media" && sha256 !== slot.sha256)
    throw manifestError(`${at} (${path}) is listed with a SHA-256 other than its name`);
  if (!Number.isSafeInteger(bytes) || (bytes as number) < 0)
    throw manifestError(`${at} (${path}) needs a non-negative integer size`);
  const size = bytes as number;
  if (slot.kind !== "media" && size === 0) throw manifestError(`${at} (${path}) is empty`);
  const cap = slot.kind === "media" ? limits.mediaBytes : limits.partBytes;
  if (size > cap) throw tooLarge(`${path} is ${size} bytes, above the ${cap}-byte cap`);
  return { file: { path, sha256, bytes: size }, slot };
}

/** The checked `files` list of a manifest. */
export function checkManifestFiles(
  raw: unknown,
  context: {
    counts: ArchiveCounts;
    mediaOmitted: boolean;
    limits: ArchiveLimits;
    /** The manifest's own size, for the decompressed total. */
    manifestBytes: number;
  },
): ArchiveFile[] {
  const { counts, limits } = context;
  if (!Array.isArray(raw)) throw manifestError("files must be an array");
  if (raw.length + 1 > limits.entries)
    throw tooLarge(`${raw.length + 1} entries, above the cap of ${limits.entries}`);
  const files: ArchiveFile[] = [];
  const nextPart: Record<PartKind, number> = { nodes: 1, snapshots: 1, blobs: 1 };
  let previous: ArchiveSlot = { kind: "manifest" };
  let media = 0;
  let mediaBytes = 0;
  for (const [i, entry] of raw.entries()) {
    const { file, slot } = checkEntry(entry, `files[${i}]`, limits);
    if (compareSlots(previous, slot) >= 0)
      throw manifestError(`files[${i}] (${file.path}) is listed twice or out of order`);
    if (slot.kind === "part") {
      if (slot.index !== nextPart[slot.part])
        throw manifestError(`files[${i}] (${file.path}) leaves a gap in the ${slot.part} parts`);
      nextPart[slot.part] = slot.index + 1;
    }
    if (slot.kind === "media") {
      media++;
      mediaBytes += file.bytes;
    }
    previous = slot;
    files.push(file);
  }
  const total = tarLength([context.manifestBytes, ...files.map((f) => f.bytes)]);
  if (total > limits.totalBytes)
    throw tooLarge(
      `the archive is ${total} bytes decompressed, above the ${limits.totalBytes}-byte cap`,
    );
  if (counts.media !== media || counts.mediaBytes !== mediaBytes)
    throw manifestError(`counts.media and counts.mediaBytes must be ${media} and ${mediaBytes}`);
  if (context.mediaOmitted && media > 0) throw manifestError("mediaOmitted, yet media are listed");
  return files;
}
