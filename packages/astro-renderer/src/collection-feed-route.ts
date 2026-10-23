/**
 * RFC-0042 §5: the collection feed route. `collectionFeedXml` builds a collection's RSS 2.0 feed in
 * a locale on top of `rssXml` (the site feed's rules: published, listed, `feed: false` left out);
 * `serveCollectionFeed` turns a theme's 404 for `<prefix>/rss.xml` into that feed. The `cloudhal()`
 * integration runs it as a middleware on every target (`collection-feed-middleware.ts`), so a
 * theme with its own route for the path keeps it, and old theme copies gain feeds on upgrade.
 * Static builds write the files because `staticPaths().feeds` lists these paths for the starter's
 * `[...path]/rss.xml` route, whose 404 this replaces.
 */
import { collectionLabel } from "@cloudhal/core-ts";
import { localeUrl } from "@cloudhal/core-ts/locale-paths";
import { addCacheTags, listCacheTag } from "./cache-tags.ts";
import { collectionFeedPath, collectionForFeedPath } from "./collection-feeds.ts";
import { rssXml } from "./feeds.ts";
import { localeRequest } from "./locales.ts";
import { loadAssetIndex } from "./media.ts";
import { siteOrigin } from "./seo.ts";
import type { GraphSource } from "./source.ts";
import { loadTaxonomyIndex } from "./taxonomy.ts";

const SUFFIX = "/rss.xml";

/**
 * A collection's feed in `locale`: its newest listed entries (expired and gated ones left out by
 * the source), titled after its plural label, linking to the page at its prefix when there is one.
 */
export async function collectionFeedXml(
  source: GraphSource,
  input: { origin: string; locale: string; collection: string },
): Promise<string> {
  const { origin, locale, collection } = input;
  const site = await source.site();
  const feedPath = collectionFeedPath(site, collection) ?? `/${collection}${SUFFIX}`;
  const prefix = feedPath.slice(0, -SUFFIX.length);
  const index = await source.pageByPath(prefix, locale);
  const description = index?.seo?.description;
  return rssXml({
    site,
    origin,
    locale,
    linkOrigin: localeUrl(site, locale, "", origin),
    entries: await source.entries(collection, locale),
    feedPath,
    title: `${collectionLabel(site, collection, locale).plural} · ${site.name}`,
    linkPath: index ? prefix : "/",
    taxonomy: await loadTaxonomyIndex(source, locale),
    assets: await loadAssetIndex(source),
    ...(description ? { description } : {}),
  });
}

/**
 * Opens the request's source and lets it set caching headers on `headers` (the runtime's
 * `getSource(config, { request, response: { headers } })`); undefined when unpublished.
 */
export type FeedSourceOpener = (headers: Headers) => Promise<GraphSource | undefined>;

/**
 * The middleware's decision: `response` unchanged unless it is a 404 to a `GET`/`HEAD` of a
 * collection's feed path (in the path's or host's locale), which is then answered with the feed,
 * the source's cache headers and the site's list tag (like `rss.xml`).
 */
export async function serveCollectionFeed(
  request: Request,
  response: Response,
  open: FeedSourceOpener,
): Promise<Response> {
  if (response.status !== 404 || (request.method !== "GET" && request.method !== "HEAD"))
    return response;
  const url = new URL(request.url);
  if (!url.pathname.endsWith(SUFFIX)) return response;
  const headers = new Headers();
  const source = await open(headers);
  if (!source) return response;
  const site = await source.site();
  const lr = localeRequest(site, url.host, url.pathname);
  if (lr.redirect !== undefined) return response;
  const collection =
    collectionForFeedPath(site, lr.path) ??
    collectionForFeedPath(site, lr.path, await source.allEntries(lr.locale));
  if (!collection) return response;
  await response.body?.cancel();
  headers.set("content-type", "application/rss+xml; charset=utf-8");
  // Lists a collection's newest entries: any entry change purges it, as it does the site feed.
  addCacheTags(headers, [listCacheTag(site.id)]);
  const body = await collectionFeedXml(source, {
    origin: siteOrigin(site, url),
    locale: lr.locale,
    collection,
  });
  return new Response(body, { status: 200, headers });
}
