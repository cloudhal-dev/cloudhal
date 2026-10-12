/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

/**
 * Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "SchemaVersion".
 */
export type SchemaVersion = 1;
/**
 * A release id: `rel_` and 6 to 32 letters or digits.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseId".
 */
export type ReleaseId = string;
/**
 * Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * One pinned change, discriminated by `kind`.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseItem".
 */
export type ReleaseItem = ReleaseSetItem | ReleaseRemoveItem;
/**
 * Kinds of graph node a release may carry. The site node is never one of them.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseNodeKind".
 */
export type ReleaseNodeKind =
  "page" | "contentEntry" | "taxonomy" | "term" | "redirect" | "menu" | "asset";
/**
 * Monotonic per-node revision used for optimistic locking (compare-and-swap on write).
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "Revision".
 */
export type Revision = number;
/**
 * When the release runs, discriminated by `kind`. Absent while a draft has no time yet.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseWhen".
 */
export type ReleaseWhen = ReleaseAt | ReleaseOnApproval;
/**
 * RFC 3339 / ISO 8601 instant in UTC.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "TimeZone".
 */
export type TimeZone = string;
/**
 * A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "LocalDateTime".
 */
export type LocalDateTime = string;
/**
 * Lifecycle. `draft`: proposed or being assembled, nothing locked. `awaiting_approval`: waiting for a person; its nodes are locked. `scheduled`: approved (or allowed by `auto` mode) and locked until it runs. `running`: claimed by the scheduler. `published`: applied; `outcome` names the snapshot. `conflict`: a pinned node or its live base changed; held, nothing published. `missed`: the scheduler reached it more than an hour late; nothing published. `expired`: no valid approval at its time. `failed`: refused at run time (e.g. a dependency is missing). `canceled`: withdrawn.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseState".
 */
export type ReleaseState =
  | "draft"
  | "awaiting_approval"
  | "scheduled"
  | "running"
  | "published"
  | "conflict"
  | "missed"
  | "expired"
  | "failed"
  | "canceled";
/**
 * `rl1:` and the lower-case hex SHA-256 of the release's canonical item lines (site id, then one line per item sorted by node id: kind, node id, target and base versions). The prefix keeps it apart from the graph state hash and from comment bindings (`cm1:`); approvals store it as their state.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseHash".
 */
export type ReleaseHash = string;
/**
 * Why the release may run, discriminated by `kind`.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseApproval".
 */
export type ReleaseApproval = ReleasePersonApproval | ReleaseAutoApproval;
/**
 * Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ActorKind".
 */
export type ActorKind = "human" | "agent" | "system";
/**
 * What happened when the release was due, discriminated by `kind` (it matches the terminal `state`).
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseOutcome".
 */
export type ReleaseOutcome =
  | ReleasePublishedOutcome
  | ReleaseConflictOutcome
  | ReleaseFailedOutcome
  | ReleaseMissedOutcome
  | ReleaseExpiredOutcome
  | ReleaseCanceledOutcome;

/**
 * A scheduled content change set (RFC-0008): node versions pinned by id, rev and content hash, applied on top of whatever is live at the release's time. A single scheduled publish is a one-item release. Each item records the version that was live when the release was pinned (`base`); if a pinned node or its live base changed before the release runs, the release is held as a conflict instead of overwriting anything. A person's approval is bound to `hash` (`rl1:`), which digests the items only, so a person may move an approved release without re-approving it while an agent's move or any content change voids the approval. Releases live in D1 next to the graph; they are not graph nodes, never enter a snapshot and are not part of site bundles.
 */
export interface Release {
  schemaVersion: SchemaVersion;
  id: ReleaseId;
  siteId: Id;
  /**
   * Optional name shown in Studio ("Election night"). A one-item release without a title is shown under its entry's or page's title.
   */
  title?: string;
  /**
   * The pinned changes, at most one per node. A release never contains the site node: site settings, domains and structure are published the ordinary way.
   *
   * @minItems 1
   * @maxItems 100
   */
  items: [ReleaseItem, ...ReleaseItem[]];
  when?: ReleaseWhen;
  state: ReleaseState;
  hash: ReleaseHash;
  approval?: ReleaseApproval;
  outcome?: ReleaseOutcome;
  createdBy: Actor;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rev: Revision;
  metadata?: Metadata;
}
/**
 * Make `target` the live version of the node. `base` is the version that was live when the item was pinned; absent when the node was not live (a new entry or page).
 */
export interface ReleaseSetItem {
  kind: "set";
  nodeId: Id;
  nodeKind: ReleaseNodeKind;
  target: ReleaseNodeVersion;
  base?: ReleaseNodeVersion;
}
/**
 * One version of a node: its revision and the SHA-256 of its canonical JSON, whose body the blob store keeps under `nodes/<hash>.json`.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseNodeVersion".
 */
export interface ReleaseNodeVersion {
  rev: Revision;
  hash: string;
}
/**
 * Take the node out of the live snapshot. `base` is the live version that is removed.
 */
export interface ReleaseRemoveItem {
  kind: "remove";
  nodeId: Id;
  nodeKind: ReleaseNodeKind;
  base: ReleaseNodeVersion;
}
/**
 * At an instant. `at` is what the scheduler compares with the clock; when a person entered a wall-clock time, `localTime` keeps it and `at` is recomputed from it and `timeZone` before the release runs, never earlier than the wall-clock time.
 */
export interface ReleaseAt {
  kind: "at";
  at: Timestamp;
  timeZone: TimeZone;
  localTime?: LocalDateTime;
}
/**
 * As soon as it is approved (a gate-only change such as setting an expiry on live content, or "publish when approved").
 */
export interface ReleaseOnApproval {
  kind: "on-approval";
}
/**
 * A person approved these items (bound to `hash`) for `executeAt`, either by deciding an agent's request (`approvalId`) or by scheduling it themselves. The person's rights are checked again when the release runs.
 */
export interface ReleasePersonApproval {
  kind: "person";
  by: ReleasePerson;
  at: Timestamp;
  executeAt?: Timestamp;
  approvalId?: Id;
}
/**
 * A staff person (`user_…`). Agents never appear here.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleasePerson".
 */
export interface ReleasePerson {
  id: string;
  name?: string;
}
/**
 * An agent key in `auto` mode scheduled a low-risk release without a person (ADR-0015). Valid only while the release runs before `windowEnds`: the end of the key's elevation, or 24 hours after scheduling, whichever comes first.
 */
export interface ReleaseAutoApproval {
  kind: "auto";
  by: Actor;
  keyId: string;
  at: Timestamp;
  windowEnds: Timestamp;
}
/**
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  kind: ActorKind;
  id: Id;
  name?: string;
}
/**
 * Applied: `snapshotId` is the new live snapshot (reason `scheduled`), composed from `baseSnapshotId` and the items. `purge` says how the edge cache followed.
 */
export interface ReleasePublishedOutcome {
  kind: "published";
  runId: Id;
  at: Timestamp;
  snapshotId: Id;
  baseSnapshotId: Id;
  latenessSeconds: number;
  purge: "tags" | "everything" | "deferred" | "failed" | "none";
}
/**
 * Held: these nodes changed since the release was pinned. Nothing was published.
 */
export interface ReleaseConflictOutcome {
  kind: "conflict";
  runId?: Id;
  at: Timestamp;
  /**
   * @minItems 1
   * @maxItems 100
   */
  conflicts: [ReleaseConflict, ...ReleaseConflict[]];
}
/**
 * A node whose live version was not the pinned base when the release ran. `expected` absent: the node was not expected to be live; `found` absent: it was not live.
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "ReleaseConflict".
 */
export interface ReleaseConflict {
  nodeId: Id;
  expected?: ReleaseNodeVersion;
  found?: ReleaseNodeVersion;
}
/**
 * Refused at run time; nothing was published.
 */
export interface ReleaseFailedOutcome {
  kind: "failed";
  runId?: Id;
  at: Timestamp;
  code:
    | "dependency_missing"
    | "invalid_snapshot"
    | "site_missing"
    | "node_body_missing"
    | "store_error";
  message?: string;
}
/**
 * The scheduler reached the release more than an hour after its time; nothing was published. A person may publish it now.
 */
export interface ReleaseMissedOutcome {
  kind: "missed";
  at: Timestamp;
  latenessSeconds: number;
}
/**
 * No valid approval when the release was due: never approved, the approver can no longer publish it, the agent's `auto` window ended, or its creator left.
 */
export interface ReleaseExpiredOutcome {
  kind: "expired";
  at: Timestamp;
  reason: "unapproved" | "approval_lost" | "auto_window_ended" | "creator_removed";
}
/**
 * Withdrawn by a person or an agent; its nodes are unlocked.
 */
export interface ReleaseCanceledOutcome {
  kind: "canceled";
  at: Timestamp;
  by: Actor;
}
/**
 * Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).
 *
 * This interface was referenced by `Release`'s JSON-Schema
 * via the `definition` "Metadata".
 */
export interface Metadata {
  [k: string]: string | undefined;
}
