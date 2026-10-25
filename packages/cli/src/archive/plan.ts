/**
 * The synchronous front half of the archive writer: checks the content, hashes the in-memory
 * files, counts the rows and media, and builds the manifest, which it checks with the reader's own
 * parser, so the writer never starts an archive its reader would refuse under the same limits.
 */
import { createHash } from "node:crypto";
import { CONTRACT_SCHEMA_VERSION } from "@cloudhal/core-contracts";
import { SITE_BUNDLE_FORMAT } from "@cloudhal/core-ts";
import { ArchiveError } from "./errors.ts";
import {
  LEDGER_PATH,
  mediaPath,
  PART_KINDS,
  type PartKind,
  PROJECT_PATH,
  partPath,
  SHA256_HEX,
} from "./layout.ts";
import { type ArchiveLimits, MAX_PART_INDEX } from "./limits.ts";
import {
  type ArchiveFile,
  encodeManifest,
  parseManifest,
  SITE_ARCHIVE_FORMAT,
  type SiteArchiveManifest,
} from "./manifest.ts";
import { countRows } from "./parts.ts";

/** A media file, streamed when the writer reaches it and verified against `sha256` and `bytes`. */
export interface ArchiveMediaSource {
  readonly sha256: string;
  readonly bytes: number;
  open(): AsyncIterable<Uint8Array> | Promise<AsyncIterable<Uint8Array>>;
}

/** What an archive holds. The caller orders the rows (RFC-0039 §1); the writer sorts media. */
export interface ArchiveContent {
  siteId: string;
  siteName: string;
  /** The `@cloudhal/cli` version. */
  createdBy: string;
  /** RFC 3339, taken from the content (the newest row), never from the clock. */
  createdAt: string;
  /** `project.json`: the project row as JSON. */
  project?: Uint8Array | undefined;
  /** NDJSON parts, from `splitNdjson`. */
  nodes: readonly Uint8Array[];
  snapshots: readonly Uint8Array[];
  blobs: readonly Uint8Array[];
  /** `ledger.ndjson`, from `encodeNdjson`, when there are purged rows. */
  ledger?: Uint8Array | undefined;
  media?: readonly ArchiveMediaSource[] | undefined;
  mediaOmitted?: true | undefined;
}

export type PlannedFile =
  | { path: string; data: Uint8Array }
  | { path: string; media: ArchiveMediaSource };

export interface ArchivePlan {
  manifest: SiteArchiveManifest;
  manifestBytes: Uint8Array;
  /** Every file after the manifest, in archive order. */
  files: PlannedFile[];
}

interface Draft {
  files: PlannedFile[];
  listed: ArchiveFile[];
  limits: ArchiveLimits;
}

function sha256Of(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function addData(draft: Draft, path: string, data: Uint8Array): void {
  if (data.length === 0) throw new ArchiveError("invalid_input", `${path} is empty`, { path });
  if (data.length > draft.limits.partBytes)
    throw new ArchiveError("too_large", `${path} is above ${draft.limits.partBytes} bytes`, {
      path,
    });
  draft.files.push({ path, data });
  draft.listed.push({ path, sha256: sha256Of(data), bytes: data.length });
}

/** Adds the parts of one kind and returns their rows. */
function addParts(draft: Draft, kind: PartKind, parts: readonly Uint8Array[]): number {
  if (parts.length > MAX_PART_INDEX)
    throw new ArchiveError("too_large", `${kind}: more than ${MAX_PART_INDEX} parts`);
  let rows = 0;
  for (const [i, part] of parts.entries()) {
    const path = partPath(kind, i + 1);
    addData(draft, path, part);
    rows += countRows(part, path, "invalid_input");
  }
  return rows;
}

/** The media in archive order (ascending hash), checked. */
function sortedMedia(content: ArchiveContent, limits: ArchiveLimits): ArchiveMediaSource[] {
  const media = [...(content.media ?? [])];
  if (media.length > 0 && content.mediaOmitted)
    throw new ArchiveError("invalid_input", "media were given together with mediaOmitted");
  const seen = new Set<string>();
  for (const m of media) {
    if (!SHA256_HEX.test(m.sha256))
      throw new ArchiveError("invalid_input", "a media sha256 is not 64 lowercase hex digits");
    if (seen.has(m.sha256))
      throw new ArchiveError("invalid_input", `media ${m.sha256} is given twice`);
    seen.add(m.sha256);
    if (!Number.isSafeInteger(m.bytes) || m.bytes < 0)
      throw new ArchiveError("invalid_input", `media ${m.sha256} has an invalid size`);
    if (m.bytes > limits.mediaBytes)
      throw new ArchiveError("too_large", `media ${m.sha256} is above ${limits.mediaBytes} bytes`);
  }
  return media.sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0));
}

/** The manifest checked by the reader's parser; refusals become the writer's `invalid_input`. */
function checkedManifest(manifest: SiteArchiveManifest, limits: ArchiveLimits): Uint8Array {
  const bytes = encodeManifest(manifest);
  try {
    parseManifest(bytes, limits);
  } catch (e) {
    if (e instanceof ArchiveError && e.code !== "too_large")
      throw new ArchiveError("invalid_input", e.message, { cause: e });
    throw e;
  }
  return bytes;
}

/** Checks `content` and lays out the archive; throws before any byte is written. */
export function planArchive(content: ArchiveContent, limits: ArchiveLimits): ArchivePlan {
  const draft: Draft = { files: [], listed: [], limits };
  if (content.project !== undefined) addData(draft, PROJECT_PATH, content.project);
  const rows: Record<PartKind, number> = { nodes: 0, snapshots: 0, blobs: 0 };
  for (const kind of PART_KINDS) rows[kind] = addParts(draft, kind, content[kind]);
  const media = sortedMedia(content, limits);
  let mediaBytes = 0;
  for (const m of media) {
    const path = mediaPath(m.sha256);
    draft.files.push({ path, media: m });
    draft.listed.push({ path, sha256: m.sha256, bytes: m.bytes });
    mediaBytes += m.bytes;
  }
  if (content.ledger !== undefined) {
    addData(draft, LEDGER_PATH, content.ledger);
    countRows(content.ledger, LEDGER_PATH, "invalid_input");
  }
  const manifest: SiteArchiveManifest = {
    format: SITE_ARCHIVE_FORMAT,
    contracts: { schemaVersion: CONTRACT_SCHEMA_VERSION },
    bundle: SITE_BUNDLE_FORMAT,
    siteId: content.siteId,
    siteName: content.siteName,
    createdBy: content.createdBy,
    createdAt: content.createdAt,
    counts: { ...rows, media: media.length, mediaBytes },
    files: draft.listed,
    ...(content.mediaOmitted ? { mediaOmitted: true as const } : {}),
  };
  return { manifest, manifestBytes: checkedManifest(manifest, limits), files: draft.files };
}
