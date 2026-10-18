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

import { type Asset, assertValid, type Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver, SqlStatement } from "@cloudhal/storage";
import { mediaBlobKey, refsRebuild } from "./assets.ts";
import { checkAvailability, checkTimeZone, type GateSupport, isTimeZone } from "./availability.ts";
import { InvariantError } from "./errors.ts";
import { canonicalJson, nodeHash, sha256Hex } from "./hash.ts";
import { checkHosts, hostStatements, hostsOf } from "./hosts.ts";
import { validateMenuTree } from "./menu.ts";
import { isNodeKind, NODE_SPEC, type NodeKind, type NodeTypes } from "./nodes.ts";

/** Gates in a bundle follow the write rules (§4.1) and the writer guard (S15). */
async function assertGates(
  siteId: string,
  bundle: SiteBundle,
  gates: GateSupport | undefined,
): Promise<void> {
  let gated = false;
  for (const row of bundle.nodes) {
    if (row.kind !== "page" && row.kind !== "contentEntry") continue;
    const availability = (JSON.parse(row.body) as { availability?: { from?: string } })
      .availability;
    if (!availability) continue;
    checkAvailability(availability);
    gated = true;
  }
  if (gated && gates && !(await gates.enforced(siteId)))
    throw new InvariantError(
      "gates_unsupported",
      "the bundle has time gates (availability) and this site's renderer has not confirmed it enforces them",
      { siteId },
    );
}

/**
 * `Site.timeZone` must be a zone this runtime knows (RFC-0008 §4.1), as on every other write; the
 * zone the target already stores for the site is accepted unchanged.
 */
async function assertTimeZone(to: StoragePair, siteId: string, bundle: SiteBundle): Promise<void> {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId);
  const zone = row ? (JSON.parse(row.body) as { timeZone?: string }).timeZone : undefined;
  if (zone === undefined || isTimeZone(zone)) return;
  const stored = await to.sql.get<{ body: string }>(
    "SELECT body FROM nodes WHERE id = ? AND kind = 'site'",
    [siteId],
  );
  checkTimeZone(
    zone,
    stored ? (JSON.parse(stored.body) as { timeZone?: string }).timeZone : undefined,
  );
}

/**
 * A bundle is untrusted input (whoever holds the deployment token): every row must be a valid
 * contract document of the kind its `kind` column declares (RFC-0002 §4.1: the node schemas are
 * mutually exclusive, so a body cannot pass as another kind), whose columns agree with its body,
 * for this site only.
 */
async function assertValidRows(siteId: string, bundle: SiteBundle): Promise<void> {
  for (const row of bundle.nodes) {
    if (!isNodeKind(row.kind)) throw new Error(`node ${row.id}: unknown kind ${row.kind}`);
    const kind: NodeKind = row.kind;
    const spec = NODE_SPEC[kind] as {
      schema: (typeof NODE_SPEC)[NodeKind]["schema"];
      key(n: NodeTypes[NodeKind]): string;
      siteId(n: NodeTypes[NodeKind]): string;
    };
    const schema = spec.schema;
    let body: NodeTypes[NodeKind];
    try {
      body = JSON.parse(row.body) as NodeTypes[NodeKind];
    } catch {
      throw new Error(`node ${row.id}: body is not JSON`);
    }
    try {
      assertValid(schema, body);
    } catch (e) {
      throw new Error(
        `node ${row.id}: not a valid ${schema} (${e instanceof Error ? e.message.slice(0, 200) : e})`,
      );
    }
    if (
      body.id !== row.id ||
      body.rev !== row.rev ||
      spec.siteId(body) !== row.site_id ||
      row.site_id !== siteId ||
      spec.key(body) !== row.key
    )
      throw new Error(`node ${row.id}: columns do not match its body`);
    if ((await nodeHash(body)) !== row.hash)
      throw new Error(`node ${row.id}: hash does not match its body`);
    if (kind === "menu") {
      // RFC-0003 §4.2: the tree rules the schema cannot express; targets are not checked (hidden
      // items are a legal state), and labels of a locale the site dropped are kept.
      const siteRow = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId);
      const menu = body as NodeTypes["menu"];
      try {
        if (siteRow) validateMenuTree(menu, JSON.parse(siteRow.body), menu);
      } catch (e) {
        throw new Error(`node ${row.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  for (const row of bundle.snapshots) {
    let body: { id?: string; siteId?: string };
    try {
      body = JSON.parse(row.body) as { id?: string; siteId?: string };
    } catch {
      throw new Error(`snapshot ${row.id}: body is not JSON`);
    }
    try {
      assertValid("snapshot", body);
    } catch {
      throw new Error(`snapshot ${row.id}: not a valid snapshot`);
    }
    if (body.id !== row.id || body.siteId !== siteId || row.site_id !== siteId)
      throw new Error(`snapshot ${row.id}: columns do not match its body`);
  }
}

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
  /**
   * RFC-0008 S15: when given, a bundle whose pages or entries carry `availability` is refused
   * (`gates_unsupported`) unless the target's renderer enforces gates. The admin Worker passes its
   * store's check; local targets have the renderer in the same process.
   */
  gates?: GateSupport;
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
  /**
   * RFC-0004 §4.7: content the bundle's blob assets (current and in snapshots) need. The bytes
   * travel separately (`copyMediaBlobs`, or the admin media routes); a target that lacks them
   * refuses the bundle (`missing_media`).
   */
  media?: BundleMedia[];
  /** Taken-down content: travels as ledger rows, so a copy can never bring the bytes back. */
  purged?: BundlePurge[];
}

export interface BundleMedia {
  sha256: string;
  bytes: number;
  mediaType: string;
}

export interface BundlePurge {
  sha256: string;
  reason: string;
  legal: boolean;
  by: string;
  at: string;
}

const SHA256 = /^[0-9a-f]{64}$/;

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
  await assertValidRows(siteId, bundle);
  await assertGates(siteId, bundle, options.gates);
  await assertTimeZone(to, siteId, bundle);
  await assertMedia(to, bundle);
  // RFC-0034 §4: the site's hostnames must be free in the target installation.
  const siteRow = bundle.nodes.find((n) => n.kind === "site" && n.id === siteId) as NodeRow;
  const hosts = hostsOf(JSON.parse(siteRow.body) as Site);
  await checkHosts(to.sql, hosts);

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
  // The derived reference index follows the node set in the same batch (RFC-0004 §4.4).
  statements.push(...refsRebuild(siteId, bundle.nodes));
  statements.push(...hostStatements(hosts, { siteId, hash: siteRow.hash }));
  if (statements.length > 0) {
    if (statements.length > 1000)
      throw new Error(
        `site ${siteId} has too many nodes (${bundle.nodes.length}) for one atomic copy`,
      );
    await to.sql.batch(statements);
  }
  await importMediaLedger(to, bundle, snapInserts.length > 0);
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
  // Media bytes first (RFC-0004 §4.7), then the bundle.
  await copyMediaBlobs(from.blobs, to.blobs, siteId, bundle.media ?? []);
  return importSite(to, bundle, options);
}

/**
 * RFC-0004 §4.7: every listed content must be in the target's blob store already (copied first),
 * and every current blob asset must be listed (or taken down). Otherwise `missing_media`.
 */
async function assertMedia(to: StoragePair, bundle: SiteBundle): Promise<void> {
  const listed = new Set<string>();
  for (const m of bundle.media ?? []) {
    if (
      !SHA256.test(m.sha256) ||
      !Number.isInteger(m.bytes) ||
      m.bytes < 0 ||
      typeof m.mediaType !== "string" ||
      m.mediaType.length > 255
    )
      throw new Error("bundle media entry is malformed");
    listed.add(m.sha256);
  }
  const purged = new Set<string>();
  for (const p of bundle.purged ?? []) {
    if (!SHA256.test(p.sha256)) throw new Error("bundle takedown entry is malformed");
    purged.add(p.sha256);
  }
  for (const n of bundle.nodes)
    if (n.kind === "asset") {
      const a = JSON.parse(n.body) as Asset;
      if (a.storage.kind === "blob" && !listed.has(a.sha256) && !purged.has(a.sha256))
        throw new InvariantError(
          "missing_media",
          `asset ${a.id} needs content the bundle does not list`,
          {
            sha256: a.sha256,
          },
        );
    }
  const missing: string[] = [];
  for (const sha of listed)
    if (!purged.has(sha) && !(await to.blobs.head(mediaBlobKey(bundle.siteId, sha))))
      missing.push(sha);
  if (missing.length > 0)
    throw new InvariantError(
      "missing_media",
      `the target is missing ${missing.length} media file(s); copy them first`,
      { missing },
    );
}

/** Ledger rows for the bundle's media and takedowns, and `snapshot_blobs` for its snapshots. */
async function importMediaLedger(
  to: StoragePair,
  bundle: SiteBundle,
  snapshotsAdded: boolean,
): Promise<void> {
  const { siteId } = bundle;
  const ts = new Date().toISOString();
  const statements: SqlStatement[] = [];
  for (const m of bundle.media ?? [])
    statements.push({
      sql: `INSERT INTO media_blobs (site_id, sha256, bytes, media_type, state, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'stored', ?, ?)
            ON CONFLICT (site_id, sha256) DO UPDATE SET state = 'stored', updated_at = excluded.updated_at
            WHERE media_blobs.state IN ('uploading', 'deleting')`,
      params: [siteId, m.sha256, m.bytes, m.mediaType, ts, ts],
    });
  for (const p of bundle.purged ?? [])
    statements.push({
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
    });
  if (snapshotsAdded || (bundle.media ?? []).length > 0) {
    // Which content each snapshot captured: from its asset node bodies.
    const assetBodies = new Map<string, string>();
    for (const [hash, text] of Object.entries(bundle.blobs)) assetBodies.set(hash, text);
    for (const snap of bundle.snapshots) {
      const refs = (JSON.parse(snap.body) as { nodes: { kind: string; hash: string }[] }).nodes;
      const shas = new Set<string>();
      for (const r of refs) {
        if (r.kind !== "asset") continue;
        const text =
          assetBodies.get(r.hash) ??
          new TextDecoder().decode((await to.blobs.get(`nodes/${r.hash}.json`)) ?? undefined);
        if (!text) continue;
        const a = JSON.parse(text) as Asset;
        if (a.storage.kind === "blob") shas.add(a.sha256);
      }
      if (shas.size > 0)
        statements.push({
          sql: "INSERT OR IGNORE INTO snapshot_blobs (snapshot_id, site_id, sha256) SELECT ?, ?, value FROM json_each(?)",
          params: [snap.id, siteId, JSON.stringify([...shas])],
        });
    }
  }
  await runBatches(to.sql, statements);
  // Taken-down bytes never survive a copy.
  for (const p of bundle.purged ?? []) await to.blobs.delete(mediaBlobKey(siteId, p.sha256));
}
