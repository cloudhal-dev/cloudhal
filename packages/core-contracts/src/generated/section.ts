/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.
 */
export type Section =
  | HeroSection
  | RichTextSection
  | ImageSection
  | ContentListSection
  | ComponentSection
  | SurfaceSection;
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
/**
 * A component's id, unique within its surface; `root` is the tree's root (RFC-0020 §1).
 */
export type SurfaceComponentId = string;

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
  /**
   * RFC-0042: conditions on the collection's list fields, ANDed.
   *
   * @minItems 1
   * @maxItems 4
   */
  where?:
    | [FieldCondition]
    | [FieldCondition, FieldCondition]
    | [FieldCondition, FieldCondition, FieldCondition]
    | [FieldCondition, FieldCondition, FieldCondition, FieldCondition];
  orderBy?: FieldOrder;
}
/**
 * RFC-0042: one condition on a typed field of the listed collection. `value` is read by the field's type: a number, YYYY-MM-DD, an RFC 3339 instant, true/false, an option value, or `now`. `values` only with `in`.
 */
export interface FieldCondition {
  /**
   * A field key (site.schema.json FieldKey's pattern, repeated).
   */
  field: string;
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "set" | "unset";
  value?: string;
  /**
   * @minItems 1
   * @maxItems 20
   */
  values?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
/**
 * RFC-0042: order a listing by a number, date or datetime field. Entries without a value sort last.
 */
export interface FieldOrder {
  /**
   * A field key (site.schema.json FieldKey's pattern, repeated).
   */
  field: string;
  direction: "asc" | "desc";
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
  /**
   * Motion presets for this component (RFC-0024 §2): `reveal`, `hover`, `speed`, `delay`, `stagger`, `replay` and later `scroll`, `loop`; enums and clamped numbers only, validated by the store against the catalog. The renderer turns them into CSS; agents never write CSS.
   */
  motion?: {
    [k: string]: unknown | undefined;
  };
}
