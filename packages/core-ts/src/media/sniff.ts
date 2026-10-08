/**
 * Magic-number sniffing (RFC-0004 §5.2), in the style of WHATWG MIME sniffing: the bytes decide the
 * type, never the declared type or the file name. Worker-safe, no dependencies.
 */

export type SniffResult =
  /** An accepted binary type. */
  | { kind: "type"; mediaType: string }
  /** UTF-8 text without NUL that is not HTML, XML or script: a data format (CSV, TSV, JSON, NDJSON). */
  | { kind: "text"; json: boolean }
  /** Recognised but refused, with the reason people see. */
  | { kind: "refused"; what: string; hint?: string }
  | { kind: "unknown" };

const ascii = (b: Uint8Array, at: number, text: string) => {
  if (at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

const u32 = (b: Uint8Array, at: number) =>
  (((b[at] as number) << 24) |
    ((b[at + 1] as number) << 16) |
    ((b[at + 2] as number) << 8) |
    (b[at + 3] as number)) >>>
  0;

/** Brands of the first ISOBMFF `ftyp` box: major brand first. */
function ftypBrands(b: Uint8Array): string[] | undefined {
  if (b.length < 16 || !ascii(b, 4, "ftyp")) return undefined;
  const size = u32(b, 0);
  if (size < 16 || size > 4096) return undefined;
  const end = Math.min(size, b.length);
  const brands = [String.fromCharCode(...b.subarray(8, 12))];
  for (let at = 16; at + 4 <= end; at += 4)
    brands.push(String.fromCharCode(...b.subarray(at, at + 4)));
  return brands;
}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/**
 * Patterns browsers sniff as active content. A data file must not look like any of them, or a
 * browser that ignores `nosniff` (or a download opened locally) could treat it as a page.
 */
const ACTIVE_TEXT =
  /^\s*<(?:!doctype\s+html|html|head|body|script|iframe|object|embed|svg|math|xml|\?xml|!--|style|link|meta|a\s|img|div|table|br|p\s*>|title|frameset|form|h1|font|b\s*>)/i;
/** Never inside a data file's sniffed window, wherever it appears. */
const ACTIVE_ANYWHERE = /<(?:script|html|!doctype\s+html|iframe|object|embed)\b/i;

function isSvgText(text: string): boolean {
  // An optional BOM, XML declaration, comments and whitespace, then the svg root element.
  const t = text.replace(/^﻿/, "");
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    t,
  );
}

/**
 * Sniffs the first bytes of a file (pass at least 4 KB when available). `tail` (the last 4 bytes)
 * confirms Parquet. Text is only classified as safe text; the declared type picks the data format.
 */
export function sniff(head: Uint8Array, tail?: Uint8Array): SniffResult {
  const b = head;
  if (b.length === 0) return { kind: "refused", what: "an empty file" };
  // Images
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { kind: "type", mediaType: "image/jpeg" };
  if (ascii(b, 0, "\x89PNG\r\n\x1a\n")) return { kind: "type", mediaType: "image/png" };
  if (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a"))
    return { kind: "type", mediaType: "image/gif" };
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return { kind: "type", mediaType: "image/webp" };
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return { kind: "type", mediaType: "audio/wav" };
  const brands = ftypBrands(b);
  if (brands) {
    const has = (...xs: string[]) => brands.some((x) => xs.includes(x));
    if (has("avif", "avis")) return { kind: "type", mediaType: "image/avif" };
    if (has("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"))
      return {
        kind: "refused",
        what: "a HEIC/HEIF image",
        hint: "browsers do not display HEIC; convert it to JPEG",
      };
    if (brands[0] === "M4A " || brands[0] === "M4B ")
      return { kind: "type", mediaType: "audio/mp4" };
    if (
      has(
        "isom",
        "iso2",
        "iso3",
        "iso4",
        "iso5",
        "iso6",
        "mp41",
        "mp42",
        "avc1",
        "M4V ",
        "dash",
        "MSNV",
        "f4v ",
      )
    )
      return { kind: "type", mediaType: "video/mp4" };
    if (has("qt  "))
      return { kind: "refused", what: "a QuickTime movie", hint: "export it as MP4" };
    return { kind: "unknown" };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // EBML: WebM declares its DocType near the start; other Matroska files are refused.
    const head64 = String.fromCharCode(...b.subarray(0, Math.min(b.length, 64)));
    return head64.includes("webm")
      ? { kind: "type", mediaType: "video/webm" }
      : { kind: "refused", what: "a Matroska file", hint: "export it as WebM or MP4" };
  }
  if (ascii(b, 0, "OggS")) return { kind: "type", mediaType: "audio/ogg" };
  if (ascii(b, 0, "ID3")) return { kind: "type", mediaType: "audio/mpeg" };
  // MPEG audio frame sync (11 bits), layer not "reserved" (which also keeps AAC/ADTS out).
  if (
    b[0] === 0xff &&
    b.length > 1 &&
    ((b[1] as number) & 0xe0) === 0xe0 &&
    ((b[1] as number) & 0x06) !== 0
  )
    return { kind: "type", mediaType: "audio/mpeg" };
  // %PDF- within the first 1,024 bytes.
  const pdfWindow = b.subarray(0, Math.min(b.length, 1024));
  for (let i = 0; i + 5 <= pdfWindow.length; i++)
    if (pdfWindow[i] === 0x25 && ascii(pdfWindow, i, "%PDF-"))
      return { kind: "type", mediaType: "application/pdf" };
  if (ascii(b, 0, "PAR1")) {
    if (tail && !ascii(tail, tail.length - 4, "PAR1"))
      return { kind: "refused", what: "a truncated Parquet file" };
    return { kind: "type", mediaType: "application/vnd.apache.parquet" };
  }
  // Refused binaries: archives, executables, Office and other containers.
  if (ascii(b, 0, "PK\x03\x04") || ascii(b, 0, "PK\x05\x06"))
    return { kind: "refused", what: "a ZIP archive (or an Office document)" };
  if (b[0] === 0x1f && b[1] === 0x8b) return { kind: "refused", what: "a gzip archive" };
  if (ascii(b, 0, "7z\xbc\xaf\x27\x1c")) return { kind: "refused", what: "a 7z archive" };
  if (ascii(b, 0, "Rar!")) return { kind: "refused", what: "a RAR archive" };
  if (ascii(b, 257, "ustar")) return { kind: "refused", what: "a tar archive" };
  if (ascii(b, 0, "MZ")) return { kind: "refused", what: "a Windows executable" };
  if (ascii(b, 0, "\x7fELF")) return { kind: "refused", what: "an executable" };
  const magic = u32(b, 0);
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic))
    return { kind: "refused", what: "an executable" };
  if (ascii(b, 0, "\xd0\xcf\x11\xe0")) return { kind: "refused", what: "an Office document" };
  if (ascii(b, 0, "#!")) return { kind: "refused", what: "a script" };
  return sniffText(b);
}

function sniffText(b: Uint8Array): SniffResult {
  if (b.includes(0)) return { kind: "unknown" };
  let text: string;
  try {
    // A multi-byte character may be cut at the end of the sniffed window: drop up to 3 bytes.
    text = decodeUtf8Prefix(b);
  } catch {
    return { kind: "unknown" };
  }
  if (isSvgText(text)) return { kind: "type", mediaType: "image/svg+xml" };
  if (/^\s*<\?xml/i.test(text.replace(/^﻿/, "")))
    return { kind: "refused", what: "an XML document" };
  const body = text.replace(/^﻿/, "");
  if (ACTIVE_TEXT.test(body) || ACTIVE_ANYWHERE.test(body))
    return {
      kind: "refused",
      what: "a web page (HTML)",
      hint: "pass the address of the file itself",
    };
  if (/^\s*(?:#!|<\?php|<%)/.test(text)) return { kind: "refused", what: "a script" };
  const first = text.replace(/^﻿/, "").trimStart()[0];
  return { kind: "text", json: first === "{" || first === "[" };
}

function decodeUtf8Prefix(b: Uint8Array): string {
  for (let cut = 0; cut <= 3 && cut < b.length; cut++) {
    try {
      return decoder.decode(b.subarray(0, b.length - cut));
    } catch (e) {
      if (cut === 3) throw e;
    }
  }
  return decoder.decode(b);
}

/** Whole-file text check for buffered data uploads: UTF-8, no NUL. */
export function isCleanUtf8(b: Uint8Array): boolean {
  if (b.includes(0)) return false;
  try {
    decoder.decode(b);
    return true;
  } catch {
    return false;
  }
}
