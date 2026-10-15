/**
 * Site search for themes (RFC-0019 §3): the `/search` route's view, safe snippet HTML and whether
 * the deployment can answer searches at all (static builds cannot; their themes hide the form).
 * Worker-safe.
 */
import { MARK_CLOSE, MARK_OPEN, SEARCH_PATH, type SearchResults } from "@cloudhal/core-ts";
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
