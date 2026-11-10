/**
 * What a release execution does after its batch committed (RFC-0008 §6.3 "After the batch"): read
 * the stored purge plan, record the purge's outcome, and tell the deployment a release went live
 * (the release-run member of the `onPublished` family, #150). Split from `releases.ts`.
 */

import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { SqlDriver } from "@cloudhal/storage";
import type { CachePurgePlan } from "./cache-purge.ts";
import type { ReleasePurge } from "./release-apply.ts";

/** A release went live: its site, the snapshot it published and the release. */
export type ReleasePublishedHook = (published: {
  readonly siteId: string;
  readonly snapshotId: string;
  readonly releaseId: string;
}) => void | Promise<void>;

/** A stored purge plan as `planCachePurge` wrote it. */
export function isPurgePlan(v: unknown): v is CachePurgePlan {
  if (!v || typeof v !== "object") return false;
  const p = v as { mode?: unknown; tags?: unknown };
  return p.mode === "everything" || (p.mode === "tags" && Array.isArray(p.tags));
}

/** Rewrites a published release's `outcome.purge` (one statement). */
export async function recordPurgeOutcome(
  sql: SqlDriver,
  releaseId: string,
  purge: ReleasePurge,
): Promise<void> {
  await new SqlScheduleStore(sql).recordPurge(releaseId, purge);
}

/**
 * Calls the deployment's hook for a release that went live (`publishRelease` does not call the
 * store's `onPublished`). A throw is logged and never fails the run.
 */
export async function notifyReleasePublished(
  hook: ReleasePublishedHook | undefined,
  published: Parameters<ReleasePublishedHook>[0],
  log: (line: string) => void,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(published);
  } catch (e) {
    log(
      `schedules: the published hook of release ${published.releaseId} failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
