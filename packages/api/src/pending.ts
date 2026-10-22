import type { NodeRef, Site } from "@cloudhal/core-contracts";
import { canonicalJson, type SiteGraphStore, type SnapshotDiff } from "@cloudhal/core-ts";

/**
 * What a publish would carry (Studio's top bar badge next to Publish): the node counts of
 * `SiteGraphStore.pendingChanges` — the current state against the live snapshot, held nodes at
 * their live version, the site node's publish-only rewrite left out. Numbers only; the list is the
 * approval dialog's diff.
 *
 * Adding or deleting a page also rewrites the site node's `pageIds`; that follows from the page
 * change and is not counted again (a reorder or a settings change still counts as the site).
 *
 * A site that was never published has no live snapshot: `live` is false and every node the first
 * publish would take, the site node included, counts as added.
 */
export interface PendingChanges {
  live: boolean;
  liveSnapshotId?: string;
  counts: { added: number; changed: number; removed: number; total: number };
  /** The total by node kind; kinds without changes are left out. */
  byKind: Partial<Record<NodeRef["kind"], number>>;
}

/** The pending counts of `site` (one diff of node refs; one blob read when the site node moved). */
export async function pendingFor(store: SiteGraphStore, site: Site): Promise<PendingChanges> {
  const diff = await store.pendingChanges(site.id);
  const siteChange = diff.changed.find((c) => c.after.kind === "site");
  if (siteChange && (await onlyPageList(store, siteChange.before, site, diff)))
    return pendingSummary(
      { ...diff, changed: diff.changed.filter((c) => c !== siteChange) },
      site.publishedSnapshotId,
    );
  return pendingSummary(diff, site.publishedSnapshotId);
}

/** Does the site node differ from its live version only by the pages added and removed? */
async function onlyPageList(
  store: SiteGraphStore,
  liveRef: NodeRef,
  site: Site,
  diff: SnapshotDiff,
): Promise<boolean> {
  const live = await store.readSnapshotNode<Site>(liveRef).catch(() => undefined);
  if (!live) return false;
  const added = new Set(diff.added.filter((n) => n.kind === "page").map((n) => n.id));
  const removed = new Set(diff.removed.filter((n) => n.kind === "page").map((n) => n.id));
  const strip = ({ pageIds: _i, publishedSnapshotId: _p, rev: _r, updatedAt: _u, ...rest }: Site) =>
    canonicalJson(rest);
  const before = live.pageIds.filter((id) => !removed.has(id));
  const after = site.pageIds.filter((id) => !added.has(id));
  return strip(live) === strip(site) && canonicalJson(before) === canonicalJson(after);
}

export function pendingSummary(diff: SnapshotDiff, liveSnapshotId?: string): PendingChanges {
  const byKind: PendingChanges["byKind"] = {};
  const count = (kind: NodeRef["kind"]) => {
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  };
  for (const n of diff.added) count(n.kind);
  for (const n of diff.removed) count(n.kind);
  for (const c of diff.changed) count(c.after.kind);
  const { added, removed, changed } = diff;
  return {
    live: liveSnapshotId !== undefined,
    ...(liveSnapshotId ? { liveSnapshotId } : {}),
    counts: {
      added: added.length,
      changed: changed.length,
      removed: removed.length,
      total: added.length + changed.length + removed.length,
    },
    byKind,
  };
}
