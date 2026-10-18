/**
 * Site search for themes (RFC-0019 §3, RFC-0029 §5): the `/search` route's view, safe snippet HTML,
 * the modal's `/search.json` answer and whether the deployment can answer searches at all (static
 * builds cannot; their themes hide the form).
 * Worker-safe.
 */
import {
  MARK_CLOSE,
  MARK_OPEN,
  SEARCH_PATH,
  type SearchKind,
  type SearchResults,
  searchKinds,
} from "@cloudhal/core-ts";
import type { CloudhalRendererConfig } from "./integration.ts";
import type { GraphSource } from "./source.ts";

export { SEARCH_PATH } from "@cloudhal/core-ts";

/** What the `/search` route hands the theme. */
export type SearchView = SearchResults;

/** The `q` and page of a search request (`?q=…&page=n`); the query is capped by the store. */
export function searchRequest(search: string): { query: string; page: number } {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page") ?? "1");
  return {
    query: params.get("q") ?? "",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The URL of a results page (page 1 has no `page` parameter). */
export function searchPageHref(query: string, page: number): string {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));
  return `${SEARCH_PATH}?${params}`;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/** A hit's snippet as HTML: the text escaped first, then `<mark>` around the matches. */
export function snippetHtml(snippet: string): string {
  return escapeHtml(snippet).replaceAll(MARK_OPEN, "<mark>").replaceAll(MARK_CLOSE, "</mark>");
}

/**
 * True when this deployment answers `/search`: the Cloudflare Site Worker and `cloudhal dev` (a
 * live source). A static `cloudhal build` renders a snapshot ahead of time with no server to ask,
 * so its theme shows no search form.
 */
export function searchAvailable(
  config: Pick<CloudhalRendererConfig, "target">,
  source: Pick<GraphSource, "mode" | "search">,
): boolean {
  return source.search !== undefined && (config.target === "cloudflare" || source.mode === "live");
}

// ── RFC-0029 §5: the JSON the search modal asks ───────────────────────────────────────────────

/** The modal's endpoint (`GET /search.json?q=&kinds=&page=`): same index, same rules as `/search`. */
export const SEARCH_JSON_PATH = "/search.json";
/** Hits the modal shows per request. */
export const SEARCH_SUGGEST_SIZE = 8;

/** One hit as the modal receives it: the snippet already escaped and marked (`snippetHtml`). */
export interface SearchJsonHit {
  title: string;
  href: string;
  kind: SearchKind;
  context?: string;
  snippetHtml: string;
  publishedAt?: string;
}

export interface SearchJson {
  query: string;
  total: number;
  page: number;
  pages: number;
  stale: boolean;
  hits: SearchJsonHit[];
}

/** A modal request: `q`, `page`, `kinds` (comma-separated, unknown ones ignored). */
export function searchJsonRequest(search: string): {
  query: string;
  page: number;
  kinds: SearchKind[] | undefined;
} {
  const kinds = new URLSearchParams(search).get("kinds");
  return {
    ...searchRequest(search),
    kinds: kinds ? searchKinds(kinds.split(",")) : undefined,
  };
}

/** Results as JSON for the modal: no node ids, snippets as safe HTML. */
export function searchJson(results: SearchResults): SearchJson {
  return {
    query: results.query,
    total: results.total,
    page: results.page,
    pages: results.pages,
    stale: results.stale,
    hits: results.hits.map((h) => ({
      title: h.title,
      href: h.href,
      kind: h.kind ?? "article",
      ...(h.context ? { context: h.context } : {}),
      snippetHtml: snippetHtml(h.snippet),
      ...(h.publishedAt ? { publishedAt: h.publishedAt } : {}),
    })),
  };
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // per query: never in a browser or edge cache, never in search engines (RFC-0019 §3)
  "cache-control": "no-store",
  "cloudflare-cdn-cache-control": "no-store",
  "x-robots-tag": "noindex",
};

/**
 * The `/search.json` route's answer: the source's results as `SearchJson`, or an empty `404` where
 * the deployment does not answer searches (static builds). Themes call it from their route file.
 */
export async function searchJsonResponse(
  config: Pick<CloudhalRendererConfig, "target">,
  source: Pick<GraphSource, "mode" | "search"> | undefined,
  url: URL,
  options: { locale?: string; localize?: ((path: string) => string) | undefined } = {},
): Promise<Response> {
  // No body: a static build, which prerenders the route once, then writes no file at all.
  if (!source?.search || !searchAvailable(config, source))
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  const { query, page, kinds } = searchJsonRequest(url.search);
  const results = await source.search(query, {
    page,
    perPage: SEARCH_SUGGEST_SIZE,
    ...(kinds ? { kinds } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
  });
  // RFC-0033: hits link to the locale's URLs (`linkLocalizer`).
  const { localize } = options;
  const shown = localize
    ? { ...results, hits: results.hits.map((h) => ({ ...h, href: localize(h.href) })) }
    : results;
  return new Response(JSON.stringify(searchJson(shown)), { headers: JSON_HEADERS });
}
