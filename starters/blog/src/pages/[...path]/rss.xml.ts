import config from "virtual:cloudhal/config";
import {
  addCacheTags,
  listCacheTag,
  nodeCacheTag,
  termCacheTag,
} from "@cloudhal/astro-renderer/cache-tags";
import { archiveFeedXml, FEED_LIMIT } from "@cloudhal/astro-renderer/feeds";
import { resolveRoute, staticPaths } from "@cloudhal/astro-renderer/routing";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";
import { ARCHIVE_PAGE_SIZE } from "../../theme.ts";

const SUFFIX = "/rss.xml";

/** Static builds: one feed per served archive of a taxonomy with `feed: true`. */
export async function getStaticPaths() {
  const source = await getSource(config);
  const { feeds } = await staticPaths(source, { perPage: ARCHIVE_PAGE_SIZE });
  return feeds.map((p) => ({ params: { path: p.slice(1, -SUFFIX.length) } }));
}

/**
 * A category's or tag's RSS feed (`<basePath>/<slug>/rss.xml`, RFC-0002 §7). Old slugs follow
 * their redirects (prefix redirects carry `/rss.xml` along); retired terms answer 410.
 */
export const GET: APIRoute = async ({ request, url, params }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  if (!source) return new Response("This site has not been published yet.", { status: 503 });
  const route = await resolveRoute(source, `/${params.path ?? ""}${SUFFIX}`, {
    perPage: ARCHIVE_PAGE_SIZE,
    search: url.search,
  });
  if (route.kind === "redirect")
    return new Response(null, { status: route.status, headers: { location: route.location } });
  if (route.kind === "gone") return new Response(null, { status: 410 });
  if (route.kind !== "feed") return new Response(null, { status: 404 });
  const site = await source.site();
  headers.set("content-type", "application/rss+xml; charset=utf-8");
  addCacheTags(headers, [
    listCacheTag(route.archive.term.id),
    termCacheTag(route.archive.term.id),
    ...route.archive.entries.slice(0, FEED_LIMIT).map((e) => nodeCacheTag(e.id)),
  ]);
  const body = archiveFeedXml({
    site,
    origin: siteOrigin(site, url),
    archive: route.archive,
    taxonomy: route.index,
  });
  return new Response(body, { headers });
};
