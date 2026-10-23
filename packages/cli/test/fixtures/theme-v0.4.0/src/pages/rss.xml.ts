import config from "virtual:cloudhal/config";
import { addCacheTags, listCacheTag } from "@cloudhal/astro-renderer/cache-tags";
import { localeFeedXml } from "@cloudhal/astro-renderer/locale-feeds";
import { hostLocale } from "@cloudhal/astro-renderer/locales";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/**
 * The site's RSS 2.0 feed: the newest published articles of every collection, in the host's
 * locale (the default one, or a locale's own domain). Other locales: `/<locale>/rss.xml`.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  headers.set("content-type", "application/rss+xml; charset=utf-8");
  // Lists every collection's newest entries: any entry change purges it (`cloudhal-list-<site>`).
  addCacheTags(headers, [listCacheTag(site.id)]);
  const locale = hostLocale(site, url.host) ?? site.defaultLocale;
  return new Response(await localeFeedXml(source, { origin: siteOrigin(site, url), locale }), {
    headers,
  });
};
