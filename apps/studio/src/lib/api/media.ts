/** The media library. */
import type { Asset } from "@cloudhal/core-contracts";
import { json, query, request } from "./http.ts";

// ---- media library (RFC-0004 §6.1, packages/api/src/routes/assets.ts) -------------------------

/** One row of `GET /assets`: the asset, its site-relative URL (live once published), its uses. */
export interface AssetListItem {
  asset: Asset;
  url: string;
  usage: number;
}

export interface AssetListPage {
  assets: AssetListItem[];
  nextCursor?: string;
}

export interface AssetListQuery {
  kind?: Asset["kind"][] | undefined;
  status?: Asset["status"][] | undefined;
  q?: string | undefined;
  unused?: boolean | undefined;
  missingAlt?: boolean | undefined;
  uploadedBy?: "human" | "agent" | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** Where an asset is used: the node, the slot and (when it still exists) its title and path. */
export interface AssetUse {
  nodeId: string;
  nodeKind: string;
  field: string;
  title?: string;
  path?: string;
  status?: string;
}

export interface AssetDetail extends AssetListItem {
  /** Public checksum file (`<url>.sha256`), live once published. */
  checksumUrl?: string;
  uses: AssetUse[];
  blob?: {
    state: "uploading" | "stored" | "deleting" | "purged";
    purge?: { reason: string; legal: boolean; by: string; at: string };
  };
  /** The caller may edit the details: their own upload, or `asset:manage`. */
  editable: boolean;
}

/** Editable fields of `PUT /assets/:id`; a field set to `null` is removed. */
export interface AssetPatch {
  title?: Record<string, string> | null;
  alt?: Record<string, string> | null;
  caption?: Record<string, string> | null;
  credit?: string | null;
  license?: Asset["license"] | null;
  decorative?: boolean;
  slug?: string;
  /** RFC-0028: an image's focal point (0–1 from the top-left), or null to clear it. */
  focal?: { x: number; y: number } | null;
}

/** One file of `POST /assets/uploads` (RFC-0004 §5.5). */
export interface UploadFileRequest {
  filename: string;
  bytes: number;
  mediaType: string;
  sha256?: string;
  keepMetadata?: boolean;
  image?: { blurhash?: string; lqip?: string; color?: string };
  /** In the site's default locale (or `locale`). */
  alt?: string;
  decorative?: boolean;
  title?: string;
  locale?: string;
}

/** What the server answered for one file, in request order. */
export type UploadTicket =
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

/** The answer of the streamed `PUT` (201 new, 200 already in the library). */
export interface UploadResult extends AssetListItem {
  existing: boolean;
  /** `gps` / `metadata-kept` when a person kept the photo's metadata. */
  warnings: string[];
}

const assetPath = (siteId: string, id: string) =>
  `/api/sites/${siteId}/assets/${encodeURIComponent(id)}`;

/** The media library (RFC-0004 §6.1). Bytes go up only through `lib/uploads.ts` with a ticket. */
export const mediaApi = {
  list: (siteId: string, q: AssetListQuery = {}) =>
    request<AssetListPage>(
      `/api/sites/${siteId}/assets${query({
        kind: q.kind?.join(","),
        status: q.status?.join(","),
        q: q.q?.trim() || undefined,
        unused: q.unused ? 1 : undefined,
        missingAlt: q.missingAlt ? 1 : undefined,
        uploadedBy: q.uploadedBy,
        cursor: q.cursor,
        limit: q.limit,
      })}`,
    ),
  get: (siteId: string, id: string) => request<AssetDetail>(assetPath(siteId, id)),
  update: (asset: Asset, patch: AssetPatch) =>
    request<Asset>(assetPath(asset.siteId, asset.id), {
      method: "PUT",
      ...json({ rev: asset.rev, ...patch }),
    }),
  retire: (asset: Asset) =>
    request<Asset>(`${assetPath(asset.siteId, asset.id)}/retire`, {
      method: "POST",
      ...json({ rev: asset.rev }),
    }),
  restore: (asset: Asset) =>
    request<Asset>(`${assetPath(asset.siteId, asset.id)}/restore`, {
      method: "POST",
      ...json({ rev: asset.rev }),
    }),
  remove: (asset: Asset) =>
    request<void>(`${assetPath(asset.siteId, asset.id)}?rev=${asset.rev}`, {
      method: "DELETE",
    }),
  /** Takedown (Owner): the bytes go from every snapshot; the URL answers 410 (451 when legal). */
  purge: (asset: Asset, input: { reason: string; legal: boolean }) =>
    request<{ asset: Asset; status: 410 | 451 }>(`${assetPath(asset.siteId, asset.id)}/purge`, {
      method: "POST",
      ...json(input),
    }),
  /** Lets the same bytes be uploaded again after a takedown (Owner). */
  liftPurge: (siteId: string, sha256: string) =>
    request<{ lifted: boolean; asset?: Asset }>(
      `/api/sites/${siteId}/media/${encodeURIComponent(sha256)}/lift-purge`,
      { method: "POST", ...json({}) },
    ),
  /** Step 1 of an upload: signed, single-use tickets (at most 20 files per request). */
  requestUploads: (siteId: string, files: UploadFileRequest[]) =>
    request<{ files: UploadTicket[] }>(`/api/sites/${siteId}/assets/uploads`, {
      method: "POST",
      ...json({ files }),
    }),
  /**
   * Studio's own, session-authenticated copy of the bytes (drafts included). With the file's hash
   * (`v`, its first 16 hex digits) the browser keeps it for a day instead of asking again.
   */
  contentUrl: (siteId: string, id: string, sha256?: string) =>
    `${assetPath(siteId, id)}/content${sha256 ? `?v=${sha256.slice(0, 16)}` : ""}`,
};
