/**
 * `cloudhal import`'s reads of the file (RFC-0039 §2): its size (a missing file or a folder is
 * refused before anything is read), one pass over the whole archive, verified and reassembled into
 * a bundle with its manifest checked before the rest is read, and what the result says about the
 * archive's site, read from that bundle (untrusted until planned: printed cleaned).
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { addAbortSignal } from "node:stream";
import type { SiteBundle } from "@cloudhal/core-ts";
import { type ArchiveItem, readArchive, type SiteArchiveManifest } from "../archive/index.ts";
import type { ProjectConfig } from "../config.ts";
import { isRecord } from "./archive-bundle.ts";
import { type ArchiveMediaItem, bundleFromArchive } from "./archive-reassemble.ts";

export async function statOrUndefined(file: string) {
  return stat(file).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
    throw e;
  });
}

/** The archive's size; a missing file or a folder is refused before anything is read. */
export async function archiveSize(file: string): Promise<number> {
  const s = await statOrUndefined(file);
  if (!s) throw new Error("no such file");
  if (s.isDirectory()) throw new Error("it is a directory; name a .cloudhal file");
  return s.size;
}

/** The first item (the manifest) checked by `check` before the rest is read. */
async function* checkManifest(
  items: AsyncIterable<ArchiveItem>,
  check: (manifest: SiteArchiveManifest) => void,
): AsyncGenerator<ArchiveItem, void, undefined> {
  let first = true;
  for await (const item of items) {
    if (first && item.type === "manifest") check(item.manifest);
    first = false;
    yield item;
  }
}

export interface ReadPassOptions {
  readonly file: string;
  readonly signal?: AbortSignal | undefined;
  /** Throws to refuse the archive once its manifest is read. */
  readonly check: (manifest: SiteArchiveManifest) => void;
  readonly onMedia?: ((item: ArchiveMediaItem) => Promise<void>) | undefined;
}

/** One read of the whole file: verified, reassembled, its media handed to `onMedia`. */
export async function readPass(
  options: ReadPassOptions,
): Promise<{ manifest: SiteArchiveManifest; bundle: SiteBundle }> {
  const stream = createReadStream(options.file);
  if (options.signal) addAbortSignal(options.signal, stream);
  try {
    const { onMedia } = options;
    const read = await bundleFromArchive(
      checkManifest(readArchive(stream), options.check),
      onMedia ? { onMedia } : {},
    );
    return { manifest: read.manifest, bundle: read.bundle };
  } finally {
    stream.destroy();
  }
}

/** What the result says about the archive's site and media, read from pass 1's bundle. */
export function siteSummary(cfg: ProjectConfig, manifest: SiteArchiveManifest, bundle: SiteBundle) {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === manifest.siteId);
  let site: unknown;
  try {
    site = row ? JSON.parse(row.body) : undefined;
  } catch {
    site = undefined;
  }
  const field = (key: string) =>
    isRecord(site) && typeof site[key] === "string" ? (site[key] as string) : undefined;
  const media = bundle.media ?? [];
  return {
    site: {
      id: manifest.siteId,
      slug: field("slug"),
      locale: field("defaultLocale"),
      projectId: field("projectId"),
      published: field("publishedSnapshotId"),
      listed: (cfg.sites ?? [cfg.siteId]).includes(manifest.siteId),
    },
    mediaNeeded: { files: media.length, bytes: media.reduce((n, m) => n + m.bytes, 0) },
  };
}
