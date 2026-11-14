/**
 * Streams a release tarball (RFC-0046 §7) without holding it whole. It accepts exactly what the
 * producer (`scripts/release-bundle/tar.ts`) writes and refuses everything else (`tar-format`):
 *
 * - gzip with the fixed header (no flags, mtime 0, OS 255), decompressed by `DecompressionStream`;
 * - ustar headers with a valid checksum, `ustar\0` + `00`, mode 0644, uid/gid 0, no owner names,
 *   link name or prefix, the release's mtime, and typeflag `0` (or `x` with a single PAX `path`
 *   record for the entry that follows); links, directories and every other type are refused;
 * - two or more zero blocks, and nothing but zeros, at the end.
 */
import { ReleaseVerifyError, refuse } from "./errors.ts";
import { LIMITS, MAX_TAR_BYTES } from "./limits.ts";

export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array;

/** The chunks of `source`, whatever its form. */
export async function* chunksOf(source: ByteSource): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  if (typeof (source as ReadableStream<Uint8Array>).getReader === "function") {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  yield* source as AsyncIterable<Uint8Array>;
}

const GZIP_FIXED = [0x1f, 0x8b, 8, 0, 0, 0, 0, 0];

/** Refuses a gzip stream whose first ten bytes are not the fixed header (§7). */
export function checkGzipHeader(head: Uint8Array): void {
  if (head.length < 10) refuse("tar-format", "the tarball is not gzip");
  for (let i = 0; i < GZIP_FIXED.length; i++)
    if (head[i] !== GZIP_FIXED[i]) refuse("tar-format", "the tarball's gzip header is not fixed");
  if (head[9] !== 255) refuse("tar-format", "the tarball's gzip OS byte is not 255");
}

/** The decompressed bytes of a gzip `source` whose header is the fixed one. */
export async function* gunzip(
  source: AsyncIterable<Uint8Array>,
  max: number = MAX_TAR_BYTES,
): AsyncGenerator<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  const pump = (async () => {
    const head: number[] = [];
    try {
      for await (const chunk of source) {
        if (head.length < 10) {
          for (const b of chunk.subarray(0, 10 - head.length)) head.push(b);
          if (head.length === 10) checkGzipHeader(Uint8Array.from(head));
        }
        await writer.write(chunk);
      }
      if (head.length < 10) checkGzipHeader(Uint8Array.from(head));
      await writer.close();
    } catch (e) {
      await writer.abort(e).catch(() => {});
      throw e;
    }
  })();
  pump.catch(() => {});
  const reader = ds.readable.getReader();
  let total = 0;
  try {
    for (;;) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (e) {
        await pump; // a header refusal from the pump wins over the decompressor's error
        throw e;
      }
      if (next.done) break;
      total += next.value.length;
      if (total > max)
        refuse("limit-exceeded", `the tarball decompresses to more than ${max} bytes`);
      yield next.value;
    }
    await pump;
  } catch (e) {
    if (e instanceof ReleaseVerifyError) throw e;
    refuse("tar-format", `the tarball is not valid gzip (${(e as Error).message})`);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** A FIFO of byte chunks that hands out exact lengths. */
class ByteQueue {
  private chunks: Uint8Array[] = [];
  private offset = 0;
  length = 0;
  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }
  take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const head = this.chunks[0] as Uint8Array;
      const part = head.subarray(this.offset, this.offset + (n - at));
      out.set(part, at);
      at += part.length;
      this.offset += part.length;
      if (this.offset === head.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    this.length -= n;
    return out;
  }
}

const dec = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

function str(h: Uint8Array, at: number, len: number): string {
  const s = h.subarray(at, at + len);
  const end = s.indexOf(0);
  try {
    return dec.decode(end >= 0 ? s.subarray(0, end) : s);
  } catch {
    return refuse("tar-format", "a tar header field is not UTF-8");
  }
}

/** An octal field: 1 to 11 digits, NUL- or space-terminated (anchored and bounded: linear). */
function num(h: Uint8Array, at: number, len: number, what: string): number {
  const s = str(h, at, len).trim();
  if (!/^[0-7]{1,11}$/.test(s)) refuse("tar-format", `a tar header has a bad ${what} field`);
  return Number.parseInt(s, 8);
}

function checksumOk(h: Uint8Array): boolean {
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
  return num(h, 148, 8, "checksum") === sum;
}

interface Header {
  readonly name: string;
  readonly size: number;
  readonly flag: "0" | "x";
}

function checkHeader(h: Uint8Array, mtime: number): Header {
  if (!checksumOk(h)) refuse("tar-format", "a tar header has a bad checksum");
  if (str(h, 257, 6) !== "ustar" || h[262] !== 0 || str(h, 263, 2) !== "00")
    refuse("tar-format", "a tar header is not ustar");
  const flag = h[156] === 0 ? "0" : String.fromCharCode(h[156] as number);
  if (flag !== "0" && flag !== "x") refuse("tar-format", `a tar entry has type ${flag}`);
  if (num(h, 100, 8, "mode") !== 0o644) refuse("tar-format", "a tar entry's mode is not 0644");
  if (num(h, 108, 8, "uid") !== 0 || num(h, 116, 8, "gid") !== 0)
    refuse("tar-format", "a tar entry's uid or gid is not 0");
  if (num(h, 136, 12, "mtime") !== mtime)
    refuse("tar-format", "a tar entry's mtime is not the release's createdAt");
  if (str(h, 157, 100) || str(h, 265, 32) || str(h, 297, 32) || str(h, 345, 155))
    refuse("tar-format", "a tar entry has a link name, an owner name or a prefix");
  return { name: str(h, 0, 100), size: num(h, 124, 12, "size"), flag };
}

/** The `path` of a PAX header holding exactly one `path` record. */
function paxPath(data: Uint8Array): string {
  let text: string;
  try {
    text = dec.decode(data);
  } catch {
    return refuse("tar-format", "a PAX header is not UTF-8");
  }
  const sp = text.indexOf(" ");
  const len = Number(text.slice(0, sp));
  if (sp < 1 || len !== data.length || !text.endsWith("\n") || !text.startsWith(`${len} path=`))
    refuse("tar-format", "a PAX header is not a single path record");
  return text.slice(sp + 6, -1);
}

export interface TarEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const padded = (size: number) => Math.ceil(size / 512) * 512;
const isZero = (b: Uint8Array) => b.every((x) => x === 0);

/** A tar stream read in exact lengths. */
class TarReader {
  private readonly q = new ByteQueue();
  private readonly it: AsyncIterator<Uint8Array>;
  constructor(source: AsyncIterable<Uint8Array>) {
    this.it = source[Symbol.asyncIterator]();
  }
  /** Buffers at least `n` bytes; false when the stream ends first. */
  async fill(n: number): Promise<boolean> {
    while (this.q.length < n) {
      const next = await this.it.next();
      if (next.done) return false;
      this.q.push(next.value);
    }
    return true;
  }
  /** Exactly `n` bytes, or the refusal of a truncated archive. */
  async take(n: number): Promise<Uint8Array> {
    if (!(await this.fill(n))) refuse("tar-format", "the tar archive is truncated");
    return this.q.take(n);
  }
  /** Everything left in the stream must be zeros, and with `zeros` already read, 1024 or more. */
  async checkEnd(zeros: number): Promise<void> {
    let trailing = zeros;
    do {
      const rest = this.q.take(this.q.length);
      if (!isZero(rest)) refuse("tar-format", "the tar archive has data after its end");
      trailing += rest.length;
    } while (await this.fill(1));
    if (trailing < 1024) refuse("tar-format", "the tar archive does not end with two zero blocks");
  }
}

/** The next file header with its PAX path applied, or null at the first zero block. */
async function nextHeader(
  r: TarReader,
  mtime: number,
): Promise<{ path: string; size: number } | null> {
  let pax: string | null = null;
  for (;;) {
    const h = await r.take(512);
    if (isZero(h)) {
      if (pax !== null) refuse("tar-format", "a PAX header ends the archive");
      return null;
    }
    const { name, size, flag } = checkHeader(h, mtime);
    if (size > LIMITS.partBytes)
      refuse("limit-exceeded", `a tar entry is above ${LIMITS.partBytes} bytes`);
    if (flag === "0") {
      if (pax !== null && pax.slice(-100) !== name)
        refuse("tar-format", `${pax}: the ustar name is not the end of the PAX path`);
      return { path: pax ?? name, size };
    }
    if (pax !== null) refuse("tar-format", "two PAX headers in a row");
    if (size > 4096) refuse("tar-format", "a PAX header is too large");
    pax = paxPath((await r.take(padded(size))).subarray(0, size));
  }
}

/**
 * The entries of a decompressed tar stream, in archive order. `admit(path, size)` runs on each
 * entry's header, before its bytes are buffered, so an unlisted or oversized entry is refused
 * without reading it into memory.
 */
export async function* readTar(
  source: AsyncIterable<Uint8Array>,
  mtime: number,
  admit: (path: string, size: number) => void,
): AsyncGenerator<TarEntry> {
  const r = new TarReader(source);
  let count = 0;
  for (;;) {
    const header = await nextHeader(r, mtime);
    if (!header) break;
    if (++count > LIMITS.tarEntries)
      refuse("limit-exceeded", `the tarball has more than ${LIMITS.tarEntries} entries`);
    admit(header.path, header.size);
    const data = await r.take(padded(header.size));
    yield { path: header.path, bytes: data.subarray(0, header.size) };
  }
  await r.checkEnd(512);
}
