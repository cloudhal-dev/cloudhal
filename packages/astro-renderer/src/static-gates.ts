/**
 * Static builds (Node, `cloudhal build`) and time gates (RFC-0008 §7): a static build renders the
 * site as it is at build time — embargoed pages and entries are left out, expired ones too — but
 * nothing re-renders it when a gate passes. An embargo then stays dark until the next build (safe)
 * and an expiry stays online (not safe), so the build says when it must run again. The Cloudflare
 * Site Worker checks gates per request and needs none of this. Node-only, loaded lazily by the
 * integration's `astro:build:done`.
 */
import { openLocalStore } from "@cloudhal/core-ts/local";
import type { CloudhalRendererConfig } from "./integration.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "./source.ts";

/** The next gate after `now` in the build's source (ms), if any. */
export async function staticNextGate(
  config: CloudhalRendererConfig,
  now: number,
): Promise<number | undefined> {
  const selector = process.env.CLOUDHAL_SOURCE ?? config.source ?? "live";
  const local = await openLocalStore(config.dataDir);
  try {
    const source: GraphSource = selector.startsWith("snapshot:")
      ? (await SnapshotSource.open(local.store, selector.slice("snapshot:".length))).at(now)
      : new LiveSource(local.store, config.siteId, { includeDrafts: false, now: () => now });
    return await source.nextGate?.();
  } finally {
    await local.close();
  }
}
