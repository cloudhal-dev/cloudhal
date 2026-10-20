import {
  assertBlobKey,
  type BlobMeta,
  type BlobStore,
  StorageError,
  sha256OfBytes,
} from "../types.ts";

/** The part of a Worker `Fetcher` binding (e.g. `ASSETS`) this store uses. */
export interface BlobFetcher {
  fetch(input: string): Promise<Response>;
}

export interface FetcherBlobStoreOptions {
  /** Keys `list` reports (static assets cannot be listed). Default: none. */
  readonly keys?: readonly string[];
}

/**
 * A read-only `BlobStore` over static files (RFC-0036 §2): `key` is fetched as
 * `/<prefix><key>` from the Worker's `ASSETS` binding. Writes throw `StorageError`. Used as the
 * base layer of a `LayeredBlobStore` for demo media.
 */
export class FetcherBlobStore implements BlobStore {
  readonly name = "fetcher";
  readonly #fetcher: BlobFetcher;
  readonly #prefix: string;
  readonly #keys: readonly string[];

  constructor(fetcher: BlobFetcher, prefix: string, options: FetcherBlobStoreOptions = {}) {
    this.#fetcher = fetcher;
    this.#prefix = prefix.replace(/^\/+/, "");
    this.#keys = [...(options.keys ?? [])].sort();
  }

  async #fetch(key: string): Promise<Response | null> {
    assertBlobKey(key);
    const res = await this.#fetcher.fetch(`https://assets.local/${this.#prefix}${key}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new StorageError(`fetching ${key} failed with ${res.status}`);
    return res;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.#fetch(key);
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
  }

  async head(key: string): Promise<BlobMeta | null> {
    // A full read: the size and SHA-256 must be exact, and demo media are small.
    const res = await this.#fetch(key);
    if (!res) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type");
    return {
      size: data.byteLength,
      sha256: await sha256OfBytes(data),
      ...(ct ? { contentType: ct } : {}),
    };
  }

  async put(key: string): Promise<void> {
    throw new StorageError(`blob store "${this.name}" is read-only (put ${key})`);
  }

  async delete(key: string): Promise<void> {
    throw new StorageError(`blob store "${this.name}" is read-only (delete ${key})`);
  }

  async list(prefix = ""): Promise<string[]> {
    return this.#keys.filter((k) => k.startsWith(prefix));
  }
}
