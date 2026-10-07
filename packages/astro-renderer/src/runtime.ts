import { openLocalStore } from "@cloudhal/core-ts/local";
import type { CloudhalRendererConfig } from "./integration.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

let cached: Promise<GraphSource> | undefined;

/**
 * The page-side entry point: returns the configured `GraphSource`, created once per process.
 * `CLOUDHAL_SOURCE=live | snapshot:<id>` overrides the integration config (used by `cloudhal build`).
 */
export function getSource(
  config: CloudhalRendererConfig,
  /** Ignored on Node (one source per process); the `workerd` build resolves per request. */
  _astro?: { request: Request; response: { headers: Headers } },
): Promise<GraphSource> {
  cached ??= (async () => {
    const selector = process.env.CLOUDHAL_SOURCE ?? config.source ?? "live";
    const { store } = await openLocalStore(config.dataDir);
    if (selector === "live") return new LiveSource(store, config.siteId);
    if (selector.startsWith("snapshot:"))
      return SnapshotSource.open(store, selector.slice("snapshot:".length));
    throw new Error(`invalid CLOUDHAL_SOURCE "${selector}" (expected "live" or "snapshot:<id>")`);
  })();
  return cached;
}

/** Test hook. */
export function resetSource(): void {
  cached = undefined;
}

/** Shared with the `workerd` runtime so code importing either build sees the same names. */
export const CACHE_TAG_PREFIX = "cloudhal-site-";
