import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { type BlobMeta, type BlobPutOptions, type BlobStore, StorageError } from "../types.ts";

const KEY_RE = /^[A-Za-z0-9._\-/]+$/;

function assertKey(key: string): void {
  if (
    !KEY_RE.test(key) ||
    key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new StorageError(`invalid blob key "${key}"`);
  }
}

/** Filesystem blob store: keys map to files under a root directory (self-host / local dev). */
export class FsBlobStore implements BlobStore {
  readonly name = "fs";
  readonly #root: string;

  constructor(rootDir: string) {
    this.#root = path.resolve(rootDir);
  }

  #pathFor(key: string): string {
    assertKey(key);
    return path.join(this.#root, ...key.split("/"));
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

  async put(key: string, data: Uint8Array, _options: BlobPutOptions = {}): Promise<void> {
    const file = this.#pathFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
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
        const key = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), key);
        else if (entry.isFile() && key.startsWith(prefix)) out.push(key);
      }
    };
    await walk(this.#root, "");
    return out.sort();
  }
}
