import config from "virtual:cloudhal/config";
import { addCacheTags, listCacheTag } from "@cloudhal/astro-renderer/cache-tags";
import { sitemapXml } from "@cloudhal/astro-renderer/feeds";
import { localizedSitemap } from "@cloudhal/astro-renderer/locale-feeds";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/**
 * Canonical, indexable URLs of the published site in every locale this host serves (RFC-0033):
 * pages, articles and indexable archives, each with its language versions as `xhtml:link`.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  headers.set("content-type", "application/xml; charset=utf-8");
  // Lists every page, entry and indexable archive: any entry or term change purges it.
  addCacheTags(headers, [listCacheTag(site.id)]);
  const urls = await localizedSitemap(source, siteOrigin(site, url), url.host);
  return new Response(sitemapXml(urls), { headers });
};
