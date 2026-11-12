/**
 * Reads a release tarball back for `verify` (RFC-0046 §7): it accepts exactly what `tar.ts`
 * writes and refuses everything else. Gzip must carry the fixed header (no flags, mtime 0, OS
 * 255); tar headers must have a valid checksum, `ustar\0` + `00`, mode 0644, uid/gid 0, no owner
 * names, link name or prefix, the release's mtime, and typeflag `0` (or `x` with a single PAX
 * `path` record for the entry that follows). Links, directories and every other type are refused.
 */
import { gunzipCapped } from "../../packages/cli/src/archive/gzip.ts";
import { LIMITS } from "./manifest.ts";
import type { SourceFile } from "./read-build.ts";

const dec = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/** The largest decompressed tar a release may hold: every part at its limit is far beyond it. */
export const MAX_TAR_BYTES = 1024 * 1024 * 1024;

const GZIP_FIXED = [0x1f, 0x8b, 8, 0, 0, 0, 0, 0];

/** Refuses a gzip stream whose header is not the fixed one (§7). */
export function checkGzipHeader(gz: Uint8Array): void {
  if (gz.length < 18) throw new Error("the tarball is not gzip");
  for (let i = 0; i < GZIP_FIXED.length; i++)
    if (gz[i] !== GZIP_FIXED[i]) throw new Error("the tarball's gzip header is not the fixed one");
  if (gz[9] !== 255) throw new Error("the tarball's gzip OS byte is not 255");
}

async function* once(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

export async function gunzipBytes(gz: Uint8Array, max = MAX_TAR_BYTES): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const c of gunzipCapped(once(gz), max)) chunks.push(c);
  return new Uint8Array(Buffer.concat(chunks));
}

const str = (h: Uint8Array, at: number, len: number) => {
  const s = h.subarray(at, at + len);
  const end = s.indexOf(0);
  return dec.decode(end >= 0 ? s.subarray(0, end) : s);
};

function num(h: Uint8Array, at: number, len: number, what: string): number {
  const s = str(h, at, len).trim();
  if (!/^[0-7]{1,11}$/.test(s)) throw new Error(`a tar header has a bad ${what} field`);
  return Number.parseInt(s, 8);
}

function checksumOk(h: Uint8Array): boolean {
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
  return num(h, 148, 8, "checksum") === sum;
}

function checkHeader(h: Uint8Array, mtime: number): { name: string; size: number; flag: string } {
  if (!checksumOk(h)) throw new Error("a tar header has a bad checksum");
  if (str(h, 257, 6) !== "ustar" || h[262] !== 0 || str(h, 263, 2) !== "00")
    throw new Error("a tar header is not ustar");
  const flag = h[156] === 0 ? "0" : String.fromCharCode(h[156] as number);
  if (flag !== "0" && flag !== "x") throw new Error(`a tar entry has type ${flag}: not a file`);
  if (num(h, 100, 8, "mode") !== 0o644) throw new Error("a tar entry's mode is not 0644");
  if (num(h, 108, 8, "uid") !== 0 || num(h, 116, 8, "gid") !== 0)
    throw new Error("a tar entry's uid or gid is not 0");
  if (num(h, 136, 12, "mtime") !== mtime) throw new Error("a tar entry's mtime is not createdAt");
  if (str(h, 157, 100) || str(h, 265, 32) || str(h, 297, 32) || str(h, 345, 155))
    throw new Error("a tar entry has a link name, an owner name or a prefix");
  return { name: str(h, 0, 100), size: num(h, 124, 12, "size"), flag };
}

/** The `path` of a PAX header holding exactly one `path` record. */
function paxPath(data: Uint8Array): string {
  const text = dec.decode(data);
  const sp = text.indexOf(" ");
  const len = Number(text.slice(0, sp));
  if (sp < 1 || len !== data.length || !text.endsWith("\n") || !text.startsWith(`${len} path=`))
    throw new Error("a PAX header is not a single path record");
  return text.slice(sp + 6, -1);
}

/** The entries of `tar`, in archive order, checked against §7 (see the file comment). */
export function readTar(tar: Uint8Array, mtime: number): SourceFile[] {
  const out: SourceFile[] = [];
  let at = 0;
  let pending: string | null = null;
  for (;;) {
    if (at + 512 > tar.length) throw new Error("the tar archive is truncated");
    const h = tar.subarray(at, at + 512);
    if (h.every((x) => x === 0)) break;
    const { name, size, flag } = checkHeader(h, mtime);
    const data = tar.subarray(at + 512, at + 512 + size);
    if (data.length !== size) throw new Error("the tar archive is truncated");
    at += 512 + Math.ceil(size / 512) * 512;
    if (flag === "x") {
      if (pending !== null) throw new Error("two PAX headers in a row");
      pending = paxPath(data);
      continue;
    }
    const path = pending ?? name;
    if (pending !== null && pending.slice(-100) !== name)
      throw new Error(`${path}: the ustar name is not the end of the PAX path`);
    pending = null;
    out.push({ path, bytes: data });
    if (out.length > LIMITS.tarEntries)
      throw new Error(`the tarball has more than ${LIMITS.tarEntries} entries`);
  }
  if (pending !== null) throw new Error("a PAX header ends the archive");
  if (tar.subarray(at, at + 1024).length !== 1024 || tar.subarray(at).some((x) => x !== 0))
    throw new Error("the tar archive does not end with zero blocks only");
  return out;
}
