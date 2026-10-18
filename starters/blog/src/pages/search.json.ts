import config from "virtual:cloudhal/config";
import { hostLocale, linkLocalizer } from "@cloudhal/astro-renderer/locales";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { searchJsonResponse } from "@cloudhal/astro-renderer/search";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/**
 * The search modal's endpoint (RFC-0029 §5): the same index and rules as `/search`, as JSON, in
 * the host's locale (other locales: `/<locale>/search.json`, RFC-0033). Never cached, never
 * indexed; a static build has no search and writes no file.
 */
export const GET: APIRoute = async ({ request, url }) => {
  // The source's own headers (preview, cache tags) do not apply: the answer is never cached.
  const source = await getSource(config, { request, response: { headers: new Headers() } });
  if (!source) return searchJsonResponse(config, source, url);
  const site = await source.site();
  const locale = hostLocale(site, url.host) ?? site.defaultLocale;
  const localize = await linkLocalizer(source, locale, siteOrigin(site, url));
  return searchJsonResponse(config, source, url, { locale, localize });
};
