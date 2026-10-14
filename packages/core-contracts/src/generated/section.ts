/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.
 */
export type Section = HeroSection | RichTextSection | ImageSection | ContentListSection;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 */
export type Id = string;
/**
 * The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies.
 */
export type BodyProfile = 1;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 */
export type Timestamp = string;
/**
 * A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.
 *
 * @maxItems 5000
 */
export type BodyBlocks = BodyBlock[];
/**
 * Lower-case URL segment.
 */
export type Slug = string;

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
