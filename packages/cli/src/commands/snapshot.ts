import path from "node:path";
import type { Snapshot } from "@cloudhal/core-contracts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";

export interface SnapshotOptions {
  readonly projectDir: string;
  readonly label?: string;
  readonly publish?: boolean;
}

/** A snapshot, or (`unchanged`) the live one when publishing would change nothing. */
export type SnapshotResult = Snapshot & { readonly unchanged?: true };

/**
 * Creates a snapshot of the live site (and optionally publishes it). Publishing a site whose
 * graph matches its live snapshot makes no new one (#51): re-running a setup script does not pad
 * the history with empty snapshots.
 */
export async function snapshot(options: SnapshotOptions): Promise<SnapshotResult> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    if (options.publish) {
      const live = await unchangedLive(local.store, cfg.siteId);
      if (live) return { ...live, unchanged: true };
    }
    const snap = await local.store.createSnapshot(cfg.siteId, {
      actor: { kind: "human", id: "user_localcli0001", name: "cloudhal CLI" },
      reason: options.publish ? "publish" : "manual",
      ...(options.label ? { label: options.label } : {}),
    });
    if (options.publish) {
      const site = await local.store.getSite(cfg.siteId);
      if (!site) throw new Error(`site ${cfg.siteId} not found`);
      await local.store.publish(site, snap.id);
    }
    return snap;
  } finally {
    await local.close();
  }
}

/** The live snapshot when the site has one and nothing is pending against it. */
async function unchangedLive(
  store: LocalStore["store"],
  siteId: string,
): Promise<Snapshot | undefined> {
  const site = await store.getSite(siteId);
  if (!site?.publishedSnapshotId) return undefined;
  const d = await store.pendingChanges(siteId);
  if (d.added.length || d.removed.length || d.changed.length) return undefined;
  return (await store.getSnapshot(site.publishedSnapshotId)) ?? undefined;
}

/** The snapshot `cloudhal build` renders: the published one, else the latest, else a fresh one. */
export async function resolveBuildSnapshot(projectDir: string): Promise<Snapshot> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error(`site ${cfg.siteId} not found`);
    if (site.publishedSnapshotId) {
      const s = await local.store.getSnapshot(site.publishedSnapshotId);
      if (s) return s;
    }
    const latest = await local.store.latestSnapshot(cfg.siteId);
    if (latest) return latest;
  } finally {
    await local.close();
  }
  return snapshot({ projectDir, label: "build" });
}
