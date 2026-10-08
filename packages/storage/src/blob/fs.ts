import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  assertBlobKey,
  BlobIntegrityError,
  type BlobMeta,
  type BlobPutOptions,
  type BlobRange,
  type BlobStore,
  type BlobStream,
  resolveBlobRange,
  SHA256_HEX,
  StorageError,
  verifyBlob,
} from "../types.ts";

/** Uploads stream here first and are renamed into place once verified (same filesystem). */
const TMP_DIR = ".tmp";

/** Filesystem blob store: keys map to files under a root directory (self-host / local dev). */
export class FsBlobStore implements BlobStore {
  readonly name = "fs";
  readonly #root: string;

  constructor(rootDir: string) {
    this.#root = path.resolve(rootDir);
  }

  #pathFor(key: string): string {
    assertBlobKey(key);
    if (key === TMP_DIR || key.startsWith(`${TMP_DIR}/`))
      throw new StorageError(`invalid blob key "${key}"`);
    const file = path.resolve(this.#root, ...key.split("/"));
    // Containment: whatever the key, the file stays under the root (RFC-0004 §4.1).
    if (!file.startsWith(`${this.#root}${path.sep}`))
      throw new StorageError(`invalid blob key "${key}"`);
    return file;
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.#pathFor(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async head(key: string): Promise<BlobMeta | null> {
    try {
      const s = await stat(this.#pathFor(key));
      return s.isFile() ? { size: s.size } : null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async #tmpFile(): Promise<string> {
    const dir = path.join(this.#root, TMP_DIR);
    await mkdir(dir, { recursive: true });
    return path.join(dir, randomUUID());
  }

  /** Writes to a temporary file and renames it into place (atomic on one filesystem). */
  async #commit(file: string, tmp: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await rename(tmp, file);
  }

  async put(key: string, data: Uint8Array, options: BlobPutOptions = {}): Promise<void> {
    const file = this.#pathFor(key);
    if (options.sha256 !== undefined) await verifyBlob(data, options.sha256);
    const tmp = await this.#tmpFile();
    try {
      await writeFile(tmp, data);
      await this.#commit(file, tmp);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    options: BlobPutOptions & { size: number; sha256: string },
  ): Promise<void> {
    const file = this.#pathFor(key);
    if (!SHA256_HEX.test(options.sha256))
      throw new BlobIntegrityError("sha256 must be 64 lower-case hex");
    const tmp = await this.#tmpFile();
    const hash = createHash("sha256");
    const out = createWriteStream(tmp, { flags: "wx" });
    let total = 0;
    try {
      const reader = data.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > options.size) {
          await reader.cancel().catch(() => {});
          throw new BlobIntegrityError(`stream is longer than ${options.size} bytes`);
        }
        hash.update(value);
        if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
      }
      await new Promise<void>((resolve, reject) =>
        out.end((err?: Error | null) => (err ? reject(err) : resolve())),
      );
      if (total !== options.size)
        throw new BlobIntegrityError(`expected ${options.size} bytes, got ${total}`);
      if (hash.digest("hex") !== options.sha256)
        throw new BlobIntegrityError("data does not match the declared sha256");
      await this.#commit(file, tmp);
    } catch (e) {
      out.destroy();
      await rm(tmp, { force: true });
      throw e;
    }
  }

  async getStream(key: string, options: { range?: BlobRange } = {}): Promise<BlobStream | null> {
    const file = this.#pathFor(key);
    let size: number;
    try {
      const s = await stat(file);
      if (!s.isFile()) return null;
      size = s.size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    const range = options.range ? resolveBlobRange(options.range, size) : undefined;
    if (options.range && !range) throw new StorageError("range not satisfiable");
    const stream = createReadStream(
      file,
      range ? { start: range.offset, end: range.offset + range.length - 1 } : {},
    );
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return range ? { body, size, range } : { body, size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.#pathFor(key), { force: true });
  }

  async list(prefix = ""): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      for (const entry of entries) {
        if (!rel && entry.name === TMP_DIR) continue;
        const key = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), key);
        else if (entry.isFile() && key.startsWith(prefix)) out.push(key);
      }
    };
    await walk(this.#root, "");
    return out.sort();
  }
}
