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
  const header = html.slice(
    html.indexOf("<header"),
    html.indexOf("</header>") + "</header>".length,
  );
  // The phone menu (RFC-0025 25b) repeats the bar's menus: `menuOf` reads it on its own.
  const slot = header.indexOf('<div class="ch-menu-slot">');
  return slot < 0 ? header : `${header.slice(0, slot)}</div></header>`;
}

/** The header's phone menu (RFC-0025 §2): its disclosure or dialog link, with its panel. */
export function menuOf(html: string): string {
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  const slot = header.indexOf('<div class="ch-menu-slot">');
  return slot < 0 ? "" : header.slice(slot);
}

/** The `<footer>…</footer>` of a rendered page. */
export function footerOf(html: string): string {
  return html.slice(html.indexOf("<footer"), html.indexOf("</footer>") + "</footer>".length);
}

/**
 * The header's search form, rendered where the deployment answers searches (RFC-0019 §3). */
export const HEADER_SEARCH =
  '<form class="ch-header-search" method="get" action="/search" role="search"><label for="ch-header-q" class="sr-only">Search this site</label><input id="ch-header-q" type="search" name="q" value maxlength="200" placeholder="Search articles…"><button type="submit" class="sr-only">Search</button></form>';

/**
 * The derived header (no menu, no chrome: RFC-0025's defaults), byte for byte: the top-level pages,
 * then the served top-level categories; `current` names the item whose href is the path or a prefix of it.
 */
export function derivedHeader(
  siteName: string,
  links: ReadonlyArray<{ href: string; label: string; current?: boolean }>,
  options: { search?: boolean } = {},
): string {
  const a = (l: { href: string; label: string; current?: boolean }) =>
    l.current
      ? `<a href="${l.href}" aria-current="page" class="text-zinc-900">${l.label}</a>`
      : `<a href="${l.href}" class="hover:text-zinc-900">${l.label}</a>`;
  const nav = links.length
    ? `<nav class="ch-header__nav" aria-label="Main">${links.map(a).join("")}</nav>`
    : "";
  const actions = options.search ? `<div class="ch-header__actions">${HEADER_SEARCH}</div>` : "";
  return `<header class="ch-header" data-layout="logo-left" data-behavior="static" data-width="content" data-surface="plain" data-collapse="md"><div class="ch-header__inner"><a href="/" class="ch-header__brand">${siteName}</a>${nav}${actions}</div></header>`;
}

export const DEFAULT_FOOTER =
  '<footer class="ch-footer" data-layout="simple" data-surface="plain"><div class="ch-footer__inner"><div class="ch-footer__legal"><span>Built with Cloudhal</span><a href="/rss.xml" class="hover:text-zinc-700">RSS</a></div></div></footer>';
