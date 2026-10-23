/**
 * The route sweep's renderer (RFC-0008 §7.2): what the blog starter's routes put on the wire for
 * one source, path by path. Shared by the time-gate sweep (`gates-sweep.test.ts`) and the derived
 * gate sweep (`derived-gates-sweep.test.ts`, RFC-0042 §3).
 */
import type { Section } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { archiveSummaries } from "../src/archive.ts";
import { collectionFeedXml } from "../src/collection-feed-route.ts";
import { collectionForFeedPath } from "../src/collection-feeds.ts";
import { contentListEntries } from "../src/entry-query.ts";
import { archiveFeedXml, robotsTxt, rssXml, sitemapUrls, sitemapXml } from "../src/feeds.ts";
import { renderEntryArticle } from "../src/markdown.ts";
import { loadAssetIndex, type MediaContext } from "../src/media.ts";
import { serveMediaRequest } from "../src/media-route.ts";
import { derivedNavigation } from "../src/navigation.ts";
import { renderSectionHtml } from "../src/preview.ts";
import { resolveRoute, staticPaths } from "../src/routing.ts";
import { archiveHead, entryHead, pageHead } from "../src/seo.ts";
import type { GraphSource } from "../src/source.ts";
import { entryTaxonomy, loadTaxonomyIndex, relatedEntries } from "../src/taxonomy.ts";

export const ORIGIN = "https://gates.example";

export interface Swept {
  /** Every public body and header, joined: what a leak would show up in. */
  readonly text: string;
  /** What each path answered (`page`, `entry`, `archive`, `feed`, `not-found`, …). */
  readonly routes: Map<string, string>;
  /** Media URL → status. */
  readonly media: Map<string, number>;
  /** What each path's own route rendered (head, body, lists), for leaks outside one page. */
  readonly byPath: Map<string, string>;
}

/** What the blog starter's routes put on the wire for one source, path by path. */
export async function sweep(
  source: GraphSource,
  candidates: readonly string[],
  assets: readonly string[],
  store: SiteGraphStore,
): Promise<Swept> {
  const out: string[] = [];
  const routes = new Map<string, string>();
  const site = await source.site();
  const locale = site.defaultLocale;
  const index = await loadTaxonomyIndex(source);
  const media: MediaContext = {
    assets: await loadAssetIndex(source),
    locale,
    defaultLocale: locale,
  };
  const all = await source.allEntries();
  const primary = await source.navigation("primary", locale);
  const header = derivedNavigation(
    site,
    await source.pages(),
    archiveSummaries(index, all).filter((a) => a.taxonomy.key === "category"),
    locale,
  );
  out.push(JSON.stringify(primary), JSON.stringify(header));
  const { pages, feeds } = await staticPaths(source);
  const byPath = new Map<string, string>();
  for (const path of new Set([...pages, ...feeds, ...candidates])) {
    const before = out.length;
    const route = await resolveRoute(source, path);
    routes.set(path, route.kind);
    // RFC-0042 §5: a collection's feed answers where the starter's routes answer 404.
    const feedOf = route.kind === "not-found" ? collectionForFeedPath(site, path, all) : undefined;
    if (feedOf) {
      routes.set(path, "collection-feed");
      out.push(await collectionFeedXml(source, { origin: ORIGIN, locale, collection: feedOf }));
    } else if (route.kind === "page") {
      // what `Sections` draws: a section listing by field gets its own query's entries
      const lists = await contentListEntries(source, route.page.sections);
      const listOf = (s: Section) =>
        s.kind === "contentList" && lists[s.id] ? { [s.collection]: lists[s.id] ?? [] } : lists;
      out.push(
        JSON.stringify(pageHead(site, route.page, ORIGIN, media)),
        ...route.page.sections.map((s) => renderSectionHtml(s, listOf(s), media)),
      );
    } else if (route.kind === "entry") {
      const terms = entryTaxonomy(index, route.entry);
      out.push(
        JSON.stringify(entryHead(site, route.entry, ORIGIN, terms, media)),
        renderEntryArticle(route.entry, locale, media),
        JSON.stringify(terms),
        JSON.stringify(relatedEntries(route.entry, all, index, 3).map((e) => [e.id, e.title])),
      );
    } else if (route.kind === "archive") {
      out.push(
        JSON.stringify(archiveHead(site, route.archive, ORIGIN, media)),
        JSON.stringify(route.archive.entries.map((e) => [e.id, e.title, e.summary])),
        String(route.archive.total),
      );
    } else if (route.kind === "feed") {
      out.push(archiveFeedXml({ site, origin: ORIGIN, archive: route.archive, taxonomy: index }));
    } else if (route.kind === "redirect") {
      out.push(route.location);
    }
    byPath.set(path, out.slice(before).join("\n"));
  }
  out.push(
    rssXml({
      site,
      origin: ORIGIN,
      entries: all,
      taxonomy: index,
      assets: await loadAssetIndex(source),
    }),
    sitemapXml(sitemapUrls(site, await source.pages(), all, ORIGIN, archiveSummaries(index, all))),
    robotsTxt(ORIGIN),
  );
  const mediaStatus = new Map<string, number>();
  for (const url of assets) {
    const res = (await serveMediaRequest(new Request(`${ORIGIN}${url}`), {
      siteId: site.id,
      mode: "published",
      assetByPrefix: async (p) => source.assetByPrefix?.(p),
      blobState: (sha) => store.blobState(site.id, sha),
      blobs: store.blobs,
    })) as Response;
    mediaStatus.set(url, res.status);
    out.push(JSON.stringify([...res.headers]));
    await res.body?.cancel();
  }
  return { text: out.join("\n"), routes, media: mediaStatus, byPath };
}
