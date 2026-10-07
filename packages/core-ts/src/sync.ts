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

type NodeRow = {
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
type SnapshotRow = {
  id: string;
  site_id: string;
  parent_id: string | null;
  site_rev: number;
  body: string;
  created_at: string;
};
type ProjectRow = { id: string; rev: number; body: string; created_at: string; updated_at: string };

/** Splits statements into batches that respect D1's per-batch limit. */
async function runBatches(sql: SqlDriver, statements: SqlStatement[], size = 500): Promise<void> {
  for (let i = 0; i < statements.length; i += size) await sql.batch(statements.slice(i, i + size));
}

export async function copySite(
  from: StoragePair,
  to: StoragePair,
  siteId: string,
  options: CopySiteOptions = {},
): Promise<CopySiteResult> {
  const log = options.log ?? (() => {});
  const mode = options.mode ?? "bootstrap";
  const srcNodes = await from.sql.all<NodeRow>(
    "SELECT * FROM nodes WHERE site_id = ? ORDER BY id",
    [siteId],
  );
  const siteNode = srcNodes.find((n) => n.kind === "site");
  if (!siteNode) throw new Error(`source has no site ${siteId}`);
  const projectId = (JSON.parse(siteNode.body) as { projectId?: string }).projectId;

  // 1. Blobs first: snapshots must never point at missing node bodies.
  const snapshots = await from.sql.all<SnapshotRow>(
    "SELECT * FROM snapshots WHERE site_id = ? ORDER BY created_at, id",
    [siteId],
  );
  const hashes = new Set<string>();
  for (const s of snapshots)
    for (const n of (JSON.parse(s.body) as { nodes: { hash: string }[] }).nodes) hashes.add(n.hash);
  let blobs = 0;
  for (const hash of [...hashes].sort()) {
    const key = `nodes/${hash}.json`;
    if (await to.blobs.head(key)) continue;
    const data = await from.blobs.get(key);
    if (!data) throw new Error(`source blob ${key} is missing`);
    await to.blobs.put(key, data, { contentType: "application/json" });
    blobs++;
  }
  log(`blobs: ${blobs} uploaded, ${hashes.size - blobs} already present`);

  // 2. Snapshots: immutable, insert the missing ones (parents before children).
  const existingSnaps = new Set(
    (await to.sql.all<{ id: string }>("SELECT id FROM snapshots WHERE site_id = ?", [siteId])).map(
      (r) => r.id,
    ),
  );
  const snapInserts: SqlStatement[] = snapshots
    .filter((s) => !existingSnaps.has(s.id))
    .map((s) => ({
      sql: "INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [s.id, s.site_id, s.parent_id, s.site_rev, s.body, s.created_at],
    }));

  // 3. Project row (insert if missing; never overwritten).
  const statements: SqlStatement[] = [];
  if (projectId) {
    const project = await from.sql.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [
      projectId,
    ]);
    const remote = await to.sql.get("SELECT id FROM projects WHERE id = ?", [projectId]);
    if (project && !remote)
      statements.push({
        sql: "INSERT INTO projects (id, rev, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        params: [project.id, project.rev, project.body, project.created_at, project.updated_at],
      });
  }

  // 4. Nodes: compare by (id, hash, rev).
  const dstNodes = await to.sql.all<NodeRow>("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [
    siteId,
  ]);
  const sig = (n: NodeRow) => `${n.id}@${n.rev}:${n.hash}`;
  const srcSig = new Set(srcNodes.map(sig));
  const dstSig = new Set(dstNodes.map(sig));
  const unchanged = srcSig.size === dstSig.size && [...srcSig].every((s) => dstSig.has(s));
  let inserted = 0;
  let deleted = 0;
  if (!unchanged) {
    if (dstNodes.length > 0 && mode !== "replace") {
      const differing = [
        ...srcNodes.filter((n) => !dstSig.has(sig(n))).map((n) => n.id),
        ...dstNodes.filter((n) => !srcSig.has(sig(n))).map((n) => n.id),
      ];
      throw new SyncConflictError(siteId, [...new Set(differing)]);
    }
    statements.push({ sql: "DELETE FROM nodes WHERE site_id = ?", params: [siteId] });
    deleted = dstNodes.length;
    for (const n of srcNodes) {
      statements.push({
        sql: "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [n.id, n.site_id, n.kind, n.key, n.rev, n.hash, n.body, n.created_at, n.updated_at],
      });
      inserted++;
    }
  }

  // Snapshots before nodes: the site node's publishedSnapshotId must resolve once nodes land.
  await runBatches(to.sql, snapInserts);
  // Project + node replacement in one atomic batch so readers never see a half-copied site.
  if (statements.length > 0) {
    if (statements.length > 1000)
      throw new Error(`site ${siteId} has too many nodes (${srcNodes.length}) for one atomic copy`);
    await to.sql.batch(statements);
  }
  log(
    `snapshots: ${snapInserts.length} added; nodes: ${unchanged ? "unchanged" : `${inserted} written, ${deleted} replaced`}`,
  );
  return { nodes: { inserted, deleted, unchanged }, snapshots: snapInserts.length, blobs };
}
