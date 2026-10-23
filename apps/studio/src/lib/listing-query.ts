/**
 * RFC-0042 §4 "Studio": the API query of a collection list's field state in the URL
 * (`listing-search.ts`), and the URL with one filter changed. Loads with the list screen.
 */
import type { FieldCondition, FieldOrder } from "@cloudhal/core-contracts";
import { KEY, listingSearch, SORT } from "./listing-search.ts";

/** The condition a token stands for. */
export function conditionOf(field: string, token: string): FieldCondition | undefined {
  switch (token) {
    case "upcoming":
      return { field, op: "gte", value: "now" };
    case "past":
      return { field, op: "lt", value: "now" };
    case "set":
    case "unset":
      return { field, op: token };
    case "yes":
      return { field, op: "eq", value: "true" };
    case "no":
      return { field, op: "eq", value: "false" };
    default:
      return token.startsWith("is:") && token.length > 3
        ? { field, op: "eq", value: token.slice(3) }
        : undefined;
  }
}

export interface ListingQuery {
  where: FieldCondition[];
  orderBy: FieldOrder | undefined;
  /** True when the list asks the API by field (filters or a field sort). */
  active: boolean;
  /** The filter token per field. */
  filters: Record<string, string>;
}

/** The API query of the URL's field state. */
export function listingQuery(search: Record<string, unknown>): ListingQuery {
  const clean = listingSearch(search);
  const filters: Record<string, string> = {};
  const where: FieldCondition[] = [];
  for (const [key, token] of Object.entries(clean)) {
    const field = KEY.exec(key)?.[1];
    const condition = field ? conditionOf(field, token) : undefined;
    if (field && condition) {
      filters[field] = token;
      where.push(condition);
    }
  }
  const m = clean.sort ? SORT.exec(clean.sort) : null;
  const orderBy: FieldOrder | undefined =
    m?.[1] && m[2] ? { field: m[1], direction: m[2] as FieldOrder["direction"] } : undefined;
  return { where, orderBy, active: where.length > 0 || orderBy !== undefined, filters };
}

/** The URL search with one filter set (or cleared with `undefined`), the rest kept. */
export function withFilter(
  search: Record<string, unknown>,
  field: string,
  token: string | undefined,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(search))
    if (typeof v === "string" && k !== `f_${field}`) next[k] = v;
  if (token) next[`f_${field}`] = token;
  return next;
}
