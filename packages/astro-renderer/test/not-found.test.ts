/**
 * RFC-0033 §4: the not-found page in the request's locale — the site's `/404` page and its
 * translations — and the system pages' heads (search, feeds) in the locale, over a real store.
 */
import type { Page, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { llmsTxt, localizedSitemap } from "../src/locale-feeds.ts";
import { localizeHead } from "../src/locales.ts";
import { NOT_FOUND_PATH, notFoundPage, notFoundPageIds } from "../src/not-found.ts";
import { searchHead } from "../src/seo.ts";
import { LiveSource } from "../src/source.ts";

const ORIGIN = "https://example.com";

describe("the not-found page", () => {
  let store: SiteGraphStore;
  let site: Site;
  let page404: Page;
  let sayfa404: Page;
  let source: LiveSource;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Missing", slug: "missing" });
    site = await store.updateSite({ ...site, locales: ["en", "tr", "es"] });
    ({ page: page404, site } = await store.createPage(site, {
      id: "page_01HZX8K4N0FD",
      siteId: site.id,
      path: NOT_FOUND_PATH,
      title: "Lost?",
      locale: "en",
      status: "published",
      sections: [{ id: "sec_lost00000001", kind: "hero", heading: "Nothing here" }],
      translation: { group: "page_01HZX8K4N0FD", method: "original" },
    }));
    const hash = (await store.translationGroup(site, page404.id)).members[0]?.hash as string;
    // A translation may live at its own path: it is the not-found page of its locale all the same.
    ({ page: sayfa404, site } = await store.createPage(site, {
      siteId: site.id,
      path: "/bulunamadi",
      title: "Kayboldunuz mu?",
      locale: "tr",
      status: "published",
      sections: [{ id: "sec_kayip0000001", kind: "hero", heading: "Burada bir şey yok" }],
      translation: {
        group: page404.id,
        method: "human",
        source: { id: page404.id, locale: "en", rev: page404.rev, hash },
      },
    }));
    source = new LiveSource(store, site.id);
  });

  it("picks the version in the request's locale, else nothing (the theme's own page)", async () => {
    expect((await notFoundPage(source, site, "en"))?.id).toBe(page404.id);
    expect((await notFoundPage(source, site, "tr"))?.id).toBe(sayfa404.id);
    expect(await notFoundPage(source, site, "es")).toBeUndefined();
    expect(notFoundPageIds(await source.pages())).toEqual(new Set([page404.id, sayfa404.id]));
  });

  it("shows the original where the site falls back to the default language", async () => {
    const fallback = { ...site, localization: { fallback: "default-with-notice" as const } };
    expect((await notFoundPage(source, fallback, "es"))?.id).toBe(page404.id);
  });

  it("stays out of the sitemap and llms.txt", async () => {
    const urls = (await localizedSitemap(source, ORIGIN, "example.com")).map((u) => u.loc);
    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls.some((u) => u.endsWith("/404") || u.endsWith("/bulunamadi"))).toBe(false);
    expect(await llmsTxt(source, { origin: ORIGIN, locale: "en" })).not.toContain("Lost?");
    expect(await llmsTxt(source, { origin: ORIGIN, locale: "tr" })).not.toContain("Kayboldunuz");
  });
});

describe("system pages' heads in the locale", () => {
  const site = {
    name: "News",
    defaultLocale: "en",
    locales: ["en", "tr", "de"],
  } as unknown as Site;

  it("titles the search page in the request's language, English where it has none", () => {
    expect(searchHead(site, "çay", ORIGIN, "tr").title).toBe("Arama: çay · News");
    expect(searchHead(site, "", ORIGIN, "tr").title).toBe("Ara · News");
    expect(searchHead(site, "Tee", ORIGIN, "de").title).toBe("Search: Tee · News");
    expect(searchHead(site, "tea", ORIGIN).title).toBe("Search: tea · News");
  });

  it("points a localized page's feeds and canonical at the locale's URLs", () => {
    const head = localizeHead(
      {
        ...searchHead(site, "", ORIGIN, "tr"),
        feeds: [
          { title: "News", href: `${ORIGIN}/rss.xml` },
          { title: "Spor · News", href: `${ORIGIN}/kategori/spor/rss.xml` },
          { title: "Elsewhere", href: "https://feeds.example.org/x.xml" },
        ],
      },
      site,
      { locale: "tr", origin: ORIGIN, alternates: [] },
    );
    expect(head.canonical).toBe(`${ORIGIN}/tr/search`);
    expect(head.feeds.map((f) => f.href)).toEqual([
      `${ORIGIN}/tr/rss.xml`,
      `${ORIGIN}/tr/kategori/spor/rss.xml`,
      "https://feeds.example.org/x.xml",
    ]);
    expect(head).toMatchObject({ lang: "tr", dir: "ltr" });
  });
});
