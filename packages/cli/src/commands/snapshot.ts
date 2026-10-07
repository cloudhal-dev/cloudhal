import path from "node:path";
import type { Snapshot } from "@cloudhal/core-contracts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";

export interface SnapshotOptions {
  readonly projectDir: string;
  readonly label?: string;
  readonly publish?: boolean;
}

/** Creates a snapshot of the live site (and optionally publishes it). */
export async function snapshot(options: SnapshotOptions): Promise<Snapshot> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const snap = await local.store.createSnapshot(cfg.siteId, {
      actor: { kind: "human", id: "user_localcli0001", name: "cloudhal CLI" },
      reason: "manual",
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
