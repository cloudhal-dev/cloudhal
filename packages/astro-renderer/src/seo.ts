/**
 * What goes into `<head>` for search engines and link previews: title, description, canonical,
 * robots, Open Graph / Twitter cards and JSON-LD. Pure functions over the graph, so every starter
 * gets the same, tested output and themes only decide where to render `<SeoHead>`.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { safeSrc } from "./markdown.ts";
import { entryPath } from "./routing.ts";

export interface HeadMeta {
  /** `<title>`. */
  title: string;
  description?: string;
  /** Absolute URL. */
  canonical: string;
  /** `noindex,follow` for pages the site asks search engines to skip. */
  robots?: string;
  /** `<html lang>`. */
  lang: string;
  /** `<meta property="og:*">`, in order. */
  openGraph: Array<[string, string]>;
  /** `<meta name="twitter:*">`, in order. */
  twitter: Array<[string, string]>;
  /** JSON-LD documents (`<script type="application/ld+json">`). */
  jsonLd: object[];
  /** `<link rel="alternate">` feeds. */
  feeds: Array<{ title: string; href: string }>;
}

/** The public origin: the site's primary domain when it has one, else where the request came in. */
export function siteOrigin(site: Pick<Site, "domains">, requestUrl: URL | string): string {
  const primary = site.domains?.find((d) => d.primary)?.hostname;
  return primary ? `https://${primary}` : new URL(requestUrl).origin;
}

/** An absolute URL for a path or URL (safe schemes only); undefined for anything else. */
export function absoluteUrl(origin: string, pathOrUrl: string | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  const safe = safeSrc(pathOrUrl);
  if (!safe || safe.startsWith("data:")) return undefined;
  if (/^https?:\/\//i.test(safe)) return safe;
  return safe.startsWith("/") ? `${origin}${safe}` : undefined;
}

/** `og:locale` wants `en_US`; contracts store BCP 47 (`en`, `tr-TR`). */
function ogLocale(locale: string): string {
  return locale.replace("-", "_");
}

/** JSON-LD inside `<script>`: no `</script>` breakout, no HTML comment tricks. */
export function jsonLdText(doc: object): string {
  return JSON.stringify(doc)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Search results cut descriptions around 155–160 characters; previews and cards alike. */
export function clip(text: string | undefined, max = 160): string | undefined {
  const flat = text?.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

const RSS_PATH = "/rss.xml";

function siteFeeds(site: Site, origin: string): HeadMeta["feeds"] {
  return [{ title: site.name, href: `${origin}${RSS_PATH}` }];
}

function cards(
  kind: "website" | "article",
  meta: { title: string; description?: string; url: string; image?: { url: string; alt: string } },
  site: Site,
  locale: string,
): Pick<HeadMeta, "openGraph" | "twitter"> {
  const og: Array<[string, string]> = [
    ["og:type", kind],
    ["og:site_name", site.name],
    ["og:title", meta.title],
    ["og:url", meta.url],
    ["og:locale", ogLocale(locale)],
  ];
  if (meta.description) og.push(["og:description", meta.description]);
  if (meta.image) og.push(["og:image", meta.image.url], ["og:image:alt", meta.image.alt]);
  const twitter: Array<[string, string]> = [
    ["twitter:card", meta.image ? "summary_large_image" : "summary"],
    ["twitter:title", meta.title],
  ];
  if (meta.description) twitter.push(["twitter:description", meta.description]);
  if (meta.image) twitter.push(["twitter:image", meta.image.url]);
  return { openGraph: og, twitter };
}

/** `<head>` for a Page. */
export function pageHead(site: Site, page: Page, origin: string): HeadMeta {
  const home = page.path === "/";
  const own = `${origin}${home ? "/" : page.path}`;
  const canonical = absoluteUrl(origin, page.seo?.canonical) ?? own;
  const title = page.seo?.title ?? (home ? page.title : `${page.title} · ${site.name}`);
  const description = clip(page.seo?.description);
  const jsonLd: object[] = home
    ? [{ "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: `${origin}/` }]
    : [
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: page.title,
          url: own,
          ...(description ? { description } : {}),
          inLanguage: page.locale,
          isPartOf: { "@type": "WebSite", name: site.name, url: `${origin}/` },
        },
        breadcrumbs([
          { name: site.name, url: `${origin}/` },
          { name: page.title, url: own },
        ]),
      ];
  return {
    title,
    ...(description ? { description } : {}),
    canonical,
    ...(page.seo?.noindex ? { robots: "noindex,follow" } : {}),
    lang: page.locale,
    ...cards(
      "website",
      { title, url: canonical, ...(description ? { description } : {}) },
      site,
      page.locale,
    ),
    jsonLd,
    feeds: siteFeeds(site, origin),
  };
}

/** `<head>` for an article (content entry). The summary is the description until entries get SEO fields. */
export function entryHead(site: Site, entry: ContentEntry, origin: string): HeadMeta {
  const url = `${origin}${entryPath(entry)}`;
  const description = clip(entry.summary);
  const imageUrl = absoluteUrl(origin, entry.coverImage?.src);
  const image = imageUrl ? { url: imageUrl, alt: entry.coverImage?.alt ?? "" } : undefined;
  const title = `${entry.title} · ${site.name}`;
  const base = cards(
    "article",
    {
      title: entry.title,
      url,
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
    },
    site,
    entry.locale,
  );
  if (entry.publishedAt) base.openGraph.push(["article:published_time", entry.publishedAt]);
  base.openGraph.push(["article:modified_time", entry.updatedAt]);
  for (const tag of entry.tags) base.openGraph.push(["article:tag", tag]);
  const publisher = { "@type": "Organization", name: site.name, url: `${origin}/` };
  // A person's byline is a Person; work done by an agent or the system is credited to the site.
  const author =
    entry.author.kind === "human" && entry.author.name
      ? { "@type": "Person", name: entry.author.name }
      : publisher;
  return {
    title,
    ...(description ? { description } : {}),
    canonical: url,
    lang: entry.locale,
    ...base,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: entry.title.slice(0, 110),
        ...(description ? { description } : {}),
        url,
        mainEntityOfPage: url,
        ...(image ? { image: [image.url] } : {}),
        ...(entry.publishedAt ? { datePublished: entry.publishedAt } : {}),
        dateModified: entry.updatedAt,
        inLanguage: entry.locale,
        ...(entry.tags.length ? { keywords: entry.tags.join(", ") } : {}),
        author,
        publisher,
      },
      breadcrumbs([
        { name: site.name, url: `${origin}/` },
        { name: entry.title, url },
      ]),
    ],
    feeds: siteFeeds(site, origin),
  };
}

function breadcrumbs(items: Array<{ name: string; url: string }>): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
