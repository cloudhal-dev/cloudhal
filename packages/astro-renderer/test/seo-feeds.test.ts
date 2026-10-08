/** SEO head, feeds, sitemap and routing over a seeded site (Sprint 10). */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { robotsTxt, rssXml, sitemapUrls, sitemapXml } from "../src/feeds.ts";
import { renderEntryArticle } from "../src/markdown.ts";
import { navLinks, resolvePath, routablePaths } from "../src/routing.ts";
import { absoluteUrl, clip, entryHead, jsonLdText, pageHead, siteOrigin } from "../src/seo.ts";
import { LiveSource, SnapshotSource } from "../src/source.ts";

const human = { kind: "human" as const, id: "user_writer0001", name: "Ayşe Yazar" };
const agent = { kind: "agent" as const, id: "agent_writer001", name: "desk-bot" };

let store: SiteGraphStore;
let site: Site;

beforeEach(async () => {
  store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  });
  await store.init();
  const seeded = await seedStarterSite(store, { name: "Haber", slug: "haber" });
  site = await store.updateSite({
    ...seeded,
    domains: [{ hostname: "news.example.com", primary: true }],
  });
});

async function entry(overrides: Partial<ContentEntry>): Promise<ContentEntry> {
  return store.createContentEntry({
    siteId: site.id,
    collection: "posts",
    slug: "launch",
    locale: "en",
    status: "published",
    title: "We launched <today>",
    summary: "A short summary for search results.",
    body: { format: "markdown", value: "# We launched <today>\n\nBody with **bold**." },
    fields: {},
    tags: ["launch", "news"],
    author: human,
    ...overrides,
  } as never);
}

describe("seo", () => {
  it("prefers the primary domain as the origin and only makes safe URLs absolute", () => {
    expect(siteOrigin(site, "http://localhost:4321/x")).toBe("https://news.example.com");
    expect(siteOrigin({ domains: [] }, "http://localhost:4321/x")).toBe("http://localhost:4321");
    expect(absoluteUrl("https://a.example", "/img/c.png")).toBe("https://a.example/img/c.png");
    expect(absoluteUrl("https://a.example", "https://cdn.example/c.png")).toBe(
      "https://cdn.example/c.png",
    );
    expect(absoluteUrl("https://a.example", "javascript:alert(1)")).toBeUndefined();
    expect(absoluteUrl("https://a.example", "data:image/png;base64,AAAA")).toBeUndefined();
    expect(absoluteUrl("https://a.example", "relative.png")).toBeUndefined();
    expect(clip("a  b\n c")).toBe("a b c");
    expect(clip("x".repeat(200))?.length).toBe(160);
    expect(clip("   ")).toBeUndefined();
  });

  it("pages: title, canonical, noindex, cards and JSON-LD", async () => {
    const pages = await store.listPages(site.id);
    const home = pages.find((p) => p.path === "/") as NonNullable<(typeof pages)[number]>;
    const about = pages.find((p) => p.path === "/about") as NonNullable<(typeof pages)[number]>;
    const h = pageHead(site, home, "https://news.example.com");
    expect(h.canonical).toBe("https://news.example.com/");
    expect(h.title).toBe(home.title);
    expect(h.jsonLd[0]).toMatchObject({ "@type": "WebSite", name: "Haber" });
    expect(h.feeds).toEqual([{ title: "Haber", href: "https://news.example.com/rss.xml" }]);
    expect(h.robots).toBeUndefined();

    const a = pageHead(
      site,
      { ...about, seo: { title: "About Haber", description: "Who we are", noindex: true } },
      "https://news.example.com",
    );
    expect(a).toMatchObject({
      title: "About Haber",
      description: "Who we are",
      canonical: "https://news.example.com/about",
      robots: "noindex,follow",
    });
    expect(a.openGraph).toContainEqual(["og:type", "website"]);
    expect(a.twitter).toContainEqual(["twitter:card", "summary"]);
    expect(pageHead(site, about, "https://news.example.com").title).toBe("About · Haber");
    // a canonical override wins (safe schemes only)
    expect(
      pageHead(site, { ...about, seo: { canonical: "https://other.example/about" } }, "https://x")
        .canonical,
    ).toBe("https://other.example/about");
  });

  it("articles: summary as description, cover as card image, BlogPosting credited honestly", async () => {
    const e = await entry({
      coverImage: { src: "/media/cover.jpg", alt: "The team", width: 1200, height: 630 },
    });
    const m = entryHead(site, e, "https://news.example.com");
    expect(m.canonical).toBe("https://news.example.com/posts/launch");
    expect(m.description).toBe("A short summary for search results.");
    expect(m.title).toBe("We launched <today> · Haber");
    expect(m.openGraph).toEqual(
      expect.arrayContaining([
        ["og:type", "article"],
        ["og:image", "https://news.example.com/media/cover.jpg"],
        ["og:image:alt", "The team"],
        ["article:published_time", e.publishedAt as string],
        ["article:tag", "launch"],
      ]),
    );
    expect(m.twitter).toContainEqual(["twitter:card", "summary_large_image"]);
    expect(m.jsonLd[0]).toMatchObject({
      "@type": "BlogPosting",
      headline: "We launched <today>",
      datePublished: e.publishedAt,
      author: { "@type": "Person", name: "Ayşe Yazar" },
      keywords: "launch, news",
    });
    // an agent's article is credited to the site, not to the key's name
    const byAgent = entryHead(site, { ...e, author: agent }, "https://news.example.com");
    expect((byAgent.jsonLd[0] as { author: unknown }).author).toMatchObject({
      "@type": "Organization",
      name: "Haber",
    });
    // JSON-LD cannot break out of its <script>
    expect(jsonLdText({ headline: "</script><script>alert(1)</script>" })).not.toMatch(/<|>/);
  });

  it("renders the cover image above the body with a safe src only", async () => {
    const e = await entry({ coverImage: { src: "/c.jpg", alt: 'A "quote"' } });
    expect(renderEntryArticle(e)).toContain(
      '<figure class="ch-cover"><img src="/c.jpg" alt="A &quot;quote&quot;" fetchpriority="high"',
    );
    const bad = { ...e, coverImage: { src: "javascript:alert(1)", alt: "x" } };
    expect(renderEntryArticle(bad)).not.toContain("<figure");
  });
});

describe("feeds and sitemap", () => {
  it("RSS lists published articles of every collection with full content, escaped", async () => {
    await entry({});
    await entry({ collection: "notes", slug: "a-note", title: "A note", tags: [] });
    await entry({ slug: "draft", status: "draft", title: "Not yet" });
    const live = new LiveSource(store, site.id); // includes drafts — the feed must not
    const feed = rssXml({
      site,
      origin: "https://news.example.com",
      entries: await live.allEntries(),
    });
    expect(feed).toContain('<rss version="2.0"');
    expect(feed).toContain("<title>We launched &lt;today&gt;</title>");
    expect(feed).toContain("<link>https://news.example.com/posts/launch</link>");
    expect(feed).toContain("<link>https://news.example.com/notes/a-note</link>");
    expect(feed).toContain("<category>launch</category>");
    expect(feed).toContain("<content:encoded><![CDATA[");
    expect(feed).toContain("<dc:creator><![CDATA[Ayşe Yazar]]></dc:creator>");
    expect(feed).not.toContain("Not yet");
    expect(feed).toContain(
      '<atom:link href="https://news.example.com/rss.xml" rel="self" type="application/rss+xml"/>',
    );
  });

  it("sitemap lists canonical, indexable URLs only; robots points at it", async () => {
    await entry({});
    await entry({ slug: "draft", status: "draft", title: "Not yet" });
    const pages = await store.listPages(site.id);
    const about = pages.find((p) => p.path === "/about") as NonNullable<(typeof pages)[number]>;
    await store.updatePage({ ...about, seo: { noindex: true } });
    const live = new LiveSource(store, site.id);
    const urls = sitemapUrls(
      site,
      await live.pages(),
      await live.allEntries(),
      "https://news.example.com",
    );
    const locs = urls.map((u) => u.loc);
    expect(locs).toContain("https://news.example.com/");
    expect(locs).toContain("https://news.example.com/posts/launch");
    expect(locs).not.toContain("https://news.example.com/about");
    expect(locs.some((l) => l.endsWith("/posts/draft"))).toBe(false);
    expect(sitemapXml(urls)).toContain("<loc>https://news.example.com/posts/launch</loc>");
    expect(robotsTxt("https://news.example.com")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://news.example.com/sitemap.xml\n",
    );
  });
});

describe("routing", () => {
  it("resolves pages first, then articles of any collection; lists every routable path", async () => {
    await entry({ collection: "notes", slug: "a-note", title: "A note" });
    const snap = await store.createSnapshot(site.id, {
      actor: { kind: "system", id: "sys_test0001" },
      reason: "manual",
    });
    for (const source of [
      new LiveSource(store, site.id),
      await SnapshotSource.open(store, snap.id),
    ]) {
      expect((await resolvePath(source, "/about"))?.kind).toBe("page");
      const note = await resolvePath(source, "/notes/a-note");
      expect(note?.kind === "entry" && note.entry.title).toBe("A note");
      expect(await resolvePath(source, "/notes/missing")).toBeUndefined();
      expect(await resolvePath(source, "/a/b/c")).toBeUndefined();
      expect(await routablePaths(source)).toEqual(
        expect.arrayContaining(["/", "/about", "/notes/a-note"]),
      );
    }
  });

  it("builds the header navigation from top-level pages in site order", async () => {
    const pages = await new LiveSource(store, site.id).pages();
    expect(navLinks(site, pages, "/about")).toEqual([
      { href: "/about", label: "About", current: true },
    ]);
    expect(navLinks(site, pages, "/")[0]?.current).toBe(false);
  });
});
