/**
 * Showing assets (RFC-0004 §7.5–§7.7): the one place that knows about image transformations.
 * Starters and section components call `imageAttributes`; markdown, SEO and feeds use the helpers
 * here. Pure functions; Worker-safe.
 *
 * `transform: "cdn-cgi"` emits Cloudflare URL transformations from the same zone (a fixed width
 * ladder, never wider than the original); it is opt-in (`media.transform` in `cloudhal.json`, answer
 * 13) because it needs Transformations enabled on a real zone. `"none"` (the default; offline,
 * static builds, previews, workers.dev) is a passthrough: the original URL, no `srcset`.
 */
import type { Asset, ImageRef } from "@cloudhal/core-contracts";
import { assetUrl, formatBytes, MEDIA_TYPES, mediaPath } from "@cloudhal/core-ts/media";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type ImageTransform = "cdn-cgi" | "none";

/** Fixed widths: bounded cache fragmentation and a bounded number of unique transformations. */
export const WIDTH_LADDER: readonly number[] = [320, 640, 960, 1280, 1600, 1920, 2560];

/** Assets by id (what a page needs to resolve `assetId` and `asset:<id>`). */
export type AssetIndex = ReadonlyMap<string, Asset>;

export interface MediaContext {
  readonly assets?: AssetIndex | undefined;
  readonly locale?: string | undefined;
  readonly defaultLocale?: string | undefined;
  readonly transform?: ImageTransform | undefined;
  /** Preview responses never use transformations (§7.3). */
  readonly preview?: boolean | undefined;
  /** Called once per unresolved `asset:` reference (logged by the caller). */
  readonly onMiss?: ((id: string) => void) | undefined;
}

export interface ImageAttributeOptions {
  locale: string;
  defaultLocale: string;
  transform: ImageTransform;
  sizes: string;
  widths?: readonly number[];
  quality?: number;
  priority?: boolean;
  preview?: boolean;
}

export interface ImageAttributes {
  src: string;
  srcset?: string;
  sizes?: string;
  width: number;
  height: number;
  alt: string;
  loading: "lazy" | "eager";
  decoding: "async";
  fetchpriority?: "high";
  style?: string;
}

const TRANSFORMABLE = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

function localized(
  map: { [k: string]: string | undefined } | undefined,
  locale: string,
  fallback: string,
): string | undefined {
  return map?.[locale] ?? map?.[fallback];
}

/** Alt text: this use's alt when given, "" for decorative images, else the asset's (§7.6). */
export function assetAlt(
  asset: Asset,
  refAlt: string | undefined,
  locale: string,
  defaultLocale: string,
): string {
  if (refAlt?.trim()) return refAlt;
  if (asset.decorative) return "";
  return localized(asset.alt, locale, defaultLocale) ?? "";
}

/** The asset's caption followed by its credit (§7.7), or undefined. */
export function assetCaption(
  asset: Asset,
  locale: string,
  defaultLocale: string,
  own?: string,
): string | undefined {
  const caption = own?.trim() || localized(asset.caption, locale, defaultLocale);
  const parts = [caption, asset.credit].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** A transformation URL of a blob image (same zone, `/cdn-cgi/image/…`). */
export function transformedUrl(asset: Asset, width: number, quality = 80): string {
  return `/cdn-cgi/image/width=${width},fit=scale-down,format=auto,quality=${quality}${mediaPath(asset)}`;
}

function canTransform(asset: Asset, o: { transform: ImageTransform; preview?: boolean }) {
  return (
    o.transform === "cdn-cgi" &&
    !o.preview &&
    asset.storage.kind === "blob" &&
    TRANSFORMABLE.includes(asset.mediaType) &&
    !asset.image?.animated &&
    (asset.image?.width ?? 0) >= 320
  );
}

/** `<img>` attributes for an asset (RFC-0004 §7.5): size always, `srcset` when transforming. */
export function imageAttributes(
  asset: Asset,
  ref: Pick<ImageRef, "alt" | "width" | "height"> | undefined,
  o: ImageAttributeOptions,
): ImageAttributes {
  const width = asset.image?.width ?? ref?.width ?? 0;
  const height = asset.image?.height ?? ref?.height ?? 0;
  const base: ImageAttributes = {
    src: assetUrl(asset),
    width,
    height,
    alt: assetAlt(asset, ref?.alt, o.locale, o.defaultLocale),
    loading: o.priority ? "eager" : "lazy",
    decoding: "async",
    ...(o.priority ? { fetchpriority: "high" as const } : {}),
    ...(asset.image?.lqip
      ? { style: `background-image:url(${asset.image.lqip});background-size:cover` }
      : {}),
  };
  if (!canTransform(asset, o)) return base;
  const quality = o.quality ?? 80;
  const ladder = (o.widths ?? WIDTH_LADDER).filter((w) => w <= width);
  const candidates = ladder.map((w) => `${transformedUrl(asset, w, quality)} ${w}w`);
  // The original closes the set when it is wider than the ladder's last step.
  if ((ladder.at(-1) ?? 0) < width) candidates.push(`${mediaPath(asset)} ${width}w`);
  return {
    ...base,
    src: width > 1280 ? transformedUrl(asset, 1280, quality) : mediaPath(asset),
    srcset: candidates.join(", "),
    sizes: o.sizes,
  };
}

/** `<img …>` HTML for attributes (every value escaped). */
export function imgHtml(a: ImageAttributes, extra = ""): string {
  const attr = (k: string, v: string | number | undefined) =>
    v === undefined || v === "" || v === 0 ? "" : ` ${k}="${escapeHtml(String(v))}"`;
  return `<img src="${escapeHtml(a.src)}"${attr("srcset", a.srcset)}${attr("sizes", a.sizes)} alt="${escapeHtml(a.alt)}"${attr("width", a.width)}${attr("height", a.height)} loading="${a.loading}" decoding="${a.decoding}"${attr("fetchpriority", a.fetchpriority)}${attr("style", a.style)}${extra}>`;
}

/** The URL social cards use: absolute, the 1200-wide variant when transforming (§7.7). */
export function socialImageUrl(
  origin: string,
  asset: Asset,
  transform: ImageTransform = "none",
): string {
  if (asset.storage.kind === "external") return asset.storage.url;
  const path =
    canTransform(asset, { transform }) && (asset.image?.width ?? 0) > 1200
      ? transformedUrl(asset, 1200)
      : mediaPath(asset);
  return `${origin}${path}`;
}

/** schema.org ImageObject for JSON-LD (§7.7); SPDX ids link to spdx.org. */
export function imageObject(
  origin: string,
  asset: Asset,
  locale: string,
  defaultLocale: string,
): Record<string, unknown> {
  const caption = localized(asset.caption, locale, defaultLocale);
  const license =
    asset.license?.kind === "spdx"
      ? `https://spdx.org/licenses/${asset.license.id.split(" ")[0]}.html`
      : asset.license?.url;
  return {
    "@type": "ImageObject",
    contentUrl:
      asset.storage.kind === "external" ? asset.storage.url : `${origin}${mediaPath(asset)}`,
    ...(asset.image ? { width: asset.image.width, height: asset.image.height } : {}),
    ...(caption ? { caption } : {}),
    ...(asset.credit ? { creditText: asset.credit } : {}),
    ...(license ? { license } : {}),
    encodingFormat: asset.mediaType,
  };
}

/** "CSV · 1.2 MB" and the checksum link for downloads (§7.6). */
export function downloadMeta(asset: Asset): string {
  const label = MEDIA_TYPES[asset.mediaType]?.label ?? asset.mediaType;
  const sum =
    asset.storage.kind === "blob"
      ? ` · <a href="${escapeHtml(`${mediaPath(asset)}.sha256`)}">SHA-256</a>`
      : asset.storage.checksum === "declared"
        ? " · SHA-256 (not verified)"
        : "";
  return `<small class="ch-asset-meta">${escapeHtml(label)} · ${escapeHtml(formatBytes(asset.bytes))}${sum}</small>`;
}

/** Whether a download should carry `download` (attachments: data and other). */
export function isAttachment(asset: Asset): boolean {
  return (MEDIA_TYPES[asset.mediaType]?.disposition ?? "attachment") === "attachment";
}

/** Every asset of a source, by id (`source.assets()`; empty for sources without media). */
export async function loadAssetIndex(source: {
  assets?: () => Promise<Asset[]>;
}): Promise<Map<string, Asset>> {
  const list = source.assets ? await source.assets() : [];
  return new Map(list.map((a) => [a.id, a]));
}
