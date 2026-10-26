/**
 * RFC-0042 §4, #110: a parsed field query (`fields/query.ts`) compiled to SQL over
 * `entry_list_values`. Pure: it builds statements, `query.ts` runs them. Every statement checks
 * inside itself that the collection is ready under the fingerprint the caller computed, so an
 * answer never mixes a stale table with the current definitions.
 *
 * One condition drives the scan through `entry_list_values_query` (site, collection, field, has,
 * num, text, …): the field the list is ordered by, else the most selective condition. It reads
 * one row per entry (a field row; or, for a multiple select's `eq`, the one option row an entry
 * can hold for that value), so `count(*)` is the number of matches. Every other condition is an
 * `EXISTS` probe through `entry_list_values_node` (node_id, field, has, num, text). Operands are
 * the evaluator's own (`operandKey`, then `encodeKey`, as the rows' `sortKey`), always bound as
 * parameters (D1 reads doubles inside JSON inexactly); option lists travel as JSON strings.
 *
 * Order: with `orderBy`, entries with a value (`has = 1`) by `num`, then the collection sort's
 * `tie`, then `node_id`; then those without one (`has = 0`) by `tie`, then `node_id`, which is
 * `compareByField` then `bySort` then `id`. Without it, `created, node_id`: the store's
 * `created_at, id`. A page in a segment's second half is read from its end in the reverse order
 * (then put back in order), so a deep page reads the rows after it, not every row before it.
 *
 * Statement shapes, by what the index can do:
 * - ordered and paged: the count, then a page per segment (both follow the index);
 * - unordered and paged: the index does not hold `created` first, so `matches` reads each match's
 *   id and `created` once, unsorted (D1 counts a sorter's rows as read, a top-N sort's again for
 *   every row), the caller orders them, and `bodies` reads the window's entries by id,
 *   re-checking each against the query;
 * - unpaged: `all`, every match's body in one statement (no count: the total is the rows
 *   returned; `ready` tells an empty answer from a collection that is not ready), in answer order
 *   with `orderBy`, else ordered by the caller as `matches` is.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { SqlStatement, SqlValue } from "@cloudhal/storage";
import {
  type FieldOperand,
  operandKey,
  type ParsedCondition,
  type ParsedFieldQuery,
} from "../fields/query.ts";
import { encodeKey } from "./rows.ts";

type Sort = "newest" | "oldest" | "title";

/** What to compile: the parsed query, the collection, its prefilter and the readiness to check. */
export interface ListQuerySpec {
  readonly siteId: string;
  readonly collection: string;
  /** `listFingerprint` of the site the query was parsed against. */
  readonly fingerprint: string;
  /** The collection's listed keys: a query without conditions reads the first one's rows. */
  readonly listFields: readonly string[];
  readonly query: ParsedFieldQuery;
  readonly sort: Sort;
  readonly locale?: string | undefined;
  readonly status?: readonly string[] | undefined;
  readonly now: number;
}

/** A page's part: with `orderBy`, entries with a value, then those without; else one part. */
export type Segment = "valued" | "missing" | "all";

/** The compiled query: one count, then a page statement per segment the window touches. */
export interface CompiledListQuery {
  /** One row: `ok` (1 when ready under the fingerprint), `total`, `valued` (has = 1). */
  readonly count: SqlStatement;
  /** The segments in answer order. */
  readonly segments: readonly Segment[];
  /**
   * `limit` rows of `segment` from `offset` (counted from its end when `reverse`): one `body`
   * column, in answer order either way.
   */
  page(
    segment: Segment,
    window: { limit: number; offset: number; reverse?: boolean },
  ): SqlStatement;
  /** Every match's `body` (with its `id` and `created`): in answer order with `orderBy`, else in none. */
  readonly all: SqlStatement;
  /** Without `orderBy`: every match's node `id` and `created`, in no order. */
  readonly matches: SqlStatement | undefined;
  /** The `id` and `body` of each of `ids` that still matches (in no order). */
  bodies(ids: readonly string[]): SqlStatement;
  /** One row while the collection is ready under the fingerprint. */
  readonly ready: SqlStatement;
}

interface Frag {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

/** One condition: a predicate on its field row, or on its option rows (a multiple select). */
interface Compiled {
  readonly key: string;
  readonly def: FieldDefinition;
  /** `row`: the field row; `some`/`none`: an option row exists / does not. */
  readonly on: "row" | "some" | "none";
  /** Lower drives first (an equality seeks; `ne` reads every row). */
  readonly rank: number;
  /** Can drive as an option row: one per entry at most (a single value). */
  readonly unique: boolean;
  pred(alias: string): Frag;
}

const frag = (sql: string, ...params: SqlValue[]): Frag => ({ sql, params });
const join = (parts: readonly Frag[], sep = " AND "): Frag => ({
  sql: parts.map((p) => p.sql).join(sep),
  params: parts.flatMap((p) => p.params),
});

const COMPARE: Record<string, string> = { lt: "<", lte: "<=", gt: ">", gte: ">=" };
/** Field types whose rows never hold `num` (so `num IS NULL` lets a seek reach `text`). */
const TEXTUAL = new Set(["select", "text", "url", "richText", "image"]);

function presence(c: ParsedCondition): Omit<Compiled, "key" | "def" | "unique"> | undefined {
  if (c.op === "set") return { on: "row", rank: 5, pred: (a) => frag(`${a}.has = 1`) };
  if (c.op === "unset") return { on: "row", rank: 6, pred: (a) => frag(`${a}.has = 0`) };
  return undefined;
}

function ordered(c: ParsedCondition, k: number): Omit<Compiled, "key" | "def" | "unique"> {
  if (c.op === "eq") return { on: "row", rank: 1, pred: (a) => frag(`${a}.num = ?`, k) };
  if (c.op === "ne") return { on: "row", rank: 9, pred: (a) => frag(`${a}.num IS NOT ?`, k) };
  const op = COMPARE[c.op] as string;
  return { on: "row", rank: 3, pred: (a) => frag(`${a}.num ${op} ?`, k) };
}

function select(c: ParsedCondition, values: string[]): Omit<Compiled, "key" | "def" | "unique"> {
  const multiple = c.def.type === "select" && c.def.multiple === true;
  const one = values[0] as string;
  const test = (a: string) =>
    c.op === "in"
      ? frag(`${a}.text IN (SELECT value FROM json_each(?))`, JSON.stringify(values))
      : frag(`${a}.text = ?`, one);
  if (multiple)
    return { on: c.op === "ne" ? "none" : "some", rank: c.op === "ne" ? 9 : 1, pred: test };
  if (c.op === "ne") return { on: "row", rank: 9, pred: (a) => frag(`${a}.text IS NOT ?`, one) };
  return { on: "row", rank: c.op === "in" ? 2 : 1, pred: test };
}

/** One condition compiled, or why it stays with the evaluator. */
function compileCondition(c: ParsedCondition, now: number, zone: string): Compiled | string {
  const base = { key: c.key, def: c.def, unique: c.op === "eq" };
  const bare = presence(c);
  if (bare) return { ...base, ...bare };
  const operands = c.operands as FieldOperand[];
  const strings = operands.map((o) => (o.kind === "string" ? o.s : undefined));
  switch (c.def.type) {
    case "number":
    case "date":
    case "datetime": {
      const o = operands[0];
      if (!o) return "an operator without a value";
      return { ...base, ...ordered(c, encodeKey(operandKey(o, c.def, now, zone))) };
    }
    case "boolean": {
      const yes = strings[0] === "true";
      return {
        ...base,
        on: "row",
        rank: yes ? 4 : 7,
        pred: (a) => frag(`${a}.num = ?`, yes ? 1 : 0),
      };
    }
    case "select":
      if (strings.some((s) => s === undefined)) return "a select operand that is not a string";
      return { ...base, ...select(c, strings as string[]) };
    case "text":
    case "url": {
      const s = strings[0];
      if (c.op !== "eq" || s === undefined) return `${c.op} on a ${c.def.type} field`;
      // A lone surrogate cannot be compared exactly through UTF-8; rows store NULL for it.
      if (!s.isWellFormed()) return "a string operand that is not well formed";
      return { ...base, on: "row", rank: 1, pred: (a) => frag(`${a}.text = ?`, s) };
    }
    default:
      return `${c.op} on a ${c.def.type} field`;
  }
}

/** The scan's driver: a field (its field rows, or one value's option rows) and its predicates. */
interface Driver {
  readonly key: string;
  readonly options: boolean;
  readonly textual: boolean;
  readonly preds: readonly Frag[];
  readonly probes: readonly Compiled[];
}

function chooseDriver(spec: ListQuerySpec, compiled: readonly Compiled[]): Driver | string {
  const orderKey = spec.query.orderBy?.def.key;
  let lead: Compiled | undefined;
  if (orderKey === undefined)
    for (const c of compiled)
      if ((c.on === "row" || (c.on === "some" && c.unique)) && (!lead || c.rank < lead.rank))
        lead = c;
  const key = orderKey ?? lead?.key ?? spec.listFields[0];
  if (key === undefined) return "a collection without list fields";
  if (lead?.on === "some")
    return {
      key,
      options: true,
      textual: true,
      preds: [lead.pred("d")],
      probes: compiled.filter((c) => c !== lead),
    };
  const mine = (c: Compiled) => c.key === key && c.on === "row";
  const def = spec.query.orderBy?.def ?? lead?.def;
  return {
    key,
    options: false,
    textual: def !== undefined && TEXTUAL.has(def.type),
    preds: compiled.filter(mine).map((c) => c.pred("d")),
    probes: compiled.filter((c) => !mine(c)),
  };
}

function probe(c: Compiled, i: number): Frag {
  const p = `p${i}`;
  const rows = c.on === "row" ? `${p}.has IN (0, 1)` : `${p}.has = 2 AND ${p}.num IS NULL`;
  const test = c.pred(p);
  return {
    sql: `${c.on === "none" ? "NOT " : ""}EXISTS (SELECT 1 FROM entry_list_values ${p}
      WHERE ${p}.node_id = d.node_id AND ${p}.field = ? AND ${rows} AND ${test.sql})`,
    params: [c.key, ...test.params],
  };
}

const READY =
  "EXISTS (SELECT 1 FROM entry_list_state s WHERE s.site_id = ? AND s.collection = ? AND s.ready = 1 AND s.fingerprint = ?)";

/** The driver rows a segment reads. */
function rowsOf(driver: Driver, segment: Segment | "count"): string {
  if (driver.options) return "d.has = 2 AND d.num IS NULL";
  if (segment === "valued") return "d.has = 1";
  if (segment === "missing") return "d.has = 0 AND d.num IS NULL AND d.text IS NULL";
  return driver.textual ? "d.has IN (0, 1) AND d.num IS NULL" : "d.has IN (0, 1)";
}

/** A segment's order; `reverse` flips every term (a deep page read from the segment's end). */
function orderOf(spec: ListQuerySpec, segment: Segment, at: { alias: string; reverse: boolean }) {
  const [up, down] = at.reverse ? ["DESC", "ASC"] : ["ASC", "DESC"];
  const a = at.alias;
  const tie = spec.sort === "newest" ? down : up;
  if (segment === "all") return `${a}.created ${up}, ${a}.node_id ${up}`;
  if (segment === "missing") return `${a}.tie ${tie}, ${a}.node_id ${up}`;
  const dir = spec.query.orderBy?.direction === "desc" ? down : up;
  return `${a}.num ${dir}, ${a}.text ${dir}, ${a}.tie ${tie}, ${a}.node_id ${up}`;
}

/**
 * An ordered answer's order in one statement: the valued segment's order after `has DESC` (the
 * missing rows' `num` and `text` are NULL, so it is their segment's order too).
 */
const answerOrder = (spec: ListQuerySpec): string =>
  `d.has DESC, ${orderOf(spec, "valued", { alias: "d", reverse: false })}`;

/** `all`, every match (sorted only with `orderBy`); `matches`, unordered queries' ids, unsorted. */
function wholeStatements(spec: ListQuerySpec, m: { where: string; params: readonly SqlValue[] }) {
  const order = spec.query.orderBy ? ` ORDER BY ${answerOrder(spec)}` : "";
  return {
    all: {
      sql: `SELECT n.body AS body, d.node_id AS id, d.created AS created FROM entry_list_values d
          CROSS JOIN nodes n ON n.id = d.node_id AND n.kind = 'contentEntry'
        WHERE ${m.where}${order}`,
      params: m.params,
    },
    matches: spec.query.orderBy
      ? undefined
      : {
          sql: `SELECT d.node_id AS id, d.created AS created FROM entry_list_values d WHERE ${m.where}`,
          params: m.params,
        },
  };
}

/** Compiles `spec`, or says why the evaluator must answer it (a reason string). */
export function compileListQuery(spec: ListQuerySpec): CompiledListQuery | string {
  const compiled: Compiled[] = [];
  for (const c of spec.query.where) {
    const out = compileCondition(c, spec.now, spec.query.timeZone);
    if (typeof out === "string") return out;
    compiled.push(out);
  }
  const driver = chooseDriver(spec, compiled);
  if (typeof driver === "string") return driver;
  const ready = frag(READY, spec.siteId, spec.collection, spec.fingerprint);
  const rest = [
    ...driver.preds,
    ...(spec.locale !== undefined ? [frag("d.locale = ?", spec.locale)] : []),
    ...(spec.status !== undefined
      ? [frag("d.status IN (SELECT value FROM json_each(?))", JSON.stringify(spec.status))]
      : []),
    ...driver.probes.map(probe),
    ready,
  ];
  const at = [spec.siteId, spec.collection, driver.key];
  const filter = join([frag("d.site_id = ? AND d.collection = ? AND d.field = ?", ...at), ...rest]);
  // By node: `+` keeps the planner off the query index, so each id is one seek of the node index.
  const byNode = join([
    frag("+d.site_id = ? AND +d.collection = ? AND d.field = ?", ...at),
    ...rest,
  ]);
  const where = (segment: Segment | "count") => `${rowsOf(driver, segment)} AND ${filter.sql}`;
  return {
    ...wholeStatements(spec, { where: where("count"), params: filter.params }),
    bodies: (ids) => ({
      sql: `SELECT n.id AS id, n.body AS body FROM json_each(?) j
          CROSS JOIN entry_list_values d ON d.node_id = j.value
          CROSS JOIN nodes n ON n.id = d.node_id AND n.kind = 'contentEntry'
        WHERE ${rowsOf(driver, "count")} AND ${byNode.sql}`,
      params: [JSON.stringify(ids), ...byNode.params],
    }),
    ready: { sql: `SELECT 1 AS ok WHERE ${READY}`, params: ready.params },
    count: {
      sql: `SELECT (SELECT count(*) FROM entry_list_state s WHERE s.site_id = ? AND s.collection = ?
          AND s.ready = 1 AND s.fingerprint = ?) AS ok,
        count(*) AS total, coalesce(sum(d.has = 1), 0) AS valued
        FROM entry_list_values d WHERE ${where("count")}`,
      params: [...ready.params, ...filter.params],
    },
    segments: spec.query.orderBy ? ["valued", "missing"] : ["all"],
    page: (segment, window) => ({
      sql: `SELECT n.body AS body FROM (
          SELECT d.node_id AS node_id, d.num AS num, d.text AS text, d.tie AS tie, d.created AS created
          FROM entry_list_values d WHERE ${where(segment)}
          ORDER BY ${orderOf(spec, segment, { alias: "d", reverse: window.reverse === true })}
          LIMIT ? OFFSET ?
        ) p JOIN nodes n ON n.id = p.node_id AND n.kind = 'contentEntry'
        ORDER BY ${orderOf(spec, segment, { alias: "p", reverse: false })}`,
      params: [...filter.params, window.limit, window.offset],
    }),
  };
}
