/**
 * Media library helpers (DESIGN.md §2u, RFC-0004 §8). The type table, sniffing and the image
 * header reader are the server's own (`@cloudhal/core-ts/media`), so Studio refuses exactly what
 * the upload pipeline refuses — before a byte is sent — and warns about GPS the way §5.3 says.
 */
import type { Asset } from "@cloudhal/core-contracts";
import {
  dominantColor,
  inspectImage,
  leanWebp,
  MEDIA_TYPES,
  mediaExtension,
  mediaTypeFromFilename,
  normalizeMediaType,
  RASTER_TYPES,
} from "@cloudhal/core-ts/media";
import { type AssetListItem, type AssetPatch, api } from "./api.ts";
import { type ImageRef, previewImageUrl } from "./seo.ts";

export type AssetKind = Asset["kind"];

/** RFC-0004 §5.1: per ticket request (the server enforces it too). */
export const UPLOAD_FILES_PER_REQUEST = 20;
/** Library pages (cursor API). */
export const LIBRARY_PAGE_SIZE = 48;

/** Kinds a person can filter by, in menu order. */
export const ASSET_KINDS: readonly AssetKind[] = ["image", "video", "audio", "document", "data"];

/** `accept` of the library's file chooser: every type the pipeline takes. */
export const ACCEPT_ALL = [
  ...Object.keys(MEDIA_TYPES),
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".svg",
  ".mp4",
  ".webm",
  ".mp3",
  ".m4a",
  ".ogg",
  ".wav",
  ".pdf",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".ndjson",
  ".parquet",
].join(",");
/** `accept` of an image slot's chooser. */
export const ACCEPT_IMAGES = Object.entries(MEDIA_TYPES)
  .filter(([, info]) => info.kind === "image")
  .map(([type]) => type)
  .join(",");

/** "JPEG", "CSV" — the short name of a media type. */
export function typeLabel(mediaType: string): string {
  return MEDIA_TYPES[mediaType]?.label ?? mediaExtension(mediaType).toUpperCase();
}

/** 482 KB, 1,2 MB — sizes in the person's locale. */
export function formatSize(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** The file name the asset is shown under: its title, else the uploaded name, else the URL's. */
export function assetTitle(asset: Asset, locale: string, defaultLocale?: string): string {
  return (
    asset.title?.[locale] ??
    (defaultLocale ? asset.title?.[defaultLocale] : undefined) ??
    Object.values(asset.title ?? {})[0] ??
    (asset.source.kind === "upload" ? asset.source.filename : undefined) ??
    `${asset.slug}.${mediaExtension(asset.mediaType)}`
  );
}

/** "JPEG · 1200 × 800 · 482 KB" */
export function assetMeta(asset: Asset, locale: string): string {
  return [
    typeLabel(asset.mediaType),
    asset.image ? `${asset.image.width} × ${asset.image.height}` : undefined,
    formatSize(asset.bytes, locale),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** An image that says nothing to a screen reader yet: no alt text in the default locale, not decorative. */
export function needsAlt(asset: Asset, defaultLocale: string): boolean {
  return asset.kind === "image" && !asset.decorative && !asset.alt?.[defaultLocale];
}

/**
 * Where Studio loads an asset's picture for its own previews: the session-authenticated content
 * route, which also serves drafts (the public `/media/…` URL answers only once published, §7.3).
 * External images load from their https URL. Files that are not images have no picture.
 */
export function assetPreviewUrl(siteId: string, asset: Asset): string | undefined {
  if (asset.kind !== "image") return undefined;
  if (asset.storage.kind === "external")
    return /^https:\/\//.test(asset.storage.url) ? asset.storage.url : undefined;
  return api.assets.contentUrl(siteId, asset.id);
}

/**
 * Where Studio previews an image slot: a library file from the private content route (drafts
 * included; its `src` is the public media path, live only once published), an address through
 * `previewImageUrl` (site paths from the primary domain).
 */
export function imageRefPreviewUrl(
  siteId: string,
  ref: Pick<ImageRef, "src" | "assetId">,
  host: string | undefined,
): string | undefined {
  return ref.assetId ? api.assets.contentUrl(siteId, ref.assetId) : previewImageUrl(ref.src, host);
}

/** An image slot pointing at an asset (RFC-0004 §2.2): the store keeps `src`/size canonical. */
export function imageRefFor(item: AssetListItem, alt = ""): ImageRef {
  const { asset } = item;
  return {
    assetId: asset.id,
    src: item.url,
    alt,
    ...(asset.image ? { width: asset.image.width, height: asset.image.height } : {}),
  };
}

// ---- before an upload ---------------------------------------------------------------------------

export type FileProblem = "unsupported_type" | "heic" | "too_large";

export interface FileCheck {
  mediaType?: string;
  kind?: Exclude<AssetKind, "other">;
  /** The cap for this type (bytes). */
  cap?: number;
  problem?: FileProblem;
}

/**
 * What a chosen file is, by its declared type or extension, and whether the pipeline would take
 * it (§5.1). The server sniffs the bytes anyway; this only saves a round trip.
 */
export function checkFile(file: Pick<File, "name" | "type" | "size">): FileCheck {
  const declared = normalizeMediaType(file.type);
  const byName = mediaTypeFromFilename(file.name);
  const mediaType =
    declared && declared !== "application/octet-stream" && declared !== "text/plain"
      ? declared
      : byName;
  if (/\.hei[cf]$/i.test(file.name) || mediaType === "image/heic" || mediaType === "image/heif")
    return { problem: "heic" };
  const info = mediaType ? MEDIA_TYPES[mediaType] : undefined;
  if (!mediaType || !info) return { problem: "unsupported_type" };
  const out = { mediaType, kind: info.kind, cap: info.cap };
  return file.size > info.cap ? { ...out, problem: "too_large" } : out;
}

/** Lower-case hex SHA-256 of the file (WebCrypto): the server dedupes before any transfer. */
export async function sha256OfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** What Studio learns from a raster image before upload: its size and whether it carries GPS. */
export function readImageInfo(
  bytes: Uint8Array,
  mediaType: string,
): { width: number; height: number; gps: boolean } | undefined {
  if (!RASTER_TYPES.includes(mediaType)) return undefined;
  try {
    const info = inspectImage(bytes, mediaType);
    return { width: info.width, height: info.height, gps: info.metadata.gps };
  } catch {
    return undefined; // the server explains what is wrong with it
  }
}

/**
 * Placeholders drawn in the browser (Workers cannot decode images; RFC-0004 §5.3, RFC-0028 §1):
 * a ≤ 24 px `data:image/webp` LQIP and the dominant colour (`#rrggbb`, the mean of the visible
 * pixels). Optional — each is undefined where the browser cannot draw it.
 */
export async function placeholdersOf(file: Blob): Promise<{ lqip?: string; color?: string }> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return {};
    const bitmap = await createImageBitmap(file);
    const scale = 24 / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return {};
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const url = leanWebp(canvas.toDataURL("image/webp", 0.5));
    const lqip =
      /^data:image\/(?:webp|png|jpeg);base64,/.test(url) && url.length <= 3000 ? url : undefined;
    const color = dominantColor(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    return { ...(lqip ? { lqip } : {}), ...(color ? { color } : {}) };
  } catch {
    return {};
  }
}

/** The server's refusal codes (§6.1, §5.5) Studio has words for; others read as `unknown`. */
export const UPLOAD_ERRORS = [
  "unsupported_type",
  "heic",
  "type_mismatch",
  "too_large",
  "too_many_pixels",
  "svg_unsafe",
  "metadata_unsupported",
  "quota_exceeded",
  "purged",
  "alt_required",
  "checksum_required",
  "checksum_mismatch",
  "size_mismatch",
  "upload_expired",
  "upload_used",
  "too_many_uploads",
  "too_many_files",
  "retry",
  "network",
  "unknown",
] as const;
export type UploadErrorCode = (typeof UPLOAD_ERRORS)[number];

export function uploadErrorCode(code: string | undefined): UploadErrorCode {
  return (UPLOAD_ERRORS as readonly string[]).includes(code ?? "")
    ? (code as UploadErrorCode)
    : "unknown";
}

// ---- licenses ----------------------------------------------------------------------------------

/** Common licences offered first (SPDX ids); any other SPDX id or a URL can be entered. */
export const COMMON_LICENSES = [
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-4.0",
  "CC0-1.0",
  "LicenseRef-AllRightsReserved",
  "MIT",
  "Apache-2.0",
] as const;

export const SPDX_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$/;
export const HTTPS_PATTERN = /^https:\/\/[^\s\\/?#@]+(?:[/?#][^\s\\]*)?$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Text limits of `asset.schema.json`. */
export const ASSET_LIMITS = {
  title: 300,
  alt: 500,
  caption: 1000,
  credit: 300,
  slug: 128,
  license: 200,
  url: 2048,
} as const;

// ---- the details form ---------------------------------------------------------------------------

export type LicenseChoice =
  | { kind: "none" }
  | { kind: "spdx"; id: string }
  | { kind: "url"; url: string; name: string };

/** The editable fields of an asset, as the detail page's form holds them. */
export interface AssetForm {
  title: Record<string, string>;
  alt: Record<string, string>;
  caption: Record<string, string>;
  credit: string;
  decorative: boolean;
  slug: string;
  license: LicenseChoice;
  /** RFC-0028: an image's focal point, or null (crops keep the middle). */
  focal: { x: number; y: number } | null;
}

export function assetForm(asset: Asset): AssetForm {
  const license: LicenseChoice = !asset.license
    ? { kind: "none" }
    : asset.license.kind === "spdx"
      ? { kind: "spdx", id: asset.license.id }
      : { kind: "url", url: asset.license.url, name: asset.license.name ?? "" };
  const copy = (map: Record<string, string | undefined> | undefined) =>
    Object.fromEntries(
      Object.entries(map ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  return {
    title: copy(asset.title),
    alt: copy(asset.alt),
    caption: copy(asset.caption),
    credit: asset.credit ?? "",
    decorative: asset.decorative === true,
    slug: asset.slug,
    license,
    focal: asset.image?.focal ? { x: asset.image.focal.x, y: asset.image.focal.y } : null,
  };
}

export interface AssetFormErrors {
  /** Images need alt text in the default locale, or are decorative (RFC-0004 §8). */
  alt?: "required" | "tooLong";
  title?: "tooLong";
  caption?: "tooLong";
  credit?: "tooLong";
  slug?: "invalid";
  license?: "invalid";
}

const tooLong = (map: Record<string, string>, max: number) =>
  Object.values(map).some((v) => v.trim().length > max);

/** What the server would refuse, checked before Save (the alt rule mirrors `PUT /assets/:id`). */
export function validateAssetForm(
  form: AssetForm,
  kind: AssetKind,
  defaultLocale: string,
): AssetFormErrors {
  const errors: AssetFormErrors = {};
  if (kind === "image" && !form.decorative && !form.alt[defaultLocale]?.trim())
    errors.alt = "required";
  else if (tooLong(form.alt, ASSET_LIMITS.alt)) errors.alt = "tooLong";
  if (tooLong(form.title, ASSET_LIMITS.title)) errors.title = "tooLong";
  if (tooLong(form.caption, ASSET_LIMITS.caption)) errors.caption = "tooLong";
  if (form.credit.trim().length > ASSET_LIMITS.credit) errors.credit = "tooLong";
  if (!SLUG_PATTERN.test(form.slug) || form.slug.length > ASSET_LIMITS.slug)
    errors.slug = "invalid";
  const l = form.license;
  if (
    (l.kind === "spdx" &&
      (!SPDX_PATTERN.test(l.id.trim()) || l.id.length > ASSET_LIMITS.license)) ||
    (l.kind === "url" && (!HTTPS_PATTERN.test(l.url.trim()) || l.url.length > ASSET_LIMITS.url))
  )
    errors.license = "invalid";
  return errors;
}

const cleanMap = (map: Record<string, string>): Record<string, string> | null => {
  const kept = Object.fromEntries(
    Object.entries(map)
      .map(([locale, v]) => [locale, v.trim()] as const)
      .filter(([, v]) => v),
  );
  return Object.keys(kept).length ? kept : null;
};

/** The `PUT /assets/:id` body for a form (empty texts removed; a decorative image keeps no alt). */
export function assetPatch(form: AssetForm, kind: AssetKind): AssetPatch {
  const l = form.license;
  return {
    title: cleanMap(form.title),
    alt: kind === "image" && form.decorative ? null : cleanMap(form.alt),
    caption: cleanMap(form.caption),
    credit: form.credit.trim() || null,
    license:
      l.kind === "none"
        ? null
        : l.kind === "spdx"
          ? { kind: "spdx", id: l.id.trim() }
          : { kind: "url", url: l.url.trim(), ...(l.name.trim() ? { name: l.name.trim() } : {}) },
    decorative: kind === "image" ? form.decorative : false,
    slug: form.slug,
    ...(kind === "image" ? { focal: form.focal } : {}),
  };
}

/** A URL slug from a file name (lower-case words joined by hyphens), for the slug field. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ASSET_LIMITS.slug);
}
