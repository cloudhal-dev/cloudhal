/**
 * Assets and the media library (RFC-0004 §3–§4): asset nodes, the blob ledger with leases, reference
 * tracking for pages, entries and terms, garbage collection and takedown. `SiteGraphStore` delegates
 * here. Every multi-statement write is one `batch()` (AGENTS.md rule 4). Worker-safe.
 *
 * Ledger states (`media_blobs.state`): `uploading` (leased, bytes being written), `stored`,
 * `deleting` (garbage collection in progress) and `purged` (taken down). A blob asset node is only
 * ever inserted while its row is `stored` (invariant 3); a lease keeps garbage collection away from
 * an upload in flight, and `deleting` makes a concurrent upload answer `retry` (§4.5).
 */
import {
  type Actor,
  type Asset,
  assertValid,
  type ContentEntry,
  type NodeRef,
  type Page,
  type Site,
  type Term,
} from "@cloudhal/core-contracts";
import {
  type BlobStore,
  readAllBytes,
  type SqlDriver,
  type SqlStatement,
  sha256OfBytes,
} from "@cloudhal/storage";
import { ConflictError, InvariantError, isUniqueViolation, NotFoundError } from "./errors.ts";
import { canonicalJson } from "./hash.ts";
import { ID_PREFIX } from "./ids.ts";
import { RASTER_TYPES } from "./media/image.ts";
import { type InspectOptions, inspectUpload } from "./media/ingest.ts";
import { type AssetRefUse, assetRefsOf, canonicalImageRefs } from "./media/refs.ts";
import { sniff } from "./media/sniff.ts";
import {
  assetKindFor,
  MEDIA_LIMITS,
  MEDIA_TYPES,
  mediaPrefix,
  normalizeMediaType,
  slugifyFilename,
} from "./media/types.ts";
import { type Cond, casUpdateStatement, insertNodeStatement, parseRows } from "./node-sql.ts";
import type { Creatable } from "./nodes.ts";

/** Key of a site's content in the blob store (derived, never stored in a document; §4.1). */
export function mediaBlobKey(siteId: string, sha256: string): string {
  if (!/^[a-z]+_[A-Za-z0-9]{6,32}$/.test(siteId) || !/^[0-9a-f]{64}$/.test(sha256))
    throw new InvariantError("invalid_asset", "invalid site id or sha256 for a media key");
  return `media/${siteId}/${sha256}`;
}

/** Fields a person or agent chooses for an asset (everything else is measured by the server). */
export interface AssetFields {
  readonly title?: Asset["title"];
  readonly alt?: Asset["alt"];
  readonly caption?: Asset["caption"];
  readonly credit?: Asset["credit"];
  readonly license?: Asset["license"];
  readonly decorative?: boolean;
  readonly slug?: string;
  readonly metadata?: Asset["metadata"];
  /** Client-computed placeholders (Studio); only their format is checked (§5.3). */
  readonly image?: { readonly blurhash?: string; readonly lqip?: string };
}

export interface IngestAssetInput {
  readonly siteId: string;
  readonly bytes: Uint8Array;
  readonly declaredType?: string | undefined;
  /** Original file name: kept for search, never a key, never served. */
  readonly filename?: string | undefined;
  readonly uploadedBy: Actor;
  /** How the bytes came in. `upload` gets `filename` filled in. */
  readonly source:
    | { kind: "upload" }
    | { kind: "fetch"; url: string; fetchedAt: string }
    | { kind: "import"; from: string; importer?: string };
  /** People only (answer 8). */
  readonly keepMetadata?: boolean | undefined;
  /** The path's cap (4 MB `upload_asset`, 25 MB `fetch_asset_url`). */
  readonly maxBytes?: number | undefined;
  readonly caps?: InspectOptions["caps"];
  /** Applied to a new asset only; an existing asset (same content) is returned unchanged. */
  readonly fields?: AssetFields | undefined;
}

export interface IngestAssetResult {
  readonly asset: Asset;
  /** The site already had these bytes (idempotent retries, duplicate drops). */
  readonly existing: boolean;
  /** `gps`/`metadata-kept` when a person kept metadata (Studio warns). */
  readonly warnings: readonly string[];
}

export interface StreamIngestInput extends Omit<IngestAssetInput, "bytes" | "keepMetadata"> {
  readonly stream: ReadableStream<Uint8Array>;
  /** Exact size (the ticket's `bytes`); enforced while streaming. */
  readonly size: number;
  /** Client-declared SHA-256, verified before the object becomes visible. */
  readonly sha256: string;
}

export interface AssetQuery {
  readonly kind?: readonly Asset["kind"][];
  readonly status?: readonly Asset["status"][];
  /** Words in title, alt, caption, credit, slug or the original file name. */
  readonly query?: string;
  /** Only assets nothing refers to. */
  readonly unused?: boolean;
  /** Images without alt text that are not decorative. */
  readonly missingAlt?: boolean;
  readonly uploadedBy?: "human" | "agent";
  readonly cursor?: string;
  /** Default 50, at most 200. */
  readonly limit?: number;
}

export interface AssetPage {
  readonly assets: Asset[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  readonly nextCursor?: string;
}

export interface AssetRefRow {
  readonly nodeId: string;
  readonly nodeKind: string;
  readonly field: string;
}

export interface AssetUsage {
  readonly total: number;
  readonly byKind: Record<string, number>;
  readonly refs: AssetRefRow[];
}

export interface BlobLedgerRow {
  readonly sha256: string;
  readonly state: "uploading" | "stored" | "deleting" | "purged";
  readonly bytes: number;
  readonly mediaType: string;
  readonly originalSha256?: string;
  readonly leaseUntil?: string;
  readonly purge?: { reason: string; legal: boolean; by: string; at: string };
}

export interface GcResult {
  /** Content whose bytes were deleted (or would be, on a dry run). */
  readonly collected: string[];
  readonly dryRun: boolean;
}

/** What a person asks to upload (RFC-0004 §5.5); the server measures everything else. */
export interface UploadTicketRequest {
  /** Client-declared SHA-256 of the bytes as uploaded (required for streamed kinds). */
  readonly sha256?: string | undefined;
  readonly bytes: number;
  /** Declared (normalised) media type; the sniffed type must agree at upload time. */
  readonly mediaType: string;
  /** JSON options carried to the upload: file name, `keepMetadata`, the asset's fields. */
  readonly options: Readonly<Record<string, unknown>>;
}

/** A row of `media_uploads`: single use (`open` → `used`), bound to its actor and site. */
export interface UploadTicket extends UploadTicketRequest {
  readonly id: string;
  readonly siteId: string;
  readonly actor: { readonly kind: string; readonly id: string };
  readonly state: "open" | "used";
  readonly expiresAt: string;
  readonly createdAt: string;
}

/** A node write's reference plan: the canonical node, its guard and its index rewrite. */
export interface RefPlan<T> {
  readonly node: T;
  readonly guard?: Cond;
  /** `asset_refs` rewrite, anchored on the node's new hash; empty when nothing changed. */
  statements(hash: string): SqlStatement[];
  /** Re-checks the references after a write that matched no row (throws the specific error). */
  diagnose(): Promise<void>;
}

type RefKind = "page" | "contentEntry" | "term" | "site";
type RefNode = Page | ContentEntry | Term | Site;

const LEASE_MS = 15 * 60 * 1000;
const json = (v: unknown) => JSON.stringify(v);

/** Invariant 13: no empty maps or texts, `decorative`/`animated` never false. */
export function canonicalAsset(a: Asset): Asset {
  const out = { ...a } as Asset & Record<string, unknown>;
  for (const field of ["title", "alt", "caption"] as const) {
    const map = out[field];
    if (!map) continue;
    const kept = Object.fromEntries(
      Object.entries(map).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
    );
    if (Object.keys(kept).length === 0) delete out[field];
    else out[field] = kept as never;
  }
  if (out.credit !== undefined && out.credit.trim() === "") delete out.credit;
  if (out.decorative === false) delete out.decorative;
  if (out.image) {
    const { animated, ...img } = out.image;
    out.image = animated ? { ...img, animated: true } : img;
  }
  if (out.metadata && Object.keys(out.metadata).length === 0) delete out.metadata;
  return out;
}

/** Invariant 4 (and the shape rules the schema cannot express, §2.6). */
export function checkAssetRules(a: Asset): void {
  const external = a.storage.kind === "external";
  const expected = assetKindFor(a.mediaType);
  if (!external && !MEDIA_TYPES[a.mediaType])
    throw new InvariantError("invalid_asset", `${a.mediaType} is not stored by Cloudhal`);
  if (a.kind !== expected)
    throw new InvariantError("invalid_asset", `an asset of type ${a.mediaType} is a ${expected}`);
  if (a.kind === "other" && !external)
    throw new InvariantError("invalid_asset", "kind other is for external files only");
  if (a.kind !== "image" && a.image)
    throw new InvariantError("invalid_asset", "only images carry image information");
  if (a.kind === "image" && !external && !a.image)
    throw new InvariantError("invalid_asset", "a stored image needs its width and height");
  if ((a.source.kind === "link") !== external)
    throw new InvariantError(
      "invalid_asset",
      "external files are registered as links, and links are external",
    );
}

const IMMUTABLE = [
  "siteId",
  "sha256",
  "originalSha256",
  "bytes",
  "mediaType",
  "kind",
  "storage",
  "source",
  "uploadedBy",
  "status",
  "createdAt",
] as const;

export interface AssetKernel {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  stamp(): string;
  newId(prefix: string): string;
  /** Stored bytes per site; 0 = unlimited. */
  readonly quotaBytes: number;
  readonly onMediaPurged?: ((siteId: string, assetIds: string[]) => Promise<void>) | undefined;
  readonly onHookError: (error: unknown) => void;
}

export class AssetEngine {
  readonly #k: AssetKernel;

  constructor(kernel: AssetKernel) {
    this.#k = kernel;
  }

  get #sql(): SqlDriver {
    return this.#k.sql;
  }

  // ───────────────────────────── reads ─────────────────────────────

  async getAsset(id: string): Promise<Asset | undefined> {
    const row = await this.#sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE id = ? AND kind = 'asset'",
      [id],
    );
    return row ? (JSON.parse(row.body) as Asset) : undefined;
  }

  async getAssetBySha256(siteId: string, sha256: string): Promise<Asset | undefined> {
    const row = await this.#sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'asset' AND key = ?",
      [siteId, sha256],
    );
    return row ? (JSON.parse(row.body) as Asset) : undefined;
  }

  /** The asset whose SHA-256 starts with the 16-hex URL prefix (unique per site, invariant 2). */
  async getAssetByPrefix(siteId: string, prefix16: string): Promise<Asset | undefined> {
    if (!/^[0-9a-f]{16}$/.test(prefix16)) return undefined;
    const row = await this.#sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'asset' AND key >= ? AND key < ? LIMIT 1",
      [siteId, prefix16, `${prefix16}g`],
    );
    return row ? (JSON.parse(row.body) as Asset) : undefined;
  }

  async getAssets(siteId: string, ids: readonly string[]): Promise<Map<string, Asset>> {
    if (ids.length === 0) return new Map();
    const rows = await this.#sql.all<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'asset' AND id IN (SELECT value FROM json_each(?))",
      [siteId, json([...new Set(ids)])],
    );
    return new Map(parseRows<Asset>(rows).map((a) => [a.id, a]));
  }

  async listAssets(siteId: string, q: AssetQuery = {}): Promise<AssetPage> {
    const where: string[] = ["site_id = ?", "kind = 'asset'"];
    const params: (string | number)[] = [siteId];
    if (q.kind?.length) {
      where.push("json_extract(body, '$.kind') IN (SELECT value FROM json_each(?))");
      params.push(json(q.kind));
    }
    if (q.status?.length) {
      where.push("json_extract(body, '$.status') IN (SELECT value FROM json_each(?))");
      params.push(json(q.status));
    }
    if (q.uploadedBy) {
      where.push("json_extract(body, '$.uploadedBy.kind') = ?");
      params.push(q.uploadedBy);
    }
    if (q.unused) where.push("NOT EXISTS (SELECT 1 FROM asset_refs r WHERE r.asset_id = nodes.id)");
    if (q.missingAlt)
      where.push(
        "json_extract(body, '$.kind') = 'image' AND json_extract(body, '$.alt') IS NULL AND json_extract(body, '$.decorative') IS NULL",
      );
    const words = (q.query ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    for (const w of words) {
      where.push(
        "lower(coalesce(json_extract(body, '$.title'), '') || ' ' || coalesce(json_extract(body, '$.alt'), '') || ' ' || coalesce(json_extract(body, '$.caption'), '') || ' ' || coalesce(json_extract(body, '$.credit'), '') || ' ' || coalesce(json_extract(body, '$.source.filename'), '') || ' ' || json_extract(body, '$.slug')) LIKE ? ESCAPE '\\'",
      );
      params.push(`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    if (q.cursor) {
      const [at, id] = decodeCursor(q.cursor);
      where.push("(created_at < ? OR (created_at = ? AND id < ?))");
      params.push(at, at, id);
    }
    const limit = Math.min(Math.max(1, Math.floor(q.limit ?? 50)), 200);
    params.push(limit + 1);
    const rows = await this.#sql.all<{ body: string; created_at: string; id: string }>(
      `SELECT body, created_at, id FROM nodes WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
      params,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      assets: parseRows<Asset>(page),
      ...(rows.length > limit && last
        ? { nextCursor: encodeCursor(last.created_at, last.id) }
        : {}),
    };
  }

  /** References per asset (all of a site's assets, or `ids`), from the `asset_refs` index. */
  async assetUsage(siteId: string, ids?: readonly string[]): Promise<Map<string, AssetUsage>> {
    const rows = await this.#sql.all<{
      asset_id: string;
      node_id: string;
      node_kind: string;
      field: string;
    }>(
      `SELECT asset_id, node_id, node_kind, field FROM asset_refs WHERE site_id = ?${ids ? " AND asset_id IN (SELECT value FROM json_each(?))" : ""} ORDER BY asset_id, node_kind, node_id, field`,
      ids ? [siteId, json(ids)] : [siteId],
    );
    const out = new Map<string, AssetUsage>();
    for (const r of rows) {
      const u = out.get(r.asset_id) ?? { total: 0, byKind: {}, refs: [] };
      u.refs.push({ nodeId: r.node_id, nodeKind: r.node_kind, field: r.field });
      out.set(r.asset_id, {
        total: new Set(u.refs.map((x) => x.nodeId)).size,
        byKind: { ...u.byKind },
        refs: u.refs,
      });
    }
    for (const [id, u] of out) {
      const byKind: Record<string, number> = {};
      for (const nodeId of new Set(u.refs.map((x) => x.nodeId))) {
        const kind = u.refs.find((x) => x.nodeId === nodeId)?.nodeKind ?? "node";
        byKind[kind] = (byKind[kind] ?? 0) + 1;
      }
      out.set(id, { ...u, byKind });
    }
    return out;
  }

  /** Assets an actor added since `since` (all sites), for per-key daily limits (§5.6). */
  async uploadStats(actorId: string, since: string): Promise<{ count: number; bytes: number }> {
    const r = await this.#sql.get<{ n: number; b: number }>(
      "SELECT count(*) AS n, coalesce(sum(json_extract(body, '$.bytes')), 0) AS b FROM nodes WHERE kind = 'asset' AND json_extract(body, '$.uploadedBy.id') = ? AND created_at >= ?",
      [actorId, since],
    );
    return { count: r?.n ?? 0, bytes: r?.b ?? 0 };
  }

  // ───────────────────────────── ledger ─────────────────────────────

  async blobState(siteId: string, sha256: string): Promise<BlobLedgerRow | undefined> {
    const r = await this.#sql.get<{
      sha256: string;
      state: BlobLedgerRow["state"];
      bytes: number;
      media_type: string;
      original_sha256: string | null;
      lease_until: string | null;
      purge_reason: string | null;
      purge_legal: number | null;
      purged_by: string | null;
      purged_at: string | null;
    }>("SELECT * FROM media_blobs WHERE site_id = ? AND sha256 = ?", [siteId, sha256]);
    if (!r) return undefined;
    return {
      sha256: r.sha256,
      state: r.state,
      bytes: r.bytes,
      mediaType: r.media_type,
      ...(r.original_sha256 ? { originalSha256: r.original_sha256 } : {}),
      ...(r.lease_until ? { leaseUntil: r.lease_until } : {}),
      ...(r.state === "purged"
        ? {
            purge: {
              reason: r.purge_reason ?? "",
              legal: r.purge_legal === 1,
              by: r.purged_by ?? "",
              at: r.purged_at ?? "",
            },
          }
        : {}),
    };
  }

  /**
   * Takes (or extends) the upload lease on content before bytes are written (§4.5). A new row is
   * `uploading`; a `stored` row keeps its state. `deleting` answers `retry`, `purged` refuses.
   */
  async leaseBlob(
    siteId: string,
    sha256: string,
    until: string,
    meta: { bytes: number; mediaType: string; originalSha256?: string | undefined },
  ): Promise<"uploading" | "stored"> {
    const ts = this.#k.stamp();
    const r = await this.#sql.run(
      `INSERT INTO media_blobs (site_id, sha256, bytes, media_type, original_sha256, state, lease_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'uploading', ?, ?, ?)
       ON CONFLICT (site_id, sha256) DO UPDATE SET lease_until = excluded.lease_until, updated_at = excluded.updated_at
       WHERE media_blobs.state IN ('uploading', 'stored')`,
      [siteId, sha256, meta.bytes, meta.mediaType, meta.originalSha256 ?? null, until, ts, ts],
    );
    const row = await this.blobState(siteId, sha256);
    if (r.changes !== 1 || !row || row.state === "deleting" || row.state === "purged") {
      if (row?.state === "purged")
        throw new InvariantError(
          "purged",
          "this content was taken down on this site and cannot be uploaded again unless a person lifts the takedown",
        );
      throw new InvariantError(
        "retry",
        "this content is being cleaned up right now; try again in a few seconds",
      );
    }
    return row.state;
  }

  /** The bytes are in the blob store: the row becomes `stored` (invariant 3). */
  async markBlobStored(
    siteId: string,
    meta: { sha256: string; bytes: number; mediaType: string; originalSha256?: string | undefined },
  ): Promise<void> {
    const r = await this.#sql.run(
      `UPDATE media_blobs SET state = 'stored', bytes = ?, media_type = ?, original_sha256 = coalesce(original_sha256, ?), updated_at = ?
        WHERE site_id = ? AND sha256 = ? AND state IN ('uploading', 'stored')`,
      [
        meta.bytes,
        meta.mediaType,
        meta.originalSha256 ?? null,
        this.#k.stamp(),
        siteId,
        meta.sha256,
      ],
    );
    if (r.changes !== 1)
      throw new InvariantError("retry", "the upload lost its lease; try again", {
        sha256: meta.sha256,
      });
  }

  /** Once the node exists it holds the content; the lease is no longer needed. */
  async #releaseLease(siteId: string, sha256: string): Promise<void> {
    await this.#sql.run(
      "UPDATE media_blobs SET lease_until = NULL WHERE site_id = ? AND sha256 = ? AND state = 'stored' AND EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'asset' AND key = ?)",
      [siteId, sha256, siteId, sha256],
    );
  }

  async #storedBytes(siteId: string, except: string): Promise<number> {
    const r = await this.#sql.get<{ n: number }>(
      "SELECT coalesce(sum(bytes), 0) AS n FROM media_blobs WHERE site_id = ? AND state IN ('uploading', 'stored') AND sha256 != ?",
      [siteId, except],
    );
    return r?.n ?? 0;
  }

  async #checkQuota(siteId: string, sha256: string, bytes: number): Promise<void> {
    const quota = this.#k.quotaBytes;
    if (quota <= 0) return;
    const used = await this.#storedBytes(siteId, sha256);
    if (used + bytes > quota)
      throw new InvariantError(
        "quota_exceeded",
        `this site's media storage is full (${Math.round(used / 1048576)} of ${Math.round(quota / 1048576)} MB); delete unused files or ask the operator for more space`,
        { used, quota },
      );
  }

  async #refusePurged(siteId: string, hashes: readonly string[]): Promise<void> {
    const row = await this.#sql.get<{ sha256: string }>(
      "SELECT sha256 FROM media_blobs WHERE site_id = ? AND state = 'purged' AND (sha256 IN (SELECT value FROM json_each(?)) OR original_sha256 IN (SELECT value FROM json_each(?))) LIMIT 1",
      [siteId, json(hashes), json(hashes)],
    );
    if (row)
      throw new InvariantError(
        "purged",
        "this content was taken down on this site and cannot be uploaded again unless a person lifts the takedown",
      );
  }

  /** Writes `bytes` under the content key (skipped when the object is already there). */
  async #putBytes(siteId: string, sha256: string, bytes: Uint8Array, mediaType: string) {
    const key = mediaBlobKey(siteId, sha256);
    const head = await this.#k.blobs.head(key);
    if (head && head.size === bytes.byteLength) return;
    await this.#k.blobs.put(key, bytes, { sha256, contentType: mediaType });
  }

  // ───────────────────────────── ingest ─────────────────────────────

  /**
   * The buffered upload path (MCP `upload_asset`/`fetch_asset_url`, imports, REST images): §5.2
   * inspection, takedown and quota checks, dedupe by content, lease → put → stored → node insert.
   */
  async ingestAsset(input: IngestAssetInput): Promise<IngestAssetResult> {
    await this.#site(input.siteId);
    const inspected = await inspectUpload({
      bytes: input.bytes,
      declaredType: input.declaredType,
      filename: input.filename,
      actor: input.uploadedBy.kind,
      keepMetadata: input.keepMetadata,
      maxBytes: input.maxBytes,
      caps: input.caps,
    });
    const hashes = [
      inspected.sha256,
      ...(inspected.originalSha256 ? [inspected.originalSha256] : []),
    ];
    await this.#refusePurged(input.siteId, hashes);
    const existing = await this.getAssetBySha256(input.siteId, inspected.sha256);
    if (existing && existing.storage.kind === "blob") {
      // Idempotent by content; re-store the bytes if a lifted takedown removed them.
      if ((await this.blobState(input.siteId, existing.sha256))?.state !== "stored") {
        await this.#storeBlob(input.siteId, inspected);
      }
      return { asset: existing, existing: true, warnings: inspected.warnings };
    }
    await this.#checkQuota(input.siteId, inspected.sha256, inspected.bytes.byteLength);
    await this.#storeBlob(input.siteId, inspected);
    const fields = input.fields ?? {};
    const source =
      input.source.kind === "upload"
        ? {
            kind: "upload" as const,
            ...(input.filename ? { filename: input.filename.slice(0, 255) } : {}),
          }
        : input.source;
    const { asset, existing: raced } = await this.createAsset({
      siteId: input.siteId,
      kind: inspected.kind,
      mediaType: inspected.mediaType,
      bytes: inspected.bytes.byteLength,
      sha256: inspected.sha256,
      ...(inspected.originalSha256 ? { originalSha256: inspected.originalSha256 } : {}),
      slug: fields.slug ?? slugifyFilename(input.filename, inspected.kind),
      storage: { kind: "blob" },
      ...(inspected.image
        ? {
            image: {
              ...inspected.image,
              ...(fields.image?.blurhash ? { blurhash: fields.image.blurhash } : {}),
              ...(fields.image?.lqip ? { lqip: fields.image.lqip } : {}),
            },
          }
        : {}),
      ...pickFields(fields),
      status: "active",
      uploadedBy: input.uploadedBy,
      source,
    });
    await this.#releaseLease(input.siteId, asset.sha256);
    return { asset, existing: raced, warnings: inspected.warnings };
  }

  async #storeBlob(
    siteId: string,
    inspected: { sha256: string; bytes: Uint8Array; mediaType: string; originalSha256?: string },
  ): Promise<void> {
    const until = new Date(Date.parse(this.#k.stamp()) + LEASE_MS).toISOString();
    const meta = {
      sha256: inspected.sha256,
      bytes: inspected.bytes.byteLength,
      mediaType: inspected.mediaType,
      originalSha256: inspected.originalSha256,
    };
    await this.leaseBlob(siteId, inspected.sha256, until, meta);
    await this.#putBytes(siteId, inspected.sha256, inspected.bytes, inspected.mediaType);
    await this.markBlobStored(siteId, meta);
  }

  /**
   * The streamed path for large non-image files (REST `PUT` of a ticket, §5.5): the declared
   * SHA-256 and size are verified by the blob store before the object is visible, then the first
   * and last bytes are sniffed. Images must use the buffered `ingestAsset` (metadata stripping).
   */
  async ingestAssetStream(input: StreamIngestInput): Promise<IngestAssetResult> {
    await this.#site(input.siteId);
    const cancel = () => input.stream.cancel().catch(() => {});
    if (!/^[0-9a-f]{64}$/.test(input.sha256) || !Number.isInteger(input.size) || input.size <= 0) {
      await cancel();
      throw new InvariantError("invalid_asset", "a streamed upload needs its size and sha256");
    }
    const declared = normalizeMediaType(input.declaredType);
    if (!declared || !MEDIA_TYPES[declared]) {
      await cancel();
      throw new InvariantError("unsupported_type", `${declared ?? "this type"} is not accepted`);
    }
    const info = MEDIA_TYPES[declared];
    if (info.kind === "image") {
      await cancel();
      throw new InvariantError(
        "unsupported_type",
        "images are uploaded through the buffered path, which strips their metadata",
      );
    }
    const cap = Math.min(info.cap, input.caps?.[declared] ?? info.cap, input.maxBytes ?? info.cap);
    if (input.size > cap) {
      await cancel();
      throw new InvariantError("too_large", `${info.label} files may be at most ${cap} bytes`, {
        bytes: input.size,
        limit: cap,
      });
    }
    try {
      await this.#refusePurged(input.siteId, [input.sha256]);
    } catch (e) {
      await cancel();
      throw e;
    }
    const existing = await this.getAssetBySha256(input.siteId, input.sha256);
    if (existing && (await this.blobState(input.siteId, input.sha256))?.state === "stored") {
      await cancel();
      return { asset: existing, existing: true, warnings: [] };
    }
    try {
      await this.#checkQuota(input.siteId, input.sha256, input.size);
    } catch (e) {
      await cancel();
      throw e;
    }
    const until = new Date(Date.parse(this.#k.stamp()) + LEASE_MS).toISOString();
    const meta = { sha256: input.sha256, bytes: input.size, mediaType: declared };
    const before = await this.leaseBlob(input.siteId, input.sha256, until, meta).catch(
      async (e) => {
        await cancel();
        throw e;
      },
    );
    const key = mediaBlobKey(input.siteId, input.sha256);
    const blobs = this.#k.blobs;
    if (blobs.putStream)
      await blobs.putStream(key, input.stream, {
        size: input.size,
        sha256: input.sha256,
        contentType: declared,
      });
    else {
      // Adapters without streaming: buffered, bounded (RFC-0004 §4.1).
      if (input.size > 25 * 1024 * 1024) {
        await cancel();
        throw new InvariantError("too_large", "this storage backend accepts at most 25 MB here");
      }
      const bytes = await readAllBytes(input.stream, input.size);
      await blobs.put(key, bytes, { sha256: input.sha256, contentType: declared });
    }
    // Sniff what was stored: the sniffed type must agree with the declared one.
    const head = await this.#readRange(key, 0, Math.min(4096, input.size));
    const tail = await this.#readRange(key, Math.max(0, input.size - 4), Math.min(4, input.size));
    const s = sniff(head, tail);
    const sniffed =
      s.kind === "type" ? s.mediaType : s.kind === "text" && info.text ? declared : undefined;
    if (sniffed !== declared || (s.kind === "text" && declared.includes("json") && !s.json)) {
      if (before === "uploading") await blobs.delete(key);
      throw new InvariantError(
        s.kind === "type" || s.kind === "text" ? "type_mismatch" : "unsupported_type",
        s.kind === "type"
          ? `this file is ${MEDIA_TYPES[s.mediaType]?.label ?? s.mediaType}, not ${info.label}`
          : `this file is not ${info.label}`,
      );
    }
    await this.markBlobStored(input.siteId, meta);
    if (existing) return { asset: existing, existing: true, warnings: [] };
    const fields = input.fields ?? {};
    const { asset, existing: raced } = await this.createAsset({
      siteId: input.siteId,
      kind: info.kind,
      mediaType: declared,
      bytes: input.size,
      sha256: input.sha256,
      slug: fields.slug ?? slugifyFilename(input.filename, info.kind),
      storage: { kind: "blob" },
      ...pickFields(fields),
      status: "active",
      uploadedBy: input.uploadedBy,
      source:
        input.source.kind === "upload"
          ? {
              kind: "upload",
              ...(input.filename ? { filename: input.filename.slice(0, 255) } : {}),
            }
          : input.source,
    });
    await this.#releaseLease(input.siteId, asset.sha256);
    return { asset, existing: raced, warnings: [] };
  }

  async #readRange(key: string, offset: number, length: number): Promise<Uint8Array> {
    if (length <= 0) return new Uint8Array(0);
    const blobs = this.#k.blobs;
    if (blobs.getStream) {
      const s = await blobs.getStream(key, { range: { offset, length } });
      return s ? readAllBytes(s.body, length) : new Uint8Array(0);
    }
    const all = await blobs.get(key);
    return all ? all.slice(offset, offset + length) : new Uint8Array(0);
  }

  // ───────────────────────────── the node ─────────────────────────────

  async #site(siteId: string): Promise<void> {
    const row = await this.#sql.get("SELECT id FROM nodes WHERE id = ? AND kind = 'site'", [
      siteId,
    ]);
    if (!row) throw new NotFoundError("site", siteId);
  }

  /**
   * Inserts an asset node. Blob assets require their ledger row to be `stored` with the same size
   * and type (invariant 3), and the 16-hex prefix to be free (invariant 2). Same content twice
   * returns the existing asset (`existing: true`).
   */
  async createAsset(input: Creatable<Asset>): Promise<{ asset: Asset; existing: boolean }> {
    const ts = this.#k.stamp();
    const asset = canonicalAsset({
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#k.newId(ID_PREFIX.asset),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    } as Asset);
    assertValid("asset", asset);
    checkAssetRules(asset);
    await this.#site(asset.siteId);
    const guards: Cond[] = [
      {
        sql: "NOT EXISTS (SELECT 1 FROM nodes WHERE site_id = ? AND kind = 'asset' AND key >= ? AND key < ?)",
        params: [asset.siteId, mediaPrefix(asset.sha256), `${mediaPrefix(asset.sha256)}g`],
      },
    ];
    if (asset.storage.kind === "blob")
      guards.push({
        sql: "EXISTS (SELECT 1 FROM media_blobs WHERE site_id = ? AND sha256 = ? AND state = 'stored' AND bytes = ? AND media_type = ?)",
        params: [asset.siteId, asset.sha256, asset.bytes, asset.mediaType],
      });
    const guard: Cond = {
      sql: guards.map((g) => `(${g.sql})`).join(" AND "),
      params: guards.flatMap((g) => g.params),
    };
    const statement = await insertNodeStatement("asset", asset, ts, guard);
    let changes: number;
    try {
      changes = (await this.#sql.run(statement.sql, statement.params ?? [])).changes;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      changes = 0;
    }
    if (changes === 1) return { asset, existing: false };
    const same = await this.getAssetBySha256(asset.siteId, asset.sha256);
    if (same) return { asset: same, existing: true };
    if (await this.getAssetByPrefix(asset.siteId, mediaPrefix(asset.sha256)))
      throw new InvariantError(
        "invalid_asset",
        "another file of this site shares this content's URL prefix",
      );
    const state = await this.blobState(asset.siteId, asset.sha256);
    if (state?.state === "purged")
      throw new InvariantError("purged", "this content was taken down on this site");
    throw new InvariantError(
      "retry",
      state?.state === "deleting"
        ? "this content is being cleaned up right now; try again in a few seconds"
        : "the content is not stored (or its size or type differs); upload it again",
    );
  }

  /** Editable fields only (invariant 5); CAS on `rev`. */
  async updateAsset(a: Asset): Promise<Asset> {
    const stored = await this.#fresh(a);
    for (const f of IMMUTABLE)
      if (canonicalJson(a[f] ?? null) !== canonicalJson(stored[f] ?? null))
        throw new InvariantError(
          "immutable_field",
          f === "status"
            ? "use retire or restore to change an asset's status"
            : `an asset's ${f} cannot change`,
        );
    const keep = stored.image
      ? {
          image: {
            ...a.image,
            width: stored.image.width,
            height: stored.image.height,
            ...(stored.image.animated ? { animated: true as const } : {}),
          },
        }
      : {};
    return this.#write(stored, { ...a, ...keep });
  }

  async retireAsset(a: Asset): Promise<Asset> {
    const stored = await this.#fresh(a);
    return stored.status === "retired"
      ? stored
      : this.#write(stored, { ...stored, status: "retired" });
  }

  async restoreAsset(a: Asset): Promise<Asset> {
    const stored = await this.#fresh(a);
    if (stored.status === "active") return stored;
    if (
      stored.storage.kind === "blob" &&
      (await this.blobState(stored.siteId, stored.sha256))?.state === "purged"
    )
      throw new InvariantError(
        "purged",
        "this asset's content was taken down; lift the takedown first",
      );
    return this.#write(stored, { ...stored, status: "active" });
  }

  /**
   * Removes the node (invariant 9): refused while anything refers to it (`in_use`, with the uses).
   * The bytes stay while a snapshot references them; garbage collection takes the rest later.
   */
  async deleteAsset(a: Asset): Promise<void> {
    const r = await this.#sql.run(
      "DELETE FROM nodes WHERE id = ? AND rev = ? AND kind = 'asset' AND site_id = ? AND NOT EXISTS (SELECT 1 FROM asset_refs WHERE asset_id = ?)",
      [a.id, a.rev, a.siteId, a.id],
    );
    if (r.changes === 1) return;
    const usage = (await this.assetUsage(a.siteId, [a.id])).get(a.id);
    if (usage && usage.total > 0)
      throw new InvariantError(
        "in_use",
        `this file is used in ${usage.total} place(s); remove those uses first`,
        { uses: usage.refs },
      );
    const now = await this.getAsset(a.id);
    throw new ConflictError("asset", a.id, a.rev, now?.rev);
  }

  /** People only: records that an external file's URL produced these bytes (invariant 5 exception). */
  async verifyExternalAsset(a: Asset, result: { sha256: string; bytes: number }): Promise<Asset> {
    const stored = await this.#fresh(a);
    if (stored.storage.kind !== "external")
      throw new InvariantError("invalid_asset", "only external files are verified");
    return this.#write(stored, {
      ...stored,
      sha256: result.sha256,
      bytes: result.bytes,
      storage: { ...stored.storage, checksum: "computed", verifiedAt: this.#k.stamp() },
    });
  }

  async #fresh(a: Asset): Promise<Asset> {
    const stored = await this.getAsset(a.id);
    if (!stored || stored.siteId !== a.siteId) throw new NotFoundError("asset", a.id);
    if (stored.rev !== a.rev) throw new ConflictError("asset", a.id, a.rev, stored.rev);
    return stored;
  }

  async #write(stored: Asset, draft: Asset): Promise<Asset> {
    const next = canonicalAsset({
      ...draft,
      createdAt: stored.createdAt,
      rev: stored.rev + 1,
      updatedAt: this.#k.stamp(),
    });
    assertValid("asset", next);
    checkAssetRules(next);
    const s = await casUpdateStatement("asset", next, stored.rev);
    let changes: number;
    try {
      changes = (await this.#sql.run(s.sql, s.params ?? [])).changes;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new InvariantError("invalid_asset", "another asset of this site has this content");
      throw e;
    }
    if (changes !== 1)
      throw new ConflictError(
        "asset",
        stored.id,
        stored.rev,
        (await this.getAsset(stored.id))?.rev,
      );
    return next;
  }

  // ───────────────────────────── references (§4.4) ─────────────────────────────

  /**
   * Plans a page, entry or term write: canonical ImageRefs (invariant 8), resolution and status
   * checks (6, 7), the guard that keeps them true at write time and the `asset_refs` rewrite.
   */
  async planRefs<T extends RefNode>(
    kind: RefKind,
    siteId: string,
    draft: T,
    stored: T | undefined,
  ): Promise<RefPlan<T>> {
    const node = structuredClone(draft);
    const refs = assetRefsOf(kind, node);
    const before = stored ? assetRefsOf(kind, stored) : [];
    const ids = [...new Set(refs.map((r) => r.assetId))];
    const kept = [...new Set(before.map((r) => r.assetId))];
    const changed = !stored || refsKey(refs) !== refsKey(before);
    const nodeId = (node as { id: string }).id;
    const statements = (hash: string): SqlStatement[] => {
      if (!changed || (refs.length === 0 && !stored)) return [];
      const anchor = "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)";
      const out: SqlStatement[] = [
        {
          sql: `DELETE FROM asset_refs WHERE node_id = ? AND ${anchor}`,
          params: [nodeId, nodeId, hash],
        },
      ];
      if (refs.length > 0)
        out.push({
          sql: `INSERT INTO asset_refs (site_id, asset_id, node_id, node_kind, field)
                SELECT ?, json_extract(value, '$.a'), ?, ?, json_extract(value, '$.f') FROM json_each(?) WHERE ${anchor}`,
          params: [
            siteId,
            nodeId,
            kind,
            json(refs.map((r) => ({ a: r.assetId, f: r.field }))),
            nodeId,
            hash,
          ],
        });
      return out;
    };
    if (ids.length === 0) return { node, statements, diagnose: async () => {} };
    if (ids.length > MEDIA_LIMITS.refsPerNode)
      throw new InvariantError(
        "too_large",
        `a node may refer to at most ${MEDIA_LIMITS.refsPerNode} assets; this one refers to ${ids.length}`,
      );
    const check = async () => {
      const assets = await this.getAssets(siteId, ids);
      const unknown = ids.filter((id) => !assets.has(id));
      if (unknown.length > 0)
        throw new InvariantError(
          "unknown_asset",
          `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not a file of this site`,
          { ids: unknown },
        );
      const retired = ids.filter(
        (id) => assets.get(id)?.status === "retired" && !kept.includes(id),
      );
      if (retired.length > 0)
        throw new InvariantError(
          "retired_asset",
          `${retired.join(", ")} ${retired.length === 1 ? "was" : "were"} retired and cannot be newly used`,
          { ids: retired },
        );
      return assets;
    };
    canonicalImageRefs(kind, node, await check());
    const guard: Cond = {
      sql: "(SELECT count(*) FROM nodes WHERE kind = 'asset' AND site_id = ? AND id IN (SELECT value FROM json_each(?)) AND (json_extract(body, '$.status') = 'active' OR id IN (SELECT value FROM json_each(?)))) = ?",
      params: [siteId, json(ids), json(kept), ids.length],
    };
    return {
      node,
      guard,
      statements,
      diagnose: async () => {
        await check();
      },
    };
  }

  /** Statement that drops a deleted node's references (guarded on the node being gone). */
  dropRefsStatement(nodeId: string): SqlStatement {
    return {
      sql: "DELETE FROM asset_refs WHERE node_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = ?)",
      params: [nodeId, nodeId],
    };
  }

  /** Rebuilds a site's `asset_refs` from its current nodes (sync import, repair). */
  async rebuildRefsStatements(siteId: string): Promise<SqlStatement[]> {
    const rows = await this.#sql.all<{ id: string; kind: string; body: string }>(
      "SELECT id, kind, body FROM nodes WHERE site_id = ? AND kind IN ('page', 'contentEntry', 'term')",
      [siteId],
    );
    return refsRebuild(siteId, rows);
  }

  /** The `snapshot_blobs` rows of a snapshot: the content of every blob asset it captured. */
  snapshotBlobsStatement(
    snapshotId: string,
    siteId: string,
    assetBodies: readonly string[],
  ): SqlStatement | undefined {
    const shas = [
      ...new Set(
        assetBodies
          .map((b) => JSON.parse(b) as Asset)
          .filter((a) => a.storage.kind === "blob")
          .map((a) => a.sha256),
      ),
    ];
    if (shas.length === 0) return undefined;
    return {
      sql: "INSERT OR IGNORE INTO snapshot_blobs (snapshot_id, site_id, sha256) SELECT ?, ?, value FROM json_each(?)",
      params: [snapshotId, siteId, json(shas)],
    };
  }

  /**
   * `auto` mode (§6.3, answer 1): the added assets that ride along with an article change — a new
   * raster image, stored here, uploaded or fetched, used only by articles in the same publish.
   */
  async ridingAssets(
    siteId: string,
    diff: { added: NodeRef[]; changed: { after: NodeRef }[] },
  ): Promise<Set<string>> {
    const added = diff.added.filter((r) => r.kind === "asset").map((r) => r.id);
    if (added.length === 0) return new Set();
    const articles = new Set(
      [...diff.added, ...diff.changed.map((c) => c.after)]
        .filter((r) => r.kind === "contentEntry")
        .map((r) => r.id),
    );
    const assets = await this.getAssets(siteId, added);
    const usage = await this.assetUsage(siteId, added);
    const out = new Set<string>();
    for (const id of added) {
      const a = assets.get(id);
      const refs = usage.get(id)?.refs ?? [];
      if (
        a &&
        a.kind === "image" &&
        a.storage.kind === "blob" &&
        RASTER_TYPES.includes(a.mediaType) &&
        (a.source.kind === "upload" || a.source.kind === "fetch") &&
        refs.length > 0 &&
        refs.every((r) => r.nodeKind === "contentEntry" && articles.has(r.nodeId))
      )
        out.add(id);
    }
    return out;
  }

  // ───────────────────────────── garbage collection (§4.5) ─────────────────────────────

  /**
   * Deletes the bytes of content no asset node, snapshot or upload lease holds, older than the
   * grace period. Each step is one statement: mark `deleting` (conditional), delete the object,
   * drop the row. A crash after the first step is finished by the next run.
   */
  async collectMediaGarbage(
    siteId: string,
    opts: { graceHours?: number; limit?: number; dryRun?: boolean } = {},
  ): Promise<GcResult> {
    const now = this.#k.stamp();
    const grace = new Date(Date.parse(now) - (opts.graceHours ?? 24) * 3_600_000).toISOString();
    const unheld = `state IN ('uploading', 'stored') AND updated_at < ? AND (lease_until IS NULL OR lease_until < ?)
      AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.site_id = media_blobs.site_id AND n.kind = 'asset' AND n.key = media_blobs.sha256)
      AND NOT EXISTS (SELECT 1 FROM snapshot_blobs sb WHERE sb.site_id = media_blobs.site_id AND sb.sha256 = media_blobs.sha256)`;
    const rows = await this.#sql.all<{ sha256: string; state: string }>(
      `SELECT sha256, state FROM media_blobs WHERE site_id = ? AND (state = 'deleting' OR (${unheld})) ORDER BY updated_at LIMIT ?`,
      [siteId, grace, now, Math.min(Math.max(1, opts.limit ?? 100), 1000)],
    );
    if (opts.dryRun) return { collected: rows.map((r) => r.sha256), dryRun: true };
    const collected: string[] = [];
    for (const row of rows) {
      if (row.state !== "deleting") {
        const r = await this.#sql.run(
          `UPDATE media_blobs SET state = 'deleting', updated_at = ? WHERE site_id = ? AND sha256 = ? AND ${unheld}`,
          [now, siteId, row.sha256, grace, now],
        );
        if (r.changes !== 1) continue; // leased or referenced since the scan
      }
      await this.#k.blobs.delete(mediaBlobKey(siteId, row.sha256));
      await this.#sql.run(
        "DELETE FROM media_blobs WHERE site_id = ? AND sha256 = ? AND state = 'deleting'",
        [siteId, row.sha256],
      );
      collected.push(row.sha256);
    }
    return { collected, dryRun: false };
  }

  // ───────────────────────────── takedown (§4.6) ─────────────────────────────

  /**
   * People with the owner role only (the caller checks): the content's bytes are deleted from the
   * blob store and every snapshot's media URL answers 410 (451 when `legal`). The live asset node is
   * retired; the ledger row blocks re-uploads until `liftPurge`. Returns the retired asset.
   */
  async purgeBlob(
    siteId: string,
    sha256: string,
    by: Actor,
    reason: { text: string; legal: boolean },
  ): Promise<{ asset?: Asset }> {
    const key = mediaBlobKey(siteId, sha256);
    const ts = this.#k.stamp();
    const asset = await this.getAssetBySha256(siteId, sha256);
    const statements: SqlStatement[] = [
      {
        sql: `INSERT INTO media_blobs (site_id, sha256, bytes, media_type, state, purge_reason, purge_legal, purged_by, purged_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'purged', ?, ?, ?, ?, ?, ?)
              ON CONFLICT (site_id, sha256) DO UPDATE SET state = 'purged', lease_until = NULL,
                purge_reason = excluded.purge_reason, purge_legal = excluded.purge_legal,
                purged_by = excluded.purged_by, purged_at = excluded.purged_at, updated_at = excluded.updated_at`,
        params: [
          siteId,
          sha256,
          asset?.bytes ?? 0,
          asset?.mediaType ?? "application/octet-stream",
          reason.text.slice(0, 1000),
          reason.legal ? 1 : 0,
          `${by.kind}:${by.id}`,
          ts,
          ts,
          ts,
        ],
      },
    ];
    let retired: Asset | undefined;
    if (asset && asset.status === "active") {
      retired = canonicalAsset({ ...asset, status: "retired", rev: asset.rev + 1, updatedAt: ts });
      statements.push(await casUpdateStatement("asset", retired, asset.rev));
    }
    await this.#sql.batch(statements);
    await this.#k.blobs.delete(key);
    const ids = asset ? [asset.id] : [];
    if (ids.length && this.#k.onMediaPurged) {
      try {
        await this.#k.onMediaPurged(siteId, ids);
      } catch (e) {
        this.#k.onHookError(e);
      }
    }
    const now = asset ? await this.getAsset(asset.id) : undefined;
    return now ? { asset: now } : retired ? { asset: retired } : {};
  }

  /** Allows the content to be uploaded again (the bytes stay gone; the asset stays retired). */
  async liftPurge(siteId: string, sha256: string, _by: Actor): Promise<boolean> {
    const r = await this.#sql.run(
      "DELETE FROM media_blobs WHERE site_id = ? AND sha256 = ? AND state = 'purged'",
      [siteId, sha256],
    );
    return r.changes === 1;
  }

  // ───────────────────────────── upload tickets (§5.5) ─────────────────────────────

  /**
   * The asset that already holds this content: its stored SHA-256, or the SHA-256 of the bytes as
   * uploaded before metadata stripping (`original_sha256`), so a re-dropped photo needs no
   * transfer. Refuses content that was taken down (`purged`).
   */
  async assetForUploadedContent(siteId: string, sha256: string): Promise<Asset | undefined> {
    await this.#refusePurged(siteId, [sha256]);
    const direct = await this.getAssetBySha256(siteId, sha256);
    if (direct) return direct;
    const row = await this.#sql.get<{ body: string }>(
      `SELECT n.body FROM media_blobs b JOIN nodes n ON n.site_id = b.site_id AND n.kind = 'asset' AND n.key = b.sha256
        WHERE b.site_id = ? AND b.original_sha256 = ? AND b.state = 'stored' LIMIT 1`,
      [siteId, sha256],
    );
    return row ? (JSON.parse(row.body) as Asset) : undefined;
  }

  /**
   * Opens one ticket per file, all or none: undefined when the actor would hold more than
   * `maxOpen` open, unexpired tickets (all sites). One batch (AGENTS.md rule 4) that also drops
   * tickets that expired more than a day ago. `o.now` is the caller's clock (the API's).
   */
  async openUploadTickets(
    siteId: string,
    actor: Pick<Actor, "kind" | "id">,
    files: readonly UploadTicketRequest[],
    o: { ttlMs: number; maxOpen: number; now?: Date | undefined },
  ): Promise<UploadTicket[] | undefined> {
    await this.#site(siteId);
    const now = o.now?.toISOString() ?? this.#k.stamp();
    const expiresAt = new Date(Date.parse(now) + o.ttlMs).toISOString();
    const stale = new Date(Date.parse(now) - 24 * 3_600_000).toISOString();
    const tickets: UploadTicket[] = files.map((f) => ({
      id: this.#k.newId(ID_PREFIX.upload),
      siteId,
      actor: { kind: actor.kind, id: actor.id },
      ...(f.sha256 ? { sha256: f.sha256 } : {}),
      bytes: f.bytes,
      mediaType: f.mediaType,
      options: f.options,
      state: "open",
      expiresAt,
      createdAt: now,
    }));
    const ids = json(tickets.map((t) => t.id));
    // Every insert sees the same count (this batch's own rows excluded): all or nothing.
    const guard =
      "(SELECT count(*) FROM media_uploads WHERE actor_kind = ? AND actor_id = ? AND state = 'open' AND expires_at > ? AND id NOT IN (SELECT value FROM json_each(?))) + ? <= ?";
    const statements: SqlStatement[] = [
      { sql: "DELETE FROM media_uploads WHERE expires_at < ?", params: [stale] },
      ...tickets.map((t) => ({
        sql: `INSERT INTO media_uploads (id, site_id, actor_kind, actor_id, sha256, bytes, media_type, options, state, expires_at, created_at)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ? WHERE ${guard}`,
        params: [
          t.id,
          siteId,
          t.actor.kind,
          t.actor.id,
          t.sha256 ?? null,
          t.bytes,
          t.mediaType,
          json(t.options),
          t.expiresAt,
          now,
          actor.kind,
          actor.id,
          now,
          ids,
          tickets.length,
          o.maxOpen,
        ],
      })),
    ];
    const results = await this.#sql.batch(statements);
    const inserted = results.slice(1).reduce((n, r) => n + r.changes, 0);
    return inserted === tickets.length ? tickets : undefined;
  }

  /** Open, unexpired tickets an actor holds (all sites). */
  async openUploadCount(actor: Pick<Actor, "kind" | "id">, now?: Date): Promise<number> {
    const r = await this.#sql.get<{ n: number }>(
      "SELECT count(*) AS n FROM media_uploads WHERE actor_kind = ? AND actor_id = ? AND state = 'open' AND expires_at > ?",
      [actor.kind, actor.id, now?.toISOString() ?? this.#k.stamp()],
    );
    return r?.n ?? 0;
  }

  async getUploadTicket(id: string): Promise<UploadTicket | undefined> {
    const r = await this.#sql.get<{
      id: string;
      site_id: string;
      actor_kind: string;
      actor_id: string;
      sha256: string | null;
      bytes: number;
      media_type: string;
      options: string;
      state: string;
      expires_at: string;
      created_at: string;
    }>("SELECT * FROM media_uploads WHERE id = ?", [id]);
    if (!r) return undefined;
    let options: Record<string, unknown> = {};
    try {
      options = JSON.parse(r.options) as Record<string, unknown>;
    } catch {
      // not written by this code: no options
    }
    return {
      id: r.id,
      siteId: r.site_id,
      actor: { kind: r.actor_kind, id: r.actor_id },
      ...(r.sha256 ? { sha256: r.sha256 } : {}),
      bytes: r.bytes,
      mediaType: r.media_type,
      options,
      state: r.state === "open" ? "open" : "used",
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    };
  }

  /**
   * Uses a ticket up (`open` → `used`, compare-and-set, unexpired): true exactly once per ticket,
   * so a replayed or concurrent upload gets false.
   */
  async claimUploadTicket(id: string, now?: Date): Promise<boolean> {
    const r = await this.#sql.run(
      "UPDATE media_uploads SET state = 'used' WHERE id = ? AND state = 'open' AND expires_at > ?",
      [id, now?.toISOString() ?? this.#k.stamp()],
    );
    return r.changes === 1;
  }

  /** The content's bytes (for verification and static builds); undefined when not stored. */
  async readBlob(siteId: string, sha256: string): Promise<Uint8Array | undefined> {
    const bytes = await this.#k.blobs.get(mediaBlobKey(siteId, sha256));
    return bytes ?? undefined;
  }

  /** Recomputes the SHA-256 of a stored blob (`cloudhal media verify`). */
  async verifyBlob(siteId: string, sha256: string): Promise<"ok" | "missing" | "mismatch"> {
    const bytes = await this.readBlob(siteId, sha256);
    if (!bytes) return "missing";
    return (await sha256OfBytes(bytes)) === sha256 ? "ok" : "mismatch";
  }
}

function pickFields(f: AssetFields): Partial<Asset> {
  return {
    ...(f.title ? { title: f.title } : {}),
    ...(f.alt ? { alt: f.alt } : {}),
    ...(f.caption ? { caption: f.caption } : {}),
    ...(f.credit ? { credit: f.credit } : {}),
    ...(f.license ? { license: f.license } : {}),
    ...(f.decorative ? { decorative: true } : {}),
    ...(f.metadata ? { metadata: f.metadata } : {}),
  };
}

function refsKey(refs: readonly AssetRefUse[]): string {
  return refs.map((r) => `${r.assetId}\t${r.field}`).join("\n");
}

/** `asset_refs` for a whole site from node rows (DELETE + one INSERT). */
export function refsRebuild(
  siteId: string,
  rows: readonly { id: string; kind: string; body: string }[],
): SqlStatement[] {
  const all: { a: string; n: string; k: string; f: string }[] = [];
  for (const r of rows)
    for (const ref of assetRefsOf(r.kind, JSON.parse(r.body)))
      all.push({ a: ref.assetId, n: r.id, k: r.kind, f: ref.field });
  const out: SqlStatement[] = [
    { sql: "DELETE FROM asset_refs WHERE site_id = ?", params: [siteId] },
  ];
  if (all.length > 0)
    out.push({
      sql: `INSERT OR IGNORE INTO asset_refs (site_id, asset_id, node_id, node_kind, field)
            SELECT ?, json_extract(value, '$.a'), json_extract(value, '$.n'), json_extract(value, '$.k'), json_extract(value, '$.f') FROM json_each(?)`,
      params: [siteId, json(all)],
    });
  return out;
}

function encodeCursor(at: string, id: string): string {
  return btoa(`${at}|${id}`).replace(/=+$/, "");
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const [at, id] = atob(cursor).split("|");
    if (at && id && /^[a-z]+_[A-Za-z0-9]{6,32}$/.test(id)) return [at, id];
  } catch {
    // fall through
  }
  throw new InvariantError("invalid_asset", "invalid cursor");
}
