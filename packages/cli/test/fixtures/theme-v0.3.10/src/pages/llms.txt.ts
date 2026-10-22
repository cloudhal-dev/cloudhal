import config from "virtual:cloudhal/config";
import { addCacheTags, listCacheTag } from "@cloudhal/astro-renderer/cache-tags";
import { llmsTxt } from "@cloudhal/astro-renderer/locale-feeds";
import { hostLocale } from "@cloudhal/astro-renderer/locales";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/** `llms.txt` (llmstxt.org) in the host's locale; other locales at `/<locale>/llms.txt` (RFC-0033). */
export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  headers.set("content-type", "text/plain; charset=utf-8");
  addCacheTags(headers, [listCacheTag(site.id)]);
  const locale = hostLocale(site, url.host) ?? site.defaultLocale;
  return new Response(await llmsTxt(source, { origin: siteOrigin(site, url), locale }), {
    headers,
  });
};
