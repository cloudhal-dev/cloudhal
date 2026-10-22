/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;
/**
 * Editorial lifecycle of a page or content entry.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "PublishStatus".
 */
export type PublishStatus = "draft" | "review" | "published" | "archived";
/**
 * The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "BodyProfile".
 */
export type BodyProfile = 1;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.
 *
 * @maxItems 5000
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "BodyBlocks".
 */
export type BodyBlocks = BodyBlock[];
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * How a page's or entry's text came to be (RFC-0033). 'original' marks the source of a translation group; 'machine-reviewed' is machine output a person has reviewed.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "TranslationMethod".
 */
export type TranslationMethod = "original" | "human" | "machine" | "machine-reviewed";

/**
 * A structured content item in a named collection (e.g. collection 'posts'). Core fields are typed; collection-specific fields live in `fields` and are validated by the collection's own schema in a later phase.
 */
export interface ContentEntry {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  collection: Slug;
  slug: Slug;
  locale: Locale;
  status: PublishStatus;
  title: string;
  summary?: string;
  body: Body;
  /**
   * Collection-specific values, keyed by field. A collection with typed fields (RFC-0041, Site.collections.<key>.fields) checks each value against its definition on write; otherwise any JSON. An absent key means no value.
   */
  fields: {
    [k: string]: unknown | undefined;
  };
  /**
   * @deprecated
   * Deprecated by RFC-0002: use `terms.tag`. Still accepted on input for one release and translated into terms; the store then writes []. Removed in schemaVersion 2.
   *
   * @maxItems 50
   */
  tags: Slug[];
  /**
   * Term assignments by taxonomy key (e.g. 'category', 'tag'). Terms are referenced by id, independent of locale. A taxonomy without terms is omitted, never an empty object.
   */
  terms?: {
    [k: string]: TermAssignment | undefined;
  };
  author: Actor;
  coverImage?: ImageRef;
  publishedAt?: Timestamp;
  availability?: Availability;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  translation?: Translation;
  metadata?: Metadata;
  /**
   * Corrections, clarifications and updates appended to the entry, oldest first (RFC-0019 §2). The store stamps `at`; an item that has been live can no longer be removed, and only a person may edit its note.
   *
   * @maxItems 100
   */
  corrections?: Correction[];
}
/**
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Body".
 */
export interface Body {
  format: "markdown" | "html";
  value: string;
  profile?: BodyProfile;
  blocks?: BodyBlocks;
}
/**
 * One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "BodyBlock".
 */
export interface BodyBlock {
  /**
   * Stable across writes that keep the block's content or its place among unchanged blocks.
   */
  id: string;
  /**
   * SHA-256 (hex) of the block's markdown without trailing whitespace.
   */
  hash: string;
  by?: Actor;
  /**
   * The channel of that change.
   */
  via?: "studio" | "mcp" | "api" | "import" | "ai-command" | "proposal";
  at?: Timestamp;
}
/**
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
/**
 * Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "TermAssignment".
 */
export interface TermAssignment {
  /**
   * @minItems 1
   * @maxItems 50
   */
  ids: [Id, ...Id[]];
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  primary?: string;
}
/**
 * Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "ImageRef".
 */
export interface ImageRef {
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  assetId?: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
}
/**
 * Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Availability".
 */
export interface Availability {
  from?: Timestamp;
  until?: Timestamp;
}
/**
 * Links a page or entry to the other language versions of the same work (RFC-0033 §2). Staleness is computed: the source's current hash differs from source.hash.
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Translation".
 */
export interface Translation {
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  group: string;
  method: TranslationMethod;
  /**
   * linked: the original's structural changes propagate to this translation as drafts (RFC-0033 §4a); independent: nothing propagates. Absent means linked.
   */
  layout?: "linked" | "independent";
  /**
   * The node and revision this translation was made from. Absent on the original.
   */
  source?: {
    id: Id;
    /**
     * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
     */
    siteId?: string;
    locale: Locale;
    rev: Revision;
    /**
     * Lower-case hex SHA-256 of the source node's canonical JSON at that revision.
     */
    hash: string;
  };
  /**
   * The machine-translation record: engine, glossary revision, checks run, quality score. Required when method is machine or machine-reviewed.
   */
  provenance?: {
    engine: string;
    glossaryRev?: Revision;
    score?: number;
    /**
     * @maxItems 50
     */
    checks?: string[];
    at: Timestamp;
  };
  /**
   * The person who reviewed this translation and when. Only humans set it.
   */
  review?: {
    by: Actor;
    at: Timestamp;
  };
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
/**
 * One correction notice (RFC-0019 §2).
 *
 * This interface was referenced by `ContentEntry`'s JSON-Schema
 * via the `definition` "Correction".
 */
export interface Correction {
  id: Id;
  kind: "correction" | "clarification" | "update";
  /**
   * RFC 3339 / ISO 8601 instant in UTC.
   */
  at: string;
  /**
   * What changed, in markdown (inline).
   */
  note: string;
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  snapshotId?: string;
}
