import {
  assertBlobKey,
  type BlobMeta,
  type BlobPutOptions,
  type BlobRange,
  type BlobStore,
  type BlobStream,
  bytesStream,
  readAllBytes,
  resolveBlobRange,
  StorageError,
  verifyBlob,
} from "../types.ts";

/** In-memory blob store for tests and ephemeral runs. */
export class MemoryBlobStore implements BlobStore {
  readonly name = "memory";
  readonly #objects = new Map<string, { data: Uint8Array; contentType?: string }>();

  async get(key: string): Promise<Uint8Array | null> {
    assertBlobKey(key);
    const o = this.#objects.get(key);
    return o ? new Uint8Array(o.data) : null;
  }

  async head(key: string): Promise<BlobMeta | null> {
    assertBlobKey(key);
    const o = this.#objects.get(key);
    if (!o) return null;
    return o.contentType === undefined
      ? { size: o.data.byteLength }
      : { size: o.data.byteLength, contentType: o.contentType };
  }

  async put(key: string, data: Uint8Array, options: BlobPutOptions = {}): Promise<void> {
    assertBlobKey(key);
    if (options.sha256 !== undefined) await verifyBlob(data, options.sha256);
    const entry: { data: Uint8Array; contentType?: string } = { data: new Uint8Array(data) };
    if (options.contentType !== undefined) entry.contentType = options.contentType;
    this.#objects.set(key, entry);
  }

  async putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    options: BlobPutOptions & { size: number; sha256: string },
  ): Promise<void> {
    assertBlobKey(key);
    const bytes = await readAllBytes(data, options.size);
    await verifyBlob(bytes, options.sha256, options.size);
    await this.put(key, bytes, options);
  }

  async getStream(key: string, options: { range?: BlobRange } = {}): Promise<BlobStream | null> {
    assertBlobKey(key);
    const o = this.#objects.get(key);
    if (!o) return null;
    const size = o.data.byteLength;
    const ct = o.contentType === undefined ? {} : { contentType: o.contentType };
    if (!options.range) return { body: bytesStream(new Uint8Array(o.data)), size, ...ct };
    const range = resolveBlobRange(options.range, size);
    if (!range) throw new StorageError("range not satisfiable");
    return {
      body: bytesStream(o.data.slice(range.offset, range.offset + range.length)),
      size,
      range,
      ...ct,
    };
  }

  async delete(key: string): Promise<void> {
    assertBlobKey(key);
    this.#objects.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    return [...this.#objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}
