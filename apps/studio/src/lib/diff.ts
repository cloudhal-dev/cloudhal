import type { NodeRef, Snapshot } from "@cloudhal/core-contracts";
import type { SnapshotDiff } from "./api.ts";

export type Change = "added" | "changed" | "removed";
export const CHANGES: Change[] = ["added", "changed", "removed"];

export interface DiffRow {
  change: Change;
  id: string;
  kind: NodeRef["kind"];
  /** Revision before (changed/removed) and after (added/changed). */
  from?: number;
  to?: number;
}

const KIND_ORDER: Record<NodeRef["kind"], number> = { site: 0, page: 1, contentEntry: 2 };

/** Flattens the API diff into rows grouped by change, site first, then pages, then articles. */
export function diffRows(diff: SnapshotDiff): Record<Change, DiffRow[]> {
  const sort = (rows: DiffRow[]) =>
    rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
  return {
    added: sort(diff.added.map((n) => ({ change: "added", id: n.id, kind: n.kind, to: n.rev }))),
    changed: sort(
      diff.changed.map(({ before, after }) => ({
        change: "changed",
        id: after.id,
        kind: after.kind,
        from: before.rev,
        to: after.rev,
      })),
    ),
    removed: sort(
      diff.removed.map((n) => ({ change: "removed", id: n.id, kind: n.kind, from: n.rev })),
    ),
  };
}

export type DiffBase = "previous" | "live";

/** What a snapshot can be compared against: its parent, and the live snapshot when that's another one. */
export function diffBases(
  snapshot: Pick<Snapshot, "id" | "parentId">,
  publishedSnapshotId: string | undefined,
): Partial<Record<DiffBase, string>> {
  const bases: Partial<Record<DiffBase, string>> = {};
  if (snapshot.parentId) bases.previous = snapshot.parentId;
  if (publishedSnapshotId && publishedSnapshotId !== snapshot.id) bases.live = publishedSnapshotId;
  return bases;
}
