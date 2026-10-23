/**
 * RFC-0042 §5: per-collection feeds. Each collection with a permalink prefix (RFC-0038: `/events`
 * for `/events/{slug}`) has an RSS feed at `<prefix>/rss.xml` (and `/<locale><prefix>/rss.xml`),
 * listing its newest listed entries: expiry and gates apply as in the site feed, `feed: false`
 * answers 404. The renderer serves it after a theme's routes answered 404
 * (`collection-feed-route.ts`), so old theme copies get it and a theme's own route wins.
 *
 * This module holds the pure parts: which collections have a feed, their paths, and the
 * `<link rel="alternate">` a theme puts in its head. Worker-safe.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  BUILT_IN_COLLECTION,
  collectionLabel,
  collectionPermalink,
  collectionSettings,
  permalinkPrefix,
} from "@cloudhal/core-ts";
import { localeUrl } from "@cloudhal/core-ts/locale-paths";

const SUFFIX = "/rss.xml";

/**
 * Where a collection's feed is served (unlocalized), or undefined when it has none: `feed: false`,
 * or a permalink without a fixed prefix (`/{slug}`, whose feed would be the site's `/rss.xml`).
 */
export function collectionFeedPath(site: Site, collection: string): string | undefined {
  if (!collectionSettings(site, collection).feed) return undefined;
  const prefix = permalinkPrefix(collectionPermalink(site, collection));
  if (prefix === "" || prefix === "/" || prefix.includes("{")) return undefined;
  return `${prefix}${SUFFIX}`;
}

/**
 * The collections with a feed: declared ones, the built-in `posts`, and collections inferred from
 * `entries` (the entries a source lists), each in that order, without duplicates.
 */
export function feedCollections(site: Site, entries: readonly ContentEntry[] = []): string[] {
  const keys = new Set([
    ...Object.keys(site.collections ?? {}),
    BUILT_IN_COLLECTION,
    ...entries.map((e) => e.collection),
  ]);
  return [...keys].filter((key) => collectionFeedPath(site, key) !== undefined);
}

/** Every collection feed path (unlocalized), for static builds (`staticPaths().feeds`). */
export function collectionFeedPaths(site: Site, entries: readonly ContentEntry[] = []): string[] {
  return feedCollections(site, entries).map((key) => collectionFeedPath(site, key) as string);
}

/**
 * The collection a request path (without its locale prefix) addresses as a feed. `entries` are
 * the entries the source lists, so an undeclared collection has a feed only once it has entries.
 */
export function collectionForFeedPath(
  site: Site,
  path: string,
  entries: readonly ContentEntry[] = [],
): string | undefined {
  if (!path.endsWith(SUFFIX)) return undefined;
  return feedCollections(site, entries).find((key) => collectionFeedPath(site, key) === path);
}

/** A feed for `<link rel="alternate" type="application/rss+xml">`, as `HeadMeta.feeds` holds it. */
export interface FeedLink {
  readonly title: string;
  readonly href: string;
}

/**
 * The `<link rel="alternate">` of a collection's feed in `locale` (default: the site's), on the
 * locale's URL (its prefix or its own domain): titled `<plural label> · <site name>`. Undefined
 * when the collection has no feed (`feed: false`, no prefix). Add it to the head after
 * `localizeHead`, whose feed links it would localize a second time.
 */
export function collectionFeedLink(
  site: Site,
  collection: string,
  origin: string,
  locale: string = site.defaultLocale,
): FeedLink | undefined {
  const path = collectionFeedPath(site, collection);
  if (!path) return undefined;
  const { plural } = collectionLabel(site, collection, locale);
  return { title: `${plural} · ${site.name}`, href: localeUrl(site, locale, path, origin) };
}
