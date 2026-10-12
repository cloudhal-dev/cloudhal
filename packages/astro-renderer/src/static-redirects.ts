/**
 * Static builds (Node, `cloudhal build`): Astro cannot answer a prerendered path with a 301, so a
 * redirect becomes a meta-refresh page (with `rel=canonical` and `noindex`) for every path
 * `staticPaths` lists. This writes the same redirects as `dist/_redirects` as well, so hosts that
 * read the file (Cloudflare Workers/Pages static assets, Netlify) send real 301s — including for
 * prefix matches and feeds, which a meta-refresh page cannot cover. Node-only (loaded lazily by
 * the integration's `astro:build:done`); the Cloudflare Site Worker answers redirects itself.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { redirectsFile } from "./feeds.ts";
import type { CloudhalRendererConfig } from "./integration.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

export const REDIRECTS_FILE = "_redirects";

/** Writes `<outDir>/_redirects` for the build's source; returns how many redirects it holds. */
export async function writeStaticRedirects(
  config: CloudhalRendererConfig,
  outDir: URL,
): Promise<number> {
  const selector = process.env.CLOUDHAL_SOURCE ?? config.source ?? "live";
  const local = await openLocalStore(config.dataDir);
  try {
    const source: GraphSource = selector.startsWith("snapshot:")
      ? await SnapshotSource.open(local.store, selector.slice("snapshot:".length))
      : new LiveSource(local.store, config.siteId);
    const redirects = await source.redirects();
    if (redirects.length > 0)
      await writeFile(
        path.join(fileURLToPath(String(outDir)), REDIRECTS_FILE),
        redirectsFile(redirects),
      );
    return redirects.length;
  } finally {
    await local.close();
  }
}
