/**
 * RFC-0042 §4, #110: `queryContentEntries` answered from `entry_list_values`. Used only while the
 * collection's rows are complete and current: no listed field is being changed by a field
 * operation, and every statement finds the state row ready under the fingerprint of the site the
 * query was parsed against. Otherwise, and whenever a page comes back shorter or longer than the
 * count promised (a write landed between the two statements, seen when it removes a row of the
 * page or adds one at a segment's end), it answers `undefined` and the caller runs the in-memory
 * evaluator, which stays the definition (the property suite compares the two on random data and
 * queries).
 *
 * Statements (`query-sql.ts` says why each shape):
 * - ordered and paged: the count (`total`, and how many have a value), then one page statement
 *   per segment the window touches; bodies come from the page statement itself;
 * - unordered and paged: every match's id and creation time (the total), put in the store's order
 *   here, then the window's bodies by id, each re-checked against the query (one that stopped
 *   matching sends the caller to the scan);
 * - unpaged: one statement with every match's body (put in the store's order here when
 *   unordered); when it returns none, a readiness check.
 * Under concurrent writes the total and the page can come from different moments, as offset
 * paging across requests always can.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import type { ParsedFieldQuery } from "../fields/query.ts";
import { parseRows } from "../node-sql.ts";
import { hasListedMarker, listFingerprint, NO_LIST } from "./fingerprint.ts";
import { type CompiledListQuery, compileListQuery, type Segment } from "./query-sql.ts";
import { listedKeys } from "./rows.ts";

export interface ListValuesQuery {
  readonly collection: string;
  /** Parsed against the same `site` (`parseFieldQuery`). */
  readonly query: ParsedFieldQuery;
  readonly locale?: string | undefined;
  readonly status?: readonly string[] | undefined;
  /** Absent: every match from `offset`. */
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  readonly now: number;
}

export interface ListValuesAnswer {
  readonly entries: ContentEntry[];
  readonly total: number;
}

interface Head {
  readonly total: number;
  readonly valued: number;
}

/** A segment's part of the page; `end`: it runs to the segment's last row. */
export interface PageWindow {
  readonly segment: Segment;
  /** The segment's row count. */
  readonly size: number;
  readonly offset: number;
  readonly limit: number;
  readonly end: boolean;
}

/** The parts of each segment inside `[offset, offset + limit)`, in answer order. */
export function pageWindows(
  sizes: readonly { segment: Segment; size: number }[],
  offset: number,
  limit: number | undefined,
): PageWindow[] {
  const stop = limit === undefined ? Number.POSITIVE_INFINITY : offset + limit;
  const out: PageWindow[] = [];
  let start = 0;
  for (const { segment, size } of sizes) {
    const lo = Math.max(offset, start);
    const hi = Math.min(stop, start + size);
    if (hi > lo)
      out.push({ segment, size, offset: lo - start, limit: hi - lo, end: hi === start + size });
    start += size;
  }
  return out;
}

const sizesOf = (plan: CompiledListQuery, head: Head) =>
  plan.segments.map((segment) => ({
    segment,
    size:
      segment === "valued"
        ? head.valued
        : segment === "missing"
          ? head.total - head.valued
          : head.total,
  }));

/**
 * A window's statement. In a segment's second half it counts from the segment's end (a deep
 * page reads what follows it); at the end of a segment read forwards, one row more, to see a row
 * that came after the count.
 */
function pageStatement(plan: CompiledListQuery, w: PageWindow): [string, SqlValue[]] {
  const reverse = w.offset > w.size - w.offset - w.limit;
  const page = reverse
    ? plan.page(w.segment, { offset: w.size - w.offset - w.limit, limit: w.limit, reverse })
    : plan.page(w.segment, { offset: w.offset, limit: w.limit + (w.end ? 1 : 0) });
  return [page.sql, [...(page.params ?? [])]];
}

type Match = { id: string; created: string };

/**
 * The store's order, `created_at, id`: both are ASCII (ISO instants, generated ids), where
 * JavaScript's `<` is SQLite's BINARY order.
 */
const byCreated = (a: Match, b: Match) =>
  a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

async function isReady(sql: SqlDriver, plan: CompiledListQuery): Promise<boolean> {
  return (await sql.get(plan.ready.sql, plan.ready.params)) !== undefined;
}

/** Every match in one statement; an unordered one is put in the store's order, then the offset. */
async function unpaged(sql: SqlDriver, plan: CompiledListQuery, offset: number) {
  const rows = await sql.all<Match & { body: string }>(plan.all.sql, plan.all.params);
  if (rows.length === 0 && !(await isReady(sql, plan))) return undefined;
  if (plan.matches) rows.sort(byCreated);
  return { entries: parseRows<ContentEntry>(rows.slice(offset)), total: rows.length };
}

/** Unordered: the matches' ids (ordered here), then the window's bodies by id. */
async function byIds(
  sql: SqlDriver,
  plan: CompiledListQuery,
  matches: SqlStatement,
  window: { offset: number; limit: number },
): Promise<ListValuesAnswer | undefined> {
  const all = await sql.all<Match>(matches.sql, matches.params);
  const ids = all.sort(byCreated).map((r) => r.id);
  if (ids.length === 0 && !(await isReady(sql, plan))) return undefined;
  const page = ids.slice(window.offset, window.offset + window.limit);
  if (page.length === 0) return { entries: [], total: ids.length };
  const bodies = plan.bodies(page);
  const rows = await sql.all<{ id: string; body: string }>(bodies.sql, bodies.params);
  const byId = new Map(rows.map((r) => [r.id, r.body]));
  if (rows.length !== page.length || byId.size !== page.length) return undefined;
  const entries = page.map((id) => JSON.parse(byId.get(id) ?? "null") as ContentEntry | null);
  if (entries.some((e) => e === null)) return undefined;
  return { entries: entries as ContentEntry[], total: ids.length };
}

/** The query's answer from the table, or `undefined` when the evaluator must answer it. */
export async function queryListValues(
  sql: SqlDriver,
  site: Site,
  q: ListValuesQuery,
): Promise<ListValuesAnswer | undefined> {
  if (hasListedMarker(site, q.collection)) return undefined;
  const fingerprint = await listFingerprint(site, q.collection);
  if (fingerprint === NO_LIST) return undefined;
  const plan = compileListQuery({
    siteId: site.id,
    collection: q.collection,
    fingerprint,
    listFields: listedKeys(site, q.collection),
    query: q.query,
    sort: site.collections?.[q.collection]?.sort ?? "newest",
    locale: q.locale,
    status: q.status,
    now: q.now,
  });
  if (typeof plan === "string") return undefined;
  const offset = q.offset ?? 0;
  if (q.limit === undefined) return unpaged(sql, plan, offset);
  if (plan.matches) return byIds(sql, plan, plan.matches, { offset, limit: q.limit });
  const head = await sql.get<Record<string, number>>(plan.count.sql, plan.count.params);
  if (head?.ok !== 1) return undefined;
  const counts: Head = { total: Number(head.total), valued: Number(head.valued) };
  const entries: ContentEntry[] = [];
  for (const w of pageWindows(sizesOf(plan, counts), offset, q.limit)) {
    const rows = await sql.all<{ body: string }>(...pageStatement(plan, w));
    if (rows.length !== w.limit) return undefined;
    entries.push(...parseRows<ContentEntry>(rows));
  }
  return { entries, total: counts.total };
}
