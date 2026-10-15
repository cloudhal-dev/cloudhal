/**
 * What goes into `<head>` for search engines and link previews: title, description, canonical,
 * robots, Open Graph / Twitter cards and JSON-LD. Pure functions over the graph, so every starter
 * gets the same, tested output and themes only decide where to render `<SeoHead>`.
 */
import type { ContentEntry, ImageRef, Page, Site } from "@cloudhal/core-contracts";
import type { ArchiveView } from "./archive.ts";
import { inlineMarkdownText, markdownText, safeSrc } from "./markdown.ts";
import { assetAlt, imageObject, type MediaContext, socialImageUrl } from "./media.ts";
import { entryPath } from "./routing.ts";
import { type EntryTaxonomy, entryTaxonomy, type ShownTerm } from "./taxonomy.ts";

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

interface CardImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  type?: string;
  /** schema.org ImageObject when the image is an asset (RFC-0004 §7.7). */
  object?: Record<string, unknown>;
}

/**
 * A social image from an ImageRef: the asset's absolute media URL (with size, type and alt) when
 * its `assetId` resolves, else the ref's own `src` (safe schemes only).
 */
export function cardImage(
  ref: ImageRef | undefined,
  origin: string,
  locale: string,
  media?: MediaContext,
): CardImage | undefined {
  if (!ref) return undefined;
  const asset = ref.assetId ? media?.assets?.get(ref.assetId) : undefined;
  if (asset && asset.kind === "image") {
    const defaultLocale = media?.defaultLocale ?? locale;
    return {
      url: socialImageUrl(origin, asset, media?.preview ? "none" : (media?.transform ?? "none")),
      alt: assetAlt(asset, ref.alt, locale, defaultLocale),
      ...(asset.image ? { width: asset.image.width, height: asset.image.height } : {}),
      type: asset.mediaType,
      object: imageObject(origin, asset, locale, defaultLocale),
    };
  }
  const url = absoluteUrl(origin, ref.src);
  return url ? { url, alt: ref.alt ?? "" } : undefined;
}

function cards(
  kind: "website" | "article",
  meta: { title: string; description?: string; url: string; image?: CardImage },
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
  if (meta.image) {
    og.push(["og:image", meta.image.url]);
    if (meta.image.width && meta.image.height)
      og.push(
        ["og:image:width", String(meta.image.width)],
        ["og:image:height", String(meta.image.height)],
      );
    if (meta.image.type) og.push(["og:image:type", meta.image.type]);
    og.push(["og:image:alt", meta.image.alt]);
  }
  const twitter: Array<[string, string]> = [
    ["twitter:card", meta.image ? "summary_large_image" : "summary"],
    ["twitter:title", meta.title],
  ];
  if (meta.description) twitter.push(["twitter:description", meta.description]);
  if (meta.image)
    twitter.push(["twitter:image", meta.image.url], ["twitter:image:alt", meta.image.alt]);
  return { openGraph: og, twitter };
}

/** `<head>` for a Page. `media` resolves its social image's asset (RFC-0004 §7.7). */
export function pageHead(site: Site, page: Page, origin: string, media?: MediaContext): HeadMeta {
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
      {
        title,
        url: canonical,
        ...(description ? { description } : {}),
        ...(() => {
          const image = cardImage(page.seo?.ogImage, origin, page.locale, media);
          return image ? { image } : {};
        })(),
      },
      site,
      page.locale,
    ),
    jsonLd,
    feeds: siteFeeds(site, origin),
  };
}

/** `DefinedTerm` (schema.org) for a shown term, in its taxonomy's `DefinedTermSet`. */
export function definedTerm(term: ShownTerm, origin: string, locale: string): object {
  const labels = term.taxonomy.labels;
  const set = labels[locale] ?? Object.values(labels).find(Boolean);
  return {
    "@type": "DefinedTerm",
    name: term.name,
    termCode: term.slug,
    ...(term.href ? { url: `${origin}${term.href}` } : {}),
    inDefinedTermSet: { "@type": "DefinedTermSet", name: set?.plural ?? term.taxonomy.key },
  };
}

/** Breadcrumb items for shown terms that have an archive. */
function termCrumbs(trail: readonly ShownTerm[], origin: string) {
  return trail.flatMap((t) => (t.href ? [{ name: t.name, url: `${origin}${t.href}` }] : []));
}

/**
 * `<head>` for an article (content entry). The summary is the description until entries get SEO
 * fields. With the entry's terms (`entryTaxonomy`), the primary category becomes the section
 * (`article:section`, `articleSection`, `about`, breadcrumb) and public tags the keywords; without
 * them (or for an un-migrated entry) the deprecated `tags` are the keywords. With reader comments
 * (`commentsJsonLd`, RFC-0007 §8.1) the `BlogPosting` gains `commentCount` and the first comments.
 */
export function entryHead(
  site: Site,
  entry: ContentEntry,
  origin: string,
  taxonomy: EntryTaxonomy = entryTaxonomy(undefined, entry),
  media?: MediaContext,
  comments?: { readonly commentCount: number; readonly comment?: readonly object[] },
): HeadMeta {
  const url = `${origin}${entryPath(entry)}`;
  const description = clip(entry.summary);
  const image = cardImage(entry.coverImage, origin, entry.locale, media);
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
  if (taxonomy.section) base.openGraph.push(["article:section", taxonomy.section.name]);
  for (const tag of taxonomy.keywords) base.openGraph.push(["article:tag", tag]);
  const keywords = taxonomy.tags.length
    ? taxonomy.tags.map((t) => definedTerm(t, origin, entry.locale))
    : taxonomy.keywords.length
      ? taxonomy.keywords.join(", ")
      : undefined;
  const publisher = { "@type": "Organization", name: site.name, url: `${origin}/` };
  const corrections = [...(entry.corrections ?? [])]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((c) => ({
      "@type": "CorrectionComment",
      text: inlineMarkdownText(c.note),
      datePublished: c.at,
    }));
  // RFC-0019 §1: the byline's authors, each a Person with their archive and profiles; without a
  // byline, a person who wrote it is the author, and work by an agent or the system is the site's.
  const author =
    taxonomy.authors.length > 0
      ? taxonomy.authors.map((a) => personOf(a, origin, entry.locale))
      : entry.author.kind === "human" && entry.author.name
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
        ...(image ? { image: image.object ? [image.object] : [image.url] } : {}),
        ...(entry.publishedAt ? { datePublished: entry.publishedAt } : {}),
        // RFC-0019 §2: a correction is the visible update; ordinary edits do not move it.
        dateModified: corrections[0]?.datePublished ?? entry.updatedAt,
        ...(corrections.length > 0 ? { correction: corrections } : {}),
        inLanguage: entry.locale,
        ...(taxonomy.section
          ? {
              articleSection: taxonomy.section.name,
              about: definedTerm(taxonomy.section, origin, entry.locale),
            }
          : {}),
        ...(keywords ? { keywords } : {}),
        author,
        publisher,
        ...(comments ?? {}),
      },
      breadcrumbs([
        { name: site.name, url: `${origin}/` },
        ...termCrumbs(taxonomy.trail, origin),
        { name: entry.title, url },
      ]),
    ],
    feeds: siteFeeds(site, origin),
  };
}

const PAGE_WORD: Record<string, string> = { en: "Page", tr: "Sayfa" };

/** "Page 2" in the locale's language (English for languages without a translation). */
export function pageLabel(locale: string, page: number): string {
  return `${PAGE_WORD[locale.split("-")[0] ?? locale] ?? PAGE_WORD.en} ${page}`;
}

/**
 * `<head>` for a term archive page (RFC-0002 §7). Every page is self-canonical; page 1 carries the
 * description (`seo.description`, else the intro as text) and the JSON-LD (`CollectionPage` about
 * the term as a `DefinedTerm`, its `ItemList`, and a `BreadcrumbList` through the ancestors), and
 * later pages get a "Page n" title and neither. Thin archives are `noindex,follow`.
 */
/** An author term as a schema.org Person: name, role, archive URL, portrait, profiles. */
function personOf(a: ShownTerm, origin: string, locale: string): Record<string, unknown> {
  const label = a.term.labels[locale] ?? Object.values(a.term.labels)[0];
  const sameAs = (a.term.links ?? []).map((l) => l.href).filter((h) => /^https:\/\//.test(h));
  return {
    "@type": "Person",
    name: a.name,
    ...(label?.role ? { jobTitle: label.role } : {}),
    ...(a.href ? { url: `${origin}${a.href}` } : {}),
    ...(a.term.image?.src && /^(https:\/\/|\/)/.test(a.term.image.src)
      ? {
          image: a.term.image.src.startsWith("/")
            ? `${origin}${a.term.image.src}`
            : a.term.image.src,
        }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function archiveHead(
  site: Site,
  view: ArchiveView,
  origin: string,
  media?: MediaContext,
): HeadMeta {
  const { locale, shown } = view;
  const label = view.term.labels[locale];
  const first = view.page === 1;
  const own = `${origin}${view.path}`;
  const canonical = (first ? absoluteUrl(origin, label?.seo?.canonical) : undefined) ?? own;
  const title = first
    ? (label?.seo?.title ?? `${shown.name} · ${site.name}`)
    : `${label?.seo?.title ?? shown.name} – ${pageLabel(locale, view.page)} · ${site.name}`;
  const description = first
    ? clip(
        label?.seo?.description ??
          (label?.description ? markdownText(label.description) : undefined),
      )
    : undefined;
  const image = cardImage(label?.seo?.ogImage ?? view.term.image, origin, locale, media);
  const root = `${origin}${view.root}`;
  const isAuthor = view.taxonomy.key === "author";
  const jsonLd: object[] = first
    ? [
        {
          "@context": "https://schema.org",
          // RFC-0019 §1: an author's archive is their profile page.
          "@type": isAuthor ? ["CollectionPage", "ProfilePage"] : "CollectionPage",
          ...(isAuthor ? { mainEntity: personOf(shown, origin, locale) } : {}),
          name: shown.name,
          url: own,
          ...(description ? { description } : {}),
          ...(image ? { image: image.url } : {}),
          inLanguage: locale,
          isPartOf: { "@type": "WebSite", name: site.name, url: `${origin}/` },
          about: definedTerm(shown, origin, locale),
          [isAuthor ? "hasPart" : "mainEntity"]: {
            "@type": "ItemList",
            numberOfItems: view.total,
            itemListElement: view.entries.map((e, i) => ({
              "@type": "ListItem",
              position: (view.page - 1) * view.perPage + i + 1,
              url: `${origin}${entryPath(e)}`,
            })),
          },
        },
        breadcrumbs([
          { name: site.name, url: `${origin}/` },
          ...termCrumbs(view.trail, origin),
          { name: shown.name, url: root },
        ]),
      ]
    : [];
  return {
    title,
    ...(description ? { description } : {}),
    canonical,
    ...(view.indexable ? {} : { robots: "noindex,follow" }),
    lang: locale,
    ...cards(
      "website",
      {
        title: first ? (label?.seo?.title ?? shown.name) : title,
        url: canonical,
        ...(description ? { description } : {}),
        ...(image ? { image } : {}),
      },
      site,
      locale,
    ),
    jsonLd,
    feeds: [
      ...siteFeeds(site, origin),
      ...(view.feedPath
        ? [{ title: `${shown.name} · ${site.name}`, href: `${origin}${view.feedPath}` }]
        : []),
    ],
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
