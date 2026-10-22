/**
 * `search_site` (RFC-0029 §8): find a site's articles, pages, terms, media, menu items and redirects
 * by words, drafts included, the way Studio's palette does; or, with `published`, what readers
 * find on `/search` (the site's search provider: published, inside time gates).
 */
import {
  MARK_CLOSE,
  MARK_OPEN,
  SEARCH_KINDS,
  type SearchKind,
  SITE_SEARCH_KINDS,
  SITE_SEARCH_LIMIT_MAX,
  type SiteSearchKind,
  searchSiteNodes,
} from "@cloudhal/core-ts";
import { id, mapError, obj, requireSite, str, type ToolDefinition } from "./common.ts";

const HIT = obj(
  {
    kind: { type: "string" },
    id: { type: "string" },
    title: { type: "string" },
    detail: { type: "string" },
    context: { type: "string" },
    status: { type: "string" },
    locale: { type: "string" },
    ref: { type: "string" },
    href: { type: "string" },
    snippet: { type: "string" },
  },
  ["kind", "title"],
);

const plain = (snippet: string) => snippet.replaceAll(MARK_OPEN, "").replaceAll(MARK_CLOSE, "");

const searchSiteTool: ToolDefinition = {
  name: "search_site",
  title: "Search the site",
  description:
    "Find nodes by words instead of listing everything. By default searches what you edit, drafts included: articles (kind entry), pages, terms, media (asset), menu items (menu: `id` is the menu, `ref` the item) and redirects; every word must start a word of the title, slug, path, labels or alt text; up to `limit` hits per kind. With `published: true`, returns what readers find on /search instead (published articles, pages, terms and authors, with snippets), in the site's default locale.",
  inputSchema: obj(
    {
      siteId: id,
      query: str("Words to find", { minLength: 1, maxLength: 200 }),
      kinds: {
        type: "array",
        description:
          "Only these kinds. Editing view: entry, page, term, asset, menu, redirect. Published view: article, page, term, author.",
        items: { type: "string", enum: [...new Set([...SITE_SEARCH_KINDS, ...SEARCH_KINDS])] },
        minItems: 1,
        uniqueItems: true,
      },
      published: { type: "boolean", description: "Search what readers see (default false)" },
      limit: {
        type: "integer",
        description: "Hits per kind (editing view) or in all (published view)",
        minimum: 1,
        maximum: SITE_SEARCH_LIMIT_MAX,
      },
    },
    ["siteId", "query"],
  ),
  outputSchema: obj({ query: { type: "string" }, hits: { type: "array", items: HIT } }, [
    "query",
    "hits",
  ]),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  scopes: ["content:read"],
  handler: async (a, ctx) => {
    const site = await requireSite(ctx, a.siteId as string);
    const query = a.query as string;
    const kinds = a.kinds as string[] | undefined;
    const limit = a.limit as number | undefined;
    try {
      if (a.published === true) {
        const r = await ctx.store.search(site.id, query, {
          locale: site.defaultLocale,
          now: (ctx.now?.() ?? new Date()).getTime(),
          perPage: limit ?? SITE_SEARCH_LIMIT_MAX,
          ...(kinds ? { kinds: kinds as SearchKind[] } : {}),
          ...(site.publishedSnapshotId ? { snapshotId: site.publishedSnapshotId } : {}),
        });
        return {
          query: r.query,
          hits: r.hits.map((h) => ({
            kind: h.kind ?? "article",
            id: h.nodeId,
            title: h.title,
            href: h.href,
            ...(h.context ? { context: h.context } : {}),
            ...(h.snippet ? { snippet: plain(h.snippet) } : {}),
          })),
        };
      }
      return await searchSiteNodes(ctx.store, site.id, query, {
        site,
        ...(kinds ? { kinds: kinds as SiteSearchKind[] } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
    } catch (e) {
      mapError(e);
    }
  },
};

export function searchTools(): ToolDefinition[] {
  return [searchSiteTool];
}
