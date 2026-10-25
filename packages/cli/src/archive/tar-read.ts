/**
 * Streaming ustar reader: yields the regular-file entries of a decompressed tar stream, each with
 * a lazy body, and checks the end of the archive (two zero blocks, then at most one record of zero
 * padding, then nothing). It reads its source to the end before it returns, so gunzip's CRC and
 * length check has run when the last entry is done.
 */

import { ByteSource } from "./byte-source.ts";
import { ArchiveError } from "./errors.ts";
import { parseTarHeader, TAR_BLOCK, TAR_RECORD, tarPadding } from "./tar.ts";

export interface TarEntry {
  readonly path: string;
  readonly size: number;
  /**
   * Exactly `size` bytes, readable once and only until the next entry is requested: the reader
   * skips what is left of it then, and a later read throws.
   */
  readonly body: AsyncIterable<Uint8Array>;
}

class EntryBody implements AsyncIterable<Uint8Array> {
  readonly #source: ByteSource;
  readonly #path: string;
  #remaining: number;
  #claimed = false;
  #reading = false;
  #stale = false;

  constructor(source: ByteSource, entry: { path: string; size: number }) {
    this.#source = source;
    this.#path = entry.path;
    this.#remaining = entry.size;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array, void, undefined> {
    if (this.#claimed) throw this.#misuse("can be read once");
    this.#claimed = true;
    for (;;) {
      if (this.#stale) throw this.#misuse("was read after the next entry was requested");
      if (this.#remaining === 0) return;
      this.#reading = true;
      let chunk: Uint8Array;
      try {
        chunk = await this.#source.readSome(this.#remaining);
      } finally {
        this.#reading = false;
      }
      this.#remaining -= chunk.length;
      yield chunk;
    }
  }

  /** Skips what the caller did not read; the body is stale from here on. */
  async finish(): Promise<void> {
    if (this.#reading) throw this.#misuse("is still being read");
    this.#stale = true;
    await this.#source.skip(this.#remaining);
    this.#remaining = 0;
  }

  #misuse(what: string): ArchiveError {
    return new ArchiveError("invalid_input", `the body of a tar entry ${what}`, {
      path: this.#path,
    });
  }
}

function isZero(bytes: Uint8Array): boolean {
  for (const b of bytes) if (b !== 0) return false;
  return true;
}

/** After the first zero block: the second one, then at most one record of zeros, then the end. */
async function readEnd(source: ByteSource): Promise<void> {
  const second = await source.read(TAR_BLOCK);
  if (second === undefined)
    throw new ArchiveError("truncated", "the archive ends inside its end-of-archive marker");
  if (!isZero(second))
    throw new ArchiveError("damaged", "the archive has a zero block between its entries");
  let tail = 0;
  while (!(await source.atEnd())) {
    const chunk = await source.readSome(TAR_RECORD - tail + 1);
    tail += chunk.length;
    if (!isZero(chunk) || tail > TAR_RECORD)
      throw new ArchiveError("damaged", "the archive has data after its end");
  }
}

/** The regular files of a tar stream, in order. */
export async function* readTar(
  input: AsyncIterable<Uint8Array>,
  options: { maxEntries: number },
): AsyncGenerator<TarEntry, void, undefined> {
  const source = new ByteSource(input);
  try {
    for (let count = 0; ; count++) {
      const block = await source.read(TAR_BLOCK);
      if (block === undefined && source.position === 0)
        throw new ArchiveError("not_archive", "not a Cloudhal site archive (it is empty)");
      if (block === undefined)
        throw new ArchiveError("truncated", "the archive ends without its end-of-archive marker");
      const header = parseTarHeader(block);
      if (header === "zero") {
        await readEnd(source);
        return;
      }
      if (count >= options.maxEntries)
        throw new ArchiveError(
          "too_large",
          `the archive has more than ${options.maxEntries} entries`,
        );
      const body = new EntryBody(source, header);
      yield { path: header.path, size: header.size, body };
      await body.finish();
      await source.skip(tarPadding(header.size).length);
    }
  } finally {
    await source.close();
  }
}
