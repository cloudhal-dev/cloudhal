import config from "virtual:cloudhal/config";
import { archiveSummaries } from "@cloudhal/astro-renderer/archive";
import { sitemapUrls, sitemapXml } from "@cloudhal/astro-renderer/feeds";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import { loadTaxonomyIndex } from "@cloudhal/astro-renderer/taxonomy";
import type { APIRoute } from "astro";

/** Canonical, indexable URLs of the published site: pages, articles and indexable archives. */
export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const site = await source.site();
  headers.set("content-type", "application/xml; charset=utf-8");
  const entries = await source.allEntries();
  const archives = archiveSummaries(
    await loadTaxonomyIndex(source),
    entries.filter((e) => e.status === "published"),
  );
  const urls = sitemapUrls(site, await source.pages(), entries, siteOrigin(site, url), archives);
  return new Response(sitemapXml(urls), { headers });
};
