/**
 * The Articles and Pages lists' "Views · 30 days" column (RFC-0006 §10.2): one `top/node` query
 * for the whole site, read per row. Pure, so the reading is tested without a screen.
 */
import type { AnalyticsTopRow } from "./api.ts";

/** The most rows `top/node` answers (`API_MAX_LIMIT` in `@cloudhal/api`): one request per list. */
export const LIST_VIEWS_LIMIT = 100;

/** Daily totals fold the long tail into one row per day (`OTHER_KEY` in `@cloudhal/analytics`). */
const OTHER_KEY = "(other)";

/** The column's range: the API's default, and the Readers card's. */
export const LIST_VIEWS_RANGE = "30d" as const;

export interface ListViews {
  /** Page views by node id, for the nodes in the answer. */
  byNode: ReadonlyMap<string, number>;
  /** Every node with views is in the answer, so a missing one had none. False when the answer
   * is full or folds nodes into an "(other)" row. */
  complete: boolean;
  /** How many nodes the answer ranks: a missing one is "not among the {ranked} most read". */
  ranked: number;
}

export function listViews(rows: readonly AnalyticsTopRow[], limit = LIST_VIEWS_LIMIT): ListViews {
  const byNode = new Map<string, number>();
  let folded = false;
  for (const row of rows) {
    if (row.key === OTHER_KEY) folded = true;
    else byNode.set(row.key, (byNode.get(row.key) ?? 0) + row.pageviews);
  }
  return { byNode, complete: rows.length < limit && !folded, ranked: byNode.size };
}

/**
 * A row's page views: a number (0 when the answer lists every node with views), or `undefined`
 * when the node is not in a full answer — it has fewer views than the last row, how many is
 * unknown without one request per row.
 */
export function viewsOf(views: ListViews, nodeId: string): number | undefined {
  const n = views.byNode.get(nodeId);
  if (n !== undefined) return n;
  return views.complete ? 0 : undefined;
}
