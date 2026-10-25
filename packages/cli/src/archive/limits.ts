/**
 * Caps for reading untrusted archives (RFC-0039 Security) and the NDJSON part size of the writer.
 * Tests lower the caps through `archiveLimits`; the writer refuses content its own reader would
 * refuse under the same limits.
 */
import { ArchiveError } from "./errors.ts";

const MiB = 1024 * 1024;

export interface ArchiveLimits {
  /** `manifest.json`. */
  manifestBytes: number;
  /** `project.json`, `ledger.ndjson` and any one `nodes|snapshots|blobs` part. */
  partBytes: number;
  /** Any one `media/<sha256>` file. */
  mediaBytes: number;
  /** Decompressed bytes of the whole archive (gzip bomb backstop). */
  totalBytes: number;
  /** Tar entries, the manifest included. */
  entries: number;
}

export const ARCHIVE_LIMITS: Readonly<ArchiveLimits> = Object.freeze({
  // About 200 bytes per listed file: room for 80 000 media files.
  manifestBytes: 16 * MiB,
  partBytes: 16 * MiB,
  // = MAX_MEDIA_PUT (packages/api/src/routes/admin/sync.ts) = MEDIA_LIMITS.upload
  // (packages/core-ts/src/media/types.ts): no larger file can reach a site.
  mediaBytes: 100 * MiB,
  // Above the 10 GiB default site media quota (MEDIA_LIMITS.siteQuota).
  totalBytes: 32 * 1024 * MiB,
  entries: 100_000,
});

/** RFC-0039 §1: a new part every 8 MB. */
export const PART_SPLIT_BYTES = 8 * MiB;

/** Part numbers have 4 digits. */
export const MAX_PART_INDEX = 9999;

/** The default limits with `overrides` applied; each override must be a positive safe integer. */
export function archiveLimits(overrides: Partial<ArchiveLimits> = {}): ArchiveLimits {
  const limits: ArchiveLimits = { ...ARCHIVE_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in ARCHIVE_LIMITS))
      throw new ArchiveError("invalid_input", `unknown archive limit ${JSON.stringify(key)}`);
    if (!Number.isSafeInteger(value) || (value as number) <= 0)
      throw new ArchiveError("invalid_input", `archive limit ${key} must be a positive integer`);
    limits[key as keyof ArchiveLimits] = value as number;
  }
  return limits;
}
