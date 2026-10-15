/**
 * RFC-0003 public-site fixture shared by the static build (`e2e.test.ts`) and the Site Worker
 * (`cloudflare.test.ts`) tests, applied after the taxonomy fixture (News has published posts):
 *
 * - a published `/team` page (deleted later in the tests: its item must disappear);
 * - `primary`: About relabelled "Who we are", Team, a "Topics" group holding the News archive and
 *   a "Blog" collection item (the home page lists posts), and an external GitHub link in a new tab;
 * - `footer`: one external "Status" link (replaces the footer's RSS link).
 */
import type { Menu, Page } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";

export interface MenuFixture {
  readonly team: Page;
  readonly primary: Menu;
  readonly footer: Menu;
  readonly newsTermId: string;
}

export async function applyMenuFixture(
  store: SiteGraphStore,
  siteId: string,
): Promise<MenuFixture> {
  const site = await store.getSite(siteId);
  if (!site) throw new Error("fixture: no site");
  const about = (await store.listPages(siteId)).find((p) => p.path === "/about");
  const news = await store.getTermBySlug(siteId, "category", "news");
  if (!about || !news) throw new Error("fixture: seed pages or terms missing");
  const { page: team } = await store.createPage(site, {
    siteId,
    path: "/team",
    title: "Team",
    locale: "en",
    status: "published",
    sections: [{ id: "sec_team0000001", kind: "hero", heading: "Team" }],
  });
  const primary = await store.createMenu({
    siteId,
    key: "primary",
    maxDepth: 3,
    items: [
      { id: "item_ABOUT00001", kind: "page", pageId: about.id, labels: { en: "Who we are" } },
      { id: "item_TEAM000001", kind: "page", pageId: team.id },
      {
        id: "item_TOPICS0001",
        kind: "group",
        labels: { en: "Topics" },
        children: [
          { id: "item_NEWS000001", kind: "term", termId: news.id },
          {
            id: "item_BLOG000001",
            kind: "collection",
            collection: "posts",
            labels: { en: "Blog" },
          },
        ],
      },
      {
        id: "item_GH00000001",
        kind: "url",
        href: "https://github.com/cloudhal-dev",
        labels: { en: "GitHub" },
        newTab: true,
      },
    ],
  });
  const footer = await store.createMenu({
    siteId,
    key: "footer",
    maxDepth: 2,
    items: [
      {
        id: "item_STATUS0001",
        kind: "url",
        href: "https://status.example.com",
        labels: { en: "Status" },
      },
    ],
  });
  return { team, primary, footer, newsTermId: news.id };
}

/** The `<header>…</header>` of a rendered page. */
export function headerOf(html: string): string {
  return html.slice(html.indexOf("<header"), html.indexOf("</header>") + "</header>".length);
}

/** The `<footer>…</footer>` of a rendered page. */
export function footerOf(html: string): string {
  return html.slice(html.indexOf("<footer"), html.indexOf("</footer>") + "</footer>".length);
}

/**
 * Today's derived header (no menu), byte for byte: the top-level pages, then the served top-level
 * categories; `current` names the item whose href is the path or a prefix of it.
 */
/** The header's search form, rendered where the deployment answers searches (RFC-0019 §3). */
export const HEADER_SEARCH =
  '<form class="ch-header-search" method="get" action="/search" role="search"><label for="ch-header-q" class="sr-only">Search this site</label><input id="ch-header-q" type="search" name="q" value maxlength="200" placeholder="Search articles…"><button type="submit" class="sr-only">Search</button></form>';

export function derivedHeader(
  siteName: string,
  links: ReadonlyArray<{ href: string; label: string; current?: boolean }>,
  options: { search?: boolean } = {},
): string {
  const a = (l: { href: string; label: string; current?: boolean }) =>
    l.current
      ? `<a href="${l.href}" aria-current="page" class="text-zinc-900">${l.label}</a>`
      : `<a href="${l.href}" class="hover:text-zinc-900">${l.label}</a>`;
  return `<header class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6"><a href="/" class="text-lg font-semibold">${siteName}</a><nav class="flex flex-wrap gap-4 text-sm text-zinc-600" aria-label="Main">${links.map(a).join("")}</nav>${options.search ? HEADER_SEARCH : ""}</header>`;
}

export const DEFAULT_FOOTER =
  '<footer class="mx-auto flex max-w-3xl justify-between gap-4 px-4 py-8 text-xs text-zinc-500"><span>Built with Cloudhal</span><a href="/rss.xml" class="hover:text-zinc-700">RSS</a></footer>';
