/**
 * RFC-0039 rollout step 2: a `SiteBundle` (what `exportSite` returns and `importSite` takes) as the
 * archive container's content, and the parts both directions share; `archive-reassemble.ts` is the
 * way back. Pure (no I/O), so the container in `../archive/` stays generic and these run in tests
 * without a store.
 *
 * - Rows are written with the keys of the field tables below, in their order, so the archive's
 *   bytes do not depend on the column order a driver returns; the reader checks every row against
 *   the same tables.
 * - `bundleMedia` rebuilds `bundle.media` from the rows the way `exportSite` does: the archive
 *   holds the media files, not their media types.
 *
 * Known limitation: `exportSite` returns a whole bundle, so the graph rows and the blob texts are
 * held in memory. `importSite`'s single atomic batch already bounds a site to about 1000 nodes;
 * snapshots are not bounded that way. Only the media bytes stream.
 */
import type { Asset } from "@cloudhal/core-contracts";
import type { BundleMedia, BundlePurge, SiteBundle } from "@cloudhal/core-ts";
import { type ArchiveContent, encodeNdjson, splitNdjson } from "../archive/index.ts";

/** How a row field is checked on the way back. */
export type FieldType = "string" | "string|null" | "integer" | "boolean";

type Fields = Readonly<Record<string, FieldType>>;

/** `NodeRow` (core-ts sync.ts), in the `nodes` table's column order. */
export const NODE_FIELDS = {
  id: "string",
  site_id: "string",
  kind: "string",
  key: "string",
  rev: "integer",
  hash: "string",
  body: "string",
  created_at: "string",
  updated_at: "string",
} as const satisfies Fields;

/** `SnapshotRow`. */
export const SNAPSHOT_FIELDS = {
  id: "string",
  site_id: "string",
  parent_id: "string|null",
  site_rev: "integer",
  body: "string",
  created_at: "string",
} as const satisfies Fields;

/** `ProjectRow`. */
export const PROJECT_FIELDS = {
  id: "string",
  rev: "integer",
  body: "string",
  created_at: "string",
  updated_at: "string",
} as const satisfies Fields;

/** A line of `blobs/NNNN.ndjson`: a node body the snapshots reference, by its content hash. */
export const BLOB_FIELDS = { hash: "string", body: "string" } as const satisfies Fields;

/** `BundlePurge`: a line of `ledger.ndjson`. */
export const PURGE_FIELDS = {
  sha256: "string",
  reason: "string",
  legal: "boolean",
  by: "string",
  at: "string",
} as const satisfies Fields;

/** A node ref of a snapshot body, as far as the archive needs it. */
export interface SnapshotRef {
  kind: string;
  hash: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Code-unit order: the same on every machine (and, for lowercase hex, `localeCompare`'s). */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `row` with exactly the keys of `fields`, in their order. */
function ordered(row: object, fields: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) out[key] = (row as Record<string, unknown>)[key];
  return out;
}

/** The node refs of a snapshot body, or undefined when it is not `{nodes: [{kind, hash}, …]}`. */
export function snapshotRefs(body: string): SnapshotRef[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const nodes = isRecord(parsed) ? parsed.nodes : undefined;
  if (!Array.isArray(nodes)) return undefined;
  const refs: SnapshotRef[] = [];
  for (const n of nodes) {
    if (!isRecord(n) || typeof n.kind !== "string" || typeof n.hash !== "string") return undefined;
    refs.push({ kind: n.kind, hash: n.hash });
  }
  return refs;
}

/** What the archive and its file name need from the bundle's site node. */
export function siteFacts(bundle: Pick<SiteBundle, "siteId" | "nodes">): {
  name: string;
  slug: string;
  publishedSnapshotId?: string | undefined;
} {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === bundle.siteId);
  if (!row) throw new Error(`the bundle has no site node for ${bundle.siteId}`);
  const site = JSON.parse(row.body) as {
    name?: unknown;
    slug?: unknown;
    publishedSnapshotId?: unknown;
  };
  const published = site.publishedSnapshotId;
  return {
    name: typeof site.name === "string" ? site.name : "",
    slug: typeof site.slug === "string" ? site.slug : "",
    ...(typeof published === "string" ? { publishedSnapshotId: published } : {}),
  };
}

/**
 * `bundle.media` as `exportSite` builds it (core-ts sync.ts): the blob assets of the current nodes
 * (in id order), then of each snapshot (in bundle order, refs in body order, bodies from `blobs`),
 * the last one seen for a hash winning; taken-down content left out; sorted by hash; undefined
 * when there is none. Keep the two in step: export-cli.test.ts compares them.
 */
export function bundleMedia(
  rows: Pick<SiteBundle, "nodes" | "snapshots" | "blobs">,
  purged: ReadonlySet<string>,
): BundleMedia[] | undefined {
  const media = new Map<string, BundleMedia>();
  const add = (body: string) => {
    const a = JSON.parse(body) as Asset;
    if (a.storage?.kind === "blob" && !purged.has(a.sha256))
      media.set(a.sha256, { sha256: a.sha256, bytes: a.bytes, mediaType: a.mediaType });
  };
  for (const n of rows.nodes) if (n.kind === "asset") add(n.body);
  for (const snap of rows.snapshots)
    for (const ref of snapshotRefs(snap.body) ?? []) {
      const text = Object.hasOwn(rows.blobs, ref.hash) ? rows.blobs[ref.hash] : undefined;
      if (ref.kind === "asset" && text) add(text);
    }
  if (media.size === 0) return undefined;
  return [...media.values()].sort((a, b) => byCodeUnit(a.sha256, b.sha256));
}

/**
 * The archive's `createdAt` (invariant 7 as amended): the newest timestamp among the rows it holds
 * (nodes, snapshots, the project and the takedowns, since a takedown alone changes the ledger),
 * never the clock, so an unchanged site exports identically. Not "the newest change": a deletion
 * stamps no remaining row, so it alone leaves the date as it was (or moves it back, when the
 * newest row went); the next edit or snapshot moves it on. Values that do not parse (the ledger's
 * `''` defaults) are skipped.
 */
export function contentCreatedAt(bundle: SiteBundle): string {
  let newest = Number.NEGATIVE_INFINITY;
  const see = (at: string) => {
    const t = Date.parse(at);
    if (t > newest) newest = t;
  };
  for (const n of bundle.nodes) {
    see(n.created_at);
    see(n.updated_at);
  }
  for (const s of bundle.snapshots) see(s.created_at);
  if (bundle.project) {
    see(bundle.project.created_at);
    see(bundle.project.updated_at);
  }
  for (const p of bundle.purged ?? []) see(p.at);
  if (!Number.isFinite(newest))
    throw new Error(`site ${bundle.siteId} has no row with a timestamp to date the archive by`);
  return new Date(newest).toISOString();
}

/**
 * RFC-0041 §6: a field operation whose marker (`migration`) is still on a field of the site node
 * needs its `before` snapshot (the marker's id) to be continued or reverted, and blocks any other
 * operation on its collection until then. Dropping that snapshot would leave the collection stuck
 * after an import, so `--latest-only` is refused until the operation is finished or reverted.
 */
function refuseUnfinishedOperations(bundle: SiteBundle): void {
  const row = bundle.nodes.find((n) => n.kind === "site" && n.id === bundle.siteId);
  const site: unknown = row ? JSON.parse(row.body) : undefined;
  const collections = isRecord(site) && isRecord(site.collections) ? site.collections : {};
  for (const [collection, c] of Object.entries(collections)) {
    const fields: unknown[] = isRecord(c) && Array.isArray(c.fields) ? c.fields : [];
    const migration = fields.map((f) => (isRecord(f) ? f.migration : undefined)).find(isRecord);
    if (!migration) continue;
    const id = String(migration.id);
    throw new Error(
      `field operation ${id} on ${collection} has not finished, and --latest-only would drop the snapshot it needs; finish or revert it first (\`cloudhal fields continue|revert ${collection} ${id}\`), or export the full history`,
    );
  }
}

/**
 * `cloudhal export --latest-only`: only the published snapshot (the site node's pointer) and the
 * latest one (`latestId`, the store's `latestSnapshot`; the bundle's last row when not given), in
 * bundle order, and only the blobs they reference. Media are what the current nodes and those
 * snapshots need; nodes, the project and the takedowns stay. A kept snapshot's `parent_id` may
 * name a dropped one: nothing follows that link. Refused while a field operation is unfinished
 * (`refuseUnfinishedOperations`).
 */
export function latestOnly(bundle: SiteBundle, latestId?: string): SiteBundle {
  refuseUnfinishedOperations(bundle);
  const latest = latestId ?? bundle.snapshots.at(-1)?.id;
  const keep = new Set([siteFacts(bundle).publishedSnapshotId, latest]);
  const snapshots = bundle.snapshots.filter((s) => keep.has(s.id));
  const hashes = new Set(snapshots.flatMap((s) => (snapshotRefs(s.body) ?? []).map((r) => r.hash)));
  const blobs: Record<string, string> = {};
  for (const [hash, text] of Object.entries(bundle.blobs)) if (hashes.has(hash)) blobs[hash] = text;
  const purged = new Set((bundle.purged ?? []).map((p) => p.sha256));
  const media = bundleMedia({ nodes: bundle.nodes, snapshots, blobs }, purged);
  return {
    format: bundle.format,
    siteId: bundle.siteId,
    ...(bundle.project ? { project: bundle.project } : {}),
    nodes: bundle.nodes,
    snapshots,
    blobs,
    ...(media ? { media } : {}),
    ...(bundle.purged ? { purged: bundle.purged } : {}),
  };
}

/** Archives are self-contained: every snapshot ref has its body in the bundle's blobs. */
function assertSelfContained(bundle: SiteBundle): void {
  for (const snap of bundle.snapshots) {
    const refs = snapshotRefs(snap.body);
    if (!refs) throw new Error(`snapshot ${snap.id}: its body is not a snapshot`);
    for (const ref of refs)
      if (!Object.hasOwn(bundle.blobs, ref.hash))
        throw new Error(`snapshot ${snap.id} references node body ${ref.hash}, not in the bundle`);
  }
}

export interface BundleArchiveOptions {
  /** The `@cloudhal/cli` version. */
  createdBy: string;
  /** The bytes of a media file, opened when the writer reaches it. */
  openMedia(m: BundleMedia): AsyncIterable<Uint8Array>;
  /** `--no-media`: no media files, `mediaOmitted` in the manifest. */
  mediaOmitted?: boolean | undefined;
  /** NDJSON part size (tests; default 8 MiB). */
  partBytes?: number | undefined;
}

/**
 * `bundle` as the container's content (RFC-0039 §1): `project.json`, the node, snapshot and blob
 * parts in the bundle's order (blobs sorted by hash), one media source per `bundle.media` entry
 * and `ledger.ndjson` when content was taken down.
 */
export function bundleToArchive(bundle: SiteBundle, options: BundleArchiveOptions): ArchiveContent {
  assertSelfContained(bundle);
  const split = (rows: unknown[]) =>
    splitNdjson(rows, options.partBytes === undefined ? {} : { partBytes: options.partBytes });
  const blobs = Object.keys(bundle.blobs)
    .sort(byCodeUnit)
    .map((hash) => ({ hash, body: bundle.blobs[hash] }));
  const purged: readonly BundlePurge[] = bundle.purged ?? [];
  return {
    siteId: bundle.siteId,
    siteName: siteFacts(bundle).name,
    createdBy: options.createdBy,
    createdAt: contentCreatedAt(bundle),
    ...(bundle.project ? { project: encodeNdjson([ordered(bundle.project, PROJECT_FIELDS)]) } : {}),
    nodes: split(bundle.nodes.map((n) => ordered(n, NODE_FIELDS))),
    snapshots: split(bundle.snapshots.map((s) => ordered(s, SNAPSHOT_FIELDS))),
    blobs: split(blobs),
    ...(purged.length > 0
      ? { ledger: encodeNdjson(purged.map((p) => ordered(p, PURGE_FIELDS))) }
      : {}),
    ...(options.mediaOmitted
      ? { mediaOmitted: true as const }
      : {
          media: (bundle.media ?? []).map((m) => ({
            sha256: m.sha256,
            bytes: m.bytes,
            open: () => options.openMedia(m),
          })),
        }),
  };
}
