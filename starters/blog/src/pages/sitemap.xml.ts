import config from "virtual:cloudhal/config";
import { sitemapUrls, sitemapXml } from "@cloudhal/astro-renderer/feeds";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/** Canonical, indexable URLs of the published site. */
export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  headers.set("content-type", "application/xml; charset=utf-8");
  const urls = sitemapUrls(
    site,
    await source.pages(),
    await source.allEntries(),
    siteOrigin(site, url),
  );
  return new Response(sitemapXml(urls), { headers });
};
