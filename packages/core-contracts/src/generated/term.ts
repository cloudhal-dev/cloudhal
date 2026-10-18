/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;

/**
 * One concept in a taxonomy (a category, a tag, a series). Content refers to terms by id, independent of locale; names, synonyms, archive intro and SEO are per locale. Renames, merges and retirements keep the id and leave redirects behind; `proposedBy` records the actor that proposed it (RFC-0002).
 */
export interface Term {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  taxonomyId: Id;
  /**
   * URL segment of the term's archive; unique within its taxonomy, together with every slug in any term's slugHistory.
   */
  slug: string;
  /**
   * active: usable and public (subject to visibility). proposed: created by an agent, waiting for a person; assignable but never public. retired: no new assignments, no archive.
   */
  status: "active" | "proposed" | "retired";
  /**
   * internal terms have no archive, feed or sitemap entry and are not shown on entries; themes and filters may still use them.
   */
  visibility: "public" | "internal";
  /**
   * Names per locale. Must contain the site's default locale.
   */
  labels: {
    [k: string]: TermLabel | undefined;
  };
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  parentId?: string;
  /**
   * Order among sibling terms (same taxonomy and parent), lowest first, for menus and sidebars. Terms without a position follow, by name.
   */
  position?: number;
  image?: ImageRef;
  /**
   * Profile links shown with the term and given to search engines as sameAs, such as an author's pages elsewhere (RFC-0019 §1).
   *
   * @maxItems 10
   */
  links?:
    | []
    | [Link]
    | [Link, Link]
    | [Link, Link, Link]
    | [Link, Link, Link, Link]
    | [Link, Link, Link, Link, Link]
    | [Link, Link, Link, Link, Link, Link]
    | [Link, Link, Link, Link, Link, Link, Link]
    | [Link, Link, Link, Link, Link, Link, Link, Link]
    | [Link, Link, Link, Link, Link, Link, Link, Link, Link]
    | [Link, Link, Link, Link, Link, Link, Link, Link, Link, Link];
  /**
   * Earlier slugs, oldest first. Old slugs stay reserved in the taxonomy and still resolve when an agent assigns by slug.
   *
   * @minItems 1
   * @maxItems 50
   */
  slugHistory?: [Slug, ...Slug[]];
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  mergedInto?: string;
  proposedBy?: Actor;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "TermLabel".
 */
export interface TermLabel {
  name: string;
  /**
   * This locale's archive slug (RFC-0033); absent uses the term's slug. Never set for the site's default locale, whose slug is the term's own; unique per taxonomy and locale.
   */
  slug?: string;
  /**
   * Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.
   *
   * @minItems 1
   * @maxItems 50
   */
  altNames?: [string, ...string[]];
  /**
   * Markdown introduction shown at the top of the archive.
   */
  description?: string;
  /**
   * A short role or title shown with the term, such as an author's "Senior reporter" (RFC-0019 §1).
   */
  role?: string;
  seo?: Seo;
}
/**
 * Search and social metadata of a routable node (page, term archive).
 *
 * This interface was referenced by `Term`'s JSON-Schema
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
 * Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.
 *
 * This interface was referenced by `Term`'s JSON-Schema
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
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Link".
 */
export interface Link {
  label: string;
  href: string;
  external?: boolean;
}
/**
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Term`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
