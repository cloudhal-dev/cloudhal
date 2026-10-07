/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Lower-case URL segment.
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Slug".
 */
export type Slug = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;

/**
 * Top-level ownership boundary. A project belongs to one owner (human or organisation) and groups one or more sites. In Cloud it maps to a tenant.
 */
export interface Project {
  schemaVersion: SchemaVersion;
  id: Id;
  name: string;
  slug: Slug;
  ownerId: Id;
  siteIds: Id[];
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
