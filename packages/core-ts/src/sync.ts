/**
 * Copies one site — project row, nodes, snapshots and the blobs they reference — from one storage
 * pair to another. This is what `cloudhal push` (local → Cloudflare) and `cloudhal pull`
 * (Cloudflare → local) are built on; it only uses the `SqlDriver`/`BlobStore` interfaces, so any
 * combination of SQLite, D1 and fs/R2 works.
 *
 * Safety: the target is the source of truth once a site is deployed (agents edit it there). The
 * copy therefore refuses to overwrite a target whose nodes differ from the source unless
 * `mode: "replace"` is given. Snapshots are immutable and only ever added.
 */
import type { BlobStore, SqlDriver, SqlStatement } from "@cloudhal/storage";
import { canonicalJson, sha256Hex } from "./hash.ts";

export interface StoragePair {
  sql: SqlDriver;
  blobs: BlobStore;
}

export interface CopySiteOptions {
  /**
   * `bootstrap` (default): copy when the target has no such site or already holds exactly the same
   * nodes; otherwise throw `SyncConflictError`. `replace`: make the target's nodes equal the source.
   */
  mode?: "bootstrap" | "replace";
  log?: (line: string) => void;
}

export interface CopySiteResult {
  nodes: { inserted: number; deleted: number; unchanged: boolean };
  snapshots: number;
  blobs: number;
}

export class SyncConflictError extends Error {
  override readonly name = "SyncConflictError";
  readonly differing: string[];
  constructor(siteId: string, differing: string[]) {
    super(
      `target already has site ${siteId} with different content (${differing.length} node(s) differ: ${differing.slice(0, 5).join(", ")}${differing.length > 5 ? ", …" : ""}); pull first or pass mode "replace"`,
    );
    this.differing = differing;
  }
}

export type NodeRow = {
  id: string;
  site_id: string;
  kind: string;
  key: string;
  rev: number;
  hash: string;
  body: string;
  created_at: string;
  updated_at: string;
};
export type SnapshotRow = {
  id: string;
  site_id: string;
  parent_id: string | null;
  site_rev: number;
  body: string;
  created_at: string;
};
export type ProjectRow = {
  id: string;
  rev: number;
  body: string;
  created_at: string;
  updated_at: string;
};

/** Splits statements into batches that respect D1's per-batch limit. */
async function runBatches(sql: SqlDriver, statements: SqlStatement[], size = 500): Promise<void> {
  for (let i = 0; i < statements.length; i += size) await sql.batch(statements.slice(i, i + size));
}

/** A self-contained, JSON-serialisable copy of one site (what push/pull send over HTTP). */
export interface SiteBundle {
  format: "cloudhal.site-bundle@1";
  siteId: string;
  project?: ProjectRow | undefined;
  nodes: NodeRow[];
  snapshots: SnapshotRow[];
  /** Node bodies referenced by the snapshots, keyed by content hash (UTF-8 JSON text). */
  blobs: Record<string, string>;
}

export const SITE_BUNDLE_FORMAT = "cloudhal.site-bundle@1" as const;

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
  return {
    format: SITE_BUNDLE_FORMAT,
    siteId,
    ...(project ? { project } : {}),
    nodes,
    snapshots,
    blobs,
  };
}

/**
 * Applies a bundle to `to`. Blobs and snapshots land first, then the project row and the node set
 * in one atomic batch. Refuses to overwrite diverged nodes unless `mode: "replace"`.
 */
export async function importSite(
  to: StoragePair,
  bundle: SiteBundle,
  options: CopySiteOptions = {},
): Promise<CopySiteResult> {
  if (bundle.format !== SITE_BUNDLE_FORMAT)
    throw new Error(`unsupported bundle format ${bundle.format}`);
  const log = options.log ?? (() => {});
  const mode = options.mode ?? "bootstrap";
  const { siteId } = bundle;
  if (!bundle.nodes.some((n) => n.kind === "site" && n.id === siteId))
    throw new Error(`bundle has no site node for ${siteId}`);
  if (
    bundle.nodes.some((n) => n.site_id !== siteId) ||
    bundle.snapshots.some((s) => s.site_id !== siteId)
  )
    throw new Error("bundle contains rows of another site");

  // 1. Blobs: verify content addressing so a bundle cannot plant mismatched bodies.
  let blobs = 0;
  const encoder = new TextEncoder();
  for (const [hash, text] of Object.entries(bundle.blobs).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`invalid blob hash ${hash}`);
    const key = `nodes/${hash}.json`;
    if (await to.blobs.head(key)) continue;
    if ((await sha256Hex(canonicalJson(JSON.parse(text)))) !== hash)
      throw new Error(`blob ${hash} does not match its content`);
    await to.blobs.put(key, encoder.encode(text), { contentType: "application/json" });
    blobs++;
  }
  // Every snapshot must be fully backed by blobs on the target.
  for (const snap of bundle.snapshots)
    for (const n of (JSON.parse(snap.body) as { nodes: { hash: string }[] }).nodes)
      if (!(n.hash in bundle.blobs) && !(await to.blobs.head(`nodes/${n.hash}.json`)))
        throw new Error(`snapshot ${snap.id} references a missing blob ${n.hash}`);
  log(`blobs: ${blobs} uploaded`);

  // 2. Snapshots: immutable, insert the missing ones.
  const existingSnaps = new Set(
    (await to.sql.all<{ id: string }>("SELECT id FROM snapshots WHERE site_id = ?", [siteId])).map(
      (r) => r.id,
    ),
  );
  const snapInserts: SqlStatement[] = bundle.snapshots
    .filter((s) => !existingSnaps.has(s.id))
    .map((s) => ({
      sql: "INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [s.id, s.site_id, s.parent_id, s.site_rev, s.body, s.created_at],
    }));

  // 3. Project row (insert if missing; never overwritten).
  const statements: SqlStatement[] = [];
  if (
    bundle.project &&
    !(await to.sql.get("SELECT id FROM projects WHERE id = ?", [bundle.project.id]))
  ) {
    const p = bundle.project;
    statements.push({
      sql: "INSERT INTO projects (id, rev, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      params: [p.id, p.rev, p.body, p.created_at, p.updated_at],
    });
  }

  // 4. Nodes: compare by (id, rev, hash).
  const dstNodes = await to.sql.all<NodeRow>("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [
    siteId,
  ]);
  const sig = (n: NodeRow) => `${n.id}@${n.rev}:${n.hash}`;
  const srcSig = new Set(bundle.nodes.map(sig));
  const dstSig = new Set(dstNodes.map(sig));
  const unchanged = srcSig.size === dstSig.size && [...srcSig].every((x) => dstSig.has(x));
  let inserted = 0;
  let deleted = 0;
  if (!unchanged) {
    if (dstNodes.length > 0 && mode !== "replace") {
      const differing = [
        ...bundle.nodes.filter((n) => !dstSig.has(sig(n))).map((n) => n.id),
        ...dstNodes.filter((n) => !srcSig.has(sig(n))).map((n) => n.id),
      ];
      throw new SyncConflictError(siteId, [...new Set(differing)]);
    }
    statements.push({ sql: "DELETE FROM nodes WHERE site_id = ?", params: [siteId] });
    deleted = dstNodes.length;
    for (const n of bundle.nodes) {
      statements.push({
        sql: "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [n.id, n.site_id, n.kind, n.key, n.rev, n.hash, n.body, n.created_at, n.updated_at],
      });
      inserted++;
    }
  }

  await runBatches(to.sql, snapInserts);
  if (statements.length > 0) {
    if (statements.length > 1000)
      throw new Error(
        `site ${siteId} has too many nodes (${bundle.nodes.length}) for one atomic copy`,
      );
    await to.sql.batch(statements);
  }
  log(
    `snapshots: ${snapInserts.length} added; nodes: ${unchanged ? "unchanged" : `${inserted} written, ${deleted} replaced`}`,
  );
  return { nodes: { inserted, deleted, unchanged }, snapshots: snapInserts.length, blobs };
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
  return importSite(to, bundle, options);
}
