/**
 * Site search's shared vocabulary (RFC-0019 §3, RFC-0029 §1): limits, snippet markers, the row the
 * index stores, the results readers get and the query rules every provider applies. Worker-safe.
 */

/** The site's search page (a reserved path; pages cannot take it). */
export const SEARCH_PATH = "/search";
/** Results per search page. */
export const SEARCH_PAGE_SIZE = 20;
/** The longest query a reader may send (characters). */
export const SEARCH_QUERY_MAX = 200;
/** At most this many words of a query are searched. */
export const SEARCH_TERMS_MAX = 8;
/** Body text kept per row (characters): enough to find it, bounded per row. */
export const SEARCH_TEXT_MAX = 20_000;
/** Snippet markers: control characters a body never keeps, replaced by `<mark>` after escaping. */
export const MARK_OPEN = "\u0002";
export const MARK_CLOSE = "\u0003";

/** What a result is (RFC-0029 §1). Rows from before kinds read as `article`. */
export type SearchKind = "article" | "page" | "term" | "author";
export const SEARCH_KINDS: readonly SearchKind[] = ["article", "page", "term", "author"];

/** One searchable node in one locale, as the index stores it. */
export interface SearchRow {
  nodeId: string;
  locale: string;
  kind: SearchKind;
  title: string;
  summary: string;
  body: string;
  href: string;
  /** What the hit belongs to, shown next to it (a term's taxonomy: "Category", "Author"). */
  context?: string | undefined;
  publishedAt?: string | undefined;
  gateFrom?: string | undefined;
  gateUntil?: string | undefined;
  /** An article's term ids: a term or author is found only while a visible article carries it. */
  terms?: string[] | undefined;
}

/** One search result: the snippet carries `MARK_OPEN`/`MARK_CLOSE` around matches, unescaped. */
export interface SearchHit {
  nodeId: string;
  title: string;
  href: string;
  snippet: string;
  publishedAt?: string | undefined;
  /** Absent only in results from before RFC-0029 (then an article). */
  kind?: SearchKind | undefined;
  context?: string | undefined;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
  /** The index reflects another snapshot than the live one (a publish is being indexed). */
  stale: boolean;
  /** The provider that answered (RFC-0029 §1, invariant 3). */
  provider?: string | undefined;
}

export interface SearchOptions {
  locale: string;
  page?: number;
  perPage?: number;
  /** The reader's instant (ms) for time gates. */
  now: number;
  /** The snapshot readers see; when the index reflects another, the results say `stale`. */
  snapshotId?: string | undefined;
  /** Only these kinds (default: all). */
  kinds?: readonly SearchKind[] | undefined;
}

/**
 * A reader's query as an FTS5 expression: up to `SEARCH_TERMS_MAX` words of letters and digits,
 * each quoted and matched as a prefix, all required. Undefined when nothing searchable is left.
 */
export function ftsQuery(query: string): string | undefined {
  const terms = queryWords(query);
  return terms.length > 0 ? terms.map((w) => `"${w}"*`).join(" ") : undefined;
}

/** The searchable words of a query: letters and digits, at most `SEARCH_TERMS_MAX`. */
export function queryWords(query: string): string[] {
  const words =
    query
      .slice(0, SEARCH_QUERY_MAX)
      .normalize("NFKC")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.slice(0, SEARCH_TERMS_MAX);
}

/** The page size and page number of a request, clamped. */
export function searchPaging(options: Pick<SearchOptions, "page" | "perPage">): {
  perPage: number;
  page: number;
} {
  return {
    perPage: Math.min(Math.max(1, options.perPage ?? SEARCH_PAGE_SIZE), 50),
    page: Math.max(1, Math.trunc(options.page ?? 1)),
  };
}

/** The kinds a request asks for (all when none or only unknown ones are named). */
export function searchKinds(kinds: readonly string[] | undefined): SearchKind[] {
  const known = (kinds ?? []).filter((k): k is SearchKind =>
    (SEARCH_KINDS as readonly string[]).includes(k),
  );
  return known.length > 0 ? [...new Set(known)] : [...SEARCH_KINDS];
}

/** Terms and authors stand for archives: found only while a visible article links them. */
export function isArchiveKind(kind: SearchKind): boolean {
  return kind === "term" || kind === "author";
}
