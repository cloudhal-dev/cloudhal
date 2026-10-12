/**
 * Holds and locks (RFC-0008 §6.2, invariant S5). While a release is `awaiting_approval`,
 * `scheduled` or `running`, its nodes are **held** — an ordinary publish keeps their live version
 * (or leaves them out when they are not live) — and **locked** — updates and deletes are refused.
 * `release_items.held` (migration 0017, kept by `@cloudhal/schedules`) is the one source; this
 * module only reads it, so the store's index stays free of the schedules engine.
 */
import type { NodeRef } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { ScheduledLockedError } from "./errors.ts";

/** A release holding a node. */
export interface NodeHold {
  readonly releaseId: string;
  /** `awaiting_approval`, `scheduled` or `running`. */
  readonly state: string;
  /** When it runs (UTC), when it has a time. */
  readonly executeAt?: string;
  readonly title?: string;
}

/** Nodes held by releases of a site (all of them, or only `nodeIds`): node id → its holds, by time. */
export async function readHolds(
  sql: SqlDriver,
  siteId: string,
  nodeIds?: readonly string[],
): Promise<Map<string, NodeHold[]>> {
  const ids = nodeIds ? [...new Set(nodeIds)] : undefined;
  const out = new Map<string, NodeHold[]>();
  if (ids && ids.length === 0) return out;
  const rows = await sql.all<{
    node_id: string;
    release_id: string;
    state: string;
    execute_at: string | null;
    title: string | null;
  }>(
    `SELECT i.node_id, i.release_id, r.state, r.execute_at, r.title FROM release_items i JOIN releases r ON r.id = i.release_id
     WHERE i.site_id = ? AND i.held = 1${ids ? " AND i.node_id IN (SELECT value FROM json_each(?))" : ""}
     ORDER BY i.node_id, r.execute_at IS NULL, r.execute_at, r.id`,
    ids ? [siteId, JSON.stringify(ids)] : [siteId],
  );
  for (const r of rows) {
    const hold: NodeHold = {
      releaseId: r.release_id,
      state: r.state,
      ...(r.execute_at ? { executeAt: r.execute_at } : {}),
      ...(r.title ? { title: r.title } : {}),
    };
    out.set(r.node_id, [...(out.get(r.node_id) ?? []), hold]);
  }
  return out;
}

/**
 * Refuses a write to held nodes (`scheduled_locked`). `releaseEdit` is a person's "Edit and
 * re-approve" of that release (§6.2): the node may change when that release is the only one
 * holding it and it is not running; the caller re-pins the item right after. Agents never pass it.
 */
export async function assertUnlocked(
  sql: SqlDriver,
  siteId: string,
  nodeIds: readonly string[],
  releaseEdit?: string,
): Promise<void> {
  const holds = await readHolds(sql, siteId, nodeIds);
  for (const [nodeId, list] of holds) {
    const blocking = list.filter(
      (h) => releaseEdit === undefined || h.releaseId !== releaseEdit || h.state === "running",
    );
    const first = blocking[0];
    if (first) throw new ScheduledLockedError({ nodeId, ...first });
  }
}

/**
 * The refs an ordinary publish composes (§6.2): the working copy, except that every held node keeps
 * its live ref, or is left out when it is not live. Sorted by id.
 */
export function composeWithHolds(
  working: readonly NodeRef[],
  live: readonly NodeRef[] | undefined,
  held: ReadonlySet<string>,
): NodeRef[] {
  if (held.size === 0) return [...working];
  const liveById = new Map((live ?? []).map((n) => [n.id, n]));
  const out = working.filter((n) => !held.has(n.id));
  for (const id of held) {
    const ref = liveById.get(id);
    if (ref) out.push(ref);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * A snapshot about to go live must keep every held node at its live version (S5): otherwise an
 * ordinary publish of a whole-working-copy snapshot (a `manual` one) would release scheduled
 * content early. Rollbacks may move held nodes (they turn the releases into conflicts, §6.2).
 */
export function assertHoldsKept(
  target: readonly NodeRef[],
  live: readonly NodeRef[] | undefined,
  holds: ReadonlyMap<string, NodeHold[]>,
): void {
  if (holds.size === 0) return;
  const t = new Map(target.map((n) => [n.id, n.hash]));
  const l = new Map((live ?? []).map((n) => [n.id, n.hash]));
  for (const [nodeId, list] of holds) {
    if (t.get(nodeId) === l.get(nodeId)) continue;
    const first = list[0];
    if (first) throw new ScheduledLockedError({ nodeId, ...first });
  }
}
