/**
 * Image headers and lossless metadata stripping (RFC-0004 §5.3). Pure container edits — no pixel is
 * decoded or re-encoded, so it runs on Workers without an image library:
 *
 * - JPEG: keep SOI, APP0 (JFIF), APP2 ICC_PROFILE, APP14 (Adobe) and every non-APP segment; drop
 *   every other APPn (Exif, XMP, IPTC/Photoshop, MPF, maker data) and COM; write back a minimal
 *   Exif segment holding only the Orientation tag so rotated photos stay upright; drop bytes after EOI.
 * - PNG: drop eXIf, tEXt, iTXt, zTXt and tIME (and anything after IEND).
 * - WebP: drop the EXIF and XMP chunks and clear their VP8X flags.
 * - GIF: drop comment extensions and XMP application extensions.
 * - AVIF: refused when it carries Exif or XMP items (answer 14); rewriting iinf/iloc is deferred.
 */
import { InvariantError } from "../errors.ts";

export interface ImageMetadata {
  exif: boolean;
  xmp: boolean;
  /** IPTC / Photoshop resources, comments, PNG text chunks, timestamps. */
  other: boolean;
  /** An Exif GPS IFD with at least one entry: the place the photo was taken. */
  gps: boolean;
  /** Exif Orientation (1–8), when present. */
  orientation?: number;
}

export interface ImageInspection {
  width: number;
  height: number;
  /** More than one frame (GIF, APNG, animated WebP, AVIF sequence). */
  animated: boolean;
  metadata: ImageMetadata;
}

class Malformed extends Error {}

function bad(what: string): never {
  throw new Malformed(what);
}

const ascii = (b: Uint8Array, at: number, text: string) => {
  if (at < 0 || at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};
const be16 = (b: Uint8Array, at: number) => {
  if (at + 2 > b.length) bad("truncated");
  return ((b[at] as number) << 8) | (b[at + 1] as number);
};
const be32 = (b: Uint8Array, at: number) => {
  if (at + 4 > b.length) bad("truncated");
  return (
    (((b[at] as number) << 24) |
      ((b[at + 1] as number) << 16) |
      ((b[at + 2] as number) << 8) |
      (b[at + 3] as number)) >>>
    0
  );
};
const le16 = (b: Uint8Array, at: number) => {
  if (at + 2 > b.length) bad("truncated");
  return (b[at] as number) | ((b[at + 1] as number) << 8);
};
const le24 = (b: Uint8Array, at: number) => {
  if (at + 3 > b.length) bad("truncated");
  return (b[at] as number) | ((b[at + 1] as number) << 8) | ((b[at + 2] as number) << 16);
};
const le32 = (b: Uint8Array, at: number) => (le16(b, at) | (le16(b, at + 2) << 16)) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

const emptyMeta = (): ImageMetadata => ({ exif: false, xmp: false, other: false, gps: false });

// ───────────────────────────── TIFF / Exif ─────────────────────────────

/** Orientation and GPS presence from a TIFF structure (the body of an Exif segment or chunk). */
export function readExif(t: Uint8Array): { orientation?: number; gps: boolean } {
  if (t.length < 8) return { gps: false };
  const le = ascii(t, 0, "II");
  if (!le && !ascii(t, 0, "MM")) return { gps: false };
  const u16 = (at: number) => (le ? le16(t, at) : be16(t, at));
  const u32 = (at: number) => (le ? le32(t, at) : be32(t, at));
  try {
    if (u16(2) !== 42) return { gps: false };
    const ifd = u32(4);
    if (ifd + 2 > t.length) return { gps: false };
    const count = u16(ifd);
    let orientation: number | undefined;
    let gps = false;
    for (let i = 0; i < count && i < 512; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) break;
      const tag = u16(e);
      if (tag === 0x0112 && u16(e + 2) === 3) {
        const v = u16(e + 8);
        if (v >= 1 && v <= 8) orientation = v;
      } else if (tag === 0x8825) {
        const gpsIfd = u32(e + 8);
        gps = gpsIfd + 2 <= t.length && u16(gpsIfd) > 0;
      }
    }
    return orientation === undefined ? { gps } : { orientation, gps };
  } catch {
    return { gps: false };
  }
}

/** A minimal big-endian Exif APP1 segment that holds only the Orientation tag. */
function orientationApp1(orientation: number): Uint8Array {
  const tiff = [
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // MM, 42, IFD0 at 8
    0x00,
    0x01, // one entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00, // Orientation SHORT 1
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

// ───────────────────────────── JPEG ─────────────────────────────

interface JpegSegment {
  marker: number;
  start: number;
  /** First byte after the length field (or after the marker, for standalone markers). */
  data: number;
  end: number;
}

function jpegSegments(b: Uint8Array): { segments: JpegSegment[]; end: number } {
  if (!(b[0] === 0xff && b[1] === 0xd8)) bad("not a JPEG");
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) bad("bad marker");
    const start = i;
    let j = i + 1;
    while (j < b.length && b[j] === 0xff) j++; // fill bytes
    if (j >= b.length) bad("truncated");
    const marker = b[j] as number;
    i = j + 1;
    if (marker === 0xd9) return { segments, end: i };
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segments.push({ marker, start, data: i, end: i });
      continue;
    }
    const len = be16(b, i);
    if (len < 2 || i + len > b.length) bad("truncated segment");
    const seg: JpegSegment = { marker, start, data: i + 2, end: i + len };
    i += len;
    if (marker === 0xda) {
      // Entropy-coded data runs to the next marker that is not a stuffed byte or a restart.
      let k = i;
      while (k < b.length - 1) {
        if (b[k] === 0xff) {
          const n = b[k + 1] as number;
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
            k += 2;
            continue;
          }
          if (n === 0xff) {
            k += 1;
            continue;
          }
          break;
        }
        k++;
      }
      if (k >= b.length - 1) k = b.length;
      seg.end = k;
      i = k;
    }
    segments.push(seg);
  }
  return { segments, end: b.length };
}

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function inspectJpeg(b: Uint8Array): ImageInspection {
  const { segments, end } = jpegSegments(b);
  const metadata = emptyMeta();
  // Bytes after EOI (MPF secondary images, vendor trailers) can carry their own Exif.
  if (end < b.length) metadata.other = true;
  let width = 0;
  let height = 0;
  for (const s of segments) {
    if (s.marker >= 0xe0 && s.marker <= 0xef && s.marker !== 0xe1 && !keepJpegSegment(b, s))
      metadata.other = true;
    if (isSof(s.marker) && width === 0) {
      height = be16(b, s.data + 1);
      width = be16(b, s.data + 3);
    } else if (s.marker === 0xe1) {
      if (ascii(b, s.data, "Exif\0\0")) {
        metadata.exif = true;
        const exif = readExif(b.subarray(s.data + 6, s.end));
        if (exif.gps) metadata.gps = true;
        if (exif.orientation !== undefined && metadata.orientation === undefined)
          metadata.orientation = exif.orientation;
      } else if (ascii(b, s.data, "http://ns.adobe.com/")) metadata.xmp = true;
      else metadata.other = true;
    } else if (s.marker === 0xfe) metadata.other = true;
  }
  if (!width || !height) bad("no frame header");
  return { width, height, animated: false, metadata };
}

function keepJpegSegment(b: Uint8Array, s: JpegSegment): boolean {
  if (s.marker === 0xfe) return false; // COM
  if (s.marker >= 0xe0 && s.marker <= 0xef) {
    if (s.marker === 0xe0) return ascii(b, s.data, "JFIF\0") || ascii(b, s.data, "JFXX\0");
    if (s.marker === 0xe2) return ascii(b, s.data, "ICC_PROFILE\0");
    if (s.marker === 0xee) return ascii(b, s.data, "Adobe");
    return false;
  }
  return true;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const info = inspectJpeg(b);
  const { segments } = jpegSegments(b);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let orientationWritten =
    info.metadata.orientation === undefined || info.metadata.orientation === 1;
  for (const s of segments) {
    if (!orientationWritten && s.marker !== 0xe0) {
      parts.push(orientationApp1(info.metadata.orientation as number));
      orientationWritten = true;
    }
    if (keepJpegSegment(b, s)) parts.push(b.subarray(s.start, s.end));
  }
  parts.push(new Uint8Array([0xff, 0xd9]));
  return concat(parts);
}

// ───────────────────────────── PNG ─────────────────────────────

const PNG_SIG = "\x89PNG\r\n\x1a\n";
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

function pngChunks(b: Uint8Array): { type: string; start: number; data: number; end: number }[] {
  if (!ascii(b, 0, PNG_SIG)) bad("not a PNG");
  const out: { type: string; start: number; data: number; end: number }[] = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = be32(b, i);
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (end > b.length) bad("truncated chunk");
    out.push({ type, start: i, data: i + 8, end });
    i = end;
    if (type === "IEND") return out;
  }
  bad("no IEND");
}

function inspectPng(b: Uint8Array): ImageInspection {
  const chunks = pngChunks(b);
  const ihdr = chunks[0];
  if (ihdr?.type !== "IHDR") bad("no IHDR");
  const metadata = emptyMeta();
  if ((chunks.at(-1)?.end ?? 0) < b.length) metadata.other = true; // bytes after IEND
  let animated = false;
  for (const c of chunks) {
    if (c.type === "eXIf") {
      metadata.exif = true;
      const exif = readExif(b.subarray(c.data, c.end - 4));
      if (exif.gps) metadata.gps = true;
      if (exif.orientation !== undefined) metadata.orientation = exif.orientation;
    } else if (c.type === "iTXt" && ascii(b, c.data, "XML:com.adobe.xmp")) metadata.xmp = true;
    else if (PNG_DROP.has(c.type)) metadata.other = true;
    else if (c.type === "acTL" && be32(b, c.data) > 1) animated = true;
  }
  return { width: be32(b, ihdr.data), height: be32(b, ihdr.data + 4), animated, metadata };
}

function stripPng(b: Uint8Array): Uint8Array {
  const chunks = pngChunks(b);
  return concat([
    b.subarray(0, 8),
    ...chunks.filter((c) => !PNG_DROP.has(c.type)).map((c) => b.subarray(c.start, c.end)),
  ]);
}

// ───────────────────────────── WebP ─────────────────────────────

function webpChunks(
  b: Uint8Array,
): { fourcc: string; start: number; data: number; size: number; end: number }[] {
  if (!(ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"))) bad("not a WebP");
  const riffEnd = Math.min(b.length, 8 + le32(b, 4));
  const out: { fourcc: string; start: number; data: number; size: number; end: number }[] = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const fourcc = String.fromCharCode(...b.subarray(i, i + 4));
    const size = le32(b, i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > riffEnd) bad("truncated chunk");
    out.push({ fourcc, start: i, data: i + 8, size, end: Math.min(end, riffEnd) });
    i = end;
  }
  return out;
}

function inspectWebp(b: Uint8Array): ImageInspection {
  const chunks = webpChunks(b);
  const metadata = emptyMeta();
  if (8 + le32(b, 4) < b.length) metadata.other = true; // bytes after the RIFF container
  let width = 0;
  let height = 0;
  let animated = false;
  let frames = 0;
  for (const c of chunks) {
    if (c.fourcc === "VP8X") {
      const flags = b[c.data] as number;
      if (flags & 0x02) animated = true;
      width = le24(b, c.data + 4) + 1;
      height = le24(b, c.data + 7) + 1;
    } else if (c.fourcc === "VP8 " && !width) {
      if (!(b[c.data + 3] === 0x9d && b[c.data + 4] === 0x01 && b[c.data + 5] === 0x2a))
        bad("bad VP8 frame");
      width = le16(b, c.data + 6) & 0x3fff;
      height = le16(b, c.data + 8) & 0x3fff;
    } else if (c.fourcc === "VP8L" && !width) {
      if (b[c.data] !== 0x2f) bad("bad VP8L frame");
      const bits = le32(b, c.data + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (c.fourcc === "ANMF") frames++;
    else if (c.fourcc === "EXIF") {
      metadata.exif = true;
      const body = b.subarray(c.data, c.data + c.size);
      const exif = readExif(ascii(body, 0, "Exif\0\0") ? body.subarray(6) : body);
      if (exif.gps) metadata.gps = true;
      if (exif.orientation !== undefined) metadata.orientation = exif.orientation;
    } else if (c.fourcc === "XMP ") metadata.xmp = true;
  }
  if (frames > 1) animated = true;
  if (!width || !height) bad("no frame header");
  return { width, height, animated, metadata };
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks = webpChunks(b).filter((c) => c.fourcc !== "EXIF" && c.fourcc !== "XMP ");
  const body = chunks.map((c) => {
    const bytes = new Uint8Array(b.subarray(c.start, c.end));
    if (c.fourcc === "VP8X") bytes[8] = (bytes[8] as number) & ~(0x08 | 0x04);
    if (bytes.byteLength % 2) return concat([bytes, new Uint8Array(1)]);
    return bytes;
  });
  const size = 4 + body.reduce((n, p) => n + p.byteLength, 0);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 4), 0);
  head[4] = size & 0xff;
  head[5] = (size >>> 8) & 0xff;
  head[6] = (size >>> 16) & 0xff;
  head[7] = (size >>> 24) & 0xff;
  head.set(b.subarray(8, 12), 8);
  return concat([head, ...body]);
}

// ───────────────────────────── GIF ─────────────────────────────

interface GifBlock {
  start: number;
  end: number;
  kind: "image" | "comment" | "xmp" | "extension";
}

function gifBlocks(b: Uint8Array): { header: number; blocks: GifBlock[]; trailer: number } {
  if (!(ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a"))) bad("not a GIF");
  const packed = b[10] as number;
  let i = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
  const header = i;
  const blocks: GifBlock[] = [];
  const subBlocks = (at: number) => {
    let k = at;
    for (;;) {
      if (k >= b.length) bad("truncated");
      const n = b[k] as number;
      k += 1 + n;
      if (n === 0) return k;
    }
  };
  while (i < b.length) {
    const sep = b[i];
    if (sep === 0x3b) return { header, blocks, trailer: i };
    if (sep === 0x21) {
      const label = b[i + 1];
      const end = subBlocks(i + 2);
      const kind =
        label === 0xfe
          ? "comment"
          : label === 0xff && ascii(b, i + 3, "XMP DataXMP")
            ? "xmp"
            : "extension";
      blocks.push({ start: i, end, kind });
      i = end;
    } else if (sep === 0x2c) {
      const p = b[i + 9] as number;
      const lct = p & 0x80 ? 3 * 2 ** ((p & 0x07) + 1) : 0;
      const end = subBlocks(i + 10 + lct + 1);
      blocks.push({ start: i, end, kind: "image" });
      i = end;
    } else bad("bad block");
  }
  return { header, blocks, trailer: b.length };
}

function inspectGif(b: Uint8Array): ImageInspection {
  const { blocks, trailer } = gifBlocks(b);
  const metadata = emptyMeta();
  if (trailer + 1 < b.length) metadata.other = true; // bytes after the trailer
  for (const blk of blocks) {
    if (blk.kind === "comment") metadata.other = true;
    if (blk.kind === "xmp") metadata.xmp = true;
  }
  const frames = blocks.filter((x) => x.kind === "image").length;
  if (frames === 0) bad("no image");
  return { width: le16(b, 6), height: le16(b, 8), animated: frames > 1, metadata };
}

function stripGif(b: Uint8Array): Uint8Array {
  const { header, blocks } = gifBlocks(b);
  return concat([
    b.subarray(0, header),
    ...blocks
      .filter((x) => x.kind !== "comment" && x.kind !== "xmp")
      .map((x) => b.subarray(x.start, x.end)),
    new Uint8Array([0x3b]),
  ]);
}

// ───────────────────────────── AVIF (ISOBMFF) ─────────────────────────────

interface Box {
  type: string;
  start: number;
  /** First byte of the payload. */
  data: number;
  end: number;
}

function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let i = from;
  while (i + 8 <= to) {
    let size = be32(b, i);
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    let data = i + 8;
    if (size === 1) {
      const hi = be32(b, i + 8);
      const lo = be32(b, i + 12);
      size = hi * 2 ** 32 + lo;
      data = i + 16;
    } else if (size === 0) size = to - i;
    if (size < data - i || i + size > to) bad("truncated box");
    out.push({ type, start: i, data, end: i + size });
    i += size;
    if (out.length > 10_000) bad("too many boxes");
  }
  return out;
}

const cstring = (b: Uint8Array, at: number, end: number): [string, number] => {
  let k = at;
  while (k < end && b[k] !== 0) k++;
  return [String.fromCharCode(...b.subarray(at, k)), k + 1];
};

function inspectAvif(b: Uint8Array): ImageInspection {
  const top = boxes(b, 0, b.length);
  const ftyp = top.find((x) => x.type === "ftyp");
  if (!ftyp) bad("no ftyp");
  const brands: string[] = [];
  for (let at = ftyp.data; at + 4 <= ftyp.end; at += 4)
    if (at !== ftyp.data + 4) brands.push(String.fromCharCode(...b.subarray(at, at + 4)));
  const metadata = emptyMeta();
  let width = 0;
  let height = 0;
  const meta = top.find((x) => x.type === "meta");
  if (!meta) bad("no meta box");
  for (const child of boxes(b, meta.data + 4, meta.end)) {
    if (child.type === "iinf") {
      const version = b[child.data] as number;
      const first = child.data + 4 + (version === 0 ? 2 : 4);
      for (const infe of boxes(b, first, child.end)) {
        if (infe.type !== "infe") continue;
        const v = b[infe.data] as number;
        if (v < 2) continue;
        const typeAt = infe.data + 4 + (v === 2 ? 2 : 4) + 2;
        const itemType = String.fromCharCode(...b.subarray(typeAt, typeAt + 4));
        if (itemType === "Exif") metadata.exif = true;
        if (itemType === "mime") {
          const [, afterName] = cstring(b, typeAt + 4, infe.end);
          const [contentType] = cstring(b, afterName, infe.end);
          if (/rdf\+xml|xmp/i.test(contentType)) metadata.xmp = true;
        }
      }
    } else if (child.type === "iprp") {
      for (const ipco of boxes(b, child.data, child.end)) {
        if (ipco.type !== "ipco") continue;
        for (const prop of boxes(b, ipco.data, ipco.end)) {
          if (prop.type !== "ispe") continue;
          const w = be32(b, prop.data + 4);
          const h = be32(b, prop.data + 8);
          if (w * h > width * height) {
            width = w;
            height = h;
          }
        }
      }
    }
  }
  if (!width || !height) bad("no image size");
  const animated = brands.includes("avis") || top.some((x) => x.type === "moov");
  return { width, height, animated, metadata };
}

// ───────────────────────────── public API ─────────────────────────────

export const RASTER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

const LABEL: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
  "image/gif": "GIF",
};

/** Size, animation and metadata of a raster image, from its header only. */
export function inspectImage(bytes: Uint8Array, mediaType: string): ImageInspection {
  try {
    switch (mediaType) {
      case "image/jpeg":
        return inspectJpeg(bytes);
      case "image/png":
        return inspectPng(bytes);
      case "image/webp":
        return inspectWebp(bytes);
      case "image/gif":
        return inspectGif(bytes);
      case "image/avif":
        return inspectAvif(bytes);
      default:
        throw new InvariantError("unsupported_type", `${mediaType} is not a raster image`);
    }
  } catch (e) {
    if (e instanceof Malformed || e instanceof RangeError)
      throw new InvariantError(
        "unsupported_type",
        `this file is not a readable ${LABEL[mediaType] ?? "image"} (${e instanceof Malformed ? e.message : "truncated"})`,
      );
    throw e;
  }
}

/** Whether stripping would change anything. */
export function hasStrippableMetadata(info: ImageInspection): boolean {
  const m = info.metadata;
  return m.exif || m.xmp || m.other;
}

/**
 * The image without Exif/GPS/XMP/IPTC/comments (orientation kept), byte-identical pixels. Returns
 * the input unchanged when there is nothing to strip. AVIF with Exif or XMP is refused.
 */
export function stripImageMetadata(bytes: Uint8Array, mediaType: string): Uint8Array {
  const info = inspectImage(bytes, mediaType);
  if (!hasStrippableMetadata(info)) return bytes;
  try {
    switch (mediaType) {
      case "image/jpeg":
        return stripJpeg(bytes);
      case "image/png":
        return stripPng(bytes);
      case "image/webp":
        return stripWebp(bytes);
      case "image/gif":
        return stripGif(bytes);
      case "image/avif":
        throw new InvariantError(
          "metadata_unsupported",
          "this AVIF carries Exif or XMP metadata, which Cloudhal cannot remove from AVIF files yet; export it without metadata, or as JPEG or WebP",
        );
      default:
        return bytes;
    }
  } catch (e) {
    if (e instanceof Malformed)
      throw new InvariantError(
        "unsupported_type",
        `this file is not a readable image (${e.message})`,
      );
    throw e;
  }
}
