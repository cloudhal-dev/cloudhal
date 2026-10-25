/**
 * The media ledger writes of an import (RFC-0004 §4.7), planned with the rest before the first
 * write (`prepareImport`), so applying them cannot fail on the bundle's data: a `stored` row for
 * each listed content and a `purged` row for each takedown (`listedMedia` checked every field),
 * and `snapshot_blobs` for the bundle's snapshots. The content a snapshot captured is read from
 * verified asset bodies only: the plan's for the bodies the target lacks (validated as assets),
 * the target's own otherwise, never the bundle's text for a body the target already holds.
 * Worker-safe.
 */
import type { Asset, NodeRef } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import type { BundleMedia, BundlePurge, SiteBundle, StoragePair } from "./sync-bundle.ts";

export interface LedgerOptions {
  /** Each bundle snapshot's id and node refs, in bundle order. */
  refs: readonly { id: string; refs: readonly NodeRef[] }[];
  /** The verified bodies the import writes (the target lacks them), by hash. */
  written: ReadonlyMap<string, unknown>;
  /** The import adds at least one snapshot. */
  snapshotsAdded: boolean;
}

function storedRow(siteId: string, m: BundleMedia, ts: string): SqlStatement {
  return {
    sql: `INSERT INTO media_blobs (site_id, sha256, bytes, media_type, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'stored', ?, ?)
          ON CONFLICT (site_id, sha256) DO UPDATE SET state = 'stored', updated_at = excluded.updated_at
          WHERE media_blobs.state IN ('uploading', 'deleting')`,
    params: [siteId, m.sha256, m.bytes, m.mediaType, ts, ts],
  };
}

function purgedRow(siteId: string, p: BundlePurge, ts: string): SqlStatement {
  return {
    sql: `INSERT INTO media_blobs (site_id, sha256, bytes, media_type, state, purge_reason, purge_legal, purged_by, purged_at, created_at, updated_at)
          VALUES (?, ?, 0, 'application/octet-stream', 'purged', ?, ?, ?, ?, ?, ?)
          ON CONFLICT (site_id, sha256) DO UPDATE SET state = 'purged', lease_until = NULL,
            purge_reason = excluded.purge_reason, purge_legal = excluded.purge_legal,
            purged_by = excluded.purged_by, purged_at = excluded.purged_at, updated_at = excluded.updated_at`,
    params: [
      siteId,
      p.sha256,
      p.reason.slice(0, 1000),
      p.legal ? 1 : 0,
      p.by.slice(0, 200),
      p.at,
      ts,
      ts,
    ],
  };
}

/** The media content an asset body stores in the blob store, if it is a blob asset. */
async function capturedContent(
  to: StoragePair,
  hash: string,
  written: ReadonlyMap<string, unknown>,
): Promise<string | undefined> {
  let body = written.get(hash);
  if (body === undefined) {
    const data = await to.blobs.get(`nodes/${hash}.json`);
    try {
      body = data ? JSON.parse(new TextDecoder().decode(data)) : undefined;
    } catch {
      body = undefined;
    }
  }
  const a = body as Partial<Asset> | null | undefined;
  return a?.storage?.kind === "blob" && typeof a.sha256 === "string" ? a.sha256 : undefined;
}

/** Ledger rows for the bundle's media and takedowns, and `snapshot_blobs` for its snapshots. */
export async function planLedger(
  to: StoragePair,
  bundle: SiteBundle,
  options: LedgerOptions,
): Promise<SqlStatement[]> {
  const { siteId } = bundle;
  const ts = new Date().toISOString();
  const statements: SqlStatement[] = [
    ...(bundle.media ?? []).map((m) => storedRow(siteId, m, ts)),
    ...(bundle.purged ?? []).map((p) => purgedRow(siteId, p, ts)),
  ];
  if (!options.snapshotsAdded && (bundle.media ?? []).length === 0) return statements;
  // Which content each snapshot captured: from its asset node bodies, each read once.
  const content = new Map<string, string | undefined>();
  for (const snap of options.refs) {
    const shas = new Set<string>();
    for (const r of snap.refs) {
      if (r.kind !== "asset") continue;
      if (!content.has(r.hash))
        content.set(r.hash, await capturedContent(to, r.hash, options.written));
      const sha = content.get(r.hash);
      if (sha) shas.add(sha);
    }
    if (shas.size > 0)
      statements.push({
        sql: "INSERT OR IGNORE INTO snapshot_blobs (snapshot_id, site_id, sha256) SELECT ?, ?, value FROM json_each(?)",
        params: [snap.id, siteId, JSON.stringify([...shas])],
      });
  }
  return statements;
}
