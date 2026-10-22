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
import type { PermalinkSite } from "@cloudhal/core-ts";
import type { BlockRegistry } from "@cloudhal/core-ts/blocks";
import type { IconSet } from "@cloudhal/core-ts/icons";
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
  /**
   * The deployment's block registry (RFC-0015 §6), for previews: a theme's type is then told
   * apart from an unknown one. The site renders theme types with the theme's components.
   */
  readonly blocks?: BlockRegistry | undefined;
  /** RFC-0026: the site's icon weight (26c) and the theme's own drawings (26d). */
  readonly icons?:
    | { readonly weight?: string | undefined; readonly set?: IconSet | undefined }
    | undefined;
  /** RFC-0028 §4: the page's placeholder allowance, shared by every image it draws. */
  readonly budget?: PlaceholderBudget | undefined;
  /** RFC-0038: the site's collection permalinks, for links to entries (`entryPath`). */
  readonly permalinks?: PermalinkSite | undefined;
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
  /** RFC-0028 §4: the page's placeholder bytes left; spent as LQIPs are drawn (colour only after). */
  budget?: PlaceholderBudget;
  /** RFC-0028 §3: how the image meets its frame (the theme sets `object-fit` to match). */
  fit?: ImageFit;
}

/** RFC-0028 §3. `cover` is the default. */
export type ImageFit = "cover" | "contain" | "blur-fill" | "color-fill" | "natural";
export const IMAGE_FITS: readonly ImageFit[] = [
  "cover",
  "contain",
  "blur-fill",
  "color-fill",
  "natural",
];

/** A page's placeholder allowance (RFC-0028 §4), shared by every image the page draws. */
export interface PlaceholderBudget {
  left: number;
}
/** About 24 KB of LQIPs per page; beyond it images get their colour only. */
export const PLACEHOLDER_BUDGET = 24 * 1024;
export const placeholderBudget = (): PlaceholderBudget => ({ left: PLACEHOLDER_BUDGET });

/**
 * The placeholder painted behind an image while it loads (RFC-0028 §2): the dominant colour, and
 * the LQIP blurred by an SVG filter (no script, nothing hidden). By fit (§3):
 * - `cover` (default) and `blur-fill`: the blurred LQIP covers the box; under `object-fit:
 *   contain` (blur-fill) it stays visible in the bars. A cover crop leans towards the focal point.
 * - `contain`: the blurred LQIP only where the picture will be; the bars stay the page's.
 * - `color-fill`: the colour fills the box, the blurred LQIP where the picture will be.
 * A transparent image gets none (its pixels would show the placeholder after it loads), except
 * `color-fill`'s colour, which is the point of it.
 */
export function placeholderStyle(
  asset: Asset,
  budget?: PlaceholderBudget,
  fit: ImageFit = "cover",
): string | undefined {
  const img = asset.image;
  if (!img) return undefined;
  if (img.alpha)
    return fit === "color-fill" && img.color ? `background-color:${img.color}` : undefined;
  const color = img.color && fit !== "contain" ? `background-color:${img.color}` : "";
  let lqip = img.lqip;
  if (lqip && budget) {
    if (budget.left < lqip.length) lqip = undefined;
    else budget.left -= lqip.length;
  }
  if (!lqip) return color || undefined;
  // The LQIP's own pixel grid (≤ 24 px a side): a blur of ~1 of its pixels scales with the box.
  const long = Math.max(img.width, img.height);
  const w = Math.max(1, Math.round((24 * img.width) / long));
  const h = Math.max(1, Math.round((24 * img.height) / long));
  const third = (v: number | undefined) =>
    v === undefined || (v > 1 / 3 && v < 2 / 3) ? "Mid" : v <= 1 / 3 ? "Min" : "Max";
  const align =
    fit === "contain" || fit === "color-fill"
      ? "xMidYMid meet"
      : fit === "cover"
        ? `x${third(img.focal?.x)}Y${third(img.focal?.y)} slice`
        : "xMidYMid slice";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='${align}'><filter id='b' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1' edgeMode='duplicate'/><feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter><image width='100%' height='100%' preserveAspectRatio='none' filter='url(#b)' href='${lqip}'/></svg>`;
  const url = `data:image/svg+xml,${svg.replaceAll("#", "%23").replaceAll("<", "%3C").replaceAll(">", "%3E")}`;
  return `${color ? `${color};` : ""}background-image:url("${url}");background-size:100% 100%;background-repeat:no-repeat`;
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
  };
  const fit = o.fit ?? "cover";
  // A cover crop keeps the subject in view (RFC-0028 §3).
  const focal =
    fit === "cover" && asset.image?.focal
      ? `object-position:${pct(asset.image.focal.x)} ${pct(asset.image.focal.y)}`
      : "";
  const style = [placeholderStyle(asset, o.budget, fit), focal].filter(Boolean).join(";");
  if (style) base.style = style;
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

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

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
