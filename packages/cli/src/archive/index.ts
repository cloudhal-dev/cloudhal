/**
 * Site archives (RFC-0039, ADR-0041): the `.cloudhal` container that `cloudhal export` writes and
 * `cloudhal import` reads. Node-only; nothing a Worker runs imports it.
 */
export { ArchiveError, type ArchiveErrorCode } from "./errors.ts";
export { type ArchiveSlot, classifyPath, type FileSlot, type PartKind } from "./layout.ts";
export { ARCHIVE_LIMITS, type ArchiveLimits, PART_SPLIT_BYTES } from "./limits.ts";
export {
  type ArchiveCounts,
  type ArchiveFile,
  SITE_ARCHIVE_FORMAT,
  type SiteArchiveManifest,
} from "./manifest.ts";
export { encodeNdjson, type NdjsonSplitOptions, splitNdjson } from "./parts.ts";
export type { ArchiveContent, ArchiveMediaSource } from "./plan.ts";
export { type ArchiveItem, type ReadArchiveOptions, readArchive } from "./read.ts";
export { archiveStream, type WriteArchiveOptions, writeArchiveFile } from "./write.ts";
