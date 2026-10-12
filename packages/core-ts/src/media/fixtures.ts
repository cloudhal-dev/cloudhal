/**
 * Synthetic media files for tests (core-ts, MCP, renderer, CLI): structurally valid headers with
 * the metadata a phone would write (Exif with GPS, XMP, IPTC, comments), built byte by byte so no
 * binary fixtures are checked in. Pixel data is filler; nothing here decodes it.
 */

const enc = new TextEncoder();

function concat(...parts: (Uint8Array | number[] | string)[]): Uint8Array {
  const bufs = parts.map((p) =>
    typeof p === "string" ? enc.encode(p) : p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const out = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0));
  let at = 0;
  for (const b of bufs) {
    out.set(b, at);
    at += b.byteLength;
  }
  return out;
}

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A big-endian TIFF/Exif body: Orientation, a Make tag, and a GPS IFD with a latitude. */
export function exifTiff(options: { orientation?: number; gps?: boolean } = {}): Uint8Array {
  const entries: number[][] = [];
  if (options.orientation !== undefined)
    entries.push([...be16(0x0112), ...be16(3), ...be32(1), ...be16(options.orientation), 0, 0]);
  entries.push([...be16(0x010f), ...be16(2), ...be32(4), ...enc.encode("ACME")]); // Make
  const ifd0Size = 2 + 12 * (entries.length + (options.gps ? 1 : 0)) + 4;
  const gpsOffset = 8 + ifd0Size;
  if (options.gps) entries.push([...be16(0x8825), ...be16(4), ...be32(1), ...be32(gpsOffset)]);
  entries.sort(
    (a, b) =>
      ((a[0] as number) << 8) + (a[1] as number) - (((b[0] as number) << 8) + (b[1] as number)),
  );
  const ifd0 = [...be16(entries.length), ...entries.flat(), ...be32(0)];
  const gps = options.gps
    ? [...be16(1), ...be16(0x0001), ...be16(2), ...be32(2), ...enc.encode("N\0"), ...be32(0)]
    : [];
  return concat("MM", [0, 42], be32(8), ifd0, gps);
}

function jpegSegment(marker: number, payload: Uint8Array | string | number[]): Uint8Array {
  const body = concat(payload);
  return concat([0xff, marker], be16(body.byteLength + 2), body);
}

export interface JpegOptions {
  width?: number;
  height?: number;
  orientation?: number;
  gps?: boolean;
  xmp?: boolean;
  iptc?: boolean;
  comment?: boolean;
  /** Bytes after EOI (a vendor trailer). */
  trailer?: boolean;
}

/** A baseline JPEG skeleton with optional metadata segments. */
export function makeJpeg(o: JpegOptions = {}): Uint8Array {
  const parts: Uint8Array[] = [
    new Uint8Array([0xff, 0xd8]),
    jpegSegment(0xe0, concat("JFIF\0", [1, 1, 0, 0, 1, 0, 1, 0, 0])),
  ];
  if (o.orientation !== undefined || o.gps)
    parts.push(
      jpegSegment(
        0xe1,
        concat(
          "Exif\0\0",
          exifTiff({
            ...(o.orientation !== undefined ? { orientation: o.orientation } : {}),
            ...(o.gps ? { gps: true } : {}),
          }),
        ),
      ),
    );
  if (o.xmp)
    parts.push(jpegSegment(0xe1, concat("http://ns.adobe.com/xap/1.0/\0", "<x:xmpmeta/>")));
  parts.push(jpegSegment(0xe2, concat("ICC_PROFILE\0", [1, 1], "icc-data")));
  if (o.iptc) parts.push(jpegSegment(0xed, concat("Photoshop 3.0\0", "8BIM-iptc")));
  if (o.comment) parts.push(jpegSegment(0xfe, "shot on a phone"));
  parts.push(jpegSegment(0xdb, concat([0], new Uint8Array(64).fill(1))));
  parts.push(
    jpegSegment(0xc0, [8, ...be16(o.height ?? 480), ...be16(o.width ?? 640), 1, 1, 0x11, 0]),
  );
  parts.push(jpegSegment(0xc4, concat([0], new Uint8Array(16).fill(0), [0])));
  parts.push(jpegSegment(0xda, [1, 1, 0, 0, 63, 0]));
  parts.push(new Uint8Array([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a]));
  parts.push(new Uint8Array([0xff, 0xd9]));
  if (o.trailer) parts.push(concat("TRAILER", exifTiff({ gps: true })));
  return concat(...parts);
}

function pngChunk(type: string, data: Uint8Array | number[] | string): Uint8Array {
  const body = concat(data);
  const typed = concat(type, body);
  return concat(be32(body.byteLength), typed, be32(crc32(typed)));
}

/** A PNG skeleton (IHDR, optional metadata chunks, one IDAT, IEND). */
export function makePng(
  o: { width?: number; height?: number; text?: boolean; exif?: boolean; frames?: number } = {},
): Uint8Array {
  const parts: Uint8Array[] = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", [...be32(o.width ?? 64), ...be32(o.height ?? 32), 8, 6, 0, 0, 0]),
    pngChunk("sRGB", [0]),
  ];
  if (o.frames) parts.push(pngChunk("acTL", [...be32(o.frames), ...be32(0)]));
  if (o.text)
    parts.push(
      pngChunk("tEXt", "Comment\0made at home"),
      pngChunk("tIME", [7, 234, 10, 8, 6, 30, 0]),
    );
  if (o.exif) parts.push(pngChunk("eXIf", exifTiff({ orientation: 1, gps: true })));
  parts.push(pngChunk("IDAT", [0x78, 0x9c, 0x63, 0x60, 0, 0, 0, 2, 0, 1]), pngChunk("IEND", []));
  return concat(...parts);
}

/** A real 1×1 transparent PNG (decodes in browsers). */
export const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function riffChunk(fourcc: string, data: Uint8Array | number[] | string): Uint8Array {
  const body = concat(data);
  return concat(fourcc, le32(body.byteLength), body, body.byteLength % 2 ? [0] : []);
}

/** An extended WebP (VP8X) with a lossy frame and optional EXIF/XMP chunks or animation. */
export function makeWebp(
  o: { width?: number; height?: number; exif?: boolean; xmp?: boolean; frames?: number } = {},
): Uint8Array {
  const w = o.width ?? 320;
  const h = o.height ?? 200;
  const flags = (o.exif ? 0x08 : 0) | (o.xmp ? 0x04 : 0) | (o.frames && o.frames > 1 ? 0x02 : 0);
  const vp8 = riffChunk("VP8 ", [
    0x10,
    0x02,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...le16(w),
    ...le16(h),
    0,
    0,
    0,
  ]);
  const chunks: Uint8Array[] = [
    riffChunk("VP8X", [flags, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]),
  ];
  if (o.frames && o.frames > 1)
    for (let i = 0; i < o.frames; i++)
      chunks.push(riffChunk("ANMF", concat(new Uint8Array(16), vp8)));
  else chunks.push(vp8);
  if (o.exif) chunks.push(riffChunk("EXIF", exifTiff({ orientation: 3, gps: true })));
  if (o.xmp) chunks.push(riffChunk("XMP ", "<x:xmpmeta/>"));
  const body = concat("WEBP", ...chunks);
  return concat("RIFF", le32(body.byteLength), body);
}

/** A GIF89a with `frames` images and an optional comment extension. */
export function makeGif(
  o: { width?: number; height?: number; frames?: number; comment?: boolean } = {},
): Uint8Array {
  const parts: (Uint8Array | number[] | string)[] = [
    "GIF89a",
    le16(o.width ?? 16),
    le16(o.height ?? 16),
    [0x80, 0, 0],
    [0, 0, 0, 255, 255, 255],
  ];
  if (o.comment) parts.push([0x21, 0xfe, 5], "hello", [0]);
  for (let i = 0; i < (o.frames ?? 1); i++)
    parts.push(
      [0x21, 0xf9, 4, 0, 10, 0, 0, 0],
      [0x2c, 0, 0, 0, 0, ...le16(o.width ?? 16), ...le16(o.height ?? 16), 0],
      [2, 2, 0x4c, 0x01, 0],
    );
  parts.push([0x3b]);
  return concat(...parts);
}

function box(type: string, ...payload: (Uint8Array | number[] | string)[]): Uint8Array {
  const body = concat(...payload);
  return concat(be32(body.byteLength + 8), type, body);
}

/** An AVIF skeleton: ftyp, meta (iinf with an `av01` item and optionally an `Exif` item, ispe). */
export function makeAvif(o: { width?: number; height?: number; exif?: boolean } = {}): Uint8Array {
  const infe = (id: number, type: string) =>
    box("infe", [2, 0, 0, 0], be16(id), be16(0), type, "\0");
  const items = [infe(1, "av01"), ...(o.exif ? [infe(2, "Exif")] : [])];
  const iinf = box("iinf", [0, 0, 0, 0], be16(items.length), ...items);
  const ispe = box("ispe", [0, 0, 0, 0], be32(o.width ?? 800), be32(o.height ?? 600));
  const meta = box(
    "meta",
    [0, 0, 0, 0],
    box("hdlr", [0, 0, 0, 0], be32(0), "pict", new Uint8Array(13)),
    iinf,
    box("iprp", box("ipco", ispe)),
  );
  return concat(
    box("ftyp", "avif", be32(0), "avifmif1miaf"),
    meta,
    box("mdat", new Uint8Array(32)),
  );
}

/** Bytes of a text file. */
export const text = (s: string) => enc.encode(s);
