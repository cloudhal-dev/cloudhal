/** RFC-0019 §3: the search route, its helpers and the Site Worker's limit. */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { MARK_CLOSE, MARK_OPEN, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveRoute } from "../src/routing.ts";
import { searchAvailable, searchPageHref, searchRequest, snippetHtml } from "../src/search.ts";
import { isSearchPath, SEARCH_RATE_LIMIT, SearchLimiter } from "../src/search-limit.ts";
import { searchHead } from "../src/seo.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "../src/source.ts";

const system = { kind: "system" as const, id: "sys_search0001" };

describe("search route", () => {
  let store: SiteGraphStore;
  let site: Site;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Demo", slug: "demo" });
    const news = (await store.getTermBySlug(site.id, "category", "news"))?.id as string;
    const post = (slug: string, title: string, status: ContentEntry["status"]) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug,
        locale: "en",
        status,
        title,
        body: { format: "markdown", value: `About ${title.toLowerCase()} and <b>more</b>.` },
        fields: {},
        tags: [],
        terms: { category: { ids: [news], primary: news } },
        author: system,
        ...(status === "published" ? { publishedAt: "2026-10-15T08:00:00.000Z" } : {}),
      });
    await post("baklava", "Baklava layers", "published");
    await post("draft-baklava", "Baklava draft", "draft");
  });

  const publish = async () => {
    const snap = await store.createSnapshot(site.id, { actor: system, reason: "publish" });
    site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
    return snap;
  };

  it("answers /search from the index on a published snapshot, drafts never included", async () => {
    const snap = await publish();
    const source = new SnapshotSource(store, snap);
    const route = await resolveRoute(source, "/search", { search: "?q=baklava" });
    expect(route.kind).toBe("search");
    if (route.kind !== "search") return;
    expect(route.search).toMatchObject({ query: "baklava", total: 1, page: 1, stale: false });
    expect(route.search.hits.map((h) => h.href)).toEqual(["/posts/baklava"]);
    // an empty query is the bare form; a page past the last is a 404
    expect(await resolveRoute(source, "/search/", { search: "" })).toMatchObject({
      kind: "search",
      search: { total: 0, query: "" },
    });
    expect((await resolveRoute(source, "/search", { search: "?q=baklava&page=2" })).kind).toBe(
      "not-found",
    );
  });

  it("searches what cloudhal dev shows, drafts included", async () => {
    const route = await resolveRoute(new LiveSource(store, site.id), "/search", {
      search: "?q=bakl",
    });
    if (route.kind !== "search") throw new Error(route.kind);
    expect(route.search.hits.map((h) => h.href).sort()).toEqual([
      "/posts/baklava",
      "/posts/draft-baklava",
    ]);
    expect(route.search.hits[0]?.snippet).toContain(MARK_OPEN);
  });

  it("is a 404 for sources that cannot search, and only static builds lack it", async () => {
    const snap = await publish();
    const source = new SnapshotSource(store, snap);
    // a source from before search: the methods routing needs, no `search`
    const legacy = {
      mode: "snapshot",
      site: () => source.site(),
      pageByPath: (p: string) => source.pageByPath(p),
      entryBySlug: (c: string, s: string) => source.entryBySlug(c, s),
      taxonomies: () => source.taxonomies(),
      vocabulary: () => source.vocabulary(),
      redirectFor: (p: string) => source.redirectFor(p),
    } as unknown as GraphSource;
    expect((await resolveRoute(legacy, "/search", { search: "?q=x" })).kind).toBe("not-found");
    expect(searchAvailable({ target: "cloudflare" }, source)).toBe(true);
    expect(searchAvailable({ target: "node" }, source)).toBe(false); // a static build
    expect(searchAvailable({ target: "node" }, new LiveSource(store, site.id))).toBe(true);
  });

  it("parses requests, builds page links and escapes snippets before marking them", () => {
    expect(searchRequest("?q=%C3%A7ay&page=3")).toEqual({ query: "çay", page: 3 });
    expect(searchRequest("?page=-1")).toEqual({ query: "", page: 1 });
    expect(searchPageHref("çay & simit", 1)).toBe("/search?q=%C3%A7ay+%26+simit");
    expect(searchPageHref("çay", 2)).toBe("/search?q=%C3%A7ay&page=2");
    expect(snippetHtml(`<script>x</script> ${MARK_OPEN}çay${MARK_CLOSE} "&"`)).toBe(
      "&lt;script&gt;x&lt;/script&gt; <mark>çay</mark> &quot;&amp;&quot;",
    );
    const head = searchHead(site, "çay", "https://news.example");
    expect(head).toMatchObject({
      title: "Search: çay · Demo",
      canonical: "https://news.example/search",
      robots: "noindex,follow",
      jsonLd: [],
    });
  });
});

describe("SearchLimiter", () => {
  it("allows SEARCH_RATE_LIMIT searches per client and minute", () => {
    let now = 60_000 * 1000 + 15_000;
    const limiter = new SearchLimiter({ now: () => now });
    for (let i = 0; i < SEARCH_RATE_LIMIT; i++) expect(limiter.take("203.0.113.7")).toBe(0);
    expect(limiter.take("203.0.113.7")).toBe(45);
    expect(limiter.take("198.51.100.1")).toBe(0);
    expect(limiter.take(undefined)).toBe(0);
    now += 45_000;
    expect(limiter.take("203.0.113.7")).toBe(0);
    expect(isSearchPath("/search")).toBe(true);
    expect(isSearchPath("/search/")).toBe(true);
    expect(isSearchPath("/searching")).toBe(false);
  });
});
