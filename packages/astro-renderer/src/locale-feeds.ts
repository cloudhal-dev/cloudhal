/**
 * RFC-0033 §4 (phase B2): the machine-readable views of every locale a host serves — the sitemap
 * with `xhtml:link` alternates per URL, a feed per locale and `llms.txt` per locale. Built on the
 * single-locale functions in `feeds.ts`; this module only loops over locales and localizes URLs.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { archiveSummaries } from "./archive.ts";
import { FEED_LIMIT, rssXml, type SitemapUrl, sitemapUrls } from "./feeds.ts";
import { hostLocale, localeUrl } from "./locales.ts";
import { loadAssetIndex } from "./media.ts";
import { notFoundPageIds } from "./not-found.ts";
import { entryPath } from "./routing.ts";
import type { GraphSource } from "./source.ts";
import { loadTaxonomyIndex } from "./taxonomy.ts";

type Localized = Page | ContentEntry;
const pathOf = (n: Localized) => ("path" in n ? n.path : entryPath(n));

/** The locales a host serves: its own one, or every locale without a domain of its own. */
export function hostLocales(site: Site, host: string): string[] {
  const own = hostLocale(site, host);
  if (own) return [own];
  const domains = site.localization?.domains ?? {};
  return site.locales.filter((l) => domains[l] === undefined);
}

/** Published pages and entries of every locale, for alternates. */
async function publishedNodes(source: GraphSource, site: Site): Promise<Localized[]> {
  const entries = await Promise.all(site.locales.map((l) => source.allEntries(l)));
  return [...(await source.pages()), ...entries.flat()].filter((n) => n.status === "published");
}

/** Every language version of each grouped node, as `{locale, href}` with `x-default`. */
function alternateIndex(site: Site, nodes: readonly Localized[], origin: string) {
  const groups = new Map<string, Localized[]>();
  for (const n of nodes) {
    const g = n.translation?.group;
    if (!g) continue;
    const key = `${"path" in n ? "p" : "e"}:${g}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return (node: Localized) => {
    const g = node.translation?.group;
    const members = g ? (groups.get(`${"path" in node ? "p" : "e"}:${g}`) ?? []) : [];
    if (members.length < 2) return undefined;
    const out = members
      .filter((m) => site.locales.includes(m.locale))
      .sort((a, b) => site.locales.indexOf(a.locale) - site.locales.indexOf(b.locale))
      .map((m) => ({ locale: m.locale, href: localeUrl(site, m.locale, pathOf(m), origin) }));
    const fallback = out.find((a) => a.locale === site.defaultLocale);
    return fallback ? [...out, { locale: "x-default", href: fallback.href }] : out;
  };
}

/**
 * The sitemap of a host: for each locale it serves, the canonical, indexable URLs `sitemapUrls`
 * picks (pages, entries, archives with the locale's slugs) on the locale's URLs, each with its
 * language versions as alternates.
 */
export async function localizedSitemap(
  source: GraphSource,
  origin: string,
  host: string,
): Promise<SitemapUrl[]> {
  const site = await source.site();
  const nodes = await publishedNodes(source, site);
  const alternates = alternateIndex(site, nodes, origin);
  const pages = await source.pages();
  const out: SitemapUrl[] = [];
  for (const locale of hostLocales(site, host)) {
    const entries = (await source.allEntries(locale)).filter((e) => e.status === "published");
    const archives = archiveSummaries(await loadTaxonomyIndex(source, locale), entries);
    // `sitemapUrls` lists the site's default locale: view the site as if `locale` were it.
    const urls = sitemapUrls({ ...site, defaultLocale: locale }, pages, entries, origin, archives);
    const byPath = new Map(nodes.filter((n) => n.locale === locale).map((n) => [pathOf(n), n]));
    for (const u of urls) {
      const path = u.loc.slice(origin.length) || "/";
      const node = byPath.get(path);
      const alts = node ? alternates(node) : undefined;
      out.push({
        loc: localeUrl(site, locale, path, origin),
        lastmod: u.lastmod,
        ...(alts ? { alternates: alts } : {}),
      });
    }
  }
  return out;
}

/** A locale's site feed: its newest published entries, its links on the locale's URLs. */
export async function localeFeedXml(
  source: GraphSource,
  input: { origin: string; locale: string },
): Promise<string> {
  const { origin, locale } = input;
  const site = await source.site();
  const home = await source.pageByPath("/", locale);
  return rssXml({
    site,
    origin,
    locale,
    linkOrigin: localeUrl(site, locale, "", origin),
    entries: await source.allEntries(locale),
    taxonomy: await loadTaxonomyIndex(source, locale),
    assets: await loadAssetIndex(source),
    ...(home?.seo?.description ? { description: home.seo.description } : {}),
    ...(home ? { title: home.seo?.title ?? site.name } : {}),
  });
}

/**
 * `llms.txt` (llmstxt.org) of a locale: the site, then its pages and newest articles as Markdown
 * links on the locale's URLs, and links to the other locales' files. Published, indexable only.
 */
export async function llmsTxt(
  source: GraphSource,
  input: { origin: string; locale: string },
): Promise<string> {
  const { origin, locale } = input;
  const site = await source.site();
  const home = await source.pageByPath("/", locale);
  const visible = <T extends Localized>(n: T) =>
    n.status === "published" && n.locale === locale && !("seo" in n && n.seo?.noindex);
  const all = await source.pages();
  const notFound = notFoundPageIds(all);
  const pages = all.filter((p) => visible(p) && !notFound.has(p.id));
  const entries = (await source.allEntries(locale)).filter(visible).slice(0, FEED_LIMIT * 4);
  const line = (n: Localized) => {
    const summary = "summary" in n && n.summary ? `: ${n.summary.replace(/\s+/g, " ")}` : "";
    return `- [${n.title}](${localeUrl(site, locale, pathOf(n), origin)})${summary}`;
  };
  const others = site.locales.filter((l) => l !== locale);
  const description = home?.seo?.description ?? site.name;
  return [
    `# ${site.name}`,
    "",
    `> ${description.replace(/\s+/g, " ")}`,
    "",
    `Language: ${locale}`,
    "",
    ...(pages.length ? ["## Pages", "", ...pages.map(line), ""] : []),
    ...(entries.length ? ["## Articles", "", ...entries.map(line), ""] : []),
    ...(others.length
      ? [
          "## Other languages",
          "",
          ...others.map((l) => `- [${l}](${localeUrl(site, l, "/llms.txt", origin)})`),
          "",
        ]
      : []),
  ].join("\n");
}
