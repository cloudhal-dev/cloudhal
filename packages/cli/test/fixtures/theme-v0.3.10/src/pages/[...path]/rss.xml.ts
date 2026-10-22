import config from "virtual:cloudhal/config";
import {
  addCacheTags,
  listCacheTag,
  nodeCacheTag,
  termCacheTag,
} from "@cloudhal/astro-renderer/cache-tags";
import { archiveFeedXml, FEED_LIMIT } from "@cloudhal/astro-renderer/feeds";
import { localeFeedXml } from "@cloudhal/astro-renderer/locale-feeds";
import { localeRequest, localeUrl, localizedPath } from "@cloudhal/astro-renderer/locales";
import { loadAssetIndex } from "@cloudhal/astro-renderer/media";
import { resolveRoute, staticPaths } from "@cloudhal/astro-renderer/routing";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";
import { ARCHIVE_PAGE_SIZE } from "../../theme.ts";

const SUFFIX = "/rss.xml";

/**
 * Static builds: one feed per served archive of a taxonomy with `feed: true`, in every locale on
 * this host, and each other locale's site feed (`/<locale>/rss.xml`, RFC-0033).
 */
export async function getStaticPaths() {
  const source = await getSource(config);
  const site = await source.site();
  const domains = site.localization?.domains ?? {};
  const paths: string[] = [];
  for (const locale of site.locales) {
    if (domains[locale] !== undefined) continue;
    const { feeds } = await staticPaths(source, { perPage: ARCHIVE_PAGE_SIZE, locale });
    paths.push(...feeds.map((p) => localizedPath(site, locale, p.slice(0, -SUFFIX.length))));
    const home = localizedPath(site, locale, "/");
    if (home !== "/") paths.push(home);
  }
  return [...new Set(paths)].map((p) => ({ params: { path: p.slice(1) } }));
}

/**
 * A category's or tag's RSS feed (`<basePath>/<slug>/rss.xml`, RFC-0002 §7), or a locale's site
 * feed (`/<locale>/rss.xml`), in the locale of the path or host. Old slugs follow their redirects
 * (prefix redirects carry `/rss.xml` along); retired terms answer 410.
 */
export const GET: APIRoute = async ({ request, url, params }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  const origin = siteOrigin(site, url);
  const lr = localeRequest(site, url.host, `/${params.path ?? ""}`);
  if (lr.redirect !== undefined)
    return new Response(null, {
      status: 301,
      headers: { location: `${lr.redirect === "/" ? "" : lr.redirect}${SUFFIX}` },
    });
  if (lr.path === "/") {
    headers.set("content-type", "application/rss+xml; charset=utf-8");
    addCacheTags(headers, [listCacheTag(site.id)]);
    return new Response(await localeFeedXml(source, { origin, locale: lr.locale }), { headers });
  }
  const route = await resolveRoute(source, `${lr.path}${SUFFIX}`, {
    perPage: ARCHIVE_PAGE_SIZE,
    search: url.search,
    locale: lr.locale,
  });
  if (route.kind === "redirect")
    return new Response(null, {
      status: route.status,
      headers: {
        location: route.location.startsWith("/")
          ? localizedPath(site, lr.locale, route.location)
          : route.location,
      },
    });
  if (route.kind === "gone") return new Response(null, { status: 410 });
  if (route.kind !== "feed") return new Response(null, { status: 404 });
  headers.set("content-type", "application/rss+xml; charset=utf-8");
  addCacheTags(headers, [
    listCacheTag(route.archive.term.id),
    termCacheTag(route.archive.term.id),
    ...route.archive.entries.slice(0, FEED_LIMIT).map((e) => nodeCacheTag(e.id)),
  ]);
  const body = archiveFeedXml({
    site,
    origin,
    locale: lr.locale,
    linkOrigin: localeUrl(site, lr.locale, "", origin),
    archive: route.archive,
    taxonomy: route.index,
    assets: await loadAssetIndex(source),
  });
  return new Response(body, { headers });
};
