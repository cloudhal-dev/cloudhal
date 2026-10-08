/** RFC-0002 §7 on the public site: archives, status codes, heads, feeds, sitemap, redirects. */
import type { ContentEntry, Redirect, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { archiveState, archiveSummaries, parseArchivePath, termForSlug } from "../src/archive.ts";
import { addCacheTags, isCloudhalCacheTag } from "../src/cache-tags.ts";
import { archiveFeedXml, redirectsFile, rssXml, sitemapUrls } from "../src/feeds.ts";
import {
  categoryNavLinks,
  type RouteResult,
  redirectLocation,
  redirectPaths,
  resolveRoute,
  staticPaths,
} from "../src/routing.ts";
import { archiveHead, entryHead, pageLabel } from "../src/seo.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "../src/source.ts";
import {
  entryTaxonomy,
  loadTaxonomyIndex,
  relatedEntries,
  type TaxonomyIndex,
} from "../src/taxonomy.ts";

const human = { kind: "human" as const, id: "user_writer0001", name: "Ayşe Yazar" };
const ORIGIN = "https://news.example.com";

let store: SiteGraphStore;
let site: Site;
let category: Taxonomy;
let tag: Taxonomy;
const t: Record<string, Term> = {};
const e: Record<string, ContentEntry> = {};
let day = 0;

async function term(
  taxonomy: Taxonomy,
  slug: string,
  name: string,
  extra: Partial<Term> = {},
): Promise<Term> {
  t[slug] = await store.createTerm({
    siteId: site.id,
    taxonomyId: taxonomy.id,
    slug,
    status: "active",
    visibility: "public",
    labels: { en: { name } },
    ...extra,
  });
  return t[slug];
}

async function post(slug: string, primary: Term, tags: Term[] = [], extra = {}) {
  day++;
  e[slug] = await store.createContentEntry({
    siteId: site.id,
    collection: "posts",
    slug,
    locale: "en",
    status: "published",
    title: `Post ${slug}`,
    summary: `About ${slug}.`,
    body: { format: "markdown", value: `Body of ${slug}.` },
    fields: {},
    tags: [],
    terms: {
      category: { ids: [primary.id], primary: primary.id },
      ...(tags.length ? { tag: { ids: tags.map((x) => x.id) as [string, ...string[]] } } : {}),
    },
    author: human,
    publishedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
    ...extra,
  });
  return e[slug];
}

/**
 * The seeded site plus: News › World (3 posts) and an empty Sports category; tags `ai` (3 posts),
 * `rare` (1), a proposed `idea`, an internal `featured`, `old` (retired, no redirect) and `llm`
 * (renamed to `llms`); post `c1` renamed to `c1-new` after publishing.
 */
beforeEach(async () => {
  store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  });
  await store.init();
  day = 0;
  const seeded = await seedStarterSite(store, { name: "Haber", slug: "haber" });
  site = await store.updateSite({
    ...seeded,
    domains: [{ hostname: "news.example.com", primary: true }],
  });
  category = (await store.getTaxonomyByKey(site.id, "category")) as Taxonomy;
  tag = (await store.getTaxonomyByKey(site.id, "tag")) as Taxonomy;
  t.news = (await store.getTermBySlug(site.id, "category", "news")) as Term;
  t.cloudhal = (await store.getTermBySlug(site.id, "tag", "cloudhal")) as Term;
  t.news = await store.updateTerm({
    ...t.news,
    labels: {
      en: {
        name: "News",
        description: "What **happened** & why.",
        seo: { description: "The news desk." },
      },
    },
    image: { src: "/media/news.jpg", alt: "Newsroom" },
  });
  await term(category, "world", "World", { parentId: t.news.id, position: 1 });
  await term(category, "sports", "Sports", { position: 2 });
  await term(tag, "ai", "AI");
  await term(tag, "rare", "Rare");
  await term(tag, "idea", "Idea", { status: "proposed" });
  await term(tag, "featured", "Featured", { visibility: "internal" });
  await term(tag, "old", "Old");
  await term(tag, "llm", "LLM");
  await post("a1", t.world as Term, [t.ai as Term]);
  await post("a2", t.world as Term, [t.ai as Term]);
  await post("a3", t.world as Term, [t.ai as Term, t.llm as Term]);
  await post("b1", t.news, [t.rare as Term, t.idea as Term, t.featured as Term]);
  await post("c1", t.news, [t.old as Term, t.llm as Term]);
  await store.retireTerm((await store.getTerm((t.old as Term).id)) as Term);
  t.llms = (await store.renameTerm((await store.getTerm((t.llm as Term).id)) as Term, "llms"))
    .terms[0] as Term;
  e.c1 = await store.updateContentEntry({
    ...((await store.getContentEntry((e.c1 as ContentEntry).id)) as ContentEntry),
    slug: "c1-new",
  });
});

async function sources(): Promise<GraphSource[]> {
  const snap = await store.createSnapshot(site.id, {
    actor: { kind: "system", id: "sys_test0001" },
    reason: "manual",
  });
  return [new LiveSource(store, site.id), await SnapshotSource.open(store, snap.id)];
}

const route = (source: GraphSource, path: string, search?: string) =>
  resolveRoute(source, path, { perPage: 2, ...(search ? { search } : {}) });

function archiveOf(r: RouteResult) {
  if (r.kind !== "archive" && r.kind !== "feed") throw new Error(`expected an archive: ${r.kind}`);
  return r;
}

describe("archive paths and status decisions", () => {
  it("parses root, pagination and feed paths of enabled archives only", () => {
    const taxonomies = [category, tag];
    expect(parseArchivePath(taxonomies, "/category/news")).toMatchObject({
      slug: "news",
      root: "/category/news",
      kind: "page",
      page: 1,
      explicitFirstPage: false,
    });
    expect(parseArchivePath(taxonomies, "/tag/ai/page/3")).toMatchObject({ page: 3 });
    expect(parseArchivePath(taxonomies, "/tag/ai/page/1")).toMatchObject({
      page: 1,
      explicitFirstPage: true,
    });
    expect(parseArchivePath(taxonomies, "/tag/ai/rss.xml")).toMatchObject({ kind: "feed" });
    for (const bad of ["/tag/ai/page/0", "/tag/ai/page/02", "/tag/AI", "/tag", "/tag/a/b"])
      expect(parseArchivePath(taxonomies, bad), bad).toBeUndefined();
    const off = { ...tag, archive: { ...tag.archive, enabled: false } };
    expect(parseArchivePath([off], "/tag/ai")).toBeUndefined();
  });

  it("decides 200 (indexable or thin), 404 and 410 per the RFC table", () => {
    const active = t.news as Term;
    expect(archiveState(category, active, 3, "en")).toEqual({ status: 200, indexable: true });
    expect(archiveState(category, active, 2, "en")).toEqual({ status: 200, indexable: false });
    expect(archiveState(category, active, 0, "en")).toEqual({ status: 404 });
    const noindex = {
      ...active,
      labels: { en: { name: "News", seo: { noindex: true } } },
    };
    expect(archiveState(category, noindex, 9, "en")).toEqual({ status: 200, indexable: false });
    expect(archiveState(category, { ...active, status: "proposed" }, 9, "en").status).toBe(404);
    expect(archiveState(category, { ...active, visibility: "internal" }, 9, "en").status).toBe(404);
    expect(archiveState(category, { ...active, status: "retired" }, 0, "en").status).toBe(410);
    expect(archiveState(category, undefined, 0, "en").status).toBe(404);
    const disabled = { ...category, archive: { ...category.archive, enabled: false } };
    expect(archiveState(disabled, active, 9, "en").status).toBe(404);
    // a live term wins over a retired one that had the same slug
    const retired = { ...active, id: "term_retired0001", status: "retired" as const };
    expect(termForSlug([retired, active], "news")?.id).toBe(active.id);
    expect(termForSlug([retired], "news")?.id).toBe("term_retired0001");
  });

  it("resolves archives, pagination, redirects, 404 and 410 on live and snapshot sources", async () => {
    for (const source of await sources()) {
      // category archives include sub-categories: hello-world, a1–a3, b1, c1-new
      const news = archiveOf(await route(source, "/category/news/"));
      expect(news.kind).toBe("archive");
      expect(news.archive).toMatchObject({ total: 6, pages: 3, page: 1, indexable: true });
      expect(news.archive.entries.map((x) => x.slug)).toEqual(["hello-world", "c1-new"]);
      const page3 = archiveOf(await route(source, "/category/news/page/3"));
      expect(page3.archive.entries.map((x) => x.slug)).toEqual(["a2", "a1"]);
      expect(page3.archive.path).toBe("/category/news/page/3");
      expect(await route(source, "/category/news/page/4")).toEqual({ kind: "not-found" });
      expect(await route(source, "/category/news/page/1", "?ref=x")).toEqual({
        kind: "redirect",
        status: 301,
        location: "/category/news?ref=x",
      });
      // breadcrumb trail through the parent; thin archives are served but not indexable
      const world = archiveOf(await route(source, "/category/world"));
      expect(world.archive.trail.map((s) => s.slug)).toEqual(["news"]);
      expect(world.archive.indexable).toBe(true);
      expect(archiveOf(await route(source, "/tag/rare")).archive.indexable).toBe(false);
      // empty, proposed and internal → 404; retired without redirect → 410 (feeds too)
      for (const path of ["/category/sports", "/tag/idea", "/tag/featured", "/tag/nope"])
        expect((await route(source, path)).kind, path).toBe("not-found");
      expect(await route(source, "/tag/old")).toEqual({ kind: "gone" });
      expect(await route(source, "/tag/old/rss.xml")).toEqual({ kind: "gone" });
      // rename: prefix redirect carries pagination and feeds, and the query string
      expect(await route(source, "/tag/llm/page/2/", "?utm_source=x")).toEqual({
        kind: "redirect",
        status: 301,
        location: "/tag/llms/page/2?utm_source=x",
      });
      expect(await route(source, "/tag/llm/rss.xml")).toMatchObject({
        location: "/tag/llms/rss.xml",
      });
      expect(await route(source, "/posts/c1")).toMatchObject({
        kind: "redirect",
        location: "/posts/c1-new",
      });
      // feeds list every entry of the term
      const feed = archiveOf(await route(source, "/category/news/rss.xml"));
      expect(feed.kind).toBe("feed");
      expect(feed.archive.entries).toHaveLength(6);
      // pages and entries still win
      expect((await route(source, "/about")).kind).toBe("page");
      expect((await route(source, "/posts/a1")).kind).toBe("entry");
    }
  });

  it("lists static paths: archive pages, page/1, feeds and redirect sources — never 404s or 410s", async () => {
    const [, snapshot] = await sources();
    const paths = await staticPaths(snapshot as GraphSource, { perPage: 2 });
    expect(paths.pages).toEqual(
      expect.arrayContaining([
        "/",
        "/about",
        "/posts/c1-new",
        "/category/news",
        "/category/news/page/2",
        "/category/news/page/3",
        "/category/news/page/1",
        "/tag/rare",
        "/tag/llms",
        "/tag/llm",
        "/posts/c1",
      ]),
    );
    // a prefix redirect also covers the old twin of every served page under its target
    const redirects = await (snapshot as GraphSource).redirects();
    expect(redirectPaths(redirects, ["/tag/llms/page/2"])).toContain("/tag/llm/page/2");
    for (const missing of ["/category/sports", "/tag/idea", "/tag/featured", "/tag/old"])
      expect(paths.pages).not.toContain(missing);
    expect(paths.pages.some((p) => p.endsWith(".xml"))).toBe(false);
    expect(paths.feeds).toEqual(expect.arrayContaining(["/category/news/rss.xml"]));
    expect(paths.feeds).not.toContain("/tag/old/rss.xml");
  });
});

describe("heads, feeds and sitemap", () => {
  it("archive head: page 1 carries description and JSON-LD; page 2 is self-canonical without them", async () => {
    const [live] = await sources();
    const one = archiveOf(await route(live as GraphSource, "/category/world")).archive;
    const head = archiveHead(site, one, ORIGIN);
    expect(head).toMatchObject({
      title: "World · Haber",
      canonical: `${ORIGIN}/category/world`,
      lang: "en",
    });
    expect(head.robots).toBeUndefined();
    expect(head.feeds).toContainEqual({
      title: "World · Haber",
      href: `${ORIGIN}/category/world/rss.xml`,
    });
    expect(head.jsonLd[0]).toMatchObject({
      "@type": "CollectionPage",
      about: {
        "@type": "DefinedTerm",
        name: "World",
        url: `${ORIGIN}/category/world`,
        inDefinedTermSet: { "@type": "DefinedTermSet", name: "Categories" },
      },
      mainEntity: { "@type": "ItemList", numberOfItems: 3 },
    });
    expect(head.jsonLd[1]).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, item: `${ORIGIN}/` },
        { position: 2, name: "News", item: `${ORIGIN}/category/news` },
        { position: 3, name: "World", item: `${ORIGIN}/category/world` },
      ],
    });

    const news = archiveOf(await route(live as GraphSource, "/category/news")).archive;
    const first = archiveHead(site, news, ORIGIN);
    expect(first.description).toBe("The news desk.");
    expect(first.openGraph).toContainEqual(["og:image", `${ORIGIN}/media/news.jpg`]);
    // without seo.description, the intro becomes plain text
    const plain = archiveHead(
      site,
      {
        ...news,
        term: { ...news.term, labels: { en: { name: "News", description: "A **b** & c" } } },
      },
      ORIGIN,
    );
    expect(plain.description).toBe("A b & c");

    const two = archiveOf(await route(live as GraphSource, "/category/news/page/2")).archive;
    const second = archiveHead(site, two, ORIGIN);
    expect(second.title).toBe("News – Page 2 · Haber");
    expect(second.canonical).toBe(`${ORIGIN}/category/news/page/2`);
    expect(second.description).toBeUndefined();
    expect(second.jsonLd).toEqual([]);
    expect(pageLabel("tr-TR", 3)).toBe("Sayfa 3");

    const thin = archiveOf(await route(live as GraphSource, "/tag/rare")).archive;
    expect(archiveHead(site, thin, ORIGIN).robots).toBe("noindex,follow");
  });

  it("per-term feed and site feed name categories and tags from terms", async () => {
    const [, snapshot] = await sources();
    const source = snapshot as GraphSource;
    const r = archiveOf(await route(source, "/tag/ai/rss.xml"));
    const xml = archiveFeedXml({ site, origin: ORIGIN, archive: r.archive, taxonomy: r.index });
    expect(xml).toContain("<title>AI · Haber</title>");
    expect(xml).toContain(`<link>${ORIGIN}/tag/ai</link>`);
    expect(xml).toContain(
      `<atom:link href="${ORIGIN}/tag/ai/rss.xml" rel="self" type="application/rss+xml"/>`,
    );
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml).toContain("<category>World</category><category>AI</category>");
    const siteFeed = rssXml({
      site: await source.site(),
      origin: ORIGIN,
      entries: await source.allEntries(),
      taxonomy: r.index,
    });
    // proposed and internal tags are never shown
    expect(siteFeed).toContain("<category>News</category><category>Rare</category>");
    expect(siteFeed).not.toContain("Idea");
    expect(siteFeed).not.toContain("Featured");
  });

  it("sitemap adds indexable archives (page 1) with the newest member's lastmod", async () => {
    const [, snapshot] = await sources();
    const source = snapshot as GraphSource;
    const index = await loadTaxonomyIndex(source);
    const entries = await source.allEntries();
    const archives = archiveSummaries(index, entries);
    const urls = sitemapUrls(site, await source.pages(), entries, ORIGIN, archives);
    const byLoc = new Map(urls.map((u) => [u.loc, u.lastmod]));
    expect(byLoc.has(`${ORIGIN}/category/news`)).toBe(true);
    expect(byLoc.has(`${ORIGIN}/category/world`)).toBe(true);
    expect(byLoc.has(`${ORIGIN}/tag/ai`)).toBe(true);
    for (const missing of [
      "/tag/rare",
      "/tag/cloudhal",
      "/tag/llms",
      "/category/sports",
      "/tag/idea",
    ])
      expect(byLoc.has(`${ORIGIN}${missing}`), missing).toBe(false);
    const newestWorld = [e.a1, e.a2, e.a3]
      .map((x) => (x as ContentEntry).updatedAt)
      .sort()
      .at(-1) as string;
    const worldTerm = index.terms.get((t.world as Term).id) as Term;
    expect(byLoc.get(`${ORIGIN}/category/world`)).toBe(
      newestWorld > worldTerm.updatedAt ? newestWorld : worldTerm.updatedAt,
    );
    // the header can list top-level categories with a served archive (World is a child; Sports empty)
    expect(categoryNavLinks(archives, "/category/news/page/2", "en")).toEqual([
      { href: "/category/news", label: "News", current: true },
    ]);
  });
});

describe("posts: terms, legacy tags and related entries", () => {
  let index: TaxonomyIndex;
  beforeEach(async () => {
    index = await loadTaxonomyIndex(new LiveSource(store, site.id));
  });

  it("shows public terms only, with the primary category as section and breadcrumb", async () => {
    const a3 = (await store.getContentEntry((e.a3 as ContentEntry).id)) as ContentEntry;
    const shown = entryTaxonomy(index, a3);
    expect(shown.groups.map((g) => g.taxonomy.key)).toEqual(["category", "tag"]);
    expect(shown.section?.name).toBe("World");
    expect(shown.trail.map((s) => s.href)).toEqual(["/category/news", "/category/world"]);
    expect(shown.keywords).toEqual(["AI", "LLM"]);
    const b1 = entryTaxonomy(index, e.b1 as ContentEntry);
    expect(b1.tags.map((s) => s.slug)).toEqual(["rare"]); // not the proposed or internal tag

    const head = entryHead(site, a3, ORIGIN, shown);
    expect(head.openGraph).toEqual(
      expect.arrayContaining([
        ["article:section", "World"],
        ["article:tag", "AI"],
        ["article:tag", "LLM"],
      ]),
    );
    expect(head.jsonLd[0]).toMatchObject({
      articleSection: "World",
      about: { "@type": "DefinedTerm", name: "World", termCode: "world" },
      keywords: [
        { "@type": "DefinedTerm", name: "AI", url: `${ORIGIN}/tag/ai` },
        { "@type": "DefinedTerm", name: "LLM", url: `${ORIGIN}/tag/llms` },
      ],
    });
    expect(head.jsonLd[1]).toMatchObject({
      itemListElement: [
        { name: "Haber" },
        { name: "News" },
        { name: "World" },
        { name: "Post a3", item: `${ORIGIN}/posts/a3` },
      ],
    });
  });

  it("falls back to the deprecated tags for entries without terms (un-migrated sites)", () => {
    const { terms: _terms, ...rest } = e.a1 as ContentEntry;
    const legacy: ContentEntry = { ...rest, tags: ["launch", "news"] };
    for (const shown of [entryTaxonomy(index, legacy), entryTaxonomy(undefined, legacy)]) {
      expect(shown.keywords).toEqual(["launch", "news"]);
      expect(shown.groups).toEqual([]);
    }
    const head = entryHead(site, legacy, ORIGIN, entryTaxonomy(index, legacy));
    expect(head.openGraph).toContainEqual(["article:tag", "launch"]);
    expect((head.jsonLd[0] as { keywords: unknown }).keywords).toBe("launch, news");
    // the default (no index) reads the legacy tags too
    expect(entryHead(site, legacy, ORIGIN).openGraph).toContainEqual(["article:tag", "news"]);
    const feed = rssXml({ site, origin: ORIGIN, entries: [legacy], taxonomy: index });
    expect(feed).toContain("<category>launch</category><category>news</category>");
  });

  it("related posts: shared primary category first, then shared terms; published, same locale", async () => {
    const all = await new LiveSource(store, site.id).allEntries();
    const a1 = e.a1 as ContentEntry;
    // a2, a3 share World (primary, 2) + AI (1) → 3; hello-world, b1, c1-new share nothing
    expect(relatedEntries(a1, all, index).map((x) => x.slug)).toEqual(["a3", "a2"]);
    const hello = all.find((x) => x.slug === "hello-world") as ContentEntry;
    expect(relatedEntries(hello, all, index, 2).map((x) => x.slug)).toEqual(["c1-new", "b1"]);
    const draft = { ...(e.a2 as ContentEntry), id: "entry_draft00001", status: "draft" as const };
    const other = { ...(e.a3 as ContentEntry), id: "entry_other00001", locale: "tr" };
    expect(relatedEntries(a1, [draft, other], index)).toEqual([]);
    // legacy tags count too
    const legacy = ({ terms: _t, ...rest }: ContentEntry): ContentEntry => ({
      ...rest,
      tags: ["k"],
    });
    const y = legacy(hello);
    expect(relatedEntries(legacy(a1), [y], index)).toEqual([y]);
  });
});

describe("redirect output and cache tags", () => {
  const r = (from: string, to: string, match: Redirect["match"], status: 301 | 302 = 301) =>
    ({ from, to, match, status }) as Redirect;

  it("keeps the query string, never forwards a preview token off-site", () => {
    expect(redirectLocation("/b", "?x=1")).toBe("/b?x=1");
    expect(redirectLocation("/b?y=2#top", "?x=1")).toBe("/b?y=2&x=1#top");
    expect(redirectLocation("/b", "")).toBe("/b");
    expect(redirectLocation("/b", "?cloudhal-preview=tok")).toBe("/b?cloudhal-preview=tok");
    expect(redirectLocation("https://other.example/x", "?cloudhal-preview=tok&a=1")).toBe(
      "https://other.example/x?a=1",
    );
  });

  it("writes _redirects (exact first, prefix splats longest first) and static redirect paths", () => {
    const list = [
      r("/tag/old", "/tag/new", "prefix"),
      r("/posts/a", "/posts/b", "exact"),
      r("/tag/old/deeper", "/tag/x", "prefix", 302),
    ];
    expect(redirectsFile(list).split("\n").slice(1)).toEqual([
      "/posts/a /posts/b 301",
      "/tag/old/deeper /tag/x 302",
      "/tag/old/deeper/* /tag/x/:splat 302",
      "/tag/old /tag/new 301",
      "/tag/old/* /tag/new/:splat 301",
      "",
    ]);
    expect(
      redirectPaths(list, ["/tag/new", "/tag/new/page/2", "/tag/new/rss.xml", "/posts/b"]).sort(),
    ).toEqual(["/posts/a", "/tag/old", "/tag/old/deeper", "/tag/old/page/2"]);
  });

  it("adds node and term tags to published responses only", () => {
    const published = new Headers({ "cache-tag": "cloudhal-site-site_1" });
    addCacheTags(published, [
      "cloudhal-node-entry_1",
      "cloudhal-term-term_1",
      "cloudhal-node-entry_1",
    ]);
    expect(published.get("cache-tag")).toBe(
      "cloudhal-site-site_1,cloudhal-node-entry_1,cloudhal-term-term_1",
    );
    const preview = new Headers();
    addCacheTags(preview, ["cloudhal-node-entry_1"]);
    expect(preview.has("cache-tag")).toBe(false);
    expect(isCloudhalCacheTag("cloudhal-term-term_ABC123")).toBe(true);
    expect(isCloudhalCacheTag("cloudhal-term-x,evil")).toBe(false);
  });
});
