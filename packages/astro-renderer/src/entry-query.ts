/**
 * RFC-0042 §4: listings by field for themes. `queryEntries(source, q)` lists a collection's entries
 * filtered by its list fields (`where`), ordered by one (`orderBy`), on top of the RFC-0002 term
 * filter and the collection's `sort`, paged. Both published sources run the same evaluator
 * (`evaluateEntryQuery`) over what they show, with core-ts's `fields/query.ts` deciding each
 * condition, so live and snapshot answer alike. Pure, Worker-safe; `now` is the source's clock.
 *
 * On a published site an invalid query matches nothing and is logged ("a published snapshot must
 * keep rendering", like unknown terms in `entriesByFilter`): writers refuse invalid queries, so it
 * only happens after a definition changed.
 */
import type {
  ContentEntry,
  ContentListSection,
  FieldCondition,
  FieldOrder,
  Section,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import {
  compareByField,
  matchesFieldQuery,
  originalsOf,
  parseFieldQuery,
  type ResolvedFields,
  resolveFields,
} from "@cloudhal/core-ts/fields";
import { matches } from "@cloudhal/core-ts/filter";
import type { GraphSource } from "./source.ts";
import { compile } from "./source-helpers.ts";

/** A theme's listing by field (RFC-0042 §4). */
export interface FieldEntryQuery {
  readonly collection: string;
  /** Default: the site's. */
  readonly locale?: string | undefined;
  readonly where?: readonly FieldCondition[] | undefined;
  readonly orderBy?: FieldOrder | undefined;
  /** Default: the collection's `sort` (absent: newest). Ties after `orderBy`, then `id`. */
  readonly sort?: "newest" | "oldest" | "title" | undefined;
  /** An RFC-0002 term filter, unchanged (`category:news+tag:ai`). */
  readonly filter?: string | undefined;
  /** 1–100; default 20. */
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  /** Also unlisted (not hidden) entries past their derived gate: "past events". */
  readonly includeExpired?: boolean | undefined;
}

export interface FieldEntryResult {
  readonly entries: ContentEntry[];
  /** Matches before paging. */
  readonly total: number;
}

export const QUERY_DEFAULT_LIMIT = 20;
export const QUERY_MAX_LIMIT = 100;

/** What a source hands the evaluator. */
export interface EntryQueryInput {
  readonly site: Site;
  /** The entries this source shows for the query (listed, or reachable with `includeExpired`). */
  readonly candidates: readonly ContentEntry[];
  /** Published entries a translation may read non-localized values from. */
  readonly published: readonly ContentEntry[];
  readonly taxonomies: readonly Taxonomy[];
  readonly terms: readonly Term[];
  readonly query: FieldEntryQuery;
  /** Epoch ms; `now` in conditions compares with it. */
  readonly now: number;
  /** Resolved values by entry id, reused across queries (a snapshot's are immutable). */
  readonly cache?: Map<string, ResolvedFields> | undefined;
}

const published = (e: ContentEntry) => e.publishedAt ?? e.createdAt;

/** The listing order of RFC-0040's `sort`, as `ContentList` has always drawn it. */
function bySort(sort: FieldEntryQuery["sort"]): (a: ContentEntry, b: ContentEntry) => number {
  if (sort === "title") return (a, b) => a.title.localeCompare(b.title);
  if (sort === "oldest") return (a, b) => published(a).localeCompare(published(b));
  return (a, b) => published(b).localeCompare(published(a));
}

const byId = (a: ContentEntry, b: ContentEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const clampInt = (n: number | undefined, min: number, max: number, fallback: number) =>
  n === undefined || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, Math.trunc(n)));

/** The term filter as a predicate; an invalid one matches nothing (logged). */
function termPredicate(input: EntryQueryInput): ((e: ContentEntry) => boolean) | undefined {
  const { filter } = input.query;
  if (!filter) return undefined;
  try {
    const f = compile(filter, [...input.taxonomies], [...input.terms]);
    return (e) => matches(f, e);
  } catch (err) {
    console.warn(`cloudhal: query filter "${filter}" is invalid: ${String(err)}`);
    return () => false;
  }
}

/** Runs a query over what a source shows. Pure. */
export function evaluateEntryQuery(input: EntryQueryInput): FieldEntryResult {
  const { site, query: q } = input;
  const limit = clampInt(q.limit, 1, QUERY_MAX_LIMIT, QUERY_DEFAULT_LIMIT);
  const offset = clampInt(q.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const sort = bySort(q.sort ?? site.collections?.[q.collection]?.sort ?? "newest");
  const byTerms = termPredicate(input);
  let rows = input.candidates.filter((e) => !byTerms || byTerms(e));
  if (q.where?.length || q.orderBy) {
    const parsed = parseFieldQuery(site, q.collection, { where: q.where, orderBy: q.orderBy });
    if (!parsed.ok) {
      const shown = parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
      console.warn(`cloudhal: query on ${q.collection} matches nothing: ${shown}`);
      return { entries: [], total: 0 };
    }
    const originalOf = originalsOf(input.published);
    const cache = input.cache ?? new Map<string, ResolvedFields>();
    const values = (e: ContentEntry): ResolvedFields => {
      const known = cache.get(e.id);
      if (known) return known;
      const v = resolveFields(site, e, originalOf(e));
      cache.set(e.id, v);
      return v;
    };
    rows = rows.filter((e) => matchesFieldQuery(values(e), parsed.query, input.now));
    rows.sort(
      (a, b) => compareByField(values(a), values(b), parsed.query) || sort(a, b) || byId(a, b),
    );
  } else rows = [...rows].sort((a, b) => sort(a, b) || byId(a, b));
  return { entries: rows.slice(offset, offset + limit), total: rows.length };
}

/** What a list handed to a theme came from: its source and locale, or a query already run. */
type ListOrigin = { readonly source: GraphSource; readonly locale: string } | "queried";
const origins = new WeakMap<readonly ContentEntry[], ListOrigin>();

/**
 * Marks a list a source returned (`entries`, `entriesByFilter`) so `ContentList` can apply a
 * section's `where`/`orderBy` even for theme copies from before RFC-0042, which pass the
 * collection's list as it is. Returns the list.
 */
export function rememberList<T extends readonly ContentEntry[]>(list: T, origin: ListOrigin): T {
  origins.set(list, origin);
  return list;
}

/** Where a list came from, if a source or `queryEntries` made it. */
export function listOrigin(list: readonly ContentEntry[]): ListOrigin | undefined {
  return origins.get(list);
}

/**
 * Lists `q.collection` by its list fields on any source: the source's own `queryEntries`, or, on
 * sources from before RFC-0042, the same evaluator over `entries()` (no `includeExpired` there).
 */
export async function queryEntries(
  source: GraphSource,
  q: FieldEntryQuery,
): Promise<FieldEntryResult> {
  const result = source.queryEntries
    ? await source.queryEntries(q)
    : await (async () => {
        const site = await source.site();
        const candidates = await source.entries(q.collection, q.locale);
        const [taxonomies, terms] = q.filter
          ? await Promise.all([source.taxonomies(), source.vocabulary()])
          : [[], []];
        return evaluateEntryQuery({
          site,
          candidates,
          published: candidates,
          taxonomies,
          terms,
          query: q,
          now: Date.now(),
        });
      })();
  rememberList(result.entries, "queried");
  return result;
}

/** The query a `contentList` section with `where`/`orderBy` runs (its own `limit`, at most 100). */
export function sectionQuery(section: ContentListSection, locale?: string): FieldEntryQuery {
  return {
    collection: section.collection,
    locale,
    sort: section.sort,
    limit: Math.min(section.limit, QUERY_MAX_LIMIT),
    ...(section.where ? { where: section.where } : {}),
    ...(section.orderBy ? { orderBy: section.orderBy } : {}),
    ...(section.filter ? { filter: section.filter } : {}),
  };
}

/** True when a section lists by field (RFC-0042). */
export const listsByField = (section: ContentListSection): boolean =>
  section.where !== undefined || section.orderBy !== undefined;

/**
 * The entries a page's `contentList` sections draw, keyed as `Sections` reads them: by collection
 * (the collection's newest listed entries), by section id for a section with a term `filter`
 * (RFC-0002), and by section id for a section with `where`/`orderBy` (RFC-0042, through
 * `queryEntries`). An invalid filter lists nothing and is logged.
 */
export async function contentListEntries(
  source: GraphSource,
  sections: readonly Section[],
  locale?: string,
): Promise<Record<string, ContentEntry[]>> {
  const lists = sections.filter((s): s is ContentListSection => s.kind === "contentList");
  const out: Record<string, ContentEntry[]> = {};
  for (const c of new Set(lists.map((s) => s.collection))) out[c] = await source.entries(c, locale);
  for (const s of lists) {
    if (listsByField(s)) out[s.id] = (await queryEntries(source, sectionQuery(s, locale))).entries;
    else if (s.filter)
      out[s.id] = await source
        .entriesByFilter(`collection:${s.collection}+${s.filter}`, locale ? { locale } : {})
        .catch((err: unknown) => {
          console.warn(`cloudhal: section ${s.id} has an invalid filter: ${String(err)}`);
          return [];
        });
  }
  return out;
}
