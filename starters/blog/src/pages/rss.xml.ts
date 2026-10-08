import config from "virtual:cloudhal/config";
import { rssXml } from "@cloudhal/astro-renderer/feeds";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import { loadTaxonomyIndex } from "@cloudhal/astro-renderer/taxonomy";
import type { APIRoute } from "astro";

/** The site's RSS 2.0 feed: the newest published articles of every collection. */
export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  const home = await source.pageByPath("/");
  headers.set("content-type", "application/rss+xml; charset=utf-8");
  const body = rssXml({
    site,
    origin: siteOrigin(site, url),
    entries: await source.allEntries(),
    taxonomy: await loadTaxonomyIndex(source),
    ...(home?.seo?.description ? { description: home.seo.description } : {}),
  });
  return new Response(body, { headers });
};
