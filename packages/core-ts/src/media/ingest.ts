/**
 * The validation pipeline every buffered upload runs (RFC-0004 §5.2): size, sniff, kind, type
 * checks (image header caps, metadata stripping, SVG validation, UTF-8 for data), hash. The sniffed
 * type decides; a declared type or file extension that disagrees is `type_mismatch`, never a silent
 * relabel. Worker-safe; the store calls it from `ingestAsset`.
 */
import { sha256OfBytes } from "@cloudhal/storage";
import { InvariantError } from "../errors.ts";
import { hasStrippableMetadata, inspectImage, RASTER_TYPES, stripImageMetadata } from "./image.ts";
import { isCleanUtf8, sniff } from "./sniff.ts";
import { checkSvg } from "./svg.ts";
import {
  type AssetKind,
  formatBytes,
  MEDIA_LIMITS,
  MEDIA_TYPES,
  mediaExtension,
  mediaTypeFromFilename,
  normalizeMediaType,
} from "./types.ts";

export interface InspectOptions {
  readonly bytes: Uint8Array;
  /** What the client (or a fetched response's Content-Type) says the file is. */
  readonly declaredType?: string | undefined;
  /** The original file name: its extension must agree too. Never used as a key or served. */
  readonly filename?: string | undefined;
  /** SVG and `keepMetadata` are for people only (answers 2 and 8). */
  readonly actor: "human" | "agent" | "system";
  /** People only: keep Exif/XMP/IPTC (photographers' credits). Agents' requests are ignored. */
  readonly keepMetadata?: boolean | undefined;
  /** Cap of the path (4 MB `upload_asset`, 25 MB `fetch_asset_url`, 100 MB default). */
  readonly maxBytes?: number | undefined;
  /** Deployment caps per media type (they may only lower the defaults). */
  readonly caps?: Readonly<Record<string, number>> | undefined;
}

export interface InspectedUpload {
  /** The bytes to store: stripped of metadata when that changed anything. */
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly kind: Exclude<AssetKind, "other">;
  readonly ext: string;
  readonly sha256: string;
  /** SHA-256 of the bytes as uploaded, when stripping changed them. */
  readonly originalSha256?: string;
  readonly image?: { width: number; height: number; animated?: true };
  /** `gps`: metadata was kept and contains the place a photo was taken (Studio warns). */
  readonly warnings: readonly ("gps" | "metadata-kept")[];
}

const TEXT_TYPES = [
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/x-ndjson",
];

function label(mediaType: string): string {
  return MEDIA_TYPES[mediaType]?.label ?? mediaType;
}

function mismatch(sniffed: string, claimed: string, by: "type" | "extension"): never {
  throw new InvariantError(
    "type_mismatch",
    `this file is ${/^[AEIOU]/.test(label(sniffed)) ? "an" : "a"} ${label(sniffed)}, not ${/^[AEIOU]/.test(label(claimed)) ? "an" : "a"} ${label(claimed)}${by === "extension" ? " (check the file name's extension)" : ""}`,
    { sniffed, claimed },
  );
}

/** Runs §5.2 on buffered bytes; throws `InvariantError` with an actionable message. */
export async function inspectUpload(options: InspectOptions): Promise<InspectedUpload> {
  const { bytes } = options;
  const maxBytes = options.maxBytes ?? MEDIA_LIMITS.upload;
  if (bytes.byteLength === 0) throw new InvariantError("unsupported_type", "the file is empty");
  if (bytes.byteLength > maxBytes)
    throw new InvariantError(
      "too_large",
      `the file is ${formatBytes(bytes.byteLength)}; the limit here is ${formatBytes(maxBytes)}`,
      { bytes: bytes.byteLength, limit: maxBytes },
    );
  const declared = normalizeMediaType(options.declaredType);
  const byName = mediaTypeFromFilename(options.filename);
  const s = sniff(bytes.subarray(0, 4096), bytes.subarray(Math.max(0, bytes.byteLength - 4)));
  let mediaType: string;
  if (s.kind === "refused")
    throw new InvariantError(
      "unsupported_type",
      `this file is ${s.what}, which Cloudhal does not accept${s.hint ? `; ${s.hint}` : ""}`,
    );
  if (s.kind === "unknown")
    throw new InvariantError(
      "unsupported_type",
      "this file type is not accepted (images: JPEG, PNG, WebP, AVIF, GIF; video: MP4, WebM; audio: MP3, M4A, Ogg, WAV; PDF; data: CSV, TSV, JSON, NDJSON, Parquet)",
    );
  if (s.kind === "text") {
    // Text formats look alike: the declared type (or extension) picks one; the bytes must fit it.
    const claim = declared && declared !== "text/plain" ? declared : byName;
    if (!claim || !TEXT_TYPES.includes(claim))
      throw new InvariantError(
        "unsupported_type",
        claim && MEDIA_TYPES[claim]
          ? `this file is text, not ${label(claim)}`
          : "this is a text file; say which data format it is (CSV, TSV, JSON or NDJSON) through its type or file extension",
      );
    if (byName && TEXT_TYPES.includes(byName) && byName !== claim)
      mismatch(claim, byName, "extension");
    if ((claim === "application/json" || claim === "application/x-ndjson") && !s.json)
      throw new InvariantError("type_mismatch", `this file is not ${label(claim)}`);
    if (!isCleanUtf8(bytes))
      throw new InvariantError(
        "unsupported_type",
        "data files must be UTF-8 text without NUL characters",
      );
    mediaType = claim;
  } else {
    mediaType = s.mediaType;
    if (declared && declared !== "application/octet-stream" && declared !== mediaType)
      mismatch(mediaType, declared, "type");
    if (byName && byName !== mediaType) mismatch(mediaType, byName, "extension");
  }
  const info = MEDIA_TYPES[mediaType];
  if (!info) throw new InvariantError("unsupported_type", `${mediaType} is not accepted`);
  const cap = Math.min(info.cap, options.caps?.[mediaType] ?? info.cap);
  if (bytes.byteLength > cap)
    throw new InvariantError(
      "too_large",
      `${label(mediaType)} files may be at most ${formatBytes(cap)}; this one is ${formatBytes(bytes.byteLength)}`,
      { bytes: bytes.byteLength, limit: cap },
    );
  if (info.peopleOnly && options.actor !== "human")
    throw new InvariantError(
      "unsupported_type",
      `agents cannot upload ${label(mediaType)} files in this version; use PNG, JPEG or WebP, or ask a person to upload it`,
    );

  let out = bytes;
  let image: InspectedUpload["image"];
  const warnings: ("gps" | "metadata-kept")[] = [];
  if (mediaType === "image/svg+xml") {
    const check = checkSvg(new TextDecoder().decode(bytes));
    if (!check.ok)
      throw new InvariantError(
        "svg_unsafe",
        `SVG files can't contain scripts, event handlers or external references; remove these, then upload again: ${check.problems.join(", ")}`,
        { problems: check.problems },
      );
    image = { width: check.width, height: check.height };
  } else if (RASTER_TYPES.includes(mediaType)) {
    const header = inspectImage(bytes, mediaType);
    if (
      header.width > MEDIA_LIMITS.maxImageSide ||
      header.height > MEDIA_LIMITS.maxImageSide ||
      header.width * header.height > MEDIA_LIMITS.maxImagePixels
    )
      throw new InvariantError(
        "too_many_pixels",
        `the image is ${header.width}×${header.height}; the limit is ${MEDIA_LIMITS.maxImageSide} px per side and ${MEDIA_LIMITS.maxImagePixels / 1_000_000} megapixels`,
        { width: header.width, height: header.height },
      );
    const keep = options.keepMetadata === true && options.actor === "human";
    if (keep) {
      if (hasStrippableMetadata(header)) warnings.push("metadata-kept");
      if (header.metadata.gps) warnings.push("gps");
    } else out = stripImageMetadata(bytes, mediaType);
    image = {
      width: header.width,
      height: header.height,
      ...(header.animated ? { animated: true as const } : {}),
    };
  }
  const sha256 = await sha256OfBytes(out);
  // Present only when stripping changed the bytes (an already-clean file keeps its hash).
  const uploaded = out === bytes ? sha256 : await sha256OfBytes(bytes);
  const originalSha256 = uploaded === sha256 ? undefined : uploaded;
  return {
    bytes: out,
    mediaType,
    kind: info.kind,
    ext: mediaExtension(mediaType),
    sha256,
    ...(originalSha256 ? { originalSha256 } : {}),
    ...(image ? { image } : {}),
    warnings,
  };
}
