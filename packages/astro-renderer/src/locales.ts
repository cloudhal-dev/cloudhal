/**
 * RFC-0033 §4 / ADR-0035: a site's locales on the web. The locale is in the path
 * (`prefix-except-default`: the default locale at the root, the others under `/<locale>`;
 * `prefix-all`: every locale prefixed) or in the host (`localization.domains`), never in a cookie
 * or `Accept-Language`. This module splits a request into locale and graph path, builds localized
 * URLs, lists a node's language versions for `hreflang`, and rewrites a localized page's internal
 * links to the same locale. Worker-safe.
 */
import type { ContentEntry, Page, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { termSlug } from "@cloudhal/core-ts";
import type { HeadMeta } from "./seo.ts";
import type { GraphSource } from "./source.ts";

/** Scripts written right to left, by primary language subtag (CLDR). */
const RTL = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "ks",
  "ku",
  "ps",
  "sd",
  "syr",
  "ug",
  "ur",
  "yi",
]);

/** `<html dir>` for a locale. Kurdish written in Latin (`ku-Latn`) is the one exception handled. */
export function textDirection(locale: string): "ltr" | "rtl" {
  const [language = "", script] = locale.toLowerCase().split("-");
  if (script === "latn" || script === "cyrl") return "ltr";
  return RTL.has(language) ? "rtl" : "ltr";
}

type Routing = "prefix-except-default" | "prefix-all";

export function localeRouting(site: Site): Routing {
  return site.localization?.routing ?? "prefix-except-default";
}

/** The locale a host serves on its own (`localization.domains`), if any. */
export function hostLocale(site: Site, host: string): string | undefined {
  const bare = host.toLowerCase().replace(/:\d+$/, "");
  const domains = site.localization?.domains ?? {};
  return Object.keys(domains).find((l) => domains[l]?.toLowerCase() === bare);
}

export interface LocaleRequest {
  /** The locale the request is for. */
  readonly locale: string;
  /** The graph path inside that locale (no prefix). */
  readonly path: string;
  /** Where to send the request instead (a 301), for a non-canonical locale URL. */
  readonly redirect?: string;
}

/**
 * Splits a request path (no trailing slash, `/` for the root) into locale and graph path. A
 * default-locale prefix under `prefix-except-default` and an unprefixed path under `prefix-all`
 * redirect to the canonical URL; a locale served by its own domain is never a prefix.
 */
export function localeRequest(site: Site, host: string, path: string): LocaleRequest {
  const own = hostLocale(site, host);
  if (own) return { locale: own, path };
  const segment = path.split("/")[1] ?? "";
  const domains = site.localization?.domains ?? {};
  const locale = site.locales.find(
    (l) => l.toLowerCase() === segment.toLowerCase() && domains[l] === undefined,
  );
  const routing = localeRouting(site);
  if (locale && segment) {
    const rest = path.slice(segment.length + 1) || "/";
    if (locale === site.defaultLocale && routing === "prefix-except-default")
      return { locale, path: rest, redirect: rest };
    if (segment !== locale)
      return { locale, path: rest, redirect: localizedPath(site, locale, rest) };
    return { locale, path: rest };
  }
  if (routing === "prefix-all")
    return {
      locale: site.defaultLocale,
      path,
      redirect: localizedPath(site, site.defaultLocale, path),
    };
  return { locale: site.defaultLocale, path };
}

/** A graph path as a URL path of `locale` on the site's own host (no domain mapping). */
export function localizedPath(site: Site, locale: string, path: string): string {
  const prefixed = localeRouting(site) === "prefix-all" || locale !== site.defaultLocale;
  if (!prefixed) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The absolute URL of a graph path in `locale`: its own domain when it has one. */
export function localeUrl(site: Site, locale: string, path: string, origin: string): string {
  const domain = site.localization?.domains?.[locale];
  return domain ? `https://${domain}${path}` : `${origin}${localizedPath(site, locale, path)}`;
}

/** One language version of a page or entry for `hreflang` and the language switcher. */
export interface Alternate {
  /** BCP 47 locale, or `x-default`. */
  readonly locale: string;
  readonly href: string;
  /** This is the version being rendered. */
  readonly current: boolean;
  /** This is the group's original (the source of the translations). */
  readonly original?: boolean;
}

type Localized = Page | ContentEntry;
const pathOf = (n: Localized) => ("path" in n ? n.path : `/${n.collection}/${n.slug}`);

/** The visible members of `node`'s translation group in this source (pages or entries). */
async function groupMembers(
  source: GraphSource,
  site: Site,
  node: Localized,
): Promise<Localized[]> {
  const group = node.translation?.group;
  if (!group) return [];
  const inGroup = (n: Localized) => n.id === group || n.translation?.group === group;
  if ("path" in node) return (await source.pages()).filter(inGroup);
  const all = await Promise.all(site.locales.map((l) => source.allEntries(l)));
  return all.flat().filter(inGroup);
}

/**
 * RFC-0033 invariant 7: every visible version of the node (itself included), plus `x-default`
 * (the default locale's version). Empty when the node has no other version — `hreflang` needs two.
 */
export async function alternatesFor(
  source: GraphSource,
  node: Localized,
  origin: string,
): Promise<Alternate[]> {
  const site = await source.site();
  const members = (await groupMembers(source, site, node)).filter((m) =>
    site.locales.includes(m.locale),
  );
  if (members.length < 2) return [];
  const out = members
    .map((m) => ({
      locale: m.locale,
      href: localeUrl(site, m.locale, pathOf(m), origin),
      current: m.id === node.id,
      ...(m.id === node.translation?.group ? { original: true } : {}),
    }))
    .sort((a, b) => site.locales.indexOf(a.locale) - site.locales.indexOf(b.locale));
  const fallback = out.find((a) => a.locale === site.defaultLocale);
  return fallback ? [...out, { locale: "x-default", href: fallback.href, current: false }] : out;
}

/**
 * Internal links of a page in `locale` (`origin`: the site's primary origin, for links back from a
 * locale's own domain): a path that leads to a page, entry or archive with a
 * version in `locale` goes there; one that leads to a default-locale node without such a version
 * stays in the default locale (a reader may still follow it); anything else — search, feeds,
 * unknown paths — stays in `locale`.
 */
export async function linkLocalizer(
  source: GraphSource,
  locale: string,
  origin: string,
): Promise<((path: string) => string) | undefined> {
  const site = await source.site();
  const def = site.defaultLocale;
  const prefixAll = localeRouting(site) === "prefix-all";
  if (locale === def && !prefixAll) return undefined;
  const own = site.localization?.domains?.[locale] !== undefined;
  const here = (p: string) => (own ? p : localizedPath(site, locale, p));
  const home = (p: string) => (own ? localeUrl(site, def, p, origin) : localizedPath(site, def, p));
  const [pages, entries, translated, taxonomies, terms] = await Promise.all([
    source.pages(),
    source.allEntries(def),
    source.allEntries(locale),
    source.taxonomies(),
    source.vocabulary(),
  ]);
  const byGroup = new Map<string, Localized>();
  for (const n of [...pages, ...translated])
    if (n.locale === locale && n.translation)
      byGroup.set(`${"path" in n ? "p" : "e"}:${n.translation.group}`, n);
  const map = new Map<string, string>();
  for (const n of [...pages.filter((p) => p.locale === def), ...entries]) {
    const twin = byGroup.get(`${"path" in n ? "p" : "e"}:${n.translation?.group ?? n.id}`);
    map.set(pathOf(n), twin ? here(pathOf(twin)) : home(pathOf(n)));
  }
  const archive = archiveLocalizer(taxonomies, terms, locale, def);
  return (path) => map.get(path) ?? (archive(path) ? here(archive(path) as string) : here(path));
}

/** `<basePath>/<slug>[/…]` with the term's slug in `locale`; undefined for other paths. */
function archiveLocalizer(
  taxonomies: readonly Taxonomy[],
  terms: readonly Term[],
  locale: string,
  def: string,
): (path: string) => string | undefined {
  return (path) => {
    for (const tax of taxonomies) {
      if (!tax.archive.enabled || !path.startsWith(`${tax.archive.basePath}/`)) continue;
      const [slug = "", ...rest] = path.slice(tax.archive.basePath.length + 1).split("/");
      const term = terms.find((t) => t.taxonomyId === tax.id && t.slug === slug);
      if (term)
        return [`${tax.archive.basePath}/${termSlug(term, locale, def)}`, ...rest].join("/");
    }
    return undefined;
  };
}

/** Paths that are never a page: platform endpoints and media. */
const PLATFORM = /^\/(?:_|media\/)/;

/**
 * Rewrites root-relative `href`s of `<a>`, `action`s of `<form>` and the search dialog's
 * `data-endpoint`/`data-page` in rendered HTML through `localize` (query and fragment kept).
 * Platform paths are left alone.
 */
export function localizeLinks(html: string, localize: (path: string) => string): string {
  const swap = (all: string, head: string, url: string, tail: string) => {
    if (url.startsWith("//") || PLATFORM.test(url)) return all;
    const cut = url.search(/[?#]/);
    const path = cut < 0 ? url : url.slice(0, cut);
    const suffix = cut < 0 ? "" : url.slice(cut);
    return `${head}${localize(path.length > 1 ? path.replace(/\/+$/, "") : path)}${suffix}${tail}`;
  };
  return html
    .replace(/(<(?:a|form)\b[^>]*?\s(?:href|action)=")(\/[^"]*)(")/gi, swap)
    .replace(/(\sdata-(?:endpoint|page)=")(\/[^"]*)(")/gi, swap);
}

/**
 * The head of a page rendered in `locale`: its canonical, `og:url` and feed links on the locale's
 * URLs (each version is self-canonical, never pointing at another language), `lang`/`dir`, the
 * `hreflang` set and `og:locale:alternate`.
 */
export function localizeHead(
  meta: HeadMeta,
  site: Site,
  input: {
    locale: string;
    origin: string;
    alternates: readonly Alternate[];
    translation?: Localized["translation"];
  },
): HeadMeta {
  const { locale, origin, alternates } = input;
  const here = (url: string) =>
    url.startsWith(origin) ? localeUrl(site, locale, url.slice(origin.length) || "/", origin) : url;
  const canonical = here(meta.canonical);
  const others = alternates.filter((a) => !a.current && a.locale !== "x-default");
  return {
    ...meta,
    canonical,
    lang: locale,
    dir: textDirection(locale),
    feeds: meta.feeds.map((f) => ({ ...f, href: here(f.href) })),
    openGraph: [
      ...meta.openGraph.map(([k, v]): [string, string] => [k, k === "og:url" ? canonical : v]),
      ...others.map((a): [string, string] => ["og:locale:alternate", a.locale.replace("-", "_")]),
    ],
    jsonLd: meta.jsonLd.map((doc, i) =>
      i === 0 ? translationLd(doc, alternates, input.translation) : doc,
    ),
    ...(alternates.length
      ? { alternates: alternates.map(({ locale: l, href }) => ({ locale: l, href })) }
      : {}),
  };
}

/**
 * schema.org links between versions (RFC-0033 §4): the original lists its `workTranslation`s, a
 * translation names its `translationOfWork`; `translator` is the reviewer, or the engine
 * (a `SoftwareApplication`) for machine output nobody has reviewed yet.
 */
function translationLd(
  doc: object,
  alternates: readonly Alternate[],
  translation: Localized["translation"],
): object {
  const self = alternates.find((a) => a.current);
  const original = alternates.find((a) => a.original);
  const others = alternates.filter((a) => !a.current && a.locale !== "x-default");
  const links =
    !self || !original
      ? {}
      : self.original
        ? { workTranslation: others.map((a) => ({ "@id": a.href, inLanguage: a.locale })) }
        : { translationOfWork: { "@id": original.href, inLanguage: original.locale } };
  const by = translation?.review?.by;
  const translator = by
    ? { translator: { "@type": "Person", name: by.name ?? by.id } }
    : translation?.method === "machine" && translation.provenance
      ? { translator: { "@type": "SoftwareApplication", name: translation.provenance.engine } }
      : {};
  return { ...doc, ...links, ...translator };
}
