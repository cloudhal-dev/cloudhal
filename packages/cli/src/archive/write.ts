/**
 * The site archive writer (RFC-0039 §1): `manifest.json` first, then the files in the one order of
 * the layout, as a POSIX ustar stream compressed by `gzipFixed`. Media are streamed and verified
 * against their SHA-256 and size on the way; a mismatch ends the stream before the gzip trailer, so
 * a partial output never reads as an archive, and `writeArchiveFile` removes it.
 *
 * Determinism (invariant 7): nothing here reads the clock or the machine. `createdAt` and
 * `createdBy` come from the caller (`cloudhal export` passes the newest row timestamp of the site
 * and its own version); rows come in the caller's order, media are sorted by hash, and tar headers
 * carry fixed modes and zero times. The same content written by the same Node/zlib build gives
 * identical bytes; the tar stream inside the gzip, and so every SHA-256 in the manifest, is
 * identical on every platform.
 */
import { createHash, randomUUID } from "node:crypto";
import { type FileHandle, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ArchiveError } from "./errors.ts";
import { gzipFixed } from "./gzip.ts";
import { MANIFEST_PATH } from "./layout.ts";
import { type ArchiveLimits, archiveLimits } from "./limits.ts";
import type { SiteArchiveManifest } from "./manifest.ts";
import {
  type ArchiveContent,
  type ArchiveMediaSource,
  type ArchivePlan,
  planArchive,
} from "./plan.ts";
import { TAR_BLOCK, tarEnd, tarHeader, tarPadding } from "./tar.ts";

export interface WriteArchiveOptions {
  /** Lower caps (tests); the writer refuses what a reader with the same caps would refuse. */
  limits?: Partial<ArchiveLimits>;
}

export interface WriteArchiveFileOptions extends WriteArchiveOptions {
  /**
   * Stops the write (`cloudhal export` aborts it on Ctrl-C and SIGTERM): the temporary file is
   * removed, an existing `file` stays as it was, and the promise rejects.
   */
  signal?: AbortSignal | undefined;
}

/** A media body as it is written: no more than `bytes`, then the SHA-256. */
async function* verifiedMedia(
  file: string,
  media: ArchiveMediaSource,
): AsyncGenerator<Uint8Array, void, undefined> {
  const hash = createHash("sha256");
  let seen = 0;
  for await (const chunk of await media.open()) {
    seen += chunk.length;
    if (seen > media.bytes)
      throw new ArchiveError(
        "damaged",
        `${file}: the media source is longer than ${media.bytes} bytes`,
        {
          path: file,
        },
      );
    hash.update(chunk);
    yield chunk;
  }
  if (seen < media.bytes)
    throw new ArchiveError(
      "damaged",
      `${file}: the media source has ${seen} of ${media.bytes} bytes`,
      {
        path: file,
      },
    );
  if (hash.digest("hex") !== media.sha256)
    throw new ArchiveError("damaged", `${file}: the media source does not match its SHA-256`, {
      path: file,
    });
}

/** The tar stream of a plan. */
async function* tarChunks(plan: ArchivePlan): AsyncGenerator<Uint8Array, void, undefined> {
  let written = 0;
  for (const file of [{ path: MANIFEST_PATH, data: plan.manifestBytes }, ...plan.files]) {
    const size = "data" in file ? file.data.length : file.media.bytes;
    yield tarHeader(file.path, size);
    if ("data" in file) yield file.data;
    else yield* verifiedMedia(file.path, file.media);
    const padding = tarPadding(size);
    if (padding.length > 0) yield padding;
    written += TAR_BLOCK + size + padding.length;
  }
  yield tarEnd(written);
}

/**
 * The archive of `content` as a byte stream, with its manifest. The content is checked before
 * this returns (it throws, and nothing is streamed); a media mismatch fails the stream.
 */
export function archiveStream(
  content: ArchiveContent,
  options: WriteArchiveOptions = {},
): { manifest: SiteArchiveManifest; bytes: AsyncGenerator<Uint8Array, void, undefined> } {
  const plan = planArchive(content, archiveLimits(options.limits));
  return { manifest: plan.manifest, bytes: gzipFixed(tarChunks(plan)) };
}

/**
 * Writes the archive of `content` to `file`: to a temporary file next to it first, synced and then
 * renamed over `file`, so a failure or an abort leaves no file behind and an existing `file`
 * unchanged. Only a killed process (SIGKILL, power loss) can leave the `.<name>.partial-…` file.
 */
export async function writeArchiveFile(
  file: string,
  content: ArchiveContent,
  options: WriteArchiveFileOptions = {},
): Promise<SiteArchiveManifest> {
  const { signal } = options;
  signal?.throwIfAborted();
  const { manifest, bytes } = archiveStream(content, options);
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.partial-${process.pid}-${randomUUID().slice(0, 8)}`,
  );
  let handle: FileHandle | undefined;
  try {
    handle = await open(temp, "wx");
    // The stream owns the handle: it fsyncs (flush) and closes it, on errors too.
    await pipeline(bytes, handle.createWriteStream({ flush: true }), signal ? { signal } : {});
    await rename(temp, file);
    return manifest;
  } catch (e) {
    await bytes.return();
    if (handle !== undefined) {
      await handle.close().catch(() => {});
      await rm(temp, { force: true });
    }
    throw e;
  }
}
