/**
 * RFC-0033 §4 / ADR-0035: where a page or entry of a locale lives on the web. Graph paths carry no
 * locale (`(site, locale, path)` is unique); the URL adds `/<locale>` (`prefix-except-default`:
 * every locale but the default; `prefix-all`: every locale) unless the locale has its own domain
 * (`localization.domains`), which serves it at the root. The renderer and Studio share these.
 *
 * Browser- and Worker-safe: no imports beyond types and `permalinks.ts`.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { entryPath, type PermalinkSite } from "./permalinks.ts";

/** The part of the site these functions read. */
export type LocaleSite = Pick<Site, "defaultLocale" | "localization">;

export function localeRouting(site: LocaleSite): "prefix-except-default" | "prefix-all" {
  return site.localization?.routing ?? "prefix-except-default";
}

/** A graph path as a URL path of `locale` on the site's own host (no domain mapping). */
export function localizedPath(site: LocaleSite, locale: string, path: string): string {
  const prefixed = localeRouting(site) === "prefix-all" || locale !== site.defaultLocale;
  if (!prefixed) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The absolute URL of a graph path in `locale`: its own domain when it has one. */
export function localeUrl(site: LocaleSite, locale: string, path: string, origin: string): string {
  const domain = site.localization?.domains?.[locale];
  return domain ? `https://${domain}${path}` : `${origin}${localizedPath(site, locale, path)}`;
}

/**
 * The public URL of a page or entry: its graph path (a page's `path`, an entry's permalink) in its
 * locale. Absolute on `origin` or the locale's own domain; the localized path when neither exists.
 */
export function itemUrl(
  site: LocaleSite & PermalinkSite,
  origin: string | undefined,
  item: Pick<Page, "path" | "locale"> | Pick<ContentEntry, "collection" | "slug" | "locale">,
): string {
  const path = "path" in item ? item.path : entryPath(site, item);
  return localeUrl(site, item.locale, path, origin ?? "");
}
