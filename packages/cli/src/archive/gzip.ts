/**
 * gzip for site archives. The writer compresses with fixed parameters and a fixed OS byte, so the
 * same tar stream gives the same bytes on every platform that runs the same zlib build (gzip
 * output is not identical across zlib builds; the tar stream inside it is). The reader accepts any
 * gzip and nothing after its last member, counts the decompressed bytes against a cap, and maps
 * zlib's errors to archive errors.
 */
import { pipeline } from "node:stream/promises";
import { constants, createGunzip, createGzip, type ZlibOptions } from "node:zlib";
import { ArchiveError } from "./errors.ts";

/**
 * Level 6 (zlib's default) writes XFL 0. Level 9 costs about twice the CPU on NDJSON for about 3%
 * less; level 0 is not used because stored blocks follow the input's chunking.
 */
export const GZIP_OPTIONS: Readonly<ZlibOptions> = Object.freeze({
  level: 6,
  memLevel: 8,
  windowBits: 15,
  strategy: constants.Z_DEFAULT_STRATEGY,
});

/** RFC 1952 OS "unknown": the same on every platform (zlib writes 3 on Unix, 10 on Windows). */
export const GZIP_OS = 255;

const GZIP_HEADER = 10;

/** Checks zlib's header (no name, comment or header CRC: FLG 0) and sets the OS byte. */
function patchHeader(head: Uint8Array): Uint8Array {
  if (head[0] !== 0x1f || head[1] !== 0x8b || head[2] !== 8 || head[3] !== 0)
    throw new ArchiveError("invalid_input", "zlib wrote an unexpected gzip header");
  head[9] = GZIP_OS;
  return head;
}

/** `source` gzip-compressed with GZIP_OPTIONS and the OS byte set to GZIP_OS. */
export async function* gzipFixed(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array, void, undefined> {
  const gzip = createGzip(GZIP_OPTIONS);
  const piping = pipeline(source, gzip);
  piping.catch(() => {}); // surfaced by the loop below (pipeline destroys gzip with the error)
  let head = new Uint8Array(0);
  let patched = false;
  try {
    for await (const chunk of gzip as AsyncIterable<Uint8Array>) {
      if (patched) {
        yield chunk;
        continue;
      }
      head = Buffer.concat([head, chunk]);
      if (head.length < GZIP_HEADER) continue;
      patched = true;
      yield patchHeader(head);
    }
    await piping;
    if (!patched) throw new ArchiveError("invalid_input", "zlib wrote no gzip header");
  } finally {
    gzip.destroy();
  }
}

function zlibCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("Z_") ? code : undefined;
}

/** What the source handed to gunzip: its first two bytes, its length, and whether it ended. */
interface Feed {
  head: number[];
  bytes: number;
  ended: boolean;
}

/** `source` unchanged, counted into `feed`. */
async function* counted(
  source: AsyncIterable<Uint8Array>,
  feed: Feed,
): AsyncGenerator<Uint8Array, void, undefined> {
  for await (const chunk of source) {
    for (const b of chunk.subarray(0, 2 - feed.head.length)) feed.head.push(b);
    feed.bytes += chunk.length;
    yield chunk;
  }
  feed.ended = true;
}

/**
 * A zlib error as an archive error. Whether the input is gzip at all is judged from its first two
 * bytes (the magic 1f 8b), not from how much of it was decompressed before the error.
 */
function mapZlibError(error: unknown, feed: Feed): unknown {
  const code = zlibCode(error);
  if (code === undefined) return error;
  if (feed.bytes === 0)
    return new ArchiveError("not_archive", "not a Cloudhal site archive (it is empty)", {
      cause: error,
    });
  if (feed.head[0] !== 0x1f || feed.head[1] !== 0x8b)
    return new ArchiveError("not_archive", "not a Cloudhal site archive (not gzip)", {
      cause: error,
    });
  if (code === "Z_BUF_ERROR")
    return new ArchiveError("truncated", "the archive is truncated (gzip ends early)", {
      cause: error,
    });
  return new ArchiveError("damaged", "the archive is damaged (gzip data is corrupt)", {
    cause: error,
  });
}

/**
 * `source` decompressed, `too_large` beyond `maxBytes` decompressed bytes. It returns only after
 * gunzip ended cleanly (its CRC and length check passed) and consumed the whole source: zlib stops
 * quietly before input that starts with a zero byte, so anything left over is refused here as
 * `damaged`. Other errors (of the source, such as a file read) pass through unchanged.
 */
export async function* gunzipCapped(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
): AsyncGenerator<Uint8Array, void, undefined> {
  const feed: Feed = { head: [], bytes: 0, ended: false };
  const gunzip = createGunzip();
  const piping = pipeline(counted(source, feed), gunzip);
  piping.catch(() => {}); // surfaced by the loop below
  let produced = 0;
  try {
    for await (const chunk of gunzip as AsyncIterable<Uint8Array>) {
      produced += chunk.length;
      if (produced > maxBytes)
        throw new ArchiveError("too_large", `the archive is above ${maxBytes} bytes decompressed`);
      yield chunk;
    }
    // Checked before `piping`, which fails (premature close, abort) when gunzip ended early.
    if (!feed.ended || feed.bytes !== gunzip.bytesWritten)
      throw new ArchiveError("damaged", "the archive has data after its gzip stream");
    await piping;
  } catch (error) {
    throw mapZlibError(error, feed);
  } finally {
    gunzip.destroy();
  }
}
