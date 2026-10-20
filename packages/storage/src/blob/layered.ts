import {
  assertBlobKey,
  type BlobMeta,
  type BlobPutOptions,
  type BlobRange,
  type BlobStore,
  type BlobStream,
  bytesStream,
  resolveBlobRange,
  StorageError,
} from "../types.ts";

/**
 * Reads `upper` first, then `base`; every write goes to `upper`; `list` merges both (RFC-0036 §2).
 * The playground puts read-only demo media (`base`) under a writable per-session store (`upper`).
 * `base` is never written: deleting a key only removes `upper`'s copy, so a base object stays
 * readable after a delete.
 */
export class LayeredBlobStore implements BlobStore {
  readonly name: string;
  readonly #base: BlobStore;
  readonly #upper: BlobStore;

  constructor(base: BlobStore, upper: BlobStore) {
    this.#base = base;
    this.#upper = upper;
    this.name = `layered(${upper.name}/${base.name})`;
  }

  async get(key: string): Promise<Uint8Array | null> {
    return (await this.#upper.get(key)) ?? this.#base.get(key);
  }

  async head(key: string): Promise<BlobMeta | null> {
    return (await this.#upper.head(key)) ?? this.#base.head(key);
  }

  put(key: string, data: Uint8Array, options?: BlobPutOptions): Promise<void> {
    return this.#upper.put(key, data, options);
  }

  async putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    options: BlobPutOptions & { size: number; sha256: string },
  ): Promise<void> {
    if (this.#upper.putStream) return this.#upper.putStream(key, data, options);
    const bytes = new Uint8Array(await new Response(data).arrayBuffer());
    return this.#upper.put(key, bytes, options);
  }

  async getStream(key: string, options: { range?: BlobRange } = {}): Promise<BlobStream | null> {
    assertBlobKey(key);
    for (const store of [this.#upper, this.#base]) {
      if (store.getStream) {
        const s = await store.getStream(key, options);
        if (s) return s;
        continue;
      }
      const data = await store.get(key);
      if (data) return streamOf(data, options.range);
    }
    return null;
  }

  delete(key: string): Promise<void> {
    return this.#upper.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    const [a, b] = await Promise.all([this.#upper.list(prefix), this.#base.list(prefix)]);
    return [...new Set([...a, ...b])].sort();
  }
}

function streamOf(data: Uint8Array, range: BlobRange | undefined): BlobStream {
  if (!range) return { body: bytesStream(data), size: data.byteLength };
  const r = resolveBlobRange(range, data.byteLength);
  if (!r) throw new StorageError("range not satisfiable");
  return {
    body: bytesStream(data.slice(r.offset, r.offset + r.length)),
    size: data.byteLength,
    range: r,
  };
}
