/**
 * Copies one site — project row, nodes, snapshots and the blobs they reference — from one storage
 * pair to another. This is what `cloudhal push` (local → Cloudflare) and `cloudhal pull`
 * (Cloudflare → local) are built on, and `cloudhal import` applies an archive's bundle with it; it
 * only uses the `SqlDriver`/`BlobStore` interfaces, so any combination of SQLite, D1 and fs/R2
 * works.
 *
 * Safety: the target is the source of truth once a site is deployed (agents edit it there). The
 * copy therefore refuses to overwrite a target whose nodes differ from the source unless
 * `mode: "replace"` is given. Snapshots are immutable and only ever added. Every check runs before
 * the first write (`sync-plan.ts`), so a refused bundle leaves the target as it was.
 *
 * The bundle format lives in `sync-bundle.ts`, its checks in `sync-checks.ts`, the plan of an
 * import in `sync-plan.ts` (its media ledger in `sync-ledger.ts`); this module re-exports the
 * public parts.
 */

import type { Asset } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver, SqlStatement } from "@cloudhal/storage";
import { mediaBlobKey } from "./assets.ts";
import { InvariantError } from "./errors.ts";
import {
  type BundleMedia,
  type CopySiteOptions,
  type CopySiteResult,
  type NodeRow,
  type ProjectRow,
  SITE_BUNDLE_FORMAT,
  type SiteBundle,
  type SnapshotRow,
  type StoragePair,
} from "./sync-bundle.ts";
import { prepareImport } from "./sync-plan.ts";

export * from "./sync-bundle.ts";
export { type ImportPlan, type ImportPlanOptions, planImport } from "./sync-plan.ts";

/** Splits statements into batches that respect D1's per-batch limit. */
async function runBatches(sql: SqlDriver, statements: SqlStatement[], size = 500): Promise<void> {
  for (let i = 0; i < statements.length; i += size) await sql.batch(statements.slice(i, i + size));
}

/** Reads everything needed to recreate `siteId` elsewhere. */
export async function exportSite(
  from: StoragePair,
  siteId: string,
  options: { skipBlobs?: (hash: string) => Promise<boolean> } = {},
): Promise<SiteBundle> {
  const nodes = await from.sql.all<NodeRow>("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [
    siteId,
  ]);
  const siteNode = nodes.find((n) => n.kind === "site");
  if (!siteNode) throw new Error(`source has no site ${siteId}`);
  const projectId = (JSON.parse(siteNode.body) as { projectId?: string }).projectId;
  const project = projectId
    ? await from.sql.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [projectId])
    : undefined;
  const snapshots = await from.sql.all<SnapshotRow>(
    "SELECT * FROM snapshots WHERE site_id = ? ORDER BY created_at, id",
    [siteId],
  );
  const hashes = new Set<string>();
  for (const snap of snapshots)
    for (const n of (JSON.parse(snap.body) as { nodes: { hash: string }[] }).nodes)
      hashes.add(n.hash);
  const blobs: Record<string, string> = {};
  const decoder = new TextDecoder();
  for (const hash of [...hashes].sort()) {
    if (options.skipBlobs && (await options.skipBlobs(hash))) continue;
    const key = `nodes/${hash}.json`;
    const data = await from.blobs.get(key);
    if (!data) throw new Error(`source blob ${key} is missing`);
    blobs[hash] = decoder.decode(data);
  }
  // Media: blob assets of the current nodes and of every snapshot, minus taken-down content.
  const purgedRows = await from.sql.all<{
    sha256: string;
    purge_reason: string | null;
    purge_legal: number | null;
    purged_by: string | null;
    purged_at: string | null;
  }>(
    "SELECT sha256, purge_reason, purge_legal, purged_by, purged_at FROM media_blobs WHERE site_id = ? AND state = 'purged' ORDER BY sha256",
    [siteId],
  );
  const purged = new Set(purgedRows.map((r) => r.sha256));
  // packages/cli/src/commands/archive-bundle.ts bundleMedia rebuilds this from an archive; keep
  // the two in step (export-cli.test.ts compares them).
  const media = new Map<string, BundleMedia>();
  const addAsset = (body: string) => {
    const a = JSON.parse(body) as Asset;
    if (a.storage?.kind === "blob" && !purged.has(a.sha256))
      media.set(a.sha256, { sha256: a.sha256, bytes: a.bytes, mediaType: a.mediaType });
  };
  for (const n of nodes) if (n.kind === "asset") addAsset(n.body);
  for (const snap of snapshots)
    for (const n of (JSON.parse(snap.body) as { nodes: { kind: string; hash: string }[] }).nodes)
      if (n.kind === "asset") {
        const text =
          blobs[n.hash] ??
          new TextDecoder().decode((await from.blobs.get(`nodes/${n.hash}.json`)) ?? undefined);
        if (text) addAsset(text);
      }
  return {
    format: SITE_BUNDLE_FORMAT,
    siteId,
    ...(project ? { project } : {}),
    nodes,
    snapshots,
    blobs,
    ...(media.size > 0
      ? { media: [...media.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)) }
      : {}),
    ...(purgedRows.length > 0
      ? {
          purged: purgedRows.map((r) => ({
            sha256: r.sha256,
            reason: r.purge_reason ?? "",
            legal: r.purge_legal === 1,
            by: r.purged_by ?? "",
            at: r.purged_at ?? "",
          })),
        }
      : {}),
  };
}

/**
 * Copies the media bytes a bundle needs from one blob store to another (missing ones only),
 * verified by SHA-256 on the way in. Streams when both stores can.
 */
export async function copyMediaBlobs(
  from: BlobStore,
  to: BlobStore,
  siteId: string,
  media: readonly BundleMedia[],
): Promise<number> {
  let copied = 0;
  for (const m of media) {
    const key = mediaBlobKey(siteId, m.sha256);
    if (await to.head(key)) continue;
    if (from.getStream && to.putStream) {
      const s = await from.getStream(key);
      if (!s) throw new InvariantError("missing_media", `the source has no bytes for ${m.sha256}`);
      await to.putStream(key, s.body, { size: s.size, sha256: m.sha256, contentType: m.mediaType });
    } else {
      const bytes = await from.get(key);
      if (!bytes)
        throw new InvariantError("missing_media", `the source has no bytes for ${m.sha256}`);
      await to.put(key, bytes, { sha256: m.sha256, contentType: m.mediaType });
    }
    copied++;
  }
  return copied;
}

/**
 * Applies a bundle to `to`. Every check and read runs first (`prepareImport`), so a refused bundle
 * writes nothing; then node bodies and snapshots land, then the project row and the node set in
 * one atomic batch, then the media ledger, all planned. Only a storage failure can stop it
 * between those writes; the next import of the bundle completes it. Refuses to overwrite diverged
 * nodes unless `mode: "replace"`.
 */
export async function importSite(
  to: StoragePair,
  bundle: SiteBundle,
  options: CopySiteOptions = {},
): Promise<CopySiteResult> {
  const log = options.log ?? (() => {});
  const { plan, writes } = await prepareImport(to, bundle, { ...options, report: false });

  // 1. Node bodies the target lacks, verified against their content hash by the plan.
  const encoder = new TextEncoder();
  for (const b of writes.blobs)
    await to.blobs.put(`nodes/${b.hash}.json`, encoder.encode(b.text), {
      contentType: "application/json",
    });
  log(`blobs: ${writes.blobs.length} uploaded`);
  // 2. Snapshots: immutable, the missing ones.
  await runBatches(to.sql, writes.snapshots);
  // 3. The project row (if missing), the node set, its reference index and hostnames: one batch.
  if (writes.batch.length > 0) await to.sql.batch(writes.batch);
  // 4. The media ledger and `snapshot_blobs`; taken-down bytes never survive a copy.
  await runBatches(to.sql, writes.ledger);
  for (const key of writes.takedowns) await to.blobs.delete(key);
  log(
    `snapshots: ${writes.snapshots.length} added; nodes: ${plan.unchanged ? "unchanged" : `${writes.inserted} written, ${writes.deleted} replaced`}`,
  );
  return {
    nodes: { inserted: writes.inserted, deleted: writes.deleted, unchanged: plan.unchanged },
    snapshots: writes.snapshots.length,
    blobs: writes.blobs.length,
  };
}

/** `importSite(to, exportSite(from))`, skipping blobs the target already has. */
export async function copySite(
  from: StoragePair,
  to: StoragePair,
  siteId: string,
  options: CopySiteOptions = {},
): Promise<CopySiteResult> {
  const bundle = await exportSite(from, siteId, {
    skipBlobs: async (hash) => (await to.blobs.head(`nodes/${hash}.json`)) !== null,
  });
  // Media bytes first (RFC-0004 §4.7), then the bundle.
  await copyMediaBlobs(from.blobs, to.blobs, siteId, bundle.media ?? []);
  return importSite(to, bundle, options);
}
