/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "AssetStorage".
 */
export type AssetStorage = BlobStorage | ExternalStorage;
/**
 * Terms the asset may be reused under: an SPDX license expression or a license URL.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "AssetLicense".
 */
export type AssetLicense = SpdxLicense | UrlLicense;
/**
 * Absolute https URL without credentials, whitespace or backslashes.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "HttpsUrl".
 */
export type HttpsUrl = string;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * How the asset came in. Immutable after create.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "AssetSource".
 */
export type AssetSource = UploadSource | FetchSource | ImportSource | LinkSource;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;
/**
 * Lower-case hex SHA-256 digest.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Sha256".
 */
export type Sha256 = string;

/**
 * A media file of a site (image, video, audio, document, data) as a graph node: its bytes are identified by SHA-256 and stored once per site in the blob store under a content-addressed key, or kept elsewhere (`storage.kind: external`, e.g. a Zenodo or Hugging Face file). Pages, entries and terms refer to it by id (`ImageRef.assetId`, markdown `asset:<id>`). Snapshotted like every node, so a deleted asset's bytes stay while any snapshot references it (RFC-0004).
 */
export interface Asset {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * What the file is, derived from the sniffed media type (never chosen by the client). `other` is allowed for external storage only.
   */
  kind: "image" | "video" | "audio" | "document" | "data" | "other";
  /**
   * MIME type of the stored bytes as sniffed by the server (RFC 6838, lower case, no parameters), e.g. image/webp, text/csv. Served as Content-Type.
   */
  mediaType: string;
  /**
   * Size of the stored bytes. For external files: the size the source reports or the uploader declares.
   */
  bytes: number;
  /**
   * SHA-256 of the stored bytes (lower-case hex): the blob key, the public URL prefix, the ETag and the checksum shown with downloads. Unique per site. For external files see `storage.checksum`.
   */
  sha256: string;
  /**
   * SHA-256 of the bytes as uploaded, present only when the server changed them (image metadata stripping).
   */
  originalSha256?: string;
  /**
   * File name in the public URL, without extension: /media/<sha256[0..16]>/<slug>.<ext>. May change; the old URL then answers 301 to the new one.
   */
  slug: string;
  storage: AssetStorage;
  image?: AssetImage;
  /**
   * Display title per locale (download lists, library search).
   */
  title?: {
    [k: string]: string | undefined;
  };
  /**
   * Alternative text per locale. An `ImageRef.alt` that is not empty overrides it for one use.
   */
  alt?: {
    [k: string]: string | undefined;
  };
  /**
   * The image carries no information and renders with alt="". Absent means false; the store never writes false.
   */
  decorative?: boolean;
  /**
   * Caption per locale (plain text), the default for figures that show this asset.
   */
  caption?: {
    [k: string]: string | undefined;
  };
  /**
   * Who made it, as shown next to it (e.g. 'Photo: Ayşe Yılmaz').
   */
  credit?: string;
  license?: AssetLicense;
  /**
   * active: listed and pickable. retired: hidden from the library and pickers and cannot be newly referenced; existing references keep rendering.
   */
  status: "active" | "retired";
  uploadedBy: Actor;
  source: AssetSource;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
export interface BlobStorage {
  kind: "blob";
}
export interface ExternalStorage {
  kind: "external";
  /**
   * Direct download URL of the file.
   */
  url: string;
  /**
   * Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset).
   */
  landingPage?: string;
  /**
   * How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).
   */
  checksum: "computed" | "declared";
  /**
   * When the URL last produced bytes with this SHA-256 (checksum `computed`).
   */
  verifiedAt?: string;
}
/**
 * Intrinsic size and placeholders of an image. Present for every image stored as a blob.
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "AssetImage".
 */
export interface AssetImage {
  width: number;
  height: number;
  /**
   * Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false.
   */
  animated?: boolean;
  /**
   * BlurHash of the image for themes that decode it client-side.
   */
  blurhash?: string;
  /**
   * Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.
   */
  lqip?: string;
  /**
   * RFC-0028: the image's dominant colour, lower-case #rrggbb. Painted under the placeholder and in color-fill bars.
   */
  color?: string;
  /**
   * RFC-0028: the image may have transparent pixels (read from its header at ingest). Absent means opaque; transparent images never show the LQIP.
   */
  alpha?: true;
  /**
   * RFC-0028: where the subject is, from the top-left corner as fractions of the width and height. Cover crops keep it in view.
   */
  focal?: {
    x: number;
    y: number;
  };
}
export interface SpdxLicense {
  kind: "spdx";
  /**
   * SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.
   */
  id: string;
}
export interface UrlLicense {
  kind: "url";
  url: HttpsUrl;
  name?: string;
}
/**
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
/**
 * Bytes uploaded by a person (REST) or an agent (MCP upload_asset).
 */
export interface UploadSource {
  kind: "upload";
  /**
   * Original file name as sent (never used as a storage key or served).
   */
  filename?: string;
}
/**
 * Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.
 */
export interface FetchSource {
  kind: "fetch";
  url: HttpsUrl;
  fetchedAt: Timestamp;
}
/**
 * Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).
 */
export interface ImportSource {
  kind: "import";
  /**
   * The reference it was imported from: a URL or a site path.
   */
  from: string;
  importer?: Slug;
}
/**
 * An external file registered by URL without copying its bytes (storage.kind external).
 */
export interface LinkSource {
  kind: "link";
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Asset`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
