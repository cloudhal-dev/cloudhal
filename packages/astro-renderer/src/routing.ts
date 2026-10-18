/**
 * How URLs map onto the graph, shared by the starter's routes, sitemaps, feeds and previews: a
 * Page owns its `path`; an entry lives at `/<collection>/<slug>`; a term archive at
 * `<basePath>/<slug>[/page/<n>|/rss.xml]` (RFC-0002 §7). Pages win when several could answer, so a
 * page at `/posts/x` is never shadowed by an article. Anything else asks the site's redirects
 * before it is a 404 (or a 410 for a retired term).
 */
import type { ContentEntry, Page, Redirect, Site } from "@cloudhal/core-contracts";
import { normalisePath, SEARCH_PATH, termName } from "@cloudhal/core-ts";
import {
  type ArchiveSummary,
  type ArchiveView,
  archiveState,
  archiveSummaries,
  DEFAULT_ARCHIVE_PAGE_SIZE,
  pageCount,
  parseArchivePath,
  termForSlug,
} from "./archive.ts";
import { PREVIEW_PARAM } from "./resolver.ts";
import { type SearchView, searchRequest } from "./search.ts";
import type { GraphSource } from "./source.ts";
import {
  archiveFeedPath,
  archivePagePath,
  isPublicTerm,
  loadTaxonomyIndex,
  publicTrail,
  shownTerm,
  type TaxonomyIndex,
  taxonomyIndex,
} from "./taxonomy.ts";

export function entryPath(entry: Pick<ContentEntry, "collection" | "slug">): string {
  return `/${entry.collection}/${entry.slug}`;
}

export type Resolved = { kind: "page"; page: Page } | { kind: "entry"; entry: ContentEntry };

/** The page or entry at `path` (leading slash, no trailing slash except "/") in `locale`, if any. */
export async function resolvePath(
  source: GraphSource,
  path: string,
  locale?: string,
): Promise<Resolved | undefined> {
  const page = await source.pageByPath(path, locale);
  if (page) return { kind: "page", page };
  const m = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (!m) return undefined;
  const entry = await source.entryBySlug(m[1] as string, m[2] as string, locale);
  return entry ? { kind: "entry", entry } : undefined;
}

/** Every page and entry path of a locale (default: the site's), as graph paths without prefix. */
export async function routablePaths(source: GraphSource, locale?: string): Promise<string[]> {
  const pages = await source.pages();
  const loc = locale ?? (await source.site()).defaultLocale;
  const pagePaths = pages.filter((p) => p.locale === loc).map((p) => p.path);
  const taken = new Set(pagePaths);
  const entryPaths = (await source.allEntries(loc)).map(entryPath).filter((p) => !taken.has(p));
  return [...pagePaths, ...entryPaths];
}

export interface NavLink {
  href: string;
  label: string;
  /** The current page or one of its children. */
  current: boolean;
}

/**
 * The header navigation until a navigation editor exists: the site's top-level pages in the
 * site's page order (home excluded), in the default locale.
 */
export function navLinks(site: Site, pages: Page[], currentPath: string): NavLink[] {
  return pages
    .filter((p) => p.locale === site.defaultLocale && p.path !== "/" && /^\/[^/]+$/.test(p.path))
    .map((p) => ({
      href: p.path,
      label: p.title,
      current: currentPath === p.path || currentPath.startsWith(`${p.path}/`),
    }));
}

/**
 * Top-level categories with a served archive, by `position` then name (themes choose whether to
 * show them; the blog starter appends them to `navLinks`).
 */
export function categoryNavLinks(
  archives: readonly ArchiveSummary[],
  currentPath: string,
  locale: string,
): NavLink[] {
  return archives
    .filter((a) => a.taxonomy.key === "category" && !a.term.parentId)
    .map((a) => ({
      href: a.path,
      label: termName(a.term, locale),
      current: currentPath === a.path || currentPath.startsWith(`${a.path}/`),
    }));
}

export type RouteResult =
  | { readonly kind: "page"; readonly page: Page }
  | { readonly kind: "entry"; readonly entry: ContentEntry }
  | { readonly kind: "archive"; readonly archive: ArchiveView; readonly index: TaxonomyIndex }
  | { readonly kind: "feed"; readonly archive: ArchiveView; readonly index: TaxonomyIndex }
  | { readonly kind: "search"; readonly search: SearchView }
  | { readonly kind: "redirect"; readonly status: 301 | 302; readonly location: string }
  | { readonly kind: "gone" }
  | { readonly kind: "not-found" };

export interface RouteOptions {
  /** Entries per archive page. Default `DEFAULT_ARCHIVE_PAGE_SIZE`. */
  readonly perPage?: number;
  /** The request's query string (`?a=b`), kept on redirects. */
  readonly search?: string;
  /** The locale the request is for (RFC-0033; `localeRequest`). Default: the site's. */
  readonly locale?: string;
}

/**
 * A redirect's `Location`: the matched location (core-ts `joinTarget` already appended the rest
 * of a prefix match) plus the request's query string, merged into a query the target already has
 * and placed before its fragment. A preview token never leaves the site.
 */
export function redirectLocation(location: string, search = ""): string {
  const params = new URLSearchParams(search);
  if (!location.startsWith("/")) params.delete(PREVIEW_PARAM);
  const query = params.toString();
  if (!query) return location;
  const hash = location.indexOf("#");
  const head = hash < 0 ? location : location.slice(0, hash);
  const tail = hash < 0 ? "" : location.slice(hash);
  return `${head}${head.includes("?") ? "&" : "?"}${query}${tail}`;
}

/**
 * Resolves a request path in the order of RFC-0002 §7: page → entry → archive (and its feed) →
 * redirect → 410 for a retired term → 404. A trailing slash is ignored. `/search` (RFC-0019 §3)
 * answers after pages, when the source can search: `?q=…&page=n`, past the last page a 404.
 */
export async function resolveRoute(
  source: GraphSource,
  requestPath: string,
  options: RouteOptions = {},
): Promise<RouteResult> {
  const path = normalisePath(requestPath);
  const site = await source.site();
  const locale = options.locale ?? site.defaultLocale;
  const resolved = await resolvePath(source, path, locale);
  if (resolved) return resolved;
  if (path === SEARCH_PATH && source.search) {
    const { query, page } = searchRequest(options.search ?? "");
    const search = await source.search(query, { page, locale });
    if (page > 1 && page > search.pages) return { kind: "not-found" };
    return { kind: "search", search };
  }
  let gone = false;
  const taxonomies = await source.taxonomies();
  const request = parseArchivePath(taxonomies, path);
  if (request) {
    const vocabulary = await source.vocabulary();
    const term = termForSlug(
      vocabulary.filter((t) => t.taxonomyId === request.taxonomy.id),
      request.slug,
      { locale, defaultLocale: site.defaultLocale },
    );
    const listed =
      term && isPublicTerm(term)
        ? await source.entriesByTerm(request.taxonomy.key, term.id, {
            locale,
            descendants: request.taxonomy.hierarchical,
          })
        : [];
    const state = archiveState(request.taxonomy, term, listed.length, locale);
    gone = state.status === 410;
    if (state.status === 200 && term) {
      if (request.explicitFirstPage)
        return {
          kind: "redirect",
          status: 301,
          location: redirectLocation(request.root, options.search),
        };
      const perPage = options.perPage ?? DEFAULT_ARCHIVE_PAGE_SIZE;
      const pages = pageCount(listed.length, perPage);
      const index = taxonomyIndex(taxonomies, vocabulary, locale, site.defaultLocale);
      const shown = shownTerm(index, term);
      const servesFeed = request.kind === "feed" && request.taxonomy.feed;
      if (shown && request.page <= pages && (request.kind === "page" || servesFeed)) {
        const archive: ArchiveView = {
          taxonomy: request.taxonomy,
          term,
          shown,
          trail: publicTrail(index, term),
          locale,
          root: request.root,
          path: archivePagePath(request.root, request.page),
          ...(request.taxonomy.feed ? { feedPath: archiveFeedPath(request.root) } : {}),
          page: request.page,
          pages,
          perPage,
          total: listed.length,
          entries:
            request.kind === "feed"
              ? listed
              : listed.slice((request.page - 1) * perPage, request.page * perPage),
          indexable: state.indexable,
        };
        return { kind: request.kind === "feed" ? "feed" : "archive", archive, index };
      }
    }
  }
  const redirect = await source.redirectFor(path, locale);
  if (redirect)
    return {
      kind: "redirect",
      status: redirect.redirect.status,
      location: redirectLocation(redirect.location, options.search),
    };
  return gone ? { kind: "gone" } : { kind: "not-found" };
}

/**
 * Request paths that a redirect answers and a static build can write a page for: every `from`,
 * and for prefix redirects the old twin of every served path under the target
 * (`/tag/old/page/2` for `/tag/new/page/2`). Feed paths (`…/rss.xml`) are left out: a
 * meta-refresh page cannot stand in for XML (`redirectsFile` covers them).
 */
export function redirectPaths(redirects: readonly Redirect[], served: readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of redirects) {
    out.add(r.from);
    if (r.match !== "prefix" || !r.to.startsWith("/")) continue;
    const target = r.to.split(/[?#]/, 1)[0] ?? r.to;
    for (const path of served)
      if (path.startsWith(`${target}/`)) out.add(`${r.from}${path.slice(target.length)}`);
  }
  const taken = new Set(served);
  return [...out].filter((p) => !taken.has(p) && p !== "/" && !/\.[a-z0-9]+$/i.test(p));
}

export interface StaticPaths {
  /** For the catch-all page route: pages, entries, archive pages, then paths that redirect. */
  readonly pages: string[];
  /** For the term feed route (`<archive>/rss.xml`). */
  readonly feeds: string[];
}

/**
 * Everything a static build writes (`getStaticPaths`): routable pages and entries, every page of
 * every served archive and its feed, and the paths redirects answer (Astro writes those as
 * meta-refresh pages; `redirectsFile` gives hosts the real 301s). 404s and 410s are not built.
 */
export async function staticPaths(
  source: GraphSource,
  options: { perPage?: number; locale?: string } = {},
): Promise<StaticPaths> {
  const perPage = options.perPage ?? DEFAULT_ARCHIVE_PAGE_SIZE;
  const site = await source.site();
  const locale = options.locale ?? site.defaultLocale;
  const tagged = locale === site.defaultLocale ? undefined : locale;
  const [base, index, entries, redirects] = await Promise.all([
    routablePaths(source, locale),
    loadTaxonomyIndex(source, locale),
    source.allEntries(locale),
    source.redirects().then((all) => all.filter((r) => r.locale === tagged)),
  ]);
  // The entries the source shows (a live dev source includes drafts), as `resolveRoute` counts them.
  const archives = archiveSummaries(index, entries);
  const taken = new Set(base);
  const archivePages = archives
    .flatMap((a) =>
      Array.from({ length: pageCount(a.total, perPage) }, (_, i) => archivePagePath(a.path, i + 1)),
    )
    .filter((p) => !taken.has(p));
  const served = [...base, ...archivePages];
  const feeds = archives.flatMap((a) => (a.feedPath ? [a.feedPath] : []));
  // `…/page/1` answers with a 301 to the archive root (a meta-refresh page in static builds).
  const firstPages = archives.map((a) => `${a.path}/page/1`);
  return {
    pages: [...served, ...firstPages, ...redirectPaths(redirects, [...served, ...feeds])],
    feeds,
  };
}
