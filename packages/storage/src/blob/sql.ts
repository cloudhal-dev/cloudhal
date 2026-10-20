import {
  assertBlobKey,
  BlobIntegrityError,
  type BlobMeta,
  type BlobPutOptions,
  type BlobRange,
  type BlobStore,
  type BlobStream,
  bytesStream,
  readAllBytes,
  resolveBlobRange,
  type SqlDriver,
  StorageError,
  StorageLimitError,
  sha256OfBytes,
  verifyBlob,
} from "../types.ts";

export interface SqlBlobStoreOptions {
  /** Cap on the sum of all object sizes; a put past it throws `StorageLimitError`. Default: none. */
  readonly maxBytes?: number;
  /** Cap on one object. Default 1 MiB, under DO SQLite's and D1's 2 MB value limit. */
  readonly maxObjectBytes?: number;
}

const DDL =
  "CREATE TABLE IF NOT EXISTS _blobs (key TEXT PRIMARY KEY, data BLOB NOT NULL, content_type TEXT, size INTEGER NOT NULL, sha256 TEXT NOT NULL)";

/**
 * A `BlobStore` kept in a table of the same SQL database (RFC-0036 §2): one database holds a
 * whole site, as in a playground session's Durable Object. Works over any `SqlDriver`. Every put
 * records the SHA-256 and checks a declared one; the total-size cap is checked in the same
 * statement that writes, so concurrent puts cannot overshoot it.
 */
export class SqlBlobStore implements BlobStore {
  readonly name = "sql";
  readonly #sql: SqlDriver;
  readonly #maxBytes: number;
  readonly #maxObjectBytes: number;
  #ready: Promise<void> | undefined;

  constructor(sql: SqlDriver, options: SqlBlobStoreOptions = {}) {
    this.#sql = sql;
    this.#maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
    this.#maxObjectBytes = options.maxObjectBytes ?? 1024 * 1024;
  }

  #table(): Promise<void> {
    this.#ready ??= this.#sql.exec(DDL).catch((e: unknown) => {
      this.#ready = undefined;
      throw e;
    });
    return this.#ready;
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertBlobKey(key);
    await this.#table();
    const row = await this.#sql.get<{ data: Uint8Array | ArrayBuffer }>(
      "SELECT data FROM _blobs WHERE key = ?",
      [key],
    );
    return row ? new Uint8Array(row.data) : null;
  }

  async head(key: string): Promise<BlobMeta | null> {
    assertBlobKey(key);
    await this.#table();
    const row = await this.#sql.get<{ size: number; content_type: string | null; sha256: string }>(
      "SELECT size, content_type, sha256 FROM _blobs WHERE key = ?",
      [key],
    );
    if (!row) return null;
    return {
      size: row.size,
      sha256: row.sha256,
      ...(row.content_type === null ? {} : { contentType: row.content_type }),
    };
  }

  async put(key: string, data: Uint8Array, options: BlobPutOptions = {}): Promise<void> {
    assertBlobKey(key);
    if (options.sha256 !== undefined) await verifyBlob(data, options.sha256);
    if (data.byteLength > this.#maxObjectBytes)
      throw new StorageLimitError(
        `blob is ${data.byteLength} bytes; the limit is ${this.#maxObjectBytes}`,
      );
    await this.#table();
    const sha256 = options.sha256 ?? (await sha256OfBytes(data));
    const res = await this.#sql.run(
      `INSERT INTO _blobs (key, data, content_type, size, sha256)
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT coalesce(sum(size), 0) FROM _blobs WHERE key <> ?) + ? <= ?
       ON CONFLICT (key) DO UPDATE SET data = excluded.data, content_type = excluded.content_type,
         size = excluded.size, sha256 = excluded.sha256`,
      [
        key,
        data,
        options.contentType ?? null,
        data.byteLength,
        sha256,
        key,
        data.byteLength,
        this.#maxBytes,
      ],
    );
    if (res.changes === 0)
      throw new StorageLimitError(`blob store is full (limit ${this.#maxBytes} bytes)`);
  }

  async putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    options: BlobPutOptions & { size: number; sha256: string },
  ): Promise<void> {
    assertBlobKey(key);
    if (options.size > this.#maxObjectBytes)
      throw new StorageLimitError(
        `blob is ${options.size} bytes; the limit is ${this.#maxObjectBytes}`,
      );
    const bytes = await readAllBytes(data, options.size);
    if (bytes.byteLength !== options.size)
      throw new BlobIntegrityError(`expected ${options.size} bytes, got ${bytes.byteLength}`);
    await this.put(key, bytes, options);
  }

  async getStream(key: string, options: { range?: BlobRange } = {}): Promise<BlobStream | null> {
    const data = await this.get(key);
    if (!data) return null;
    const meta = await this.head(key);
    const ct = meta?.contentType === undefined ? {} : { contentType: meta.contentType };
    const size = data.byteLength;
    if (!options.range) return { body: bytesStream(data), size, ...ct };
    const range = resolveBlobRange(options.range, size);
    if (!range) throw new StorageError("range not satisfiable");
    return {
      body: bytesStream(data.slice(range.offset, range.offset + range.length)),
      size,
      range,
      ...ct,
    };
  }

  async delete(key: string): Promise<void> {
    assertBlobKey(key);
    await this.#table();
    await this.#sql.run("DELETE FROM _blobs WHERE key = ?", [key]);
  }

  async list(prefix = ""): Promise<string[]> {
    await this.#table();
    const rows = await this.#sql.all<{ key: string }>(
      "SELECT key FROM _blobs WHERE substr(key, 1, ?) = ? ORDER BY key",
      [prefix.length, prefix],
    );
    return rows.map((r) => r.key);
  }

  /** Sum of all object sizes, for usage displays and caps. */
  async totalBytes(): Promise<number> {
    await this.#table();
    const row = await this.#sql.get<{ n: number }>(
      "SELECT coalesce(sum(size), 0) AS n FROM _blobs",
    );
    return row?.n ?? 0;
  }
}
