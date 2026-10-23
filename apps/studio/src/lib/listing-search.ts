/**
 * RFC-0042 §4 "Studio": a collection list's field filters and field sort in the URL — one
 * `f_<field>=<token>` per filtered list field and `sort=<field>:asc|desc` — and the API query they
 * stand for. Tokens are type-free (`upcoming` → `gte now`, `is:<v>` → `eq <v>`), so the router's
 * search check and the list's query (`listing-query.ts`) need no field definitions. Only the
 * router's check lives here, in the shell.
 */

/** The URL keys of the list's field state. */
export type ListingSearch = Record<`f_${string}`, string> & { sort?: string };

/** What a filter token means; `is:<value>` compares with one value. */
export type FilterToken = "upcoming" | "past" | "set" | "unset" | "yes" | "no" | `is:${string}`;

export const KEY = /^f_([a-z][A-Za-z0-9]{0,39})$/;
const TOKEN = /^(upcoming|past|set|unset|yes|no|is:[^\s].{0,99})$/;
export const SORT = /^([a-z][A-Za-z0-9]{0,39}):(asc|desc)$/;
/** The contract's limit on conditions (`ContentListSection.where`, `FieldCondition` lists). */
const MAX_CONDITIONS = 4;

/** The router's check: only well-formed filter and sort params survive. */
export function listingSearch(search: Record<string, unknown>): ListingSearch {
  const out: Record<string, string> = {};
  let n = 0;
  for (const [key, value] of Object.entries(search)) {
    if (n < MAX_CONDITIONS && KEY.test(key) && typeof value === "string" && TOKEN.test(value)) {
      out[key] = value;
      n++;
    }
  }
  if (typeof search.sort === "string" && SORT.test(search.sort)) out.sort = search.sort;
  return out as ListingSearch;
}
