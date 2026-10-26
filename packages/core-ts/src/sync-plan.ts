/**
 * What importing a site bundle would change, without writing (RFC-0039 invariants 3 and 6):
 * every check and every target read `importSite` does, in its order, with the writes held apart.
 * `importSite` applies them only once all checks passed, so a refused bundle (a bootstrap
 * conflict, missing media, a taken host, an id another site holds, a node body that is not the
 * node its snapshot ref names, a malformed takedown, the 1000-statement limit) leaves the target
 * as it was. The media ledger is planned here too (`sync-ledger.ts`), from verified bodies only.
 * `cloudhal import` plans with `report: true` before it copies any media, and prints the plan for
 * `--dry-run`. Worker-safe.
 */
import type { NodeRef, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { mediaBlobKey } from "./assets.ts";
import type { GateSupport } from "./availability.ts";
import { InvariantError } from "./errors.ts";
import { canonicalJson, sha256Hex } from "./hash.ts";
import { checkHosts, hostStatements, hostsOf, type SiteHost } from "./hosts.ts";
import { importListStatements } from "./list-values/site-plan.ts";
import { refsRebuild } from "./media/refs-rebuild.ts";
import {
  type BundleMedia,
  type NodeRow,
  type SiteBundle,
  type StoragePair,
  SyncConflictError,
} from "./sync-bundle.ts";
import {
  assertIdsFree,
  assertNodeBody,
  assertTimeZone,
  checkBundle,
  listedMedia,
  snapshotRefs,
} from "./sync-checks.ts";
import { planLedger } from "./sync-ledger.ts";
import { keepTargetPublished } from "./sync-published.ts";

export interface ImportPlanOptions {
  /** As `importSite`'s (`CopySiteOptions`). */
  mode?: "bootstrap" | "replace" | undefined;
  gates?: GateSupport | undefined;
  published?: "source" | "target" | undefined;
  /**
   * Return a bootstrap conflict (`conflict`) and missing media (`media.missing`) instead of
   * throwing them (`cloudhal import` before it copies media, and `--dry-run`). Every other
   * refusal still throws.
   */
  report?: boolean | undefined;
}

export interface ImportPlan {
  siteId: string;
  mode: "bootstrap" | "replace";
  /** The target holds no node of the site. */
  fresh: boolean;
  /** The target's nodes are exactly the bundle's (id, rev and hash). */
  unchanged: boolean;
  /** By id: nodes only the bundle has, both have at another rev or hash, only the target has. */
  nodes: { added: NodeRow[]; changed: { from: NodeRow; to: NodeRow }[]; removed: NodeRow[] };
  /** Bootstrap into a target whose nodes differ: the ids (`SyncConflictError.differing`). */
  conflict?: string[];
  /** Node bodies the target lacks. */
  blobs: number;
  /** Ids of the snapshots the target lacks, in bundle order. */
  snapshots: string[];
  /** The target lacks the bundle's project row. */
  projectAdded: boolean;
  /**
   * The listed media not taken down by the bundle, by what the target holds: the content with its
   * size, nothing, or a file of another size (`wrongSize`); `takenDownHere` are the ones the
   * target's own ledger has taken down (also counted in one of the other three).
   */
  media: {
    present: BundleMedia[];
    missing: BundleMedia[];
    wrongSize: BundleMedia[];
    takenDownHere: BundleMedia[];
  };
  /**
   * The bundle's takedowns: how many, those whose bytes the target still holds (an import deletes
   * them), and those the target's ledger does not yet hold as taken down (an import records them).
   */
  takedowns: { listed: number; bytesHere: string[]; recorded: string[] };
}

/** The writes of a planned import, in `importSite`'s order. */
export interface ImportWrites {
  /** Node bodies (`nodes/<hash>.json`), verified against their hash and their snapshot refs. */
  blobs: VerifiedBody[];
  /** Snapshot inserts. */
  snapshots: SqlStatement[];
  /** One atomic batch: the project row if missing, the node set, its reference index, its hosts. */
  batch: SqlStatement[];
  inserted: number;
  deleted: number;
  /** The media ledger and `snapshot_blobs` (`planLedger`), after the batch. */
  ledger: SqlStatement[];
  /** Media keys to delete: the bundle's takedowns (taken-down bytes never survive a copy). */
  takedowns: string[];
}

export interface VerifiedBody {
  hash: string;
  text: string;
  /** The parsed body, a valid node of every snapshot ref to it. */
  body: unknown;
}

/** Each bundle snapshot's node refs, parsed once. */
type SnapshotRefs = { id: string; refs: NodeRef[] }[];

const HASH = /^[0-9a-f]{64}$/;

/** The content the target's ledger has taken down. */
async function takenDown(to: StoragePair, siteId: string): Promise<ReadonlySet<string>> {
  const down = await to.sql.all<{ sha256: string }>(
    "SELECT sha256 FROM media_blobs WHERE site_id = ? AND state = 'purged'",
    [siteId],
  );
  return new Set(down.map((r) => r.sha256));
}

/** The listed media against the target's blob store and ledger; missing ones throw unless `report`. */
async function mediaOnTarget(
  to: StoragePair,
  bundle: SiteBundle,
  options: { report: boolean; down: ReadonlySet<string> },
): Promise<ImportPlan["media"]> {
  const { listed, purged } = listedMedia(bundle);
  const wanted = listed.filter((m) => !purged.has(m.sha256));
  const media: ImportPlan["media"] = { present: [], missing: [], wrongSize: [], takenDownHere: [] };
  for (const m of wanted) {
    const head = await to.blobs.head(mediaBlobKey(bundle.siteId, m.sha256));
    if (!head) media.missing.push(m);
    else if (head.size === m.bytes) media.present.push(m);
    else media.wrongSize.push(m);
  }
  media.takenDownHere = wanted.filter((m) => options.down.has(m.sha256));
  if (media.missing.length > 0 && !options.report)
    throw new InvariantError(
      "missing_media",
      `the target is missing ${media.missing.length} media file(s); copy them first`,
      { missing: media.missing.map((m) => m.sha256) },
    );
  return media;
}

/**
 * The node bodies the target lacks, each verified against its content hash and validated as the
 * node of every snapshot ref to it (`assertNodeBody`, invariant 2). A body the target holds is
 * its own and is neither read from the bundle nor written.
 */
async function bodiesToWrite(
  to: StoragePair,
  bundle: SiteBundle,
  snapshots: SnapshotRefs,
): Promise<VerifiedBody[]> {
  // The distinct refs to each body (most bodies appear in many snapshots).
  const refs = new Map<string, Map<string, NodeRef>>();
  for (const s of snapshots)
    for (const r of s.refs) {
      const forBody = refs.get(r.hash) ?? new Map<string, NodeRef>();
      forBody.set(`${r.kind}\u0000${r.id}\u0000${r.rev}`, r);
      refs.set(r.hash, forBody);
    }
  const out: VerifiedBody[] = [];
  for (const [hash, text] of Object.entries(bundle.blobs).sort(([a], [b]) => a.localeCompare(b))) {
    if (!HASH.test(hash)) throw new Error(`invalid blob hash ${hash}`);
    if (await to.blobs.head(`nodes/${hash}.json`)) continue;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      // Never the parser's message: it can quote the body.
      throw new Error(`blob ${hash} is not JSON`);
    }
    if ((await sha256Hex(canonicalJson(body))) !== hash)
      throw new Error(`blob ${hash} does not match its content`);
    assertNodeBody(bundle.siteId, hash, body, [...(refs.get(hash)?.values() ?? [])]);
    out.push({ hash, text, body });
  }
  return out;
}

/** Every snapshot must be fully backed by blobs: the bundle's or the target's. */
async function assertSnapshotsBacked(
  to: StoragePair,
  bundle: SiteBundle,
  snapshots: SnapshotRefs,
): Promise<void> {
  for (const snap of snapshots)
    for (const n of snap.refs)
      if (!Object.hasOwn(bundle.blobs, n.hash) && !(await to.blobs.head(`nodes/${n.hash}.json`)))
        throw new Error(`snapshot ${snap.id} references a missing blob ${n.hash}`);
}

/** Snapshots are immutable: only the missing ones are inserted. */
async function snapshotsToAdd(
  to: StoragePair,
  bundle: SiteBundle,
): Promise<{ ids: string[]; statements: SqlStatement[] }> {
  const existing = new Set(
    (
      await to.sql.all<{ id: string }>("SELECT id FROM snapshots WHERE site_id = ?", [
        bundle.siteId,
      ])
    ).map((r) => r.id),
  );
  const added = bundle.snapshots.filter((s) => !existing.has(s.id));
  return {
    ids: added.map((s) => s.id),
    statements: added.map((s) => ({
      sql: "INSERT INTO snapshots (id, site_id, parent_id, site_rev, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [s.id, s.site_id, s.parent_id, s.site_rev, s.body, s.created_at],
    })),
  };
}

/** The project row is inserted when missing, never overwritten. */
async function projectToAdd(
  to: StoragePair,
  bundle: SiteBundle,
): Promise<SqlStatement | undefined> {
  const p = bundle.project;
  if (!p || (await to.sql.get("SELECT id FROM projects WHERE id = ?", [p.id]))) return undefined;
  return {
    sql: "INSERT INTO projects (id, rev, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    params: [p.id, p.rev, p.body, p.created_at, p.updated_at],
  };
}

interface NodeChanges extends Pick<ImportPlan, "unchanged" | "nodes" | "conflict"> {
  /** The rows to write (the bundle's, with the target's publish pointer for `published: "target"`). */
  rows: NodeRow[];
  target: NodeRow[];
}

/** The bundle's nodes against the target's, by (id, rev, hash); a bootstrap conflict throws unless `report`. */
async function nodeChanges(
  to: StoragePair,
  bundle: SiteBundle,
  mode: ImportPlan["mode"],
  options: ImportPlanOptions,
): Promise<NodeChanges> {
  const { siteId } = bundle;
  const target = await to.sql.all<NodeRow>("SELECT * FROM nodes WHERE site_id = ? ORDER BY id", [
    siteId,
  ]);
  // A push keeps the deployment's publish pointer once it has one (`published: "target"`).
  const rows =
    options.published === "target"
      ? await keepTargetPublished(bundle.nodes, target, siteId)
      : bundle.nodes;
  const sig = (n: NodeRow) => `${n.id}@${n.rev}:${n.hash}`;
  const srcSig = new Set(rows.map(sig));
  const dstSig = new Set(target.map(sig));
  const unchanged = srcSig.size === dstSig.size && [...srcSig].every((x) => dstSig.has(x));
  const byId = new Map(target.map((n) => [n.id, n]));
  const ids = new Set(rows.map((n) => n.id));
  const nodes: ImportPlan["nodes"] = {
    added: rows.filter((n) => !byId.has(n.id)),
    changed: rows.flatMap((n) => {
      const from = byId.get(n.id);
      return from && sig(from) !== sig(n) ? [{ from, to: n }] : [];
    }),
    removed: target.filter((n) => !ids.has(n.id)),
  };
  if (unchanged || target.length === 0 || mode === "replace")
    return { unchanged, nodes, rows, target };
  const conflict = [
    ...new Set([
      ...rows.filter((n) => !dstSig.has(sig(n))).map((n) => n.id),
      ...target.filter((n) => !srcSig.has(sig(n))).map((n) => n.id),
    ]),
  ];
  if (!options.report) throw new SyncConflictError(siteId, conflict);
  return { unchanged, nodes, conflict, rows, target };
}

/** The atomic batch (D1 takes at most 1000 statements; AGENTS.md rule 4). */
function nodeBatch(
  bundle: SiteBundle,
  siteRow: NodeRow,
  changes: NodeChanges,
  extra: {
    project: SqlStatement | undefined;
    hosts: readonly SiteHost[];
    lists: readonly SqlStatement[];
  },
): Pick<ImportWrites, "batch" | "inserted" | "deleted"> {
  const { siteId } = bundle;
  const batch: SqlStatement[] = extra.project ? [extra.project] : [];
  let inserted = 0;
  let deleted = 0;
  if (!changes.unchanged && !changes.conflict) {
    batch.push({ sql: "DELETE FROM nodes WHERE site_id = ?", params: [siteId] });
    deleted = changes.target.length;
    for (const n of changes.rows) {
      batch.push({
        sql: "INSERT INTO nodes (id, site_id, kind, key, rev, hash, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [n.id, n.site_id, n.kind, n.key, n.rev, n.hash, n.body, n.created_at, n.updated_at],
      });
      inserted++;
    }
    batch.push(...extra.lists);
  }
  // The derived reference index follows the node set in the same batch (RFC-0004 §4.4).
  batch.push(...refsRebuild(siteId, changes.rows));
  const written = changes.rows.find((n) => n.kind === "site" && n.id === siteId) ?? siteRow;
  batch.push(...hostStatements(extra.hosts, { siteId, hash: written.hash }));
  if (batch.length > 1000)
    throw new Error(
      `site ${siteId} has too many nodes (${bundle.nodes.length}) for one atomic copy`,
    );
  return { batch, inserted, deleted };
}

/** The bundle's takedowns against the target's blob store and ledger. */
async function takedownsOnTarget(
  to: StoragePair,
  bundle: SiteBundle,
  down: ReadonlySet<string>,
): Promise<ImportPlan["takedowns"]> {
  const purged = bundle.purged ?? [];
  const bytesHere: string[] = [];
  for (const p of purged)
    if (await to.blobs.head(mediaBlobKey(bundle.siteId, p.sha256))) bytesHere.push(p.sha256);
  const recorded = purged.filter((p) => !down.has(p.sha256)).map((p) => p.sha256);
  return { listed: purged.length, bytesHere, recorded };
}

/** Every check and target read of an import, in `importSite`'s order; nothing is written. */
export async function prepareImport(
  to: StoragePair,
  bundle: SiteBundle,
  options: ImportPlanOptions,
): Promise<{ plan: ImportPlan; writes: ImportWrites }> {
  const mode = options.mode ?? "bootstrap";
  const { siteId } = bundle;
  const siteRow = await checkBundle(bundle, options.gates);
  await assertTimeZone(to, siteId, bundle);
  const down = await takenDown(to, siteId);
  const media = await mediaOnTarget(to, bundle, { report: options.report === true, down });
  // RFC-0034 §4: the site's hostnames must be free in the target installation.
  const hosts = hostsOf(JSON.parse(siteRow.body) as Site);
  await checkHosts(to.sql, hosts);
  await assertIdsFree(to, bundle);
  const refs = bundle.snapshots.map((s) => ({ id: s.id, refs: snapshotRefs(s) }));
  const blobs = await bodiesToWrite(to, bundle, refs);
  await assertSnapshotsBacked(to, bundle, refs);
  const snapshots = await snapshotsToAdd(to, bundle);
  const project = await projectToAdd(to, bundle);
  const changes = await nodeChanges(to, bundle, mode, options);
  // RFC-0042 §4: the list values start over with the node set (rebuilt after the batch).
  const lists = await importListStatements(siteId, changes.rows, new Date().toISOString());
  const nodes = nodeBatch(bundle, siteRow, changes, { project, hosts, lists });
  const ledger = await planLedger(to, bundle, {
    refs,
    written: new Map(blobs.map((b) => [b.hash, b.body])),
    snapshotsAdded: snapshots.statements.length > 0,
  });
  const takedowns = (bundle.purged ?? []).map((p) => mediaBlobKey(siteId, p.sha256));
  const plan: ImportPlan = {
    siteId,
    mode,
    fresh: changes.target.length === 0,
    unchanged: changes.unchanged,
    nodes: changes.nodes,
    ...(changes.conflict ? { conflict: changes.conflict } : {}),
    blobs: blobs.length,
    snapshots: snapshots.ids,
    projectAdded: project !== undefined,
    media,
    takedowns: await takedownsOnTarget(to, bundle, down),
  };
  return {
    plan,
    writes: { blobs, snapshots: snapshots.statements, ...nodes, ledger, takedowns },
  };
}

/**
 * What `importSite(to, bundle, options)` would change, with every refusal it would throw; writes
 * nothing. With `report: true` a bootstrap conflict and missing media are returned instead.
 */
export async function planImport(
  to: StoragePair,
  bundle: SiteBundle,
  options: ImportPlanOptions = {},
): Promise<ImportPlan> {
  return (await prepareImport(to, bundle, options)).plan;
}
