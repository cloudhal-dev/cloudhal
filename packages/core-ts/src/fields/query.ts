/**
 * RFC-0042 §4: listings by field. One evaluator for every caller — themes (`queryEntries`),
 * `contentList` sections, the API, MCP and Studio's list columns — following `filter.ts`'s pattern
 * (one parser, one meaning). It runs in memory after the store's collection prefilter, so SQL and
 * in-memory results cannot drift. Pure, Worker-safe and Temporal-free.
 *
 * | Field type | `where` ops | `orderBy` | `value` |
 * |---|---|---|---|
 * | number | eq ne lt lte gt gte set unset | yes | decimal |
 * | date | same | yes | `YYYY-MM-DD` or `now` (today in the site zone) |
 * | datetime | same (compares `at`) | yes | RFC 3339 instant or `now` |
 * | boolean | eq (absent reads false) | no | `true`/`false` |
 * | select | eq ne in set unset (`multiple`: contains / contains any) | no | option value(s) |
 * | text, url | eq set unset | no | exact string |
 * | richText, image | set unset | no | none |
 *
 * Conditions are ANDed. `ne` is "not `eq`", so entries without a value match it. Only listed
 * fields (`CollectionSettings.listFields`) may be queried. Entries without a value sort last in
 * both directions; ties are left to the caller (the collection's `sort`, then `id`).
 */
import type { FieldCondition, FieldDefinition, FieldOrder } from "@cloudhal/core-contracts";
import { dayIn } from "./conversions.ts";
import { isBeingRemoved } from "./migration.ts";
import { hasFieldValue, type ResolvedFields } from "./resolve.ts";
import { type FieldType, fieldDefinitions, type SiteFields } from "./types.ts";
import { isCalendarDay } from "./value-checks.ts";

export type FieldQueryOp = FieldCondition["op"];

/** A listing's field conditions and order, as sections, the API and MCP carry them. */
export interface FieldQuery {
  readonly where?: readonly FieldCondition[] | undefined;
  readonly orderBy?: FieldOrder | undefined;
}

/** One reason a query is refused (`invalid_query`), at a slash path (`where/0/value`). */
export interface FieldQueryIssue {
  path: string;
  code: "invalid_query";
  message: string;
}

/** RFC-0042 Security: the bounds of a query (also in the schema). */
export const FIELD_QUERY_LIMITS = {
  conditions: 4,
  values: 20,
  valueLength: 100,
} as const;

const ORDERED = ["eq", "ne", "lt", "lte", "gt", "gte", "set", "unset"] as const;

/** The closed operator set per field type. */
export const FIELD_QUERY_OPS: Readonly<Record<FieldType, readonly FieldQueryOp[]>> = {
  number: ORDERED,
  date: ORDERED,
  datetime: ORDERED,
  boolean: ["eq"],
  select: ["eq", "ne", "in", "set", "unset"],
  text: ["eq", "set", "unset"],
  url: ["eq", "set", "unset"],
  richText: ["set", "unset"],
  image: ["set", "unset"],
};

/** True when a listing may be ordered by a field of this type. */
export const canOrderBy = (type: FieldType): boolean =>
  type === "number" || type === "date" || type === "datetime";

/** The value `now` (the only relative value; no offsets in stage 3). */
export const NOW = "now";

const DECIMAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const INSTANT =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** A condition value read by its field's type. */
export type FieldOperand =
  | { kind: "number"; n: number }
  | { kind: "day"; day: string }
  | { kind: "instant"; ms: number }
  | { kind: "now" }
  | { kind: "string"; s: string };

/** Reads one `value` by the field's type; a string describing the problem when it does not fit. */
function readValue(def: FieldDefinition, raw: string): FieldOperand | string {
  switch (def.type) {
    case "number":
      return DECIMAL.test(raw) ? { kind: "number", n: Number(raw) } : "a decimal number";
    case "date":
      if (raw === NOW) return { kind: "now" };
      return isCalendarDay(raw) ? { kind: "day", day: raw } : "YYYY-MM-DD or now";
    case "datetime": {
      if (raw === NOW) return { kind: "now" };
      const day = INSTANT.exec(raw)?.[1];
      const ms = day && isCalendarDay(day) ? Date.parse(raw) : Number.NaN;
      return Number.isFinite(ms) ? { kind: "instant", ms } : "an RFC 3339 instant or now";
    }
    case "boolean":
      return raw === "true" || raw === "false" ? { kind: "string", s: raw } : "true or false";
    case "select":
      return def.options.some((o) => o.value === raw)
        ? { kind: "string", s: raw }
        : `one of ${def.options.map((o) => o.value).join(", ")}`;
    default:
      return { kind: "string", s: raw };
  }
}

/** A checked condition, its operands read by type. */
export interface ParsedCondition {
  readonly key: string;
  readonly def: FieldDefinition;
  readonly op: FieldQueryOp;
  readonly operands: readonly FieldOperand[];
}

/** A checked query, ready for `matchesFieldQuery` and `compareByField`. */
export interface ParsedFieldQuery {
  readonly where: readonly ParsedCondition[];
  readonly orderBy?: { readonly def: FieldDefinition; readonly direction: "asc" | "desc" };
  /** The site's zone, for `now` on date fields (today there). */
  readonly timeZone: string;
}

const issue = (path: string, message: string): FieldQueryIssue => ({
  path,
  code: "invalid_query",
  message,
});

/** The listed definition of `key`, or the reason it cannot be queried. */
function listedDef(
  byKey: ReadonlyMap<string, FieldDefinition>,
  listFields: readonly string[] | undefined,
  key: unknown,
): FieldDefinition | string {
  if (typeof key !== "string") return "names no field";
  const def = byKey.get(key);
  if (!def) return `"${key}" is not a field of this collection`;
  if (!listFields?.includes(key)) return `"${key}" is not one of the collection's list fields`;
  return def;
}

function checkOperands(c: FieldCondition, def: FieldDefinition, at: string): FieldQueryIssue[] {
  const bare = c.op === "set" || c.op === "unset";
  if (bare)
    return c.value !== undefined || c.values !== undefined
      ? [issue(at, `${c.op} takes no value`)]
      : [];
  if (c.op === "in") {
    // Callers pass JSON from the API and MCP: read it as untyped.
    const values = c.values as readonly unknown[] | undefined;
    if (c.value !== undefined) return [issue(`${at}/value`, "in takes values, not value")];
    if (!Array.isArray(values) || values.length === 0)
      return [issue(`${at}/values`, "in needs at least one value")];
    if (values.length > FIELD_QUERY_LIMITS.values)
      return [issue(`${at}/values`, `at most ${FIELD_QUERY_LIMITS.values} values`)];
    if (new Set(values).size !== values.length) return [issue(`${at}/values`, "values are unique")];
    return values.flatMap((v, i) => checkString(def, v, `${at}/values/${i}`));
  }
  if (c.values !== undefined) return [issue(`${at}/values`, "values only with in")];
  if (c.value === undefined) return [issue(`${at}/value`, `${c.op} needs a value`)];
  return checkString(def, c.value, `${at}/value`);
}

function checkString(def: FieldDefinition, raw: unknown, at: string): FieldQueryIssue[] {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > FIELD_QUERY_LIMITS.valueLength)
    return [issue(at, `a string of 1 to ${FIELD_QUERY_LIMITS.valueLength} characters`)];
  const read = readValue(def, raw);
  return typeof read === "string" ? [issue(at, `a ${def.type} field compares with ${read}`)] : [];
}

function checkCondition(
  c: FieldCondition,
  i: number,
  byKey: ReadonlyMap<string, FieldDefinition>,
  listFields: readonly string[] | undefined,
): FieldQueryIssue[] {
  const at = `where/${i}`;
  const def = listedDef(byKey, listFields, c?.field);
  if (typeof def === "string") return [issue(`${at}/field`, def)];
  const ops = FIELD_QUERY_OPS[def.type];
  if (!ops.includes(c.op))
    return [issue(`${at}/op`, `a ${def.type} field takes ${ops.join(", ")}`)];
  return checkOperands(c, def, at);
}

/**
 * Every reason `query` cannot run against these definitions and list fields (`invalid_query`):
 * unknown or unlisted fields, operators outside the type's set, values that do not read as the
 * field's type, `values` without `in`, an order by a type that does not sort, and the limits.
 */
export function checkFieldQuery(
  defs: readonly FieldDefinition[],
  listFields: readonly string[] | undefined,
  query: FieldQuery,
): FieldQueryIssue[] {
  const byKey = new Map(defs.filter((d) => !isBeingRemoved(d)).map((d) => [d.key, d]));
  const out: FieldQueryIssue[] = [];
  const where = query.where ?? [];
  if (!Array.isArray(where)) return [issue("where", "a list of conditions")];
  if (where.length > FIELD_QUERY_LIMITS.conditions)
    out.push(issue("where", `at most ${FIELD_QUERY_LIMITS.conditions} conditions`));
  where.forEach((c, i) => {
    out.push(...checkCondition(c, i, byKey, listFields));
  });
  const order = query.orderBy;
  if (order !== undefined) {
    const def = listedDef(byKey, listFields, order?.field);
    if (typeof def === "string") out.push(issue("orderBy/field", def));
    else if (!canOrderBy(def.type))
      out.push(issue("orderBy/field", `a ${def.type} field does not sort`));
    if (order?.direction !== "asc" && order?.direction !== "desc")
      out.push(issue("orderBy/direction", "asc or desc"));
  }
  return out;
}

export type ParseFieldQueryResult =
  | { ok: true; query: ParsedFieldQuery }
  | { ok: false; issues: FieldQueryIssue[] };

/** Checks `query` against `collection`'s definitions and list fields, and compiles it. */
export function parseFieldQuery(
  site: SiteFields,
  collection: string,
  query: FieldQuery,
): ParseFieldQueryResult {
  const defs = fieldDefinitions(site, collection);
  const listFields = site.collections?.[collection]?.listFields;
  const issues = checkFieldQuery(defs, listFields, query);
  if (issues.length > 0) return { ok: false, issues };
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const where = (query.where ?? []).map((c): ParsedCondition => {
    const def = byKey.get(c.field) as FieldDefinition;
    const raws = c.op === "in" ? (c.values ?? []) : c.value === undefined ? [] : [c.value];
    return {
      key: c.field,
      def,
      op: c.op,
      operands: raws.map((r) => readValue(def, r) as FieldOperand),
    };
  });
  const order = query.orderBy;
  const parsed: ParsedFieldQuery = {
    where,
    timeZone: site.timeZone ?? "UTC",
    ...(order ? { orderBy: { def: byKey.get(order.field) as FieldDefinition, ...order } } : {}),
  };
  return { ok: true, query: parsed };
}

/** A comparable form of a resolved value: a number, a day string, or undefined. */
function sortKey(def: FieldDefinition, value: unknown): number | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (def.type === "number") return typeof value === "number" ? value : undefined;
  if (def.type === "date") return typeof value === "string" ? value : undefined;
  if (def.type === "datetime") {
    const at = (value as { at?: unknown }).at;
    const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

/** An operand's comparable form at `now`. */
function operandKey(
  o: FieldOperand,
  def: FieldDefinition,
  now: number,
  zone: string,
): number | string {
  switch (o.kind) {
    case "number":
      return o.n;
    case "day":
      return o.day;
    case "instant":
      return o.ms;
    case "now":
      return def.type === "date" ? dayIn(new Date(now).toISOString(), zone) : now;
    default:
      return o.s;
  }
}

type Compare = (a: number | string, b: number | string) => boolean;
const COMPARE: Partial<Record<FieldQueryOp, Compare>> = {
  eq: (a, b) => a === b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
};

/** The option values a select holds (one, or a list when `multiple`). */
const selected = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? [value]
      : [];

function matchesEq(c: ParsedCondition, value: unknown, now: number, zone: string): boolean {
  const operand = c.operands[0] as FieldOperand;
  const { def } = c;
  if (def.type === "boolean")
    return (value === true) === (operand.kind === "string" && operand.s === "true");
  if (def.type === "select")
    return selected(value).includes(operandKey(operand, def, now, zone) as string);
  if (def.type === "text" || def.type === "url")
    return value === operandKey(operand, def, now, zone);
  const key = sortKey(def, value);
  return key !== undefined && key === operandKey(operand, def, now, zone);
}

function matchesCondition(c: ParsedCondition, value: unknown, now: number, zone: string): boolean {
  switch (c.op) {
    case "set":
      return hasFieldValue(value);
    case "unset":
      return !hasFieldValue(value);
    case "eq":
      return matchesEq(c, value, now, zone);
    case "ne":
      return !matchesEq(c, value, now, zone);
    case "in": {
      const held = selected(value);
      return c.operands.some((o) => o.kind === "string" && held.includes(o.s));
    }
    default: {
      const key = sortKey(c.def, value);
      const compare = COMPARE[c.op] as Compare;
      return (
        key !== undefined &&
        compare(key, operandKey(c.operands[0] as FieldOperand, c.def, now, zone))
      );
    }
  }
}

/**
 * True when an entry's resolved values (`resolveFields`, so a translation reads the original's
 * non-localized values) meet every condition at `now` (epoch ms, injected; never a clock read).
 */
export function matchesFieldQuery(
  resolved: ResolvedFields,
  query: ParsedFieldQuery,
  now: number,
): boolean {
  return query.where.every((c) => matchesCondition(c, resolved[c.key]?.value, now, query.timeZone));
}

/**
 * Orders two entries' resolved values by the query's `orderBy`: negative when `a` comes first.
 * Entries without a value come last in both directions; `0` on a tie (or without `orderBy`), so
 * the caller falls back to its `sort`, then `id`.
 */
export function compareByField(
  a: ResolvedFields,
  b: ResolvedFields,
  query: Pick<ParsedFieldQuery, "orderBy">,
): number {
  const order = query.orderBy;
  if (!order) return 0;
  const ka = sortKey(order.def, a[order.def.key]?.value);
  const kb = sortKey(order.def, b[order.def.key]?.value);
  if (ka === undefined || kb === undefined) return ka === kb ? 0 : ka === undefined ? 1 : -1;
  const sign = order.direction === "asc" ? 1 : -1;
  return ka < kb ? -sign : ka > kb ? sign : 0;
}
