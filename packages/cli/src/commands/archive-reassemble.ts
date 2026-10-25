/**
 * RFC-0039 §1: a site archive's items (from `readArchive`) back into exactly the `SiteBundle` that
 * `exportSite` returned when it was written. `cloudhal import` (rollout step 3) hands the result
 * to `importSite`; the tests compare it with `exportSite`.
 *
 * Every row is checked against the field tables of `archive-bundle.ts` (the exact keys, strings,
 * non-negative integers), belongs to the manifest's site and appears once; every snapshot ref has
 * its body in the archive. Every asset body `bundleMedia` reads (asset nodes, the bodies of
 * snapshots' asset refs) is a JSON object with a `storage` kind and, for a blob asset, has a hex
 * SHA-256, a size and a media type, so the media rule never throws or quotes; `importSite` then
 * validates every body against its contract. The media files must match the graph:
 * none that no asset needs, none taken down by the archive's own ledger (invariant 5), each with
 * its asset's size, and, unless the manifest says `mediaOmitted`, none missing.
 *
 * The ledger comes after the media in the layout, so a media file for taken-down content is
 * refused only at the end, after `onMedia` saw it. `cloudhal import` therefore reads the file
 * twice: a first pass verifies everything (no `onMedia`), so the second writes only verified media;
 * if a later step fails, media already written stay unreferenced (content-addressed). Nothing is
 * returned before `readArchive` has verified the whole archive.
 *
 * Errors name the archive path, the line, our own field names and validated hex hashes; never ids,
 * keys, bodies or JSON.parse messages, which can quote untrusted input.
 */
import {
  type BundleMedia,
  type BundlePurge,
  type NodeRow,
  type ProjectRow,
  SITE_BUNDLE_FORMAT,
  type SiteBundle,
  type SnapshotRow,
} from "@cloudhal/core-ts";
import type { ArchiveItem, PartKind, SiteArchiveManifest } from "../archive/index.ts";
import {
  BLOB_FIELDS,
  bundleMedia,
  type FieldType,
  isRecord,
  NODE_FIELDS,
  PROJECT_FIELDS,
  PURGE_FIELDS,
  SNAPSHOT_FIELDS,
  type SnapshotRef,
  snapshotRefs,
} from "./archive-bundle.ts";

export type ArchiveMediaItem = Extract<ArchiveItem, { type: "media" }>;
type FileItem = Extract<ArchiveItem, { type: "file" }>;

export interface ReassembleOptions {
  /**
   * Called for each media file, in archive order, after it was matched against the graph; reads
   * (or ignores) its body before resolving. The body is verified as it is read.
   */
  onMedia?: ((item: ArchiveMediaItem) => Promise<void>) | undefined;
}

export interface ReassembledArchive {
  manifest: SiteArchiveManifest;
  bundle: SiteBundle;
  /** The media files the archive held, in archive order. */
  media: { sha256: string; size: number }[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** What has been read so far. */
interface Draft {
  /** Blob texts already checked as asset bodies. */
  assetBlobs: Set<string>;
  manifest: SiteArchiveManifest;
  project?: ProjectRow | undefined;
  nodes: NodeRow[];
  nodeIds: Set<string>;
  snapshots: SnapshotRow[];
  snapshotIds: Set<string>;
  /** Each snapshot's refs and where it was read, for the checks once the blobs are in. */
  refs: { at: string; refs: SnapshotRef[] }[];
  blobs: Record<string, string>;
  purged: BundlePurge[];
  purgedShas: Set<string>;
  media: { sha256: string; size: number }[];
  /** Set once the graph is complete (at the first media file, or at the end). */
  needed?: Map<string, BundleMedia> | undefined;
}

type Row<F extends Readonly<Record<string, FieldType>>> = {
  -readonly [K in keyof F]: F[K] extends "integer"
    ? number
    : F[K] extends "boolean"
      ? boolean
      : F[K] extends "string|null"
        ? string | null
        : string;
};

const FIELD_CHECKS: Record<FieldType, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  "string|null": (v) => v === null || typeof v === "string",
  integer: (v) => Number.isSafeInteger(v) && (v as number) >= 0,
  boolean: (v) => typeof v === "boolean",
};

const FIELD_WORDS: Record<FieldType, string> = {
  string: "a string",
  "string|null": "a string or null",
  integer: "a non-negative integer",
  boolean: "true or false",
};

/** A new row with exactly `fields`' keys, in their order, each of its type; or the reason not. */
function rowOf<F extends Readonly<Record<string, FieldType>>>(
  value: unknown,
  fields: F,
  at: string,
): Row<F> {
  if (!isRecord(value)) throw new Error(`${at}: not a JSON object`);
  const keys = Object.keys(fields);
  if (Object.keys(value).length !== keys.length || !keys.every((k) => Object.hasOwn(value, k)))
    throw new Error(`${at}: needs exactly the fields ${keys.join(", ")}`);
  const row: Record<string, unknown> = {};
  for (const key of keys) {
    const type = fields[key] as FieldType;
    if (!FIELD_CHECKS[type](value[key]))
      throw new Error(`${at}: ${key} must be ${FIELD_WORDS[type]}`);
    row[key] = value[key];
  }
  return row as Row<F>;
}

/** The JSON value of each line of an NDJSON file, with where it is (`path line n`). */
function* lines(item: FileItem): Generator<{ value: unknown; at: string }> {
  let text: string;
  try {
    text = decoder.decode(item.bytes);
  } catch {
    throw new Error(`${item.path}: not UTF-8`);
  }
  // The reader checks this for the parts and the ledger, not for project.json.
  if (!text.endsWith("\n")) throw new Error(`${item.path}: not NDJSON (no final newline)`);
  const all = text.split("\n");
  for (let i = 0; i < all.length - 1; i++) {
    const at = `${item.path} line ${i + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(all[i] as string);
    } catch {
      throw new Error(`${at}: not JSON`);
    }
    yield { value, at };
  }
}

function ownSite(draft: Draft, siteId: string, at: string): void {
  if (siteId !== draft.manifest.siteId) throw new Error(`${at}: site_id is not the archive's site`);
}

/**
 * An asset body as `bundleMedia` and the media ledger read it: a JSON object with a `storage`
 * object naming its kind and, when its bytes are in the blob store, a hex `sha256`, a non-negative
 * `bytes` and a string `mediaType`. Never quotes the body.
 */
function checkAssetBody(body: string, at: string, what: string): void {
  let asset: unknown;
  try {
    asset = JSON.parse(body);
  } catch {
    throw new Error(`${at}: ${what} is not JSON`);
  }
  if (!isRecord(asset)) throw new Error(`${at}: ${what} is not a JSON object`);
  if (!isRecord(asset.storage) || typeof asset.storage.kind !== "string")
    throw new Error(`${at}: ${what} needs storage, an object with a kind`);
  if (asset.storage.kind !== "blob") return;
  if (typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256))
    throw new Error(`${at}: ${what} needs a sha256 of 64 lowercase hex digits`);
  if (!FIELD_CHECKS.integer(asset.bytes))
    throw new Error(`${at}: ${what} needs bytes, a non-negative integer`);
  if (typeof asset.mediaType !== "string")
    throw new Error(`${at}: ${what} needs a mediaType string`);
}

function addNode(draft: Draft, value: unknown, at: string): void {
  const row = rowOf(value, NODE_FIELDS, at);
  ownSite(draft, row.site_id, at);
  if (row.kind === "asset") checkAssetBody(row.body, at, "the asset body");
  if (draft.nodeIds.has(row.id)) throw new Error(`${at}: a node id appears twice`);
  draft.nodeIds.add(row.id);
  draft.nodes.push(row);
}

function addSnapshot(draft: Draft, value: unknown, at: string): void {
  const row = rowOf(value, SNAPSHOT_FIELDS, at);
  ownSite(draft, row.site_id, at);
  if (draft.snapshotIds.has(row.id)) throw new Error(`${at}: a snapshot id appears twice`);
  const refs = snapshotRefs(row.body);
  if (!refs) throw new Error(`${at}: body is not a snapshot (no {nodes: [{kind, hash}]})`);
  draft.snapshotIds.add(row.id);
  draft.snapshots.push(row);
  draft.refs.push({ at, refs });
}

function addBlob(draft: Draft, value: unknown, at: string): void {
  const row = rowOf(value, BLOB_FIELDS, at);
  if (!SHA256.test(row.hash)) throw new Error(`${at}: hash must be 64 lowercase hex digits`);
  if (Object.hasOwn(draft.blobs, row.hash))
    throw new Error(`${at}: blob ${row.hash} appears twice`);
  draft.blobs[row.hash] = row.body;
}

function addPurge(draft: Draft, value: unknown, at: string): void {
  const row = rowOf(value, PURGE_FIELDS, at);
  if (!SHA256.test(row.sha256)) throw new Error(`${at}: sha256 must be 64 lowercase hex digits`);
  if (draft.purgedShas.has(row.sha256)) throw new Error(`${at}: ${row.sha256} appears twice`);
  draft.purgedShas.add(row.sha256);
  draft.purged.push(row);
}

const PART_ROWS: Record<PartKind, (draft: Draft, value: unknown, at: string) => void> = {
  nodes: addNode,
  snapshots: addSnapshot,
  blobs: addBlob,
};

/** One handler per kind of buffered file. */
const FILES: Record<FileItem["slot"]["kind"], (draft: Draft, item: FileItem) => void> = {
  project: (draft, item) => {
    for (const { value, at } of lines(item)) {
      if (draft.project) throw new Error(`${at}: project.json holds more than one row`);
      draft.project = rowOf(value, PROJECT_FIELDS, at);
    }
  },
  part: (draft, item) => {
    const slot = item.slot;
    if (slot.kind !== "part") return;
    if (draft.needed) throw new Error(`${item.path}: comes after the media`);
    const add = PART_ROWS[slot.part];
    for (const { value, at } of lines(item)) add(draft, value, at);
  },
  ledger: (draft, item) => {
    for (const { value, at } of lines(item)) addPurge(draft, value, at);
  },
};

/**
 * The graph checks that need every row, run once: the site node, every snapshot ref's body. Then
 * the media the graph needs, taken-down content not yet left out (the ledger comes last).
 */
function needed(draft: Draft): Map<string, BundleMedia> {
  if (draft.needed) return draft.needed;
  const siteId = draft.manifest.siteId;
  if (!draft.nodes.some((n) => n.kind === "site" && n.id === siteId))
    throw new Error(`nodes: the archive has no site node for ${siteId}`);
  for (const { at, refs } of draft.refs)
    for (const ref of refs) {
      if (!Object.hasOwn(draft.blobs, ref.hash))
        throw new Error(`${at}: references a node body that is not in the archive's blobs`);
      const text = draft.blobs[ref.hash];
      // `bundleMedia` reads only non-empty bodies of asset refs.
      if (ref.kind !== "asset" || !text || draft.assetBlobs.has(ref.hash)) continue;
      checkAssetBody(text, at, "an asset body it references");
      draft.assetBlobs.add(ref.hash);
    }
  const media = bundleMedia(draft, new Set()) ?? [];
  draft.needed = new Map(media.map((m) => [m.sha256, m]));
  return draft.needed;
}

async function addMedia(
  draft: Draft,
  item: ArchiveMediaItem,
  options: ReassembleOptions,
): Promise<void> {
  const asset = needed(draft).get(item.sha256);
  if (!asset) throw new Error(`${item.path}: no asset of the archive needs this file`);
  if (asset.bytes !== item.size)
    throw new Error(`${item.path}: ${item.size} bytes, its asset says ${asset.bytes}`);
  await options.onMedia?.(item);
  draft.media.push({ sha256: item.sha256, size: item.size });
}

/** The media files against the final media (the ledger applied); `bundle.media`. */
function finalMedia(draft: Draft): BundleMedia[] | undefined {
  needed(draft);
  const media = bundleMedia(draft, draft.purgedShas);
  for (const m of draft.media)
    if (draft.purgedShas.has(m.sha256))
      throw new Error(`media/${m.sha256}: the archive's ledger has taken this content down`);
  if (!draft.manifest.mediaOmitted) {
    const present = new Set(draft.media.map((m) => m.sha256));
    for (const m of media ?? [])
      if (!present.has(m.sha256))
        throw new Error(`media/${m.sha256}: an asset needs it, and the archive does not hold it`);
  }
  return media;
}

async function firstManifest(iterator: AsyncIterator<ArchiveItem>): Promise<Draft> {
  const first = await iterator.next();
  if (first.done || first.value.type !== "manifest")
    throw new Error("the archive's items do not start with its manifest");
  return {
    assetBlobs: new Set(),
    manifest: first.value.manifest,
    nodes: [],
    nodeIds: new Set(),
    snapshots: [],
    snapshotIds: new Set(),
    refs: [],
    blobs: {},
    purged: [],
    purgedShas: new Set(),
    media: [],
  };
}

function assemble(draft: Draft): ReassembledArchive {
  const media = finalMedia(draft);
  const bundle: SiteBundle = {
    format: SITE_BUNDLE_FORMAT,
    siteId: draft.manifest.siteId,
    ...(draft.project ? { project: draft.project } : {}),
    nodes: draft.nodes,
    snapshots: draft.snapshots,
    blobs: draft.blobs,
    ...(media ? { media } : {}),
    ...(draft.purged.length > 0 ? { purged: draft.purged } : {}),
  };
  return { manifest: draft.manifest, bundle, media: draft.media };
}

/**
 * The bundle of an archive: reads `items` to the end (the reader verifies the whole archive only
 * then) and hands each media file to `onMedia` on the way. A refusal stops the reader.
 */
export async function bundleFromArchive(
  items: AsyncIterable<ArchiveItem>,
  options: ReassembleOptions = {},
): Promise<ReassembledArchive> {
  const iterator = items[Symbol.asyncIterator]();
  try {
    const draft = await firstManifest(iterator);
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      const item = next.value;
      if (item.type === "manifest") throw new Error("manifest.json: appears twice");
      if (item.type === "media") await addMedia(draft, item, options);
      else FILES[item.slot.kind](draft, item);
    }
    return assemble(draft);
  } finally {
    await iterator.return?.();
  }
}
