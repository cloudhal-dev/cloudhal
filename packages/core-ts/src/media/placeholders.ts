/**
 * Placeholder helpers shared by every place that draws one in a browser (RFC-0028 §1): Studio on
 * upload and `cloudhal media placeholders` in local Chrome. Workers cannot decode images, so the
 * drawing itself happens there; these only tidy and summarise the result.
 */
import type { Asset } from "@cloudhal/core-contracts";

/**
 * A canvas WebP without its colour profile: Chrome embeds a ~450 B sRGB ICC chunk in every
 * `toDataURL("image/webp")`, triple the size of a 24 px picture. Without it (and without the
 * extended header once nothing needs it) the browser assumes sRGB anyway.
 */
export function leanWebp(dataUrl: string): string {
  const prefix = "data:image/webp;base64,";
  if (!dataUrl.startsWith(prefix)) return dataUrl;
  try {
    const b = Uint8Array.from(atob(dataUrl.slice(prefix.length)), (c) => c.charCodeAt(0));
    const tag = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
    if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return dataUrl;
    const size = (at: number) =>
      ((b[at] as number) | ((b[at + 1] as number) << 8) | ((b[at + 2] as number) << 16)) +
      (b[at + 3] as number) * 2 ** 24;
    const chunks: Uint8Array[] = [];
    let vp8x: Uint8Array | undefined;
    for (let i = 12; i + 8 <= b.length; ) {
      const end = i + 8 + size(i + 4) + (size(i + 4) % 2);
      const chunk = b.slice(i, Math.min(end, b.length));
      if (tag(i) === "VP8X") vp8x = chunk;
      else if (tag(i) !== "ICCP") chunks.push(chunk);
      i = end;
    }
    if (vp8x) {
      vp8x[8] = (vp8x[8] as number) & ~0x20; // the ICC flag
      if (vp8x[8] !== 0) chunks.unshift(vp8x); // still needed (alpha, animation)
    }
    const body = chunks.reduce((n, c) => n + c.byteLength, 4);
    const out = new Uint8Array(8 + body);
    out.set(b.subarray(0, 4), 0);
    new DataView(out.buffer).setUint32(4, body, true);
    out.set(b.subarray(8, 12), 8);
    let at = 12;
    for (const c of chunks) {
      out.set(c, at);
      at += c.byteLength;
    }
    return prefix + btoa(String.fromCharCode(...out));
  } catch {
    return dataUrl;
  }
}

/** The mean colour of RGBA pixels, weighted by their opacity; undefined when nothing is visible. */
export function dominantColor(rgba: ArrayLike<number>): string | undefined {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = (rgba[i + 3] as number) / 255;
    r += (rgba[i] as number) * a;
    g += (rgba[i + 1] as number) * a;
    b += (rgba[i + 2] as number) * a;
    w += a;
  }
  if (w === 0) return undefined;
  const hex = (v: number) =>
    Math.round(v / w)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** An image that needs a placeholder, as the local store or the deployment lists it. */
export interface PlaceholderCandidate {
  readonly id: string;
  readonly rev: number;
  readonly sha256: string;
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
  readonly alpha?: true;
}

/** Image types Chrome can draw; animated files get the first frame. */
export const PLACEHOLDER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
];

/** Which images still need one: blob images of a drawable type, without a colour (or all). */
export function needsPlaceholder(asset: Asset, all = false): boolean {
  return (
    asset.kind === "image" &&
    asset.storage.kind === "blob" &&
    PLACEHOLDER_TYPES.includes(asset.mediaType) &&
    asset.image !== undefined &&
    (all || asset.image.color === undefined)
  );
}

export function candidateOf(asset: Asset): PlaceholderCandidate {
  const image = asset.image as NonNullable<Asset["image"]>;
  return {
    id: asset.id,
    rev: asset.rev,
    sha256: asset.sha256,
    mediaType: asset.mediaType,
    width: image.width,
    height: image.height,
    ...(image.alpha ? { alpha: true as const } : {}),
  };
}
