import {
  assertBlobKey,
  BlobIntegrityError,
  type BlobMeta,
  type BlobPutOptions,
  type BlobRange,
  type BlobStore,
  type BlobStream,
  readAllBytes,
  resolveBlobRange,
  SHA256_HEX,
  StorageError,
} from "../types.ts";

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** R2 refuses a put whose checksum does not match; its error names the mismatch. */
function isChecksumError(e: unknown): boolean {
  return /checksum|digest|sha-?256|does not match|BadDigest/i.test(
    e instanceof Error ? e.message : String(e),
  );
}

/** Cloudflare R2 adapter over an `R2Bucket` binding. */
export class R2BlobStore implements BlobStore {
  readonly name = "r2";
  readonly #bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.#bucket = bucket;
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertBlobKey(key);
    const obj = await this.#bucket.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  }

  async head(key: string): Promise<BlobMeta | null> {
    assertBlobKey(key);
    const obj = await this.#bucket.head(key);
    if (!obj) return null;
    const ct = obj.httpMetadata?.contentType;
    const sha = obj.checksums?.sha256;
    return {
      size: obj.size,
      ...(ct === undefined ? {} : { contentType: ct }),
      ...(sha ? { sha256: hex(sha) } : {}),
    };
  }

  async put(key: string, data: Uint8Array, options: BlobPutOptions = {}): Promise<void> {
    assertBlobKey(key);
    if (options.sha256 !== undefined && !SHA256_HEX.test(options.sha256))
      throw new BlobIntegrityError("sha256 must be 64 lower-case hex");
    try {
      await this.#bucket.put(key, data, {
        ...(options.contentType ? { httpMetadata: { contentType: options.contentType } } : {}),
        // R2 verifies the checksum and stores nothing on a mismatch (RFC-0004 §4.1).
        ...(options.sha256 ? { sha256: options.sha256 } : {}),
      });
    } catch (e) {
      if (options.sha256 && isChecksumError(e))
        throw new BlobIntegrityError("data does not match the declared sha256");
      throw e;
    }
  }

  async putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    options: BlobPutOptions & { size: number; sha256: string },
  ): Promise<void> {
    assertBlobKey(key);
    if (!SHA256_HEX.test(options.sha256))
      throw new BlobIntegrityError("sha256 must be 64 lower-case hex");
    const Fixed = (
      globalThis as unknown as {
        FixedLengthStream?: new (n: number) => TransformStream<Uint8Array, Uint8Array>;
      }
    ).FixedLengthStream;
    if (!Fixed) {
      // Outside workerd (Miniflare's Node proxy): buffer, bounded by the declared size.
      const bytes = await readAllBytes(data, options.size);
      if (bytes.byteLength !== options.size)
        throw new BlobIntegrityError(`expected ${options.size} bytes, got ${bytes.byteLength}`);
      return this.put(key, bytes, options);
    }
    // FixedLengthStream errors on a short or long body, and R2 checks the SHA-256 before the
    // object becomes visible, so nothing is stored under a wrong name.
    const fixed = new Fixed(options.size);
    const piped = data.pipeTo(fixed.writable).catch((e: unknown) => e);
    try {
      await this.#bucket.put(key, fixed.readable as unknown as ReadableStream, {
        sha256: options.sha256,
        ...(options.contentType ? { httpMetadata: { contentType: options.contentType } } : {}),
      });
    } catch (e) {
      if (isChecksumError(e))
        throw new BlobIntegrityError("data does not match the declared sha256");
      throw new BlobIntegrityError(
        `upload failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
      );
    }
    const pipeError = await piped;
    if (pipeError) throw new BlobIntegrityError("stream did not carry the declared size");
  }

  async getStream(key: string, options: { range?: BlobRange } = {}): Promise<BlobStream | null> {
    assertBlobKey(key);
    let range: { offset: number; length: number } | undefined;
    if (options.range) {
      const head = await this.#bucket.head(key);
      if (!head) return null;
      range = resolveBlobRange(options.range, head.size);
      if (!range) throw new StorageError("range not satisfiable");
    }
    const obj = await this.#bucket.get(key, range ? { range } : {});
    if (!obj || !("body" in obj)) return null;
    const ct = obj.httpMetadata?.contentType;
    return {
      body: obj.body as unknown as ReadableStream<Uint8Array>,
      size: obj.size,
      ...(range ? { range } : {}),
      ...(ct === undefined ? {} : { contentType: ct }),
    };
  }

  async delete(key: string): Promise<void> {
    assertBlobKey(key);
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
