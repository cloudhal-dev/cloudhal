import config from "virtual:cloudhal/config";
import { linkLocalizer, localeRequest } from "@cloudhal/astro-renderer/locales";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { searchJsonResponse } from "@cloudhal/astro-renderer/search";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/** Static builds have no search: nothing to write. */
export function getStaticPaths() {
  return [];
}

/** A locale's search modal endpoint, `/<locale>/search.json` (RFC-0029 §5, RFC-0033). */
export const GET: APIRoute = async ({ request, url, params }) => {
  const source = await getSource(config, { request, response: { headers: new Headers() } });
  if (!source) return searchJsonResponse(config, source, url);
  const site = await source.site();
  const lr = localeRequest(site, url.host, `/${params.path ?? ""}`);
  if (lr.path !== "/" || lr.redirect !== undefined)
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  const localize = await linkLocalizer(source, lr.locale, siteOrigin(site, url));
  return searchJsonResponse(config, source, url, { locale: lr.locale, localize });
};
