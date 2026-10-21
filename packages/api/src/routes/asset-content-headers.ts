/**
 * Headers of Studio's private copy of an asset's bytes (`GET …/assets/:id/content`).
 */
import type { Asset } from "@cloudhal/core-contracts";
import { MEDIA_TYPES, mediaExtension, servedContentType } from "@cloudhal/core-ts/media";

/**
 * Response headers for Studio's private previews (never shared caches, never executed). A URL
 * naming the bytes (`?v=` = the first 16 hex digits of their SHA-256) cannot change, so the
 * browser keeps it for a day: Studio's media grid no longer downloads every image on every
 * visit. A day, not a year, so a file that is taken down does not linger in browsers. Without
 * `v`, the browser asks again each time and gets a 304 through the ETag.
 */
export function contentHeaders(asset: Asset, version: string | undefined): Record<string, string> {
  const info = MEDIA_TYPES[asset.mediaType];
  const svg = asset.mediaType === "image/svg+xml";
  const filename = `${asset.slug}.${mediaExtension(asset.mediaType)}`;
  return {
    "content-type": servedContentType(asset.mediaType),
    "content-disposition":
      info?.disposition === "inline" ? "inline" : `attachment; filename="${filename}"`,
    "cache-control":
      version && asset.sha256.startsWith(version) ? "private, max-age=86400" : "private, no-cache",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": svg
      ? "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
      : asset.mediaType === "application/pdf"
        ? "frame-ancestors 'self'"
        : "default-src 'none'; frame-ancestors 'self'",
    etag: `"${asset.sha256}"`,
  };
}
