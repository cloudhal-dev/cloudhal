/**
 * POSIX ustar blocks for site archives (RFC-0039 §1): regular files only, no I/O.
 *
 * The writer's headers carry nothing that varies between machines or runs (invariant 7): mode
 * 0644, uid/gid 0, mtime 0, empty user, group, link name and prefix. The reader accepts exactly the
 * headers Cloudhal writes: a valid checksum, `ustar\0` + `00`, typeflag `0` (or NUL), no link name,
 * no prefix and a printable ASCII name. Links, devices, directories, FIFOs and pax or GNU
 * extension headers are refused, so an archive can never point outside itself.
 */
import { ArchiveError } from "./errors.ts";

export const TAR_BLOCK = 512;
export const TAR_RECORD = 10240;
/** The largest size 11 octal digits hold (8 GiB - 1). */
export const TAR_MAX_SIZE = 0o77777777777;

// Field offsets and widths of a ustar header.
const NAME = [0, 100] as const;
const MODE = [100, 8] as const;
const UID = [108, 8] as const;
const GID = [116, 8] as const;
const SIZE = [124, 12] as const;
const MTIME = [136, 12] as const;
const CHECKSUM = [148, 8] as const;
const TYPEFLAG = 156;
const LINKNAME = [157, 100] as const;
const MAGIC = [257, 8] as const; // "ustar\0" + version "00"
const DEVMAJOR = [329, 8] as const;
const DEVMINOR = [337, 8] as const;
const PREFIX = [345, 155] as const;

const USTAR_MAGIC = "ustar\u000000";

const TYPE_NAMES: Record<string, string> = {
  "1": "a hard link",
  "2": "a symbolic link",
  "3": "a character device",
  "4": "a block device",
  "5": "a directory",
  "6": "a FIFO",
  "7": "a contiguous file",
  x: "a pax extended header",
  g: "a pax global header",
  L: "a GNU long name",
  K: "a GNU long link name",
};

function writeAscii(block: Uint8Array, [offset]: readonly [number, number], text: string): void {
  for (let i = 0; i < text.length; i++) block[offset + i] = text.charCodeAt(i);
}

function octal(value: number, digits: number): string {
  return `${value.toString(8).padStart(digits, "0")}\u0000`;
}

function isPrintableName(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return false;
  }
  return name.length > 0;
}

/** The unsigned header checksum: every byte, with the checksum field counted as spaces. */
function checksumOf(block: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < TAR_BLOCK; i++)
    sum += i >= CHECKSUM[0] && i < CHECKSUM[0] + CHECKSUM[1] ? 0x20 : (block[i] as number);
  return sum;
}

/** Writes the checksum of `block` into it (`%06o\0 `) and returns it. */
export function sealTarHeader(block: Uint8Array): Uint8Array {
  writeAscii(block, CHECKSUM, `${checksumOf(block).toString(8).padStart(6, "0")}\u0000 `);
  return block;
}

/** The header of a regular file: `path` is printable ASCII of at most 99 bytes. */
export function tarHeader(path: string, size: number): Uint8Array {
  if (!isPrintableName(path) || path.length >= NAME[1])
    throw new ArchiveError("invalid_input", "a tar entry name must be 1-99 printable ASCII bytes");
  if (!Number.isSafeInteger(size) || size < 0 || size > TAR_MAX_SIZE)
    throw new ArchiveError("too_large", `${path}: ${size} bytes do not fit a ustar header`, {
      path,
    });
  const block = new Uint8Array(TAR_BLOCK);
  writeAscii(block, NAME, path);
  writeAscii(block, MODE, octal(0o644, 7));
  writeAscii(block, UID, octal(0, 7));
  writeAscii(block, GID, octal(0, 7));
  writeAscii(block, SIZE, octal(size, 11));
  writeAscii(block, MTIME, octal(0, 11));
  block[TYPEFLAG] = 0x30; // "0": regular file
  writeAscii(block, MAGIC, USTAR_MAGIC);
  writeAscii(block, DEVMAJOR, octal(0, 7));
  writeAscii(block, DEVMINOR, octal(0, 7));
  return sealTarHeader(block);
}

/** Zeros from the end of a `size`-byte body to the next block boundary. */
export function tarPadding(size: number): Uint8Array {
  return new Uint8Array((TAR_BLOCK - (size % TAR_BLOCK)) % TAR_BLOCK);
}

/** Two zero blocks, then zeros so the archive is a whole number of 10240-byte records. */
export function tarEnd(written: number): Uint8Array {
  const total = Math.ceil((written + 2 * TAR_BLOCK) / TAR_RECORD) * TAR_RECORD;
  return new Uint8Array(total - written);
}

/** The length of the tar stream of files of these sizes, the end of the archive included. */
export function tarLength(sizes: Iterable<number>): number {
  let written = 0;
  for (const size of sizes) written += TAR_BLOCK + size + tarPadding(size).length;
  return written + tarEnd(written).length;
}

function isZero(bytes: Uint8Array, [offset, length]: readonly [number, number]): boolean {
  for (let i = offset; i < offset + length; i++) if (bytes[i] !== 0) return false;
  return true;
}

/** An octal number field: optional leading spaces, digits, then NUL or space padding only. */
function parseOctal(block: Uint8Array, [offset, length]: readonly [number, number]): number {
  let i = offset;
  const end = offset + length;
  while (i < end && block[i] === 0x20) i++;
  let value = 0;
  let digits = 0;
  for (; i < end && (block[i] as number) >= 0x30 && (block[i] as number) <= 0x37; i++, digits++)
    value = value * 8 + ((block[i] as number) - 0x30);
  for (; i < end; i++) if (block[i] !== 0 && block[i] !== 0x20) return Number.NaN;
  return digits === 0 ? Number.NaN : value;
}

function unsafe(message: string): ArchiveError {
  return new ArchiveError("unsafe_entry", message);
}

function checkType(block: Uint8Array): void {
  const flag = block[TYPEFLAG] as number;
  if (flag === 0x30 || flag === 0) return;
  const char = String.fromCharCode(flag);
  const what = TYPE_NAMES[char] ?? `an entry of type ${flag < 0x21 || flag > 0x7e ? flag : char}`;
  throw unsafe(`the archive holds ${what}; site archives hold regular files only`);
}

function parseName(block: Uint8Array): string {
  const nul = block.indexOf(0, NAME[0]);
  if (nul < 0 || nul >= NAME[1] || !isZero(block, [nul, NAME[1] - nul]))
    throw unsafe("a tar entry name is not NUL-terminated");
  const name = String.fromCharCode(...block.subarray(NAME[0], nul));
  if (!isPrintableName(name)) throw unsafe("a tar entry name is empty or not printable ASCII");
  return name;
}

/**
 * One header block: `"zero"` for an all-zero block (the end of the archive), otherwise the regular
 * file it describes. A bad checksum is `damaged`; anything Cloudhal does not write is
 * `unsafe_entry`.
 */
export function parseTarHeader(block: Uint8Array): { path: string; size: number } | "zero" {
  if (isZero(block, [0, TAR_BLOCK])) return "zero";
  if (parseOctal(block, CHECKSUM) !== checksumOf(block))
    throw new ArchiveError("damaged", "a tar header checksum does not match (the file is damaged)");
  if (String.fromCharCode(...block.subarray(MAGIC[0], MAGIC[0] + MAGIC[1])) !== USTAR_MAGIC)
    throw unsafe("a tar header is not POSIX ustar");
  checkType(block);
  if (!isZero(block, LINKNAME)) throw unsafe("a tar entry has a link name");
  if (!isZero(block, PREFIX)) throw unsafe("a tar entry has a name prefix");
  const path = parseName(block);
  if (((block[SIZE[0]] as number) & 0x80) !== 0) throw unsafe("a tar entry size is base-256");
  const size = parseOctal(block, SIZE);
  if (Number.isNaN(size)) throw unsafe("a tar entry size is not an octal number");
  return { path, size };
}
