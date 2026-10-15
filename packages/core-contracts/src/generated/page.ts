/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;
/**
 * Editorial lifecycle of a page or content entry.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "PublishStatus".
 */
export type PublishStatus = "draft" | "review" | "published" | "archived";
/**
 * A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Section".
 */
export type Section =
  | HeroSection
  | RichTextSection
  | ImageSection
  | ContentListSection
  | ComponentSection
  | SurfaceSection;
/**
 * The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "BodyProfile".
 */
export type BodyProfile = 1;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.
 *
 * @maxItems 5000
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "BodyBlocks".
 */
export type BodyBlocks = BodyBlock[];
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * A component's id, unique within its surface; `root` is the tree's root (RFC-0020 §1).
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "SurfaceComponentId".
 */
export type SurfaceComponentId = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;

/**
 * A routable page of a site: a path, editorial status and an ordered list of sections. Sections are embedded (not separate nodes) so a page is the unit of locking, snapshotting and diffing.
 */
export interface Page {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * Absolute URL path, starting with '/', no trailing slash except root.
   */
  path: string;
  title: string;
  locale: Locale;
  status: PublishStatus;
  sections: Section[];
  seo?: Seo;
  availability?: Availability;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
export interface HeroSection {
  id: Id;
  kind: "hero";
  heading: string;
  subheading?: string;
  image?: ImageRef;
  cta?: Link;
}
/**
 * Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.
 *
 * This interface was referenced by `Page`'s JSON-Schema
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
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Link".
 */
export interface Link {
  label: string;
  href: string;
  external?: boolean;
}
export interface RichTextSection {
  id: Id;
  kind: "richText";
  format: "markdown" | "html";
  body: string;
  profile?: BodyProfile;
  blocks?: BodyBlocks;
}
/**
 * One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.
 *
 * This interface was referenced by `Page`'s JSON-Schema
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
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
export interface ImageSection {
  id: Id;
  kind: "image";
  image: ImageRef;
  caption?: string;
}
/**
 * Renders the newest entries of a content collection (e.g. blog posts).
 */
export interface ContentListSection {
  id: Id;
  kind: "contentList";
  collection: Slug;
  limit: number;
  sort: "newest" | "oldest" | "title";
  /**
   * Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.
   */
  filter?: string;
}
/**
 * A typed block from the block registry (RFC-0015): `type` names a registered block type (one global namespace of English names), `props` follow that type's props schema, which the store validates.
 */
export interface ComponentSection {
  id: Id;
  kind: "component";
  type: string;
  /**
   * Validated against the type's props schema by the store, not by this contract.
   */
  props: {
    [k: string]: unknown | undefined;
  };
}
/**
 * A generative UI surface (RFC-0020): a flat list of catalog components with a `root`, plus a data model their props may bind to. Written and streamed by agents as data, never code; the store checks the tree, the catalog and the limits.
 */
export interface SurfaceSection {
  id: Id;
  kind: "surface";
  /**
   * The catalog the surface was written for: `<theme>@<major>` (RFC-0018 manifest).
   */
  catalog: string;
  /**
   * @minItems 1
   * @maxItems 200
   */
  components: [SurfaceComponent, ...SurfaceComponent[]];
  /**
   * The surface's data model: JSON its components bind to with `{path}` (at most 64 KB serialized; the store enforces the size).
   */
  data?: {
    [k: string]: unknown | undefined;
  };
}
/**
 * One element of a generative UI surface (RFC-0020 §1), in a flat list: `component` names a catalog entry (a PascalCase built-in primitive such as `Stack`, or a registry block type such as `callout`), `children` refer to other ids of the same surface, and `props` follow the entry's schema, which the store checks. Field names follow A2UI v0.9.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "SurfaceComponent".
 */
export interface SurfaceComponent {
  id: SurfaceComponentId;
  component: string;
  /**
   * @maxItems 200
   */
  children?: SurfaceComponentId[];
  /**
   * Literal values, `{path}` bindings into the surface's data, or `{call}` named functions; validated by the store against the catalog, not by this contract.
   */
  props?: {
    [k: string]: unknown | undefined;
  };
  /**
   * A visibility condition over the surface's data (`eq`, `ne`, `gt`, `lt`, `and`, `or`, `not`); validated by the store.
   */
  visible?: {
    [k: string]: unknown | undefined;
  };
}
/**
 * Search and social metadata of a routable node (page, term archive).
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Seo".
 */
export interface Seo {
  title?: string;
  description?: string;
  noindex?: boolean;
  canonical?: string;
  ogImage?: ImageRef;
}
/**
 * Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Availability".
 */
export interface Availability {
  from?: Timestamp;
  until?: Timestamp;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Page`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
