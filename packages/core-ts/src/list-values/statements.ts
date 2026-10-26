/**
 * RFC-0042 §4, #110: the SQL of `entry_list_values` rows (readiness is `state-sql.ts`). Builders
 * only; the entry write paths (`write-plan.ts`) and the backfill put these statements in their
 * own atomic batches, guarded on the hashes they were planned from (AGENTS.md rule 4).
 *
 * Rows travel as one JSON payload per statement (`json_each`): strings, and numbers that are safe
 * integers (instants in ms, days as YYYYMMDD, 0/1). Other numbers are bound as parameters through
 * a `VALUES` table: D1's JSON parser does not read every double back exactly. The INSERT's
 * `CROSS JOIN`s keep the payload the outer loop (SQLite keeps their order): left to the planner,
 * `n.site_id = ?` made it scan the site's nodes once per statement.
 */
import type { SqlStatement } from "@cloudhal/storage";
import type { Cond } from "../node-sql.ts";
import type { EntryListValues } from "./rows.ts";

/** The original a translation's rows were computed with: its hash as read, `null` when absent. */
export interface OriginalRead {
  readonly id: string;
  readonly hash: string | null;
}

/** One node's rows with what they were computed from. */
export interface NodeValues {
  readonly id: string;
  /** The node's hash the rows belong to: as read, or its new hash in its own write. */
  readonly hash: string;
  /** Present when a listed value came from (or would come from) the original. */
  readonly original?: OriginalRead | undefined;
  /** Absent: the node gets no rows (its collection lists no fields). */
  readonly values: EntryListValues | undefined;
}

/** Bound numbers per statement (D1 allows 100 parameters). */
const MAX_BOUND = 80;
/** JSON characters per payload. */
const MAX_PAYLOAD = 200_000;

export const at = (i: number) => `json_extract(e.value, '$[${i}]')`;
/** The payload element's node still has the hash its rows were computed for. */
export const NODE_MATCH = `EXISTS (SELECT 1 FROM nodes n WHERE n.id = ${at(0)} AND n.hash = ${at(1)})`;
/** The element's original is as read (one `?`: the site id). */
export const ORIGINAL_OK = `(${at(2)} IS NULL OR CASE WHEN ${at(3)} IS NULL
  THEN NOT EXISTS (SELECT 1 FROM nodes o WHERE o.id = ${at(2)} AND o.site_id = ?)
  ELSE EXISTS (SELECT 1 FROM nodes o WHERE o.id = ${at(2)} AND o.hash = ${at(3)}) END)`;

const tail = (guard: Cond | undefined) => (guard ? ` AND ${guard.sql}` : "");
export const head = (n: NodeValues) => [
  n.id,
  n.hash,
  n.original?.id ?? null,
  n.original?.hash ?? null,
];

function element(n: NodeValues, bound: number[]): unknown[] {
  const v = n.values as EntryListValues;
  const rows = v.rows.map((r) => {
    if (r.num === null || Number.isSafeInteger(r.num)) return [r.field, r.has, r.num, r.text, null];
    bound.push(r.num);
    return [r.field, r.has, null, r.text, bound.length - 1];
  });
  return [...head(n), v.collection, v.locale, v.status, v.tie, rows];
}

function insertStatement(siteId: string, nodes: readonly NodeValues[], guard?: Cond) {
  const bound: number[] = [];
  const payload = JSON.stringify(nodes.map((n) => element(n, bound)));
  const num = bound.length
    ? "COALESCE(json_extract(r.value, '$[2]'), (SELECT b.n FROM b WHERE b.i = json_extract(r.value, '$[4]')))"
    : "json_extract(r.value, '$[2]')";
  const values = bound.length
    ? `WITH b(i, n) AS (VALUES ${bound.map((_, i) => `(${i}, ?)`).join(", ")}) `
    : "";
  return {
    sql: `${values}INSERT INTO entry_list_values
        (site_id, collection, field, has, num, text, tie, node_id, created, locale, status)
      SELECT n.site_id, ${at(4)}, json_extract(r.value, '$[0]'), json_extract(r.value, '$[1]'),
        ${num}, json_extract(r.value, '$[3]'), ${at(7)}, n.id, n.created_at, ${at(5)}, ${at(6)}
      FROM json_each(?) e
        CROSS JOIN nodes n ON n.id = ${at(0)} AND n.hash = ${at(1)}
        CROSS JOIN json_each(e.value, '$[8]') r
      WHERE n.site_id = ? AND ${ORIGINAL_OK}${tail(guard)}`,
    params: [...bound, payload, siteId, siteId, ...(guard?.params ?? [])],
  };
}

/** Nodes in groups that fit one INSERT (bound numbers and payload size). */
function groups(nodes: readonly NodeValues[]): NodeValues[][] {
  const out: NodeValues[][] = [];
  let group: NodeValues[] = [];
  let bound = 0;
  let size = 0;
  for (const n of nodes) {
    const rows = n.values?.rows ?? [];
    const b = rows.filter((r) => r.num !== null && !Number.isSafeInteger(r.num)).length;
    const s = JSON.stringify(rows).length + 200;
    if (group.length > 0 && (bound + b > MAX_BOUND || size + s > MAX_PAYLOAD)) {
      out.push(group);
      group = [];
      bound = 0;
      size = 0;
    }
    group.push(n);
    bound += b;
    size += s;
  }
  if (group.length > 0) out.push(group);
  return out;
}

/**
 * The rows of `nodes` replaced: one DELETE of their rows, then INSERTs of the new ones, each node
 * only while it (and its original) still has the hash its rows were computed from, and only when
 * `guard` holds. A node whose `values` is absent loses its rows.
 */
export function nodeRowsStatements(
  siteId: string,
  nodes: readonly NodeValues[],
  guard?: Cond,
): SqlStatement[] {
  if (nodes.length === 0) return [];
  const del: SqlStatement = {
    sql: `DELETE FROM entry_list_values WHERE node_id IN (SELECT ${at(0)} FROM json_each(?) e
        WHERE ${NODE_MATCH} AND ${ORIGINAL_OK})${tail(guard)}`,
    params: [JSON.stringify(nodes.map(head)), siteId, ...(guard?.params ?? [])],
  };
  return [del, ...rowInserts(siteId, nodes, guard)];
}

const withRows = (nodes: readonly NodeValues[]) =>
  nodes.filter((n) => (n.values?.rows.length ?? 0) > 0);

/** The INSERTs of `nodeRowsStatements` alone (after a DELETE of the caller's own). */
export function rowInserts(
  siteId: string,
  nodes: readonly NodeValues[],
  guard?: Cond,
): SqlStatement[] {
  return groups(withRows(nodes)).map((g) => insertStatement(siteId, g, guard));
}

/** How many statements `nodeRowsStatements` makes of `nodes` (without building them). */
export function rowStatementCount(nodes: readonly NodeValues[]): number {
  return nodes.length === 0 ? 0 : 1 + groups(withRows(nodes)).length;
}

/** Every row of a node, once the node has `hash` (its own write's first statement). */
export function dropOwnRows(id: string, hash: string): SqlStatement {
  return {
    sql: "DELETE FROM entry_list_values WHERE node_id = ? AND EXISTS (SELECT 1 FROM nodes WHERE id = ? AND hash = ?)",
    params: [id, id, hash],
  };
}

/** Every row of a node, once the node is gone (a delete). */
export function dropGoneRows(id: string): SqlStatement {
  return {
    sql: "DELETE FROM entry_list_values WHERE node_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = ?)",
    params: [id, id],
  };
}

/** Same-site translations of `group` (the store's own `nodes_translation_locale` index). */
export const TRANSLATIONS_OF = `t.site_id = ? AND t.kind = 'contentEntry'
  AND json_extract(t.body, '$.translation.group') = ? AND t.id <> ?
  AND json_extract(t.body, '$.translation.source.siteId') IS NULL`;
