/**
 * Machine-readable views of the published site: RSS 2.0, `sitemap.xml` and `robots.txt`. Pure
 * functions over graph nodes (the starter's endpoints only fetch and wrap them), so the rules —
 * published only, noindex respected, canonical elsewhere excluded — live in one tested place.
 */
import type { ContentEntry, Page, Redirect, Site } from "@cloudhal/core-contracts";
import type { ArchiveSummary, ArchiveView } from "./archive.ts";
import { markdownText, renderBody } from "./markdown.ts";
import type { AssetIndex } from "./media.ts";
import { entryPath } from "./routing.ts";
import { absoluteUrl } from "./seo.ts";
import { entryTaxonomy, type TaxonomyIndex } from "./taxonomy.ts";

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
  /** Channel title; defaults to the site name. */
  title?: string;
  /** Channel link path (the page the feed mirrors); defaults to the home page. */
  linkPath?: string;
  /**
   * The site's terms: each item lists its public category and tag names as `<category>`. Without
   * it (or for an entry not migrated to terms) the deprecated `tags` are the categories.
   */
  taxonomy?: TaxonomyIndex;
  /** The site's assets: cover images get type, size and dimensions; `asset:` links resolve (RFC-0004 §7.7). */
  assets?: AssetIndex;
}

/** Category names of an item: public terms (section first), else legacy tags. */
function itemCategories(entry: ContentEntry, index: TaxonomyIndex | undefined): string[] {
  const shown = entryTaxonomy(index, entry);
  const names = shown.groups
    .flatMap((g) => (g.taxonomy.key === "tag" ? [] : g.terms))
    .map((t) => t.name);
  return [...new Set([...names, ...shown.keywords])];
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
      const cover = e.coverImage?.assetId ? options.assets?.get(e.coverImage.assetId) : undefined;
      const image = cover
        ? absoluteUrl(
            origin,
            cover.storage.kind === "external" ? cover.storage.url : e.coverImage?.src,
          )
        : absoluteUrl(origin, e.coverImage?.src);
      const mediaAttrs = cover
        ? ` type="${xml(cover.mediaType)}" fileSize="${cover.bytes}"${cover.image ? ` width="${cover.image.width}" height="${cover.image.height}"` : ""}`
        : "";
      const author = e.author.kind === "human" && e.author.name ? e.author.name : site.name;
      return [
        "<item>",
        `<title>${xml(e.title)}</title>`,
        `<link>${xml(url)}</link>`,
        `<guid isPermaLink="true">${xml(url)}</guid>`,
        `<pubDate>${date}</pubDate>`,
        `<dc:creator>${cdata(author)}</dc:creator>`,
        ...itemCategories(e, options.taxonomy).map((t) => `<category>${xml(t)}</category>`),
        e.summary ? `<description>${cdata(e.summary)}</description>` : "",
        image ? `<media:content url="${xml(image)}" medium="image"${mediaAttrs}/>` : "",
        `<content:encoded>${cdata(renderBody(e.body, options.assets ? { assets: options.assets, locale: e.locale, defaultLocale: site.defaultLocale } : undefined))}</content:encoded>`,
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
    `<title>${xml(options.title ?? site.name)}</title>`,
    `<link>${xml(`${origin}${options.linkPath ?? "/"}`)}</link>`,
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

/**
 * A term's feed (`<archive>/rss.xml`, RFC-0002 §7): the archive's published entries, titled after
 * the term, linking to its archive, described by its SEO description or intro.
 */
export function archiveFeedXml(
  options: Omit<FeedOptions, "entries" | "feedPath" | "title" | "linkPath" | "description"> & {
    archive: ArchiveView;
  },
): string {
  const { archive, ...rest } = options;
  const label = archive.term.labels[archive.locale];
  const description =
    label?.seo?.description ?? (label?.description ? markdownText(label.description) : undefined);
  return rssXml({
    ...rest,
    entries: archive.entries,
    title: `${archive.shown.name} · ${options.site.name}`,
    linkPath: archive.root,
    ...(archive.feedPath ? { feedPath: archive.feedPath } : {}),
    ...(description ? { description } : {}),
  });
}

export interface SitemapUrl {
  loc: string;
  lastmod: string;
}

/**
 * What belongs in `sitemap.xml`: published pages and entries of the default locale, and the
 * indexable term archives (page 1 only, `lastmod` = the later of the newest listed entry and the
 * term; see `archiveSummaries` — pass it published entries). Pages and archives asking for
 * `noindex`, or canonicalised to another URL, are left out (a sitemap lists canonical URLs).
 */
export function sitemapUrls(
  site: Site,
  pages: Page[],
  entries: ContentEntry[],
  origin: string,
  archives: readonly ArchiveSummary[] = [],
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
    seen.add(path);
    urls.push({ loc: `${origin}${path}`, lastmod: entry.updatedAt });
  }
  for (const archive of archives) {
    if (!archive.indexable || seen.has(archive.path)) continue;
    const own = `${origin}${archive.path}`;
    const canonical = absoluteUrl(origin, archive.term.labels[site.defaultLocale]?.seo?.canonical);
    if (canonical && canonical !== own) continue;
    seen.add(archive.path);
    urls.push({ loc: own, lastmod: archive.lastmod });
  }
  return urls;
}

/**
 * The site's redirects as a `_redirects` file (Cloudflare Workers/Pages static assets, Netlify):
 * static hosts that read it answer with real 301/302s, where Astro's meta-refresh pages are only a
 * fallback. Exact redirects come first, then prefix redirects as `from` + `from/*` splats, longest
 * first (hosts apply the first match).
 */
export function redirectsFile(redirects: readonly Redirect[]): string {
  const exact = redirects.filter((r) => r.match === "exact");
  const prefix = redirects
    .filter((r) => r.match === "prefix")
    .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from));
  const splat = (to: string) => {
    const i = to.search(/[?#]/);
    const head = (i < 0 ? to : to.slice(0, i)).replace(/\/+$/, "");
    return `${head}/:splat${i < 0 ? "" : to.slice(i)}`;
  };
  const lines = [
    "# Generated by Cloudhal from the rendered snapshot's Redirect nodes (RFC-0002). Do not edit.",
    ...exact.map((r) => `${r.from} ${r.to} ${r.status}`),
    ...prefix.flatMap((r) => [
      `${r.from} ${r.to} ${r.status}`,
      `${r.from === "/" ? "" : r.from}/* ${splat(r.to)} ${r.status}`,
    ]),
  ];
  return `${lines.join("\n")}\n`;
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
