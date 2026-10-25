/**
 * Exact byte counts from an async iterable of chunks of any size: gunzip emits 16 KiB chunks that
 * do not line up with tar's 512-byte blocks. Internal to the archive reader.
 */
import { ArchiveError } from "./errors.ts";

const EMPTY = new Uint8Array(0);

function truncated(): ArchiveError {
  return new ArchiveError("truncated", "the archive ends in the middle of an entry (truncated)");
}

export class ByteSource {
  readonly #iterator: AsyncIterator<Uint8Array>;
  #chunk: Uint8Array = EMPTY;
  #offset = 0;
  #position = 0;
  #done = false;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.#iterator = source[Symbol.asyncIterator]();
  }

  /** Bytes consumed so far. */
  get position(): number {
    return this.#position;
  }

  /** Makes sure an unread byte is buffered; false at the end of the source. */
  async #fill(): Promise<boolean> {
    while (this.#offset >= this.#chunk.length) {
      if (this.#done) return false;
      const next = await this.#iterator.next();
      if (next.done) {
        this.#done = true;
        return false;
      }
      this.#chunk = next.value;
      this.#offset = 0;
    }
    return true;
  }

  #take(max: number): Uint8Array {
    const n = Math.min(max, this.#chunk.length - this.#offset);
    const view = this.#chunk.subarray(this.#offset, this.#offset + n);
    this.#offset += n;
    this.#position += n;
    return view;
  }

  /**
   * Exactly `n` bytes in a fresh array; undefined when the source ended before the first of them,
   * `truncated` when it ends part-way.
   */
  async read(n: number): Promise<Uint8Array | undefined> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      if (!(await this.#fill())) {
        if (filled === 0) return undefined;
        throw truncated();
      }
      const view = this.#take(n - filled);
      out.set(view, filled);
      filled += view.length;
    }
    return out;
  }

  /**
   * Between 1 and `max` bytes, as a view of the source's chunk (Node streams never reuse a chunk
   * they emitted); `truncated` at the end of the source.
   */
  async readSome(max: number): Promise<Uint8Array> {
    if (!(await this.#fill())) throw truncated();
    return this.#take(max);
  }

  /** Discards exactly `n` bytes; `truncated` when the source has fewer. */
  async skip(n: number): Promise<void> {
    let left = n;
    while (left > 0) left -= (await this.readSome(left)).length;
  }

  /** True when every byte has been consumed and the source has ended. */
  async atEnd(): Promise<boolean> {
    return !(await this.#fill());
  }

  /** Stops the source (runs its `finally`); safe to call more than once. */
  async close(): Promise<void> {
    if (this.#done) return;
    this.#done = true;
    await this.#iterator.return?.();
  }
}
