/**
 * RFC-0042 §4 "API and MCP": a collection's entries filtered and sorted by its list fields, over
 * the store's collection prefilter (`listContentEntries`: collection, locale, status, the RFC-0002
 * term filter). The shared evaluator (`fields/query.ts`) defines the answer, on resolved values (a
 * translation reads its original's non-localized ones): ties fall back to the collection's
 * `sort`, then `id`; entries without a value sort last. `now` is injected (epoch ms), never read
 * from a clock here.
 *
 * #110: while the collection's `entry_list_values` rows are ready, the query runs in SQL
 * (`list-values/query.ts`): where, orderBy, status, locale, limit and offset. It falls back to
 * the in-memory scan (`scanFieldQuery`, the oracle a property suite compares it with) for a term
 * filter, a collection that is not ready, or an operand SQL cannot compare exactly.
 */
import type { ContentEntry, FieldCondition, FieldOrder, Site } from "@cloudhal/core-contracts";
import { InvariantError, NotFoundError } from "./errors.ts";
import {
  compareByField,
  type FieldQueryIssue,
  type FieldsOriginal,
  matchesFieldQuery,
  type ParsedFieldQuery,
  parseFieldQuery,
  type ResolvedFields,
  resolveFields,
} from "./fields/index.ts";
import { queryListValues } from "./list-values/query.ts";
import type { SiteGraphStore } from "./store.ts";
import type { EntryQuery } from "./taxonomy.ts";

/** At most this many entries per page (RFC-0042 §4, the theme API's bound). */
export const ENTRY_PAGE_LIMIT = 100;

export interface FieldEntryListQuery extends EntryQuery {
  readonly where?: readonly FieldCondition[] | undefined;
  readonly orderBy?: FieldOrder | undefined;
  /** Page size (1–100); absent: every match. */
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  /** The instant `now` compares with (epoch ms). */
  readonly now: number;
}

export interface FieldEntryList {
  readonly entries: ContentEntry[];
  /** Matches before paging. */
  readonly total: number;
}

const refuse = (issues: FieldQueryIssue[]): never => {
  const shown = issues
    .slice(0, 5)
    .map((i) => `${i.path}: ${i.message}`)
    .join("; ");
  throw new InvariantError("invalid_query", shown, { issues });
};

/** The query's own bounds: a collection to read fields from, page size and offset. */
function checkBounds(q: FieldEntryListQuery): FieldQueryIssue[] {
  const issues: FieldQueryIssue[] = [];
  const at = (path: string, message: string) =>
    issues.push({ path, code: "invalid_query", message });
  if ((q.where !== undefined || q.orderBy !== undefined) && q.collection === undefined)
    at("collection", "where and orderBy need a collection");
  const { limit, offset } = q;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > ENTRY_PAGE_LIMIT))
    at("limit", `an integer from 1 to ${ENTRY_PAGE_LIMIT}`);
  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0))
    at("offset", "a non-negative integer");
  return issues;
}

type Sort = "newest" | "oldest" | "title";
const published = (e: ContentEntry) => e.publishedAt ?? e.createdAt;

/** The collection's `sort` as a comparator (RFC-0040: absent is `newest`). */
function bySort(sort: Sort): (a: ContentEntry, b: ContentEntry) => number {
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  if (sort === "title") return (a, b) => cmp(a.title, b.title);
  if (sort === "oldest") return (a, b) => cmp(published(a), published(b));
  return (a, b) => cmp(published(b), published(a));
}

/** Originals of same-site translations that the prefilter left out (another locale). */
async function originals(
  store: SiteGraphStore,
  entries: readonly ContentEntry[],
): Promise<Map<string, FieldsOriginal>> {
  const byId = new Map<string, FieldsOriginal>(entries.map((e) => [e.id, e]));
  for (const e of entries) {
    const t = e.translation;
    if (!t || t.group === e.id || t.source?.siteId !== undefined || byId.has(t.group)) continue;
    const original = await store.getContentEntry(t.group);
    if (original && original.siteId === e.siteId) byId.set(original.id, original);
  }
  return byId;
}

/** Filters and orders `entries` by a parsed field query at `now`. Pure. */
export function applyFieldQuery(
  entries: readonly { entry: ContentEntry; resolved: ResolvedFields }[],
  query: ParsedFieldQuery,
  options: { now: number; sort: Sort },
): ContentEntry[] {
  const matched = entries.filter((e) => matchesFieldQuery(e.resolved, query, options.now));
  if (!query.orderBy) return matched.map((e) => e.entry);
  const tie = bySort(options.sort);
  return matched
    .sort(
      (a, b) =>
        compareByField(a.resolved, b.resolved, query) ||
        tie(a.entry, b.entry) ||
        (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0),
    )
    .map((e) => e.entry);
}

const slicePage = (entries: ContentEntry[], q: FieldEntryListQuery): FieldEntryList => {
  const start = q.offset ?? 0;
  const end = q.limit === undefined ? undefined : start + q.limit;
  return { entries: entries.slice(start, end), total: entries.length };
};

/** The prefiltered `entries` resolved (originals read as the store holds them) and evaluated. */
async function evaluate(
  store: SiteGraphStore,
  site: Site,
  entries: readonly ContentEntry[],
  q: { collection: string; query: ParsedFieldQuery; now: number },
): Promise<ContentEntry[]> {
  const byId = await originals(store, entries);
  const rows = entries.map((entry) => {
    const group = entry.translation?.group;
    const original = group && group !== entry.id ? byId.get(group) : undefined;
    return { entry, resolved: resolveFields(site, entry, original) };
  });
  const sort = site.collections?.[q.collection]?.sort ?? "newest";
  return applyFieldQuery(rows, q.query, { now: q.now, sort });
}

/**
 * The in-memory answer: the store's prefilter, then the evaluator over every entry it returns.
 * The definition `queryContentEntries` answers by, and the pushdown's oracle in tests.
 */
export async function scanFieldQuery(
  store: SiteGraphStore,
  site: Site,
  query: ParsedFieldQuery,
  q: FieldEntryListQuery & { collection: string },
): Promise<FieldEntryList> {
  const { where: _w, orderBy: _o, limit: _l, offset: _f, now, ...prefilter } = q;
  const entries = await store.listContentEntries(site.id, prefilter);
  return slicePage(await evaluate(store, site, entries, { ...q, query, now }), q);
}

/**
 * The entries of `q.collection` matching `q.where`, ordered by `q.orderBy` (else the store's
 * order), paged by `limit`/`offset`. Refuses as `invalid_query` (with paths) when the query does
 * not check against the collection's list fields.
 */
export async function queryContentEntries(
  store: SiteGraphStore,
  siteId: string,
  q: FieldEntryListQuery,
): Promise<FieldEntryList> {
  const bounds = checkBounds(q);
  if (bounds.length > 0) refuse(bounds);
  const { where, orderBy, limit: _l, offset: _f, now, ...prefilter } = q;
  const { collection } = q;
  if (collection === undefined || (where === undefined && orderBy === undefined))
    return slicePage(await store.listContentEntries(siteId, prefilter), q);
  // A term filter is compiled by the store's scan, and refused there first, as before.
  const listed =
    prefilter.filter === undefined ? undefined : await store.listContentEntries(siteId, prefilter);
  const site = await store.getSite(siteId);
  if (!site) throw new NotFoundError("site", siteId);
  const parsed = parseFieldQuery(site, collection, { where, orderBy });
  if (!parsed.ok) return refuse(parsed.issues);
  const query = parsed.query;
  if (listed) return slicePage(await evaluate(store, site, listed, { collection, query, now }), q);
  const pushed = await queryListValues(store.sql, site, { ...q, collection, query });
  return pushed ?? scanFieldQuery(store, site, query, { ...q, collection });
}
