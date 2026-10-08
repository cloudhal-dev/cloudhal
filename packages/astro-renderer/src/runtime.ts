import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import type { CloudhalRendererConfig } from "./integration.ts";
import { matchMediaRoute, serveMediaRequest } from "./media-route.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

let cached: { key: string; source: Promise<GraphSource> } | undefined;

/**
 * The page-side entry point: returns the configured `GraphSource`, created once per process and
 * selector. `CLOUDHAL_SOURCE=live | snapshot:<id>` overrides the integration config (used by
 * `cloudhal build`); a later build in the same process with another selector gets a new source.
 */
export function getSource(
  config: CloudhalRendererConfig,
  /** Ignored on Node (one source per process); the `workerd` build resolves per request. */
  _astro?: { request: Request; response: { headers: Headers } },
): Promise<GraphSource> {
  const selector = process.env.CLOUDHAL_SOURCE ?? config.source ?? "live";
  const key = `${config.dataDir}\n${config.siteId}\n${selector}`;
  if (cached?.key !== key) cached = { key, source: open(config, selector) };
  return cached.source;
}

let local: { dir: string; store: Promise<LocalStore> } | undefined;

/** One local store per data directory and process. */
function localStore(dataDir: string): Promise<LocalStore> {
  if (local?.dir !== dataDir) local = { dir: dataDir, store: openLocalStore(dataDir) };
  return local.store;
}

function open(config: CloudhalRendererConfig, selector: string): Promise<GraphSource> {
  return (async () => {
    const { store } = await localStore(config.dataDir);
    if (selector === "live") return new LiveSource(store, config.siteId);
    if (selector.startsWith("snapshot:"))
      return SnapshotSource.open(store, selector.slice("snapshot:".length));
    throw new Error(`invalid CLOUDHAL_SOURCE "${selector}" (expected "live" or "snapshot:<id>")`);
  })();
}

/** Test hook. */
export function resetSource(): void {
  cached = undefined;
}

/**
 * The media route for `cloudhal dev` (RFC-0004 §7.8): served from the local blob store with
 * `no-store`, drafts included, matching the live preview. `undefined` for other paths.
 */
export async function serveMedia(
  request: Request,
  options: Partial<CloudhalRendererConfig>,
): Promise<Response | undefined> {
  if (!matchMediaRoute(new URL(request.url).pathname)) return undefined;
  if (!options.dataDir || !options.siteId) return undefined;
  const config: CloudhalRendererConfig = {
    ...options,
    dataDir: options.dataDir,
    siteId: options.siteId,
  };
  const { store, blobs } = await localStore(config.dataDir);
  const source = await getSource(config);
  return serveMediaRequest(request, {
    siteId: config.siteId,
    mode: "dev",
    assetByPrefix: async (prefix) => source.assetByPrefix?.(prefix),
    blobState: (sha256) => store.blobState(config.siteId, sha256),
    blobs,
  });
}

/** Shared with the `workerd` runtime so code importing either build sees the same names. */
export { CACHE_TAG_PREFIX } from "./cache-tags.ts";
