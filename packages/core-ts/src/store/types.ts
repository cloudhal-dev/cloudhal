/** The store's public option and result types. */
import type { Actor, ContentEntry, NodeRef, Site, Snapshot } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import type { GateSupport } from "../availability.ts";
import type { BlockRegistry, PropsSchema } from "../blocks.ts";
import type { BlockWriter } from "../body-index.ts";

export interface SiteGraphStoreOptions {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  /** Clock, injectable for tests. */
  readonly now?: () => Date;
  readonly idGen?: (prefix: string) => string;
  /**
   * Called after the published pointer moved (publish and rollback). Deployments use it to purge
   * edge caches — `planCachePurge(change)` says which tags. Failures are reported to `onHookError`
   * and never undo the publish.
   */
  readonly onPublished?: (site: Site, change: PublishChange) => Promise<void>;
  readonly onHookError?: (error: unknown) => void;
  /** Media (RFC-0004): per-site quota of stored bytes (default 10 GB; 0 = unlimited). */
  readonly media?: { readonly quotaBytes?: number };
  /**
   * Called after a takedown removed content (`purgeBlob`): deployments purge the edge cache of the
   * asset's media URLs (`cloudhal-asset-<id>`). Failures go to `onHookError`.
   */
  readonly onMediaPurged?: (siteId: string, assetIds: string[]) => Promise<void>;
  /**
   * RFC-0008 S15: whether the renderer serving a site enforces time gates. Writes that set or
   * change `availability` are refused (`gates_unsupported`) until it says so; without this option
   * they are always refused. Node stores pass `GATES_ENFORCED` (renderer and writer are one
   * process); the admin Worker asks the site Worker's `/__cloudhal/features`.
   */
  readonly gates?: GateSupport;
  /**
   * RFC-0015: the block registry component sections are validated against (default: the
   * built-ins; deployments pass the theme's types too). Unknown types are kept, not refused.
   */
  readonly blocks?: BlockRegistry;
  /**
   * RFC-0017 §1: the theme's design settings (`src/settings.ts`), which `Site.theme.config` is
   * checked against when it changes. Without it the config is left alone.
   */
  readonly themeSettings?: PropsSchema;
  /** RFC-0021 §1: the theme's DESIGN.md (`src/DESIGN.md`), read by agents with the site's rules. */
  readonly themeDesign?: string;
}

/**
 * Where the published pointer moved from and to: `from` is absent on a first publish, `to` when the
 * site is no longer published (an import that replaced it).
 */
export interface PublishChange {
  readonly from?: string;
  readonly to?: string;
}

/**
 * Options of a page or entry update (RFC-0008 §6.2). `releaseEdit` is a person's "Edit and
 * re-approve": the node may change while held by that release (and only that one, not running);
 * the caller re-pins the item right after (`ReleaseService.editHeld…`). Agents never pass it.
 */
export interface NodeWriteOptions {
  readonly releaseEdit?: string;
  /** Who is writing: the provenance of body blocks this write changes (RFC-0014 §3). */
  readonly writer?: BlockWriter;
  /**
   * RFC-0019 §2: a person with `site:publish` may edit the note of a correction that has been live
   * (the caller checks and audits). Agents never set it.
   */
  readonly correctionEdit?: boolean;
}

export interface SnapshotInput {
  readonly actor: Actor;
  readonly reason: Snapshot["reason"];
  readonly label?: string;
  /** Namespaced keys (e.g. `cloudhal.migration`), kept on the snapshot. */
  readonly metadata?: Record<string, string>;
}

export interface SnapshotDiff {
  readonly added: NodeRef[];
  readonly removed: NodeRef[];
  readonly changed: Array<{ before: NodeRef; after: NodeRef }>;
}

/**
 * The first time an entry is marked published it gets its publication date, whichever path made
 * the change (Studio, REST, MCP, import). An explicit `publishedAt` (e.g. imported) is kept. An
 * entry under embargo is dated at its `from` (RFC-0008 §7.5): its date, feed item and sitemap
 * entry show the embargo time, not the moment someone pressed publish.
 */
export function firstPublication(
  entry: Pick<ContentEntry, "status" | "publishedAt" | "availability">,
  ts: string,
): { publishedAt?: string } {
  return entry.status === "published" && !entry.publishedAt
    ? { publishedAt: entry.availability?.from ?? ts }
    : {};
}

/**
 * The Site Graph store: typed CRUD with optimistic locking, snapshots, diff, publish, rollback,
 * taxonomies, terms and redirects. Every multi-statement write is one atomic `batch()`; see
 * ADR-0002, RFC-0001 and RFC-0002.
 */
