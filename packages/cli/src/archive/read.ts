/**
 * The verifying site archive reader (RFC-0039 §1, invariant 3). It checks as it streams and hands
 * the caller each item only as far as it can be trusted:
 *
 * 1. The manifest first, after only `manifest.json` has been read (a dry run can stop there).
 * 2. `project.json`, the NDJSON parts and `ledger.ndjson` buffered (they are capped) and yielded
 *    only after their size, SHA-256 and rows were checked against the manifest.
 * 3. Media with a streaming body, hashed as it is read: the body is unverified until its last
 *    `next()` resolves, which throws `damaged` on a mismatch. A body the caller does not read is
 *    read and verified by the reader before the next item; a body read after the next item was
 *    requested, or still being read then, throws `invalid_input` instead of ending early.
 *
 * The archive as a whole is verified only when the generator returns: every listed file present,
 * the row counts equal, the end of the archive well formed and gzip's CRC checked. A caller
 * applies nothing (no `importSite`) before that; media it streamed somewhere content-addressed
 * stay unreferenced if the archive then fails.
 */
import { createHash } from "node:crypto";
import { ArchiveError, printable } from "./errors.ts";
import { gunzipCapped } from "./gzip.ts";
import { classifyPath, type FileSlot, MANIFEST_PATH, PART_KINDS, type PartKind } from "./layout.ts";
import { type ArchiveLimits, archiveLimits } from "./limits.ts";
import { type ArchiveFile, parseManifest, type SiteArchiveManifest } from "./manifest.ts";
import { countRows } from "./parts.ts";
import { readTar, type TarEntry } from "./tar-read.ts";

export type ArchiveItem =
  | { type: "manifest"; manifest: SiteArchiveManifest }
  | { type: "file"; path: string; slot: FileSlot; bytes: Uint8Array }
  | {
      type: "media";
      path: string;
      sha256: string;
      size: number;
      /**
       * Readable once, and only before the next item is requested (await the sink first): a read
       * after that, or one still running then, throws `invalid_input`. Unverified until its last
       * `next()` resolves, which throws `damaged` on a mismatch.
       */
      body: AsyncIterable<Uint8Array>;
    };

export interface ReadArchiveOptions {
  /** Lower caps for untrusted input (the defaults are ARCHIVE_LIMITS). */
  limits?: Partial<ArchiveLimits>;
}

type Entries = AsyncGenerator<TarEntry, void, undefined>;

async function readBody(entry: TarEntry): Promise<Uint8Array> {
  const bytes = new Uint8Array(entry.size);
  let filled = 0;
  for await (const chunk of entry.body) {
    bytes.set(chunk, filled);
    filled += chunk.length;
  }
  return bytes;
}

async function readManifest(entries: Entries, limits: ArchiveLimits): Promise<SiteArchiveManifest> {
  const first = await entries.next();
  if (first.done || first.value.path !== MANIFEST_PATH)
    throw new ArchiveError(
      "not_archive",
      "not a Cloudhal site archive (manifest.json is not its first entry)",
    );
  if (first.value.size > limits.manifestBytes)
    throw new ArchiveError("too_large", `manifest.json is above ${limits.manifestBytes} bytes`, {
      path: MANIFEST_PATH,
    });
  return parseManifest(await readBody(first.value), limits);
}

/** The entry must be the next listed file, with its listed size: checked before its body. */
function expectEntry(entry: TarEntry, files: readonly ArchiveFile[], index: number) {
  const slot = classifyPath(entry.path);
  if (slot === undefined)
    throw new ArchiveError(
      "unsafe_entry",
      `the archive holds ${printable(entry.path)}, which is not a path a site archive holds`,
    );
  if (slot.kind === "manifest")
    throw new ArchiveError("mismatch", "manifest.json: appears twice", { path: MANIFEST_PATH });
  const listed = files[index];
  if (listed?.path !== entry.path) {
    const known = files.some((f) => f.path === entry.path);
    throw new ArchiveError(
      "mismatch",
      `${entry.path}: ${known ? "appears twice or out of order" : "is not listed in manifest.json"}`,
      { path: entry.path },
    );
  }
  if (entry.size !== listed.bytes)
    throw new ArchiveError(
      "mismatch",
      `${entry.path}: ${entry.size} bytes in the archive, ${listed.bytes} in manifest.json`,
      { path: entry.path },
    );
  return { slot, listed };
}

function damaged(path: string): ArchiveError {
  return new ArchiveError(
    "damaged",
    `${path}: its SHA-256 does not match manifest.json (the file is damaged or was edited)`,
    { path },
  );
}

/**
 * A media body hashed as it is read; its last `next()` throws on a mismatch. Like a tar entry's
 * body it is stale once the next item is requested: `drain` marks it so, refuses to run beside a
 * read in flight, and reads and verifies the rest itself. Its first error is thrown again by every
 * later read, so a caller that retries never sees a clean end of a partial body.
 */
class MediaBody implements AsyncIterable<Uint8Array> {
  readonly #inner: AsyncIterator<Uint8Array>;
  readonly #listed: ArchiveFile;
  readonly #hash = createHash("sha256");
  #claimed = false;
  /** The caller's reads in flight. */
  #reading = 0;
  #stale = false;
  #finished = false;
  #failure: { error: unknown } | undefined;

  constructor(entry: TarEntry, listed: ArchiveFile) {
    this.#inner = entry.body[Symbol.asyncIterator]();
    this.#listed = listed;
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    if (this.#claimed) throw this.#misuse("can be read once");
    this.#claimed = true;
    return {
      next: async () => {
        if (this.#stale) throw this.#misuse("was read after the next item was requested");
        this.#reading++;
        try {
          const value = await this.#pull();
          return value === undefined ? { done: true, value: undefined } : { done: false, value };
        } finally {
          this.#reading--;
        }
      },
      // Stopping early leaves the rest to `drain`, which still verifies it.
      return: async () => ({ done: true, value: undefined }),
    };
  }

  async #pull(): Promise<Uint8Array | undefined> {
    if (this.#failure) throw this.#failure.error;
    if (this.#finished) return undefined;
    let next: IteratorResult<Uint8Array>;
    try {
      next = await this.#inner.next();
    } catch (error) {
      this.#failure = { error };
      throw error;
    }
    if (!next.done) {
      this.#hash.update(next.value);
      return next.value;
    }
    this.#finished = true;
    if (this.#hash.digest("hex") === this.#listed.sha256) return undefined;
    this.#failure = { error: damaged(this.#listed.path) };
    throw this.#failure.error;
  }

  /** Reads and verifies what the caller left; the body is stale from here on. */
  async drain(): Promise<void> {
    this.#stale = true;
    if (this.#reading > 0)
      throw this.#misuse("is still being read (await it before the next item)");
    for (;;) if ((await this.#pull()) === undefined) return;
  }

  #misuse(what: string): ArchiveError {
    const path = this.#listed.path;
    return new ArchiveError("invalid_input", `${path}: a media body ${what}`, { path });
  }
}

/** A buffered file, checked against the manifest; its rows when it is a part. */
async function readFile(
  entry: TarEntry,
  listed: ArchiveFile,
  slot: FileSlot,
): Promise<{ bytes: Uint8Array; rows: number }> {
  const bytes = await readBody(entry);
  if (createHash("sha256").update(bytes).digest("hex") !== listed.sha256) throw damaged(entry.path);
  const ndjson = slot.kind === "part" || slot.kind === "ledger";
  return { bytes, rows: ndjson ? countRows(bytes, entry.path) : 0 };
}

function checkComplete(
  manifest: SiteArchiveManifest,
  index: number,
  rows: Record<PartKind, number>,
): void {
  const missing = manifest.files[index];
  if (missing)
    throw new ArchiveError(
      "mismatch",
      `${missing.path}: listed in manifest.json but not in the archive`,
      {
        path: missing.path,
      },
    );
  for (const kind of PART_KINDS)
    if (rows[kind] !== manifest.counts[kind])
      throw new ArchiveError(
        "mismatch",
        `${kind}: the parts hold ${rows[kind]} rows, manifest.json counts ${manifest.counts[kind]}`,
      );
}

async function* readEntries(
  entries: Entries,
  manifest: SiteArchiveManifest,
): AsyncGenerator<ArchiveItem, void, undefined> {
  const rows: Record<PartKind, number> = { nodes: 0, snapshots: 0, blobs: 0 };
  let index = 0;
  for await (const entry of entries) {
    const { slot, listed } = expectEntry(entry, manifest.files, index++);
    if (slot.kind === "media") {
      const body = new MediaBody(entry, listed);
      yield { type: "media", path: entry.path, sha256: slot.sha256, size: entry.size, body };
      await body.drain();
      continue;
    }
    const file = await readFile(entry, listed, slot);
    if (slot.kind === "part") rows[slot.part] += file.rows;
    yield { type: "file", path: entry.path, slot, bytes: file.bytes };
  }
  checkComplete(manifest, index, rows);
}

/**
 * The verified items of a `.cloudhal` stream (gzip bytes, for example a file's read stream):
 * the manifest, then every file in archive order. Stopping early (break) closes the source.
 */
export async function* readArchive(
  source: AsyncIterable<Uint8Array>,
  options: ReadArchiveOptions = {},
): AsyncGenerator<ArchiveItem, void, undefined> {
  const limits = archiveLimits(options.limits);
  const entries = readTar(gunzipCapped(source, limits.totalBytes), { maxEntries: limits.entries });
  try {
    const manifest = await readManifest(entries, limits);
    yield { type: "manifest", manifest };
    yield* readEntries(entries, manifest);
  } finally {
    await entries.return(undefined);
  }
}
