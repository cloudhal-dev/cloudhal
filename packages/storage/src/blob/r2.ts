import type { BlobMeta, BlobPutOptions, BlobStore } from "../types.ts";

/** Cloudflare R2 adapter over an `R2Bucket` binding. */
export class R2BlobStore implements BlobStore {
  readonly name = "r2";
  readonly #bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.#bucket = bucket;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const obj = await this.#bucket.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  }

  async head(key: string): Promise<BlobMeta | null> {
    const obj = await this.#bucket.head(key);
    if (!obj) return null;
    const ct = obj.httpMetadata?.contentType;
    return ct === undefined ? { size: obj.size } : { size: obj.size, contentType: ct };
  }

  async put(key: string, data: Uint8Array, options: BlobPutOptions = {}): Promise<void> {
    await this.#bucket.put(
      key,
      data,
      options.contentType ? { httpMetadata: { contentType: options.contentType } } : {},
    );
  }

  async delete(key: string): Promise<void> {
    await this.#bucket.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.#bucket.list(cursor ? { prefix, cursor } : { prefix });
      for (const o of page.objects) keys.push(o.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return keys.sort();
  }
}
