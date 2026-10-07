import type { BlobMeta, BlobPutOptions, BlobStore } from "../types.ts";

/** In-memory blob store for tests and ephemeral runs. */
export class MemoryBlobStore implements BlobStore {
  readonly name = "memory";
  readonly #objects = new Map<string, { data: Uint8Array; contentType?: string }>();

  async get(key: string): Promise<Uint8Array | null> {
    const o = this.#objects.get(key);
    return o ? new Uint8Array(o.data) : null;
  }

  async head(key: string): Promise<BlobMeta | null> {
    const o = this.#objects.get(key);
    if (!o) return null;
    return o.contentType === undefined
      ? { size: o.data.byteLength }
      : { size: o.data.byteLength, contentType: o.contentType };
  }

  async put(key: string, data: Uint8Array, options: BlobPutOptions = {}): Promise<void> {
    const entry: { data: Uint8Array; contentType?: string } = { data: new Uint8Array(data) };
    if (options.contentType !== undefined) entry.contentType = options.contentType;
    this.#objects.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.#objects.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    return [...this.#objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}
