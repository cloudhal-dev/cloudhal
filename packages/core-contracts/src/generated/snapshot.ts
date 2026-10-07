/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;

/**
 * Immutable record of a site's node set at one instant: which nodes existed, at which revision, with which content hash. Every mutation by an agent produces one; publish and rollback point the site at one. Node bodies are stored by hash in the blob store, not here.
 */
export interface Snapshot {
  schemaVersion: SchemaVersion;
  id: Id;
  siteId: Id;
  /**
   * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
   */
  parentId?: string;
  siteRev: Revision;
  reason: "manual" | "agentMutation" | "publish" | "rollback" | "scheduled" | "import";
  label?: string;
  actor: Actor;
  nodes: NodeRef[];
  summary: ChangeSummary;
  createdAt: Timestamp;
  metadata?: Metadata;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "NodeRef".
 */
export interface NodeRef {
  id: Id;
  kind: "site" | "page" | "contentEntry";
  rev: Revision;
  /**
   * Lower-case hex SHA-256 of the node's canonical JSON.
   */
  hash: string;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "ChangeSummary".
 */
export interface ChangeSummary {
  added: number;
  changed: number;
  removed: number;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
