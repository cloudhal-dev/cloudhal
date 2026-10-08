/**
 * The media type table of RFC-0004 §5.1 and §7.1: which sniffed types are accepted, the asset kind
 * each one gives, its upload cap, the extension of its public URL and how it is served. One table,
 * so a client can never pick a kind or an extension (invariant 4). Worker-safe.
 */
import type { Asset } from "@cloudhal/core-contracts";

export type AssetKind = Asset["kind"];

export interface MediaTypeInfo {
  readonly kind: Exclude<AssetKind, "other">;
  /** Extension of the public URL (`/media/<prefix>/<slug>.<ext>`). */
  readonly ext: string;
  /** Default upload cap in bytes (deployments may lower it). */
  readonly cap: number;
  /** `inline` (image, video, audio, PDF) or `attachment` (data). */
  readonly disposition: "inline" | "attachment";
  /** UTF-8 text: served with `; charset=utf-8`. */
  readonly text?: true;
  /** Short name for prompts and download links ("JPEG", "CSV"). */
  readonly label: string;
  /** Only people may upload it (SVG in v1, RFC-0004 answer 2). */
  readonly peopleOnly?: true;
}

const MB = 1024 * 1024;

export const MEDIA_TYPES: Readonly<Record<string, MediaTypeInfo>> = {
  "image/jpeg": { kind: "image", ext: "jpg", cap: 20 * MB, disposition: "inline", label: "JPEG" },
  "image/png": { kind: "image", ext: "png", cap: 20 * MB, disposition: "inline", label: "PNG" },
  "image/webp": { kind: "image", ext: "webp", cap: 20 * MB, disposition: "inline", label: "WebP" },
  "image/avif": { kind: "image", ext: "avif", cap: 20 * MB, disposition: "inline", label: "AVIF" },
  "image/gif": { kind: "image", ext: "gif", cap: 20 * MB, disposition: "inline", label: "GIF" },
  "image/svg+xml": {
    kind: "image",
    ext: "svg",
    cap: 1 * MB,
    disposition: "inline",
    label: "SVG",
    peopleOnly: true,
  },
  "video/mp4": { kind: "video", ext: "mp4", cap: 100 * MB, disposition: "inline", label: "MP4" },
  "video/webm": { kind: "video", ext: "webm", cap: 100 * MB, disposition: "inline", label: "WebM" },
  "audio/mpeg": { kind: "audio", ext: "mp3", cap: 100 * MB, disposition: "inline", label: "MP3" },
  "audio/mp4": { kind: "audio", ext: "m4a", cap: 100 * MB, disposition: "inline", label: "M4A" },
  "audio/ogg": { kind: "audio", ext: "ogg", cap: 100 * MB, disposition: "inline", label: "Ogg" },
  "audio/wav": { kind: "audio", ext: "wav", cap: 100 * MB, disposition: "inline", label: "WAV" },
  "application/pdf": {
    kind: "document",
    ext: "pdf",
    cap: 50 * MB,
    disposition: "inline",
    label: "PDF",
  },
  "text/csv": {
    kind: "data",
    ext: "csv",
    cap: 100 * MB,
    disposition: "attachment",
    text: true,
    label: "CSV",
  },
  "text/tab-separated-values": {
    kind: "data",
    ext: "tsv",
    cap: 100 * MB,
    disposition: "attachment",
    text: true,
    label: "TSV",
  },
  "application/json": {
    kind: "data",
    ext: "json",
    cap: 100 * MB,
    disposition: "attachment",
    text: true,
    label: "JSON",
  },
  "application/x-ndjson": {
    kind: "data",
    ext: "jsonl",
    cap: 100 * MB,
    disposition: "attachment",
    text: true,
    label: "NDJSON",
  },
  "application/vnd.apache.parquet": {
    kind: "data",
    ext: "parquet",
    cap: 100 * MB,
    disposition: "attachment",
    label: "Parquet",
  },
};

/** Common spellings of accepted types, folded before comparing a declared type. */
const ALIASES: Readonly<Record<string, string>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "application/x-parquet": "application/vnd.apache.parquet",
  "application/jsonl": "application/x-ndjson",
  "application/jsonlines": "application/x-ndjson",
  "application/x-jsonlines": "application/x-ndjson",
  "text/json": "application/json",
  "text/x-csv": "text/csv",
  "application/csv": "text/csv",
  "text/tsv": "text/tab-separated-values",
};

/** File extensions people use, mapped to the type they claim (for `type_mismatch`). */
const EXTENSIONS: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  tab: "text/tab-separated-values",
  json: "application/json",
  jsonl: "application/x-ndjson",
  ndjson: "application/x-ndjson",
  parquet: "application/vnd.apache.parquet",
};

/** Lower case, parameters dropped, aliases folded: `Image/JPG; q=1` → `image/jpeg`. */
export function normalizeMediaType(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const base = value.split(";", 1)[0]?.trim().toLowerCase();
  if (!base) return undefined;
  return ALIASES[base] ?? base;
}

/** The type a file name's extension claims, if the extension is one we know. */
export function mediaTypeFromFilename(filename: string | undefined): string | undefined {
  const m = filename ? /\.([A-Za-z0-9]{1,10})$/.exec(filename) : null;
  return m ? EXTENSIONS[(m[1] as string).toLowerCase()] : undefined;
}

export function mediaTypeInfo(mediaType: string): MediaTypeInfo | undefined {
  return MEDIA_TYPES[mediaType];
}

/**
 * The asset kind for a media type (§5.1). Unknown types are `other`, which only external files may
 * have (invariant 4).
 */
export function assetKindFor(mediaType: string): AssetKind {
  const info = MEDIA_TYPES[mediaType];
  if (info) return info.kind;
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  return "other";
}

/** The extension of the public URL, never taken from the upload (§7.1). */
export function mediaExtension(mediaType: string): string {
  return MEDIA_TYPES[mediaType]?.ext ?? "bin";
}

/** The `Content-Type` a media response is served with. */
export function servedContentType(mediaType: string): string {
  return MEDIA_TYPES[mediaType]?.text ? `${mediaType}; charset=utf-8` : mediaType;
}

/** Default caps of the agent paths (RFC-0004 §5.6) and the upload default (answer 6). */
export const MEDIA_LIMITS = {
  /** `upload_asset`: decoded bytes per call. */
  uploadAsset: 4 * MB,
  /** `fetch_asset_url`: bytes per fetch. */
  fetchAsset: 25 * MB,
  /** Default upload cap of any one file (the Workers request-body limit on Free/Pro). */
  upload: 100 * MB,
  /** Images: pixels per side and in total, checked from the header before any work. */
  maxImageSide: 12_000,
  maxImagePixels: 50_000_000,
  /** Default per-site quota of stored blob bytes (0 = unlimited). */
  siteQuota: 10 * 1024 * MB,
  /** Asset references per node (invariant 7). */
  refsPerNode: 200,
} as const;

/** Human-readable size: 482 KB, 1.2 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
}

/** The 16-hex URL prefix of a SHA-256 (§7.1). */
export function mediaPrefix(sha256: string): string {
  return sha256.slice(0, 16);
}

/** `/media/<sha256[0..16]>/<slug>.<ext>` — the public path of a blob asset. */
export function mediaPath(asset: Pick<Asset, "sha256" | "slug" | "mediaType">): string {
  return `/media/${mediaPrefix(asset.sha256)}/${asset.slug}.${mediaExtension(asset.mediaType)}`;
}

/** Where an asset is shown from: its media path (blob) or its external https URL. */
export function assetUrl(asset: Pick<Asset, "sha256" | "slug" | "mediaType" | "storage">): string {
  return asset.storage.kind === "external" ? asset.storage.url : mediaPath(asset);
}

/** The media route: `/media/<16 hex>/<slug>.<ext>[.sha256]` (§7.1). Anything else falls through. */
export const MEDIA_ROUTE =
  /^\/media\/([0-9a-f]{16})\/([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]{1,8})(\.sha256)?$/;

/** Invariant 12: paths no page, entry, archive or redirect may take. */
export function isReservedMediaPath(path: string): boolean {
  return /^\/media\/[0-9a-f]{16}\//.test(path);
}

const SPECIAL: Record<string, string> = {
  ı: "i",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  þ: "th",
};

/** A URL slug from a file name or title: `Boğaz at Dawn (1).JPG` → `bogaz-at-dawn-1`. */
export function slugifyFilename(name: string | undefined, fallback = "file"): string {
  const base = (name ?? "").replace(/\.[A-Za-z0-9]{1,10}$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[ıßæœøđðłþ]/g, (c) => SPECIAL[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
  return slug || fallback;
}
