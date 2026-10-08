/**
 * Machine-readable views of the published site: RSS 2.0, `sitemap.xml` and `robots.txt`. Pure
 * functions over graph nodes (the starter's endpoints only fetch and wrap them), so the rules —
 * published only, noindex respected, canonical elsewhere excluded — live in one tested place.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { renderBody } from "./markdown.ts";
import { entryPath } from "./routing.ts";
import { absoluteUrl } from "./seo.ts";

export const FEED_LIMIT = 50;

const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** CDATA cannot contain `]]>`; split it across two sections. */
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

function published<T extends { status: string }>(nodes: T[]): T[] {
  return nodes.filter((n) => n.status === "published");
}

export interface FeedOptions {
  site: Site;
  origin: string;
  /** Newest first; drafts are dropped here even when a live source includes them. */
  entries: ContentEntry[];
  /** Where the feed itself is served (for `atom:link rel=self`). */
  feedPath?: string;
  /** Channel description (e.g. the home page's SEO description); defaults to the site name. */
  description?: string;
}

/** RSS 2.0 with full content (`content:encoded`), as feed readers and Ghost/WordPress readers expect. */
export function rssXml(options: FeedOptions): string {
  const { site, origin } = options;
  const self = `${origin}${options.feedPath ?? "/rss.xml"}`;
  const items = published(options.entries)
    .slice(0, FEED_LIMIT)
    .map((e) => {
      const url = `${origin}${entryPath(e)}`;
      const date = new Date(e.publishedAt ?? e.createdAt).toUTCString();
      const image = absoluteUrl(origin, e.coverImage?.src);
      const author = e.author.kind === "human" && e.author.name ? e.author.name : site.name;
      return [
        "<item>",
        `<title>${xml(e.title)}</title>`,
        `<link>${xml(url)}</link>`,
        `<guid isPermaLink="true">${xml(url)}</guid>`,
        `<pubDate>${date}</pubDate>`,
        `<dc:creator>${cdata(author)}</dc:creator>`,
        ...e.tags.map((t) => `<category>${xml(t)}</category>`),
        e.summary ? `<description>${cdata(e.summary)}</description>` : "",
        image ? `<media:content url="${xml(image)}" medium="image"/>` : "",
        `<content:encoded>${cdata(renderBody(e.body))}</content:encoded>`,
        "</item>",
      ]
        .filter(Boolean)
        .join("");
    });
  const newest = published(options.entries)[0];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    "<channel>",
    `<title>${xml(site.name)}</title>`,
    `<link>${xml(`${origin}/`)}</link>`,
    `<description>${xml(options.description ?? site.name)}</description>`,
    `<language>${xml(site.defaultLocale)}</language>`,
    `<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
    "<generator>Cloudhal</generator>",
    newest
      ? `<lastBuildDate>${new Date(newest.publishedAt ?? newest.createdAt).toUTCString()}</lastBuildDate>`
      : "",
    ...items,
    "</channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface SitemapUrl {
  loc: string;
  lastmod: string;
}

/**
 * What belongs in `sitemap.xml`: published pages and entries of the default locale; pages asking
 * for `noindex`, or canonicalised to another URL, are left out (a sitemap lists canonical URLs).
 */
export function sitemapUrls(
  site: Site,
  pages: Page[],
  entries: ContentEntry[],
  origin: string,
): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  const seen = new Set<string>();
  for (const page of published(pages)) {
    if (page.locale !== site.defaultLocale || page.seo?.noindex) continue;
    const own = `${origin}${page.path === "/" ? "/" : page.path}`;
    const canonical = absoluteUrl(origin, page.seo?.canonical);
    if (canonical && canonical !== own) continue;
    seen.add(page.path);
    urls.push({ loc: own, lastmod: page.updatedAt });
  }
  for (const entry of published(entries)) {
    const path = entryPath(entry);
    if (entry.locale !== site.defaultLocale || seen.has(path)) continue;
    urls.push({ loc: `${origin}${path}`, lastmod: entry.updatedAt });
  }
  return urls;
}

export function sitemapXml(urls: SitemapUrl[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `<url><loc>${xml(u.loc)}</loc><lastmod>${xml(u.lastmod)}</lastmod></url>`),
    "</urlset>",
  ].join("\n");
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}
