/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Path".
 */
export type Path = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * BCP 47 language tag, e.g. en, tr, en-US.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Locale".
 */
export type Locale = string;

/**
 * A classification scheme of a site (e.g. 'category', 'tag', 'series') and its rules: hierarchy, who may create terms, how many terms an entry takes, and how its archives are published. Terms are separate nodes (term.schema.json) that point here by id (RFC-0002).
 */
export interface Taxonomy {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * Stable name of the taxonomy, unique per site and immutable once created. ContentEntry.terms and filter expressions use it (e.g. 'category:news').
   */
  key: string;
  /**
   * Display names per locale. Must contain the site's default locale.
   */
  labels: {
    [k: string]: TaxonomyLabel | undefined;
  };
  /**
   * Terms may have a parent term (categories). Flat when false (tags).
   */
  hierarchical: boolean;
  /**
   * Who may add terms. none: people only. propose: agents may create terms with status 'proposed' that wait for a person. free: agents may create active terms.
   */
  allowNewTerms: "none" | "propose" | "free";
  /**
   * An entry in review or published status must have at least one term of this taxonomy and an explicit primary term.
   */
  required: boolean;
  /**
   * Most terms of this taxonomy one entry may carry. Absent: the contract limit of 50.
   */
  maxPerEntry?: number;
  /**
   * Collections this taxonomy applies to. Absent: every collection.
   *
   * @minItems 1
   * @maxItems 50
   */
  collections?: [Slug, ...Slug[]];
  archive: TaxonomyArchive;
  /**
   * Publish an RSS feed per term at <archive.basePath>/<slug>/rss.xml. Requires archive.enabled.
   */
  feed: boolean;
  /**
   * Archives listing fewer published entries than this are served with robots 'noindex, follow' and left out of the sitemap.
   */
  minEntriesToIndex: number;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "TaxonomyLabel".
 */
export interface TaxonomyLabel {
  singular: string;
  plural: string;
  description?: string;
}
/**
 * Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "TaxonomyArchive".
 */
export interface TaxonomyArchive {
  enabled: boolean;
  basePath: Path;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Taxonomy`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
