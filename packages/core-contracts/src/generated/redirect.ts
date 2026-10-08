/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Redirect`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Redirect`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Redirect`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Redirect`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;

/**
 * An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002).
 */
export interface Redirect {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site; never a path the site currently serves.
   */
  from: string;
  /**
   * Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected.
   */
  to: string;
  /**
   * 301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects.
   */
  status: 301 | 302;
  /**
   * exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2).
   */
  match: "exact" | "prefix";
  reason: "slug-change" | "merge" | "retire" | "manual";
  source?: RedirectSource;
  note?: string;
  rev: Revision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Metadata;
}
/**
 * The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.
 *
 * This interface was referenced by `Redirect`'s JSON-Schema
 * via the `definition` "RedirectSource".
 */
export interface RedirectSource {
  kind: "page" | "contentEntry" | "term";
  id: Id;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Redirect`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
