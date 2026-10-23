import config from "virtual:cloudhal/config";
import { addCacheTags, listCacheTag } from "@cloudhal/astro-renderer/cache-tags";
import { llmsTxt } from "@cloudhal/astro-renderer/locale-feeds";
import { localeRequest } from "@cloudhal/astro-renderer/locales";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

/** Static builds: `/<locale>/llms.txt` for every other locale served on this host. */
export async function getStaticPaths() {
  const source = await getSource(config);
  const site = await source.site();
  const domains = site.localization?.domains ?? {};
  return site.locales
    .filter(
      (l) =>
        (l !== site.defaultLocale || site.localization?.routing === "prefix-all") && !domains[l],
    )
    .map((l) => ({ params: { path: l } }));
}

/** A locale's `llms.txt` (RFC-0033): `/<locale>/llms.txt`; any other path is not found. */
export const GET: APIRoute = async ({ request, url, params }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  const lr = localeRequest(site, url.host, `/${params.path ?? ""}`);
  if (lr.path !== "/") return new Response(null, { status: 404 });
  if (lr.redirect !== undefined)
    return new Response(null, {
      status: 301,
      headers: { location: `${lr.redirect === "/" ? "" : lr.redirect}/llms.txt` },
    });
  headers.set("content-type", "text/plain; charset=utf-8");
  addCacheTags(headers, [listCacheTag(site.id)]);
  return new Response(await llmsTxt(source, { origin: siteOrigin(site, url), locale: lr.locale }), {
    headers,
  });
};
