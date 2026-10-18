/**
 * The site's own "not found" page (RFC-0033 §4): a site may author a page at `/404`; its
 * translations (the page's translation group, at any path) are the not-found page of their
 * locales. A route answers a miss with the version in the request's locale, else (with
 * `localization.fallback: "default-with-notice"`) the default locale's, else nothing — the theme
 * then draws its built-in one in the request's locale. The page itself also answers `404` and stays
 * out of sitemaps and `llms.txt`. No contract change: `/404` is an ordinary page path. Worker-safe.
 */
import type { Page, Site } from "@cloudhal/core-contracts";
import type { GraphSource } from "./source.ts";

/** Where a site authors its not-found page. */
export const NOT_FOUND_PATH = "/404";

/** Ids of the pages that are a not-found page: those at `/404` and their translation groups. */
export function notFoundPageIds(pages: readonly Page[]): Set<string> {
  const groups = new Set(
    pages.filter((p) => p.path === NOT_FOUND_PATH).map((p) => p.translation?.group ?? p.id),
  );
  return new Set(
    pages
      .filter((p) => groups.has(p.id) || (p.translation && groups.has(p.translation.group)))
      .map((p) => p.id),
  );
}

/** The authored not-found page to show for a miss in `locale`, if the site has one. */
export async function notFoundPage(
  source: GraphSource,
  site: Site,
  locale: string,
): Promise<Page | undefined> {
  const pages = await source.pages();
  const ids = notFoundPageIds(pages);
  const versions = pages.filter((p) => ids.has(p.id));
  const own = versions.find((p) => p.locale === locale);
  if (own) return own;
  return site.localization?.fallback === "default-with-notice"
    ? versions.find((p) => p.locale === site.defaultLocale)
    : undefined;
}
