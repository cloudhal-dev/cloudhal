/**
 * The media library over REST (RFC-0004 §5.5, §6.1; people — agents use the MCP asset tools).
 *
 * - `GET /assets` lists with filters and a cursor, `GET /assets/:id` adds where it is used,
 *   `GET /assets/:id/content` serves the bytes privately for Studio's previews (drafts included).
 * - Uploads are two steps: `POST /assets/uploads` opens single-use, signed tickets (≤ 20 files per
 *   request, ≤ 50 open per actor, 15 minutes), then one streamed `PUT /assets/uploads/:id` per
 *   file runs the `@cloudhal/core-ts/media` pipeline through the store's ingest functions.
 * - `PUT /assets/:id` edits metadata (own uploads with `asset:upload`, any with `asset:manage`),
 *   retire/restore/delete need `asset:manage`, takedown and lifting it are the Owner's.
 *
 * Every change writes one audit row (`asset.*`, §6.3); REST writes by people take no snapshot.
 */

import { holds } from "@cloudhal/agent-runtime";
import type { Actor, Asset, Site } from "@cloudhal/core-contracts";
import { InvariantError, termName, type UploadTicket } from "@cloudhal/core-ts";
import {
  assetUrl,
  formatBytes,
  MEDIA_TYPES,
  mediaExtension,
  mediaPath,
  mediaTypeFromFilename,
  normalizeMediaType,
} from "@cloudhal/core-ts/media";
import { BlobIntegrityError, readAllBytes, sha256OfBytes } from "@cloudhal/storage";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { actorOf, requireSite } from "../governance.ts";
import { personOf } from "../own.ts";
import { param } from "../params.ts";
import { signUploadTicket, verifyUploadTicket } from "../uploads.ts";
import { contentHeaders } from "./asset-content-headers.ts";

/** RFC-0004 §5.1: per request, per actor and per ticket. */
export const UPLOAD_LIMITS = {
  filesPerRequest: 20,
  openPerActor: 50,
  ticketMinutes: 15,
} as const;

const KINDS = new Set<Asset["kind"]>(["image", "video", "audio", "document", "data", "other"]);
const STATUSES = new Set<Asset["status"]>(["active", "retired"]);
const SHA256 = /^[0-9a-f]{64}$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLURHASH = /^[0-9A-Za-z#$%*+,.:;=?@^_{|}~[\]-]{6,100}$/;
const LQIP = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const SPDX = /^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$/;
const HTTPS = /^https:\/\/[^\s\\/?#@]+(?:[/?#][^\s\\]*)?$/;

/** One row of `GET /assets`. */
export interface AssetListItem {
  asset: Asset;
  /** Site-relative media URL (live once published), or the external URL. */
  url: string;
  /** Distinct nodes that use it. */
  usage: number;
}

/** Where an asset is used (`GET /assets/:id`). */
export interface AssetUse {
  nodeId: string;
  nodeKind: string;
  /** The slot: `coverImage`, `seo.ogImage`, `sections.sec_….image`, `body`, `labels.tr.description`… */
  field: string;
  title?: string;
  /** Page path, article path or the term's taxonomy, for display. */
  path?: string;
  status?: string;
}

/** `GET /assets/:id`. */
export interface AssetDetail extends AssetListItem {
  checksumUrl?: string;
  uses: AssetUse[];
  /** The content's ledger state (blob assets): `purged` after a takedown, with its reason. */
  blob?: {
    state: "uploading" | "stored" | "deleting" | "purged";
    purge?: { reason: string; legal: boolean; by: string; at: string };
  };
  /** May the caller edit this asset's details (own upload or `asset:manage`)? */
  editable: boolean;
}

/** Per file of `POST /assets/uploads`, in request order. */
export type UploadTicketResult =
  | { index: number; filename: string; existing: AssetListItem }
  | {
      index: number;
      filename: string;
      uploadId: string;
      url: string;
      method: "PUT";
      headers: Record<string, string>;
      expiresAt: string;
    }
  | { index: number; filename: string; error: { code: string; message: string } };

/** Thrown for one file of a ticket request; the other files still get tickets. */
class FileProblem extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** A file name without path separators or control characters (kept for search only). */
function cleanFilename(name: unknown): string {
  const clean = [...(typeof name === "string" ? name : "")]
    .filter(
      (ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f && ch !== "/" && ch !== "\\",
    )
    .join("")
    .trim()
    .slice(0, 255);
  return clean || "file";
}

function text(v: unknown, field: string, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new FileProblem("invalid", `${field} must be text`);
  const t = v.trim();
  if (t.length > max) throw new FileProblem("invalid", `${field} may be at most ${max} characters`);
  return t || undefined;
}

function license(v: unknown): Asset["license"] | undefined {
  if (v === undefined || v === null) return undefined;
  if (
    isRecord(v) &&
    v.kind === "spdx" &&
    typeof v.id === "string" &&
    SPDX.test(v.id) &&
    v.id.length <= 200
  )
    return { kind: "spdx", id: v.id };
  if (
    isRecord(v) &&
    v.kind === "url" &&
    typeof v.url === "string" &&
    HTTPS.test(v.url) &&
    v.url.length <= 2048
  ) {
    const name =
      typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 200) : undefined;
    return { kind: "url", url: v.url, ...(name ? { name } : {}) };
  }
  throw new FileProblem(
    "invalid",
    "license must be {kind: spdx, id} (e.g. CC-BY-4.0) or {kind: url, url: https://…}",
  );
}

function placeholders(
  v: unknown,
): { blurhash?: string; lqip?: string; color?: string } | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isRecord(v)) throw new FileProblem("invalid", "image must be {blurhash?, lqip?, color?}");
  const out: { blurhash?: string; lqip?: string; color?: string } = {};
  if (v.blurhash !== undefined) {
    if (typeof v.blurhash !== "string" || !BLURHASH.test(v.blurhash))
      throw new FileProblem("invalid", "image.blurhash is not a BlurHash");
    out.blurhash = v.blurhash;
  }
  if (v.lqip !== undefined) {
    if (typeof v.lqip !== "string" || !LQIP.test(v.lqip) || v.lqip.length > 4096)
      throw new FileProblem("invalid", "image.lqip must be a small raster data: URL");
    out.lqip = v.lqip;
  }
  if (v.color !== undefined) {
    if (typeof v.color !== "string" || !/^#[0-9a-f]{6}$/.test(v.color))
      throw new FileProblem("invalid", "image.color must be a lower-case #rrggbb colour");
    out.color = v.color;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The fields a ticket carries to the new asset (per-locale texts in `locale`). */
interface TicketOptions {
  filename: string;
  keepMetadata?: true;
  fields: {
    alt?: Record<string, string>;
    title?: Record<string, string>;
    caption?: Record<string, string>;
    credit?: string;
    license?: Asset["license"];
    decorative?: true;
    image?: { blurhash?: string; lqip?: string; color?: string };
  };
}

/** Validates one file of a ticket request (§5.1, §5.5); throws `FileProblem`. */
function checkFile(
  raw: unknown,
  site: Site,
  actor: Actor,
): { request: { sha256?: string; bytes: number; mediaType: string }; options: TicketOptions } {
  if (!isRecord(raw)) throw new FileProblem("invalid", "each file must be an object");
  const filename = cleanFilename(raw.filename);
  const bytes = raw.bytes;
  if (!Number.isInteger(bytes) || (bytes as number) <= 0)
    throw new FileProblem("invalid", "bytes must be the file's size in bytes");
  const declared = normalizeMediaType(
    typeof raw.mediaType === "string" ? raw.mediaType : undefined,
  );
  const byName = mediaTypeFromFilename(filename);
  const mediaType =
    declared && declared !== "application/octet-stream" && declared !== "text/plain"
      ? declared
      : byName;
  const info = mediaType ? MEDIA_TYPES[mediaType] : undefined;
  if (!mediaType || !info)
    throw new FileProblem(
      "unsupported_type",
      /\.hei[cf]$/i.test(filename)
        ? "HEIC photos are not accepted (browsers can't show them); convert to JPEG first"
        : `${declared ?? "this file type"} is not accepted (images: JPEG, PNG, WebP, AVIF, GIF, SVG; video: MP4, WebM; audio: MP3, M4A, Ogg, WAV; PDF; data: CSV, TSV, JSON, NDJSON, Parquet)`,
    );
  if (byName && byName !== mediaType)
    throw new FileProblem(
      "type_mismatch",
      `the file name says ${MEDIA_TYPES[byName]?.label ?? byName} but the type says ${info.label}`,
    );
  if ((bytes as number) > info.cap)
    throw new FileProblem(
      "too_large",
      `${info.label} files may be at most ${formatBytes(info.cap)}; this one is ${formatBytes(bytes as number)}`,
    );
  if (info.peopleOnly && actor.kind !== "human")
    throw new FileProblem("unsupported_type", `only people may upload ${info.label} files`);
  let sha256: string | undefined;
  if (raw.sha256 !== undefined) {
    if (typeof raw.sha256 !== "string" || !SHA256.test(raw.sha256))
      throw new FileProblem("invalid", "sha256 must be 64 lower-case hex characters");
    sha256 = raw.sha256;
  }
  // Images are buffered (metadata stripping); everything else streams and needs its checksum.
  if (info.kind !== "image" && !sha256)
    throw new FileProblem(
      "checksum_required",
      `${info.label} files stream to storage, which verifies them against the SHA-256 you send; add sha256`,
    );
  const locale =
    typeof raw.locale === "string" && LOCALE.test(raw.locale) ? raw.locale : site.defaultLocale;
  const at = (v: string): Record<string, string> => ({ [locale]: v });
  const alt = text(raw.alt, "alt", 500);
  const decorative = raw.decorative === true;
  if (info.kind === "image" && !alt && !decorative)
    throw new FileProblem(
      "alt_required",
      "images need alt text (what the image shows, for screen readers) or decorative: true",
    );
  const title = text(raw.title, "title", 300);
  const caption = text(raw.caption, "caption", 1000);
  const credit = text(raw.credit, "credit", 300);
  const lic = license(raw.license);
  const image = info.kind === "image" ? placeholders(raw.image) : undefined;
  const keep = raw.keepMetadata === true && actor.kind === "human" && info.kind === "image";
  return {
    request: { ...(sha256 ? { sha256 } : {}), bytes: bytes as number, mediaType },
    options: {
      filename,
      ...(keep ? { keepMetadata: true as const } : {}),
      fields: {
        ...(alt ? { alt: at(alt) } : {}),
        ...(title ? { title: at(title) } : {}),
        ...(caption ? { caption: at(caption) } : {}),
        ...(credit ? { credit } : {}),
        ...(lic ? { license: lic } : {}),
        ...(decorative ? { decorative: true as const } : {}),
        ...(image ? { image } : {}),
      },
    },
  };
}

function listItem(asset: Asset, usage: number): AssetListItem {
  return { asset, url: assetUrl(asset), usage };
}

async function loadAsset(c: Context<Env>): Promise<Asset> {
  const asset = await c.get("store").getAsset(param(c, "assetId"));
  if (!asset || asset.siteId !== param(c, "siteId")) throw notFound("file not found");
  return asset;
}

/** Own upload (the caller, or an agent of the caller's) or `asset:manage` (RFC-0005 table). */
async function mayEdit(c: Context<Env>, asset: Asset): Promise<boolean> {
  const principal = c.get("principal");
  if (!principal || holds(principal.scopes, "asset:manage")) return true;
  if (asset.uploadedBy.kind === principal.actor.kind && asset.uploadedBy.id === principal.actor.id)
    return true;
  const person = personOf(c);
  return !!person && (await c.get("ownership").personOf(asset.uploadedBy)) === person;
}

function atRev(asset: Asset, rev: unknown): Asset {
  if (!Number.isInteger(rev)) throw badRequest("rev is required (the revision you edited)");
  return { ...asset, rev: rev as number };
}

async function jsonObject(c: Context<Env>): Promise<Record<string, unknown>> {
  const body = (await c.req.json().catch(() => undefined)) as unknown;
  if (!isRecord(body)) throw badRequest("the body must be a JSON object");
  return body;
}

/** One audit row per change (§6.3): `input.effect.asset` needs no migration. */
async function audit(
  c: Context<Env>,
  tool: string,
  asset: Asset,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await c.get("audit")?.record({
    at: c.get("now")().toISOString(),
    actor: actorOf(c),
    siteId: asset.siteId,
    tool,
    decision: "allow",
    outcome: "ok",
    reason,
    input: {
      assetId: asset.id,
      ...extra,
      effect: {
        asset: {
          id: asset.id,
          sha256: asset.sha256,
          bytes: asset.bytes,
          mediaType: asset.mediaType,
          source: asset.source,
        },
      },
    },
  });
}

function assetName(asset: Asset, locale: string): string {
  return (
    asset.title?.[locale] ??
    Object.values(asset.title ?? {})[0] ??
    (asset.source.kind === "upload" ? asset.source.filename : undefined) ??
    `${asset.slug}.${mediaExtension(asset.mediaType)}`
  );
}

/** Where an asset is used, with each node's title and path (Studio's "Used by" list). */
async function usesOf(c: Context<Env>, asset: Asset, locale: string): Promise<AssetUse[]> {
  const store = c.get("store");
  const usage = (await store.assetUsage(asset.siteId, [asset.id])).get(asset.id);
  const out: AssetUse[] = [];
  for (const ref of usage?.refs ?? []) {
    const use: AssetUse = { ...ref };
    if (ref.nodeKind === "contentEntry") {
      const e = await store.getContentEntry(ref.nodeId);
      if (e)
        Object.assign(use, {
          title: e.title,
          path: `/${e.collection}/${e.slug}`,
          status: e.status,
        });
    } else if (ref.nodeKind === "page") {
      const p = await store.getPage(ref.nodeId);
      if (p) Object.assign(use, { title: p.title, path: p.path, status: p.status });
    } else if (ref.nodeKind === "term") {
      const t = await store.getTerm(ref.nodeId);
      if (t) Object.assign(use, { title: termName(t, locale), status: t.status });
    } else if (ref.nodeKind === "site") {
      // RFC-0025: the brand's logo, on every page.
      const s = await store.getSite(ref.nodeId);
      if (s) Object.assign(use, { title: s.name, path: "/" });
    }
    out.push(use);
  }
  return out;
}

/** Counts bytes while streaming; errors once the stream carries more than `size`. */
function limited(body: ReadableStream<Uint8Array>, size: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > size) controller.error(new BlobIntegrityError(`more than ${size} bytes`));
        else controller.enqueue(chunk);
      },
    }),
  );
}

const sizeMismatch = (declared: number) =>
  apiError(
    400,
    "size_mismatch",
    `the upload must be exactly the ${declared} bytes declared when the upload was requested`,
    { bytes: declared },
  );

/** Maps the pipeline's refusals onto upload statuses (a file over its cap is 413). */
function uploadError(e: unknown, ticket: UploadTicket): never {
  if (e instanceof InvariantError && e.code === "too_large")
    throw apiError(413, "too_large", e.message, e.details);
  if (e instanceof BlobIntegrityError)
    throw /bytes|size|longer|shorter/i.test(e.message)
      ? sizeMismatch(ticket.bytes)
      : apiError(400, "checksum_mismatch", "the file does not match the SHA-256 declared for it");
  throw e;
}

export const assets: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const list = <T extends string>(raw: string | undefined, allowed: Set<T>, name: string) => {
      if (!raw) return undefined;
      const values = raw.split(",").map((s) => s.trim()) as T[];
      for (const v of values) if (!allowed.has(v)) throw badRequest(`unknown ${name} ${v}`);
      return values;
    };
    const kind = list(c.req.query("kind"), KINDS, "kind");
    const status = list(c.req.query("status"), STATUSES, "status");
    const flag = (name: string) => ["1", "true"].includes(c.req.query(name) ?? "");
    const uploadedBy = c.req.query("uploadedBy");
    if (uploadedBy && uploadedBy !== "human" && uploadedBy !== "agent")
      throw badRequest("uploadedBy must be human or agent");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    if (limit !== undefined && !(Number.isInteger(limit) && limit > 0))
      throw badRequest("limit must be a positive whole number");
    const q = (c.req.query("q") ?? "").slice(0, 200);
    const page = await store.listAssets(site.id, {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(q.trim() ? { query: q } : {}),
      ...(flag("unused") ? { unused: true } : {}),
      ...(flag("missingAlt") ? { missingAlt: true } : {}),
      ...(uploadedBy ? { uploadedBy: uploadedBy as "human" | "agent" } : {}),
      ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") as string } : {}),
      ...(limit ? { limit } : {}),
    });
    const usage = await store.assetUsage(
      site.id,
      page.assets.map((a) => a.id),
    );
    return c.json({
      assets: page.assets.map((a) => listItem(a, usage.get(a.id)?.total ?? 0)),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    });
  })

  // ───────────────────────────── upload (§5.5) ─────────────────────────────

  .post("/uploads", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    // Signed in (the route guard), or the API's own actor on a server without auth (local tools).
    const actor = actorOf(c);
    const body = await jsonObject(c);
    const files = body.files;
    if (!Array.isArray(files) || files.length === 0)
      throw badRequest("files must list the files to upload");
    if (files.length > UPLOAD_LIMITS.filesPerRequest)
      throw apiError(
        400,
        "too_many_files",
        `at most ${UPLOAD_LIMITS.filesPerRequest} files per request; send the rest afterwards`,
        { limit: UPLOAD_LIMITS.filesPerRequest },
      );
    const results: (UploadTicketResult | undefined)[] = [];
    const wanted: { index: number; request: ReturnType<typeof checkFile> }[] = [];
    for (const [index, raw] of files.entries()) {
      const filename = cleanFilename(isRecord(raw) ? raw.filename : undefined);
      try {
        const request = checkFile(raw, site, actor);
        // Dedupe before transfer: content the site already has needs no upload.
        if (request.request.sha256) {
          const existing = await store.assetForUploadedContent(site.id, request.request.sha256);
          if (existing) {
            const usage =
              (await store.assetUsage(site.id, [existing.id])).get(existing.id)?.total ?? 0;
            results[index] = { index, filename, existing: listItem(existing, usage) };
            continue;
          }
        }
        wanted.push({ index, request });
      } catch (e) {
        if (!(e instanceof FileProblem || e instanceof InvariantError)) throw e;
        results[index] = { index, filename, error: { code: e.code, message: e.message } };
      }
    }
    if (wanted.length > 0) {
      const now = c.get("now")();
      const tickets = await store.openUploadTickets(
        site.id,
        actor,
        wanted.map((w) => ({
          ...w.request.request,
          options: w.request.options as unknown as Record<string, unknown>,
        })),
        { ttlMs: UPLOAD_LIMITS.ticketMinutes * 60_000, maxOpen: UPLOAD_LIMITS.openPerActor, now },
      );
      if (!tickets) {
        const open = await store.openUploadCount(actor, now);
        throw apiError(
          429,
          "too_many_uploads",
          `you have ${open} uploads waiting; at most ${UPLOAD_LIMITS.openPerActor} may be open at once — finish them or wait ${UPLOAD_LIMITS.ticketMinutes} minutes`,
          { open, limit: UPLOAD_LIMITS.openPerActor },
        );
      }
      const secret = c.get("uploadSecret");
      for (const [i, ticket] of tickets.entries()) {
        const w = wanted[i] as (typeof wanted)[number];
        const sig = await signUploadTicket(secret, ticket);
        results[w.index] = {
          index: w.index,
          filename: w.request.options.filename,
          uploadId: ticket.id,
          url: `/api/sites/${site.id}/assets/uploads/${ticket.id}?sig=${sig}`,
          method: "PUT",
          headers: { "content-type": ticket.mediaType },
          expiresAt: ticket.expiresAt,
        };
      }
    }
    return c.json({ files: results }, 201);
  })
  .put("/uploads/:uploadId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    // Signed in (the route guard), or the API's own actor on a server without auth (local tools).
    const actor = actorOf(c);
    const ticket = await store.getUploadTicket(param(c, "uploadId"));
    if (!ticket || ticket.siteId !== site.id) throw notFound("upload not found");
    // The same person (session or key) that asked for it: a leaked URL alone is useless.
    if (ticket.actor.kind !== actor.kind || ticket.actor.id !== actor.id)
      throw apiError(403, "not_your_upload", "this upload was requested by someone else");
    if (!(await verifyUploadTicket(c.get("uploadSecret"), ticket, c.req.query("sig"))))
      throw apiError(403, "bad_signature", "this upload link is not valid; request a new one");
    const now = c.get("now")();
    if (ticket.state !== "open")
      throw apiError(410, "upload_used", "this upload link was already used; request a new one");
    if (Date.parse(ticket.expiresAt) <= now.getTime())
      throw apiError(410, "upload_expired", "this upload link has expired; request a new one");
    if (Number(c.req.header("content-length")) !== ticket.bytes) throw sizeMismatch(ticket.bytes);
    const body = c.req.raw.body;
    if (!body) throw sizeMismatch(ticket.bytes);
    // Single use: claimed before any byte is read, so a replay (or a race) gets 410.
    if (!(await store.claimUploadTicket(ticket.id, now)))
      throw apiError(410, "upload_used", "this upload link was already used; request a new one");

    const options = ticket.options as unknown as TicketOptions;
    const info = MEDIA_TYPES[ticket.mediaType];
    const common = {
      siteId: site.id,
      declaredType: ticket.mediaType,
      filename: options.filename,
      uploadedBy: actor,
      source: { kind: "upload" as const },
      fields: options.fields ?? {},
    };
    let result: Awaited<ReturnType<typeof store.ingestAsset>>;
    try {
      if (info?.kind === "image") {
        // Images are buffered (≤ 20 MB) so their metadata can be stripped (§5.3).
        const bytes = await readAllBytes(limited(body, ticket.bytes), ticket.bytes);
        if (bytes.byteLength !== ticket.bytes) throw sizeMismatch(ticket.bytes);
        if (ticket.sha256 && (await sha256OfBytes(bytes)) !== ticket.sha256)
          throw apiError(
            400,
            "checksum_mismatch",
            "the file does not match the SHA-256 declared for it",
          );
        result = await store.ingestAsset({
          ...common,
          bytes,
          keepMetadata: options.keepMetadata === true && actor.kind === "human",
          maxBytes: info.cap,
        });
      } else {
        result = await store.ingestAssetStream({
          ...common,
          stream: limited(body, ticket.bytes),
          size: ticket.bytes,
          sha256: ticket.sha256 ?? "",
        });
      }
    } catch (e) {
      uploadError(e, ticket);
    }
    const { asset, existing, warnings } = result;
    if (!existing)
      await audit(c, "asset.upload", asset, `${options.filename} (${formatBytes(asset.bytes)})`, {
        uploadId: ticket.id,
        ...(asset.originalSha256 ? { metadataStripped: true } : {}),
      });
    const usage = existing
      ? ((await store.assetUsage(site.id, [asset.id])).get(asset.id)?.total ?? 0)
      : 0;
    return c.json({ ...listItem(asset, usage), existing, warnings }, existing ? 200 : 201);
  })

  // ───────────────────────────── one asset ─────────────────────────────

  .get("/:assetId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const asset = await loadAsset(c);
    const uses = await usesOf(c, asset, site.defaultLocale);
    const blob =
      asset.storage.kind === "blob" ? await store.blobState(site.id, asset.sha256) : undefined;
    const detail: AssetDetail = {
      ...listItem(asset, new Set(uses.map((u) => u.nodeId)).size),
      ...(asset.storage.kind === "blob" ? { checksumUrl: `${mediaPath(asset)}.sha256` } : {}),
      uses,
      ...(blob
        ? { blob: { state: blob.state, ...(blob.purge ? { purge: blob.purge } : {}) } }
        : {}),
      editable: await mayEdit(c, asset),
    };
    return c.json(detail);
  })
  .get("/:assetId/content", async (c) => {
    const store = c.get("store");
    const asset = await loadAsset(c);
    if (asset.storage.kind === "external") return c.redirect(asset.storage.url, 302);
    const state = await store.blobState(asset.siteId, asset.sha256);
    if (state?.state === "purged")
      throw apiError(410, "purged", "this file was taken down; its bytes are gone");
    const headers = contentHeaders(asset, c.req.query("v") || undefined);
    if (c.req.header("if-none-match") === headers.etag) return c.body(null, 304, headers);
    const key = `media/${asset.siteId}/${asset.sha256}`;
    const blobs = store.blobs;
    if (blobs.getStream) {
      const s = await blobs.getStream(key);
      if (!s) throw notFound("the file's bytes are not stored");
      return c.body(s.body, 200, { ...headers, "content-length": String(s.size) });
    }
    const bytes = await blobs.get(key);
    if (!bytes) throw notFound("the file's bytes are not stored");
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, headers);
  })
  .put("/:assetId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const asset = await loadAsset(c);
    if (!(await mayEdit(c, asset)))
      throw apiError(
        403,
        "not_own",
        "your role lets you edit the files you uploaded; an Editor edits everyone's",
      );
    const b = await jsonObject(c);
    const next: Asset & Record<string, unknown> = { ...atRev(asset, b.rev) };
    const changed: string[] = [];
    const localeMap = (
      v: unknown,
      field: string,
      max: number,
    ): Record<string, string> | undefined => {
      if (v === null) return undefined;
      if (!isRecord(v)) throw badRequest(`${field} must be an object of texts per locale`);
      const out: Record<string, string> = {};
      for (const [locale, value] of Object.entries(v)) {
        if (!LOCALE.test(locale)) throw badRequest(`${field}: ${locale} is not a locale`);
        if (value === null || value === "") continue;
        if (typeof value !== "string" || value.length > max)
          throw badRequest(`${field}.${locale} must be text of at most ${max} characters`);
        if (value.trim()) out[locale] = value.trim();
      }
      return Object.keys(out).length ? out : undefined;
    };
    const set = (field: string, value: unknown) => {
      if (value === undefined) delete next[field];
      else next[field] = value;
      changed.push(field);
    };
    if (b.title !== undefined) set("title", localeMap(b.title, "title", 300));
    if (b.alt !== undefined) set("alt", localeMap(b.alt, "alt", 500));
    if (b.caption !== undefined) set("caption", localeMap(b.caption, "caption", 1000));
    if (b.credit !== undefined) {
      if (b.credit !== null && typeof b.credit !== "string")
        throw badRequest("credit must be text");
      const credit = typeof b.credit === "string" ? b.credit.trim().slice(0, 300) : "";
      set("credit", credit || undefined);
    }
    if (b.license !== undefined) {
      try {
        set("license", license(b.license));
      } catch (e) {
        if (e instanceof FileProblem) throw badRequest(e.message);
        throw e;
      }
    }
    if (b.decorative !== undefined) {
      if (typeof b.decorative !== "boolean") throw badRequest("decorative must be true or false");
      set("decorative", b.decorative ? true : undefined);
    }
    if (b.slug !== undefined) {
      if (typeof b.slug !== "string" || !SLUG.test(b.slug) || b.slug.length > 128)
        throw badRequest(
          "slug must be lower-case words joined by hyphens (the file name in the URL)",
        );
      set("slug", b.slug);
    }
    if (b.image !== undefined && asset.image) {
      try {
        const p = placeholders(b.image) ?? {};
        // Placeholders are replaced; what the server measured (size, animation, transparency)
        // and the focal point stay.
        const { blurhash: _b, lqip: _l, color: _c, ...kept } = asset.image;
        next.image = { ...kept, ...p };
        changed.push("image");
      } catch (e) {
        if (e instanceof FileProblem) throw badRequest(e.message);
        throw e;
      }
    }
    // RFC-0028: where the subject is; cover crops keep it in view. null clears it.
    if (b.focal !== undefined) {
      const image = (next.image ?? asset.image) as Asset["image"];
      if (!image) {
        if (b.focal !== null) throw badRequest("only images have a focal point");
      } else if (b.focal === null) {
        const { focal: _f, ...rest } = image;
        next.image = rest;
      } else {
        const { focal: _f, ...rest } = image;
        const f = b.focal;
        const ok = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
        if (!isRecord(f) || !ok(f.x) || !ok(f.y))
          throw badRequest("focal must be {x, y}, each from 0 to 1 (from the top-left)");
        const r = (v: number) => Math.round(v * 1000) / 1000;
        next.image = { ...rest, focal: { x: r(f.x), y: r(f.y) } };
      }
      changed.push("focal");
    }
    // Images say what they show, or that they are decorative (RFC-0004 §5.6, §8).
    if (
      next.kind === "image" &&
      !next.decorative &&
      !(next.alt as Record<string, string> | undefined)?.[site.defaultLocale]
    )
      throw apiError(
        422,
        "alt_required",
        `images need alt text in ${site.defaultLocale} (what the image shows, for screen readers), or mark them decorative`,
      );
    const saved = await store.updateAsset(next);
    await audit(c, "asset.update", saved, changed.length ? changed.join(", ") : "no change");
    return c.json(saved);
  })
  .post("/:assetId/retire", async (c) => {
    const site = await requireSite(c);
    const asset = await loadAsset(c);
    const b = await jsonObject(c);
    const saved = await c.get("store").retireAsset(atRev(asset, b.rev));
    await audit(c, "asset.retire", saved, assetName(saved, site.defaultLocale));
    return c.json(saved);
  })
  .post("/:assetId/restore", async (c) => {
    const site = await requireSite(c);
    const asset = await loadAsset(c);
    const b = await jsonObject(c);
    const saved = await c.get("store").restoreAsset(atRev(asset, b.rev));
    await audit(c, "asset.restore", saved, assetName(saved, site.defaultLocale));
    return c.json(saved);
  })
  .delete("/:assetId", async (c) => {
    const site = await requireSite(c);
    const asset = await loadAsset(c);
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    try {
      await c.get("store").deleteAsset({ ...asset, rev });
    } catch (e) {
      if (e instanceof InvariantError && e.code === "in_use") {
        const uses = await usesOf(c, asset, site.defaultLocale);
        throw apiError(409, "in_use", e.message, { uses });
      }
      throw e;
    }
    await audit(c, "asset.delete", asset, assetName(asset, site.defaultLocale));
    return c.body(null, 204);
  })
  .post("/:assetId/purge", async (c) => {
    const site = await requireSite(c);
    const asset = await loadAsset(c);
    if (asset.storage.kind !== "blob")
      throw badRequest("this file is linked, not stored here: edit or delete the link instead");
    const b = await jsonObject(c);
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!reason) throw badRequest("reason is required: say why the file is taken down");
    if (reason.length > 1000) throw badRequest("reason may be at most 1000 characters");
    const legal = b.legal === true;
    const result = await c
      .get("store")
      .purgeBlob(site.id, asset.sha256, actorOf(c), { text: reason, legal });
    await audit(c, "asset.purge", result.asset ?? asset, reason, { legal, sha256: asset.sha256 });
    return c.json({ asset: result.asset ?? asset, status: legal ? 451 : 410 });
  });

/** `POST /media/:sha256/lift-purge` (Owner): the same bytes may be uploaded again (§4.6). */
export const siteMedia: Hono<Env> = new Hono<Env>().post("/:sha256/lift-purge", async (c) => {
  const store = c.get("store");
  const site = await requireSite(c);
  const sha256 = param(c, "sha256");
  if (!SHA256.test(sha256)) throw badRequest("sha256 must be 64 lower-case hex characters");
  const lifted = await store.liftPurge(site.id, sha256, actorOf(c));
  const asset = await store.getAssetBySha256(site.id, sha256);
  if (lifted)
    await c.get("audit")?.record({
      at: c.get("now")().toISOString(),
      actor: actorOf(c),
      siteId: site.id,
      tool: "asset.lift-purge",
      decision: "allow",
      outcome: "ok",
      reason: asset ? assetName(asset, site.defaultLocale) : sha256,
      input: { sha256, ...(asset ? { assetId: asset.id } : {}) },
    });
  return c.json({ lifted, ...(asset ? { asset } : {}) });
});
