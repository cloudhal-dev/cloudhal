/**
 * How URLs map onto the graph, shared by the starter's catch-all route, sitemaps, feeds and
 * previews: a Page owns its `path`; an entry lives at `/<collection>/<slug>`. Pages win when both
 * could answer, so a page at `/posts/x` is never shadowed by an article.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import type { GraphSource } from "./source.ts";

export function entryPath(entry: Pick<ContentEntry, "collection" | "slug">): string {
  return `/${entry.collection}/${entry.slug}`;
}

export type Resolved = { kind: "page"; page: Page } | { kind: "entry"; entry: ContentEntry };

/** The page or entry at `path` (leading slash, no trailing slash except "/"), if any. */
export async function resolvePath(
  source: GraphSource,
  path: string,
): Promise<Resolved | undefined> {
  const page = await source.pageByPath(path);
  if (page) return { kind: "page", page };
  const m = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (!m) return undefined;
  const entry = await source.entryBySlug(m[1] as string, m[2] as string);
  return entry ? { kind: "entry", entry } : undefined;
}

/** Every routable path of the default locale (static builds: `getStaticPaths`). */
export async function routablePaths(source: GraphSource): Promise<string[]> {
  const pages = await source.pages();
  const site = await source.site();
  const pagePaths = pages.filter((p) => p.locale === site.defaultLocale).map((p) => p.path);
  const taken = new Set(pagePaths);
  const entryPaths = (await source.allEntries()).map(entryPath).filter((p) => !taken.has(p));
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
