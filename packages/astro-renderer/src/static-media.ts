/**
 * Static builds (`cloudhal build`, RFC-0004 §7.8): every blob asset of the built snapshot is copied
 * to `dist/media/<prefix>/<slug>.<ext>` with its `.sha256` sidecar, and `dist/_headers` gets a
 * `/media/*` block (immutable cache, `nosniff`) for hosts that read it. External assets link
 * directly; taken-down content is not copied; transformations are off. Node-only (loaded lazily by
 * the integration's `astro:build:done`).
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaBlobKey } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { mediaExtension, mediaPath } from "@cloudhal/core-ts/media";
import type { CloudhalRendererConfig } from "./integration.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

export const HEADERS_FILE = "_headers";

const HEADERS_BLOCK = `/media/*
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
`;

/** Copies the build's media into `outDir`; returns how many files were written. */
export async function writeStaticMedia(
  config: CloudhalRendererConfig,
  outDir: URL,
): Promise<number> {
  const selector = process.env.CLOUDHAL_SOURCE ?? config.source ?? "live";
  const local = await openLocalStore(config.dataDir);
  const root = fileURLToPath(String(outDir));
  try {
    const source: GraphSource = selector.startsWith("snapshot:")
      ? await SnapshotSource.open(local.store, selector.slice("snapshot:".length))
      : new LiveSource(local.store, config.siteId);
    const assets = source.assets ? await source.assets() : [];
    let written = 0;
    for (const asset of assets) {
      if (asset.storage.kind !== "blob") continue;
      if ((await local.store.blobState(config.siteId, asset.sha256))?.state === "purged") continue;
      const bytes = await local.blobs.get(mediaBlobKey(config.siteId, asset.sha256));
      if (!bytes) continue;
      const file = path.join(root, ...mediaPath(asset).split("/").filter(Boolean));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      await writeFile(
        `${file}.sha256`,
        `${asset.sha256}  ${asset.slug}.${mediaExtension(asset.mediaType)}\n`,
      );
      written++;
    }
    if (written > 0) {
      const headers = path.join(root, HEADERS_FILE);
      const existing = await readFile(headers, "utf8").catch(() => "");
      if (!existing.includes("/media/*"))
        await appendFile(
          headers,
          `${existing && !existing.endsWith("\n") ? "\n" : ""}${HEADERS_BLOCK}`,
        );
    }
    return written;
  } finally {
    await local.close();
  }
}
