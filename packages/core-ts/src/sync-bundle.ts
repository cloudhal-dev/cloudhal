/**
 * The site bundle (`cloudhal.site-bundle@1`): what `exportSite` returns, `importSite` and
 * `planImport` take, and `cloudhal push`/`pull` send over HTTP; with the copy options, the copy
 * result and the bootstrap conflict. Types and values only, so `sync-checks.ts` and
 * `sync-plan.ts` share them without importing `sync.ts`. Worker-safe.
 */
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import type { GateSupport } from "./availability.ts";

export interface StoragePair {
  sql: SqlDriver;
  blobs: BlobStore;
}

export interface CopySiteOptions {
  /**
   * `bootstrap` (default): copy when the target has no such site or already holds exactly the same
   * nodes; otherwise throw `SyncConflictError`. `replace`: make the target's nodes equal the source.
   */
  mode?: "bootstrap" | "replace";
  log?: (line: string) => void;
  /**
   * RFC-0008 S15: when given, a bundle whose pages or entries carry `availability` is refused
   * (`gates_unsupported`) unless the target's renderer enforces gates. The admin Worker passes its
   * store's check; local targets have the renderer in the same process.
   */
  gates?: GateSupport;
  /**
   * Whose `publishedSnapshotId` a written site node carries. `source` (default, `pull`): the
   * bundle's, so a local copy mirrors the deployment. `target` (`push`): once the target has
   * published, its pointer is kept, so a push carries content but never moves production back to
   * an older snapshot (publishing stays a person's action in Studio); a target that never
   * published takes the bundle's, as a first deploy does.
   */
  published?: "source" | "target";
}

export interface CopySiteResult {
  nodes: { inserted: number; deleted: number; unchanged: boolean };
  snapshots: number;
  blobs: number;
}

export class SyncConflictError extends Error {
  override readonly name = "SyncConflictError";
  readonly differing: string[];
  constructor(siteId: string, differing: string[]) {
    super(
      `target already has site ${siteId} with different content (${differing.length} node(s) differ: ${differing.slice(0, 5).join(", ")}${differing.length > 5 ? ", …" : ""}); pull first or pass mode "replace"`,
    );
    this.differing = differing;
  }
}

export type NodeRow = {
  id: string;
  site_id: string;
  kind: string;
  key: string;
  rev: number;
  hash: string;
  body: string;
  created_at: string;
  updated_at: string;
};
export type SnapshotRow = {
  id: string;
  site_id: string;
  parent_id: string | null;
  site_rev: number;
  body: string;
  created_at: string;
};
export type ProjectRow = {
  id: string;
  rev: number;
  body: string;
  created_at: string;
  updated_at: string;
};

/** A self-contained, JSON-serialisable copy of one site (what push/pull send over HTTP). */
export interface SiteBundle {
  format: "cloudhal.site-bundle@1";
  siteId: string;
  project?: ProjectRow | undefined;
  nodes: NodeRow[];
  snapshots: SnapshotRow[];
  /** Node bodies referenced by the snapshots, keyed by content hash (UTF-8 JSON text). */
  blobs: Record<string, string>;
  /**
   * RFC-0004 §4.7: content the bundle's blob assets (current and in snapshots) need. The bytes
   * travel separately (`copyMediaBlobs`, or the admin media routes); a target that lacks them
   * refuses the bundle (`missing_media`).
   */
  media?: BundleMedia[];
  /** Taken-down content: travels as ledger rows, so a copy can never bring the bytes back. */
  purged?: BundlePurge[];
}

export interface BundleMedia {
  sha256: string;
  bytes: number;
  mediaType: string;
}

export interface BundlePurge {
  sha256: string;
  reason: string;
  legal: boolean;
  by: string;
  at: string;
}

export const SITE_BUNDLE_FORMAT = "cloudhal.site-bundle@1" as const;
