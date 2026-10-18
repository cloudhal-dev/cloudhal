/**
 * RFC-0033 §4 (phase B1): locale URLs, `hreflang`, link localization and locale-aware routing, over
 * a real store (SQLite + memory blobs) and its live source.
 */
import type { Page, Site, Term } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  alternatesFor,
  linkLocalizer,
  localeRequest,
  localeUrl,
  localizedPath,
  localizeHead,
  localizeLinks,
  textDirection,
} from "../src/locales.ts";
import { resolveRoute } from "../src/routing.ts";
import { pageHead } from "../src/seo.ts";
import { LiveSource } from "../src/source.ts";

const ORIGIN = "https://example.com";

const bare = (over: Partial<Site> = {}): Site =>
  ({
    defaultLocale: "en",
    locales: ["en", "es", "ar"],
    ...over,
  }) as Site;

describe("locale URLs", () => {
  it("splits the prefix, moves non-canonical URLs, and leaves the default locale unprefixed", () => {
    const site = bare();
    expect(localeRequest(site, "example.com", "/")).toEqual({ locale: "en", path: "/" });
    expect(localeRequest(site, "example.com", "/es")).toEqual({ locale: "es", path: "/" });
    expect(localeRequest(site, "example.com", "/es/about")).toEqual({
      locale: "es",
      path: "/about",
    });
    expect(localeRequest(site, "example.com", "/en/about")).toEqual({
      locale: "en",
      path: "/about",
      redirect: "/about",
    });
    expect(localeRequest(site, "example.com", "/ES/about").redirect).toBe("/es/about");
    // A first segment that is not a locale is a path.
    expect(localeRequest(site, "example.com", "/esports")).toEqual({
      locale: "en",
      path: "/esports",
    });
  });

  it("prefixes every locale under prefix-all and serves a locale's own domain at its root", () => {
    const all = bare({ localization: { routing: "prefix-all" } });
    expect(localeRequest(all, "example.com", "/about").redirect).toBe("/en/about");
    expect(localizedPath(all, "en", "/")).toBe("/en");
    const domains = bare({ localization: { domains: { ar: "ar.example.com" } } });
    expect(localeRequest(domains, "ar.example.com:443", "/about")).toEqual({
      locale: "ar",
      path: "/about",
    });
    // On the main host, /ar is not a prefix: the locale lives on its domain.
    expect(localeRequest(domains, "example.com", "/ar/about").locale).toBe("en");
    expect(localeUrl(domains, "ar", "/about", ORIGIN)).toBe("https://ar.example.com/about");
    expect(localeUrl(domains, "es", "/", ORIGIN)).toBe("https://example.com/es");
  });

  it("knows which scripts run right to left", () => {
    expect(["ar", "fa-IR", "he", "ur"].map(textDirection)).toEqual(["rtl", "rtl", "rtl", "rtl"]);
    expect(["en", "tr", "ja", "ku-Latn"].map(textDirection)).toEqual(["ltr", "ltr", "ltr", "ltr"]);
  });

  it("rewrites internal links and forms, never platform paths or other hosts", () => {
    const html =
      '<a href="/about?x=1#top">A</a><a class="c" href="/">H</a><form action="/search"></form>' +
      '<a href="/media/0123456789abcdef/a.jpg">M</a><a href="/_cloudhal/s.js">S</a>' +
      '<a href="//cdn.example.com/x">C</a><a href="https://x.org/">X</a><link href="/rss.xml">';
    const out = localizeLinks(html, (p) => `/es${p === "/" ? "" : p}`);
    expect(out).toBe(
      '<a href="/es/about?x=1#top">A</a><a class="c" href="/es">H</a><form action="/es/search"></form>' +
        '<a href="/media/0123456789abcdef/a.jpg">M</a><a href="/_cloudhal/s.js">S</a>' +
        '<a href="//cdn.example.com/x">C</a><a href="https://x.org/">X</a><link href="/rss.xml">',
    );
  });
});

describe("locales over a store", () => {
  let store: SiteGraphStore;
  let site: Site;
  let about: Page;
  let acerca: Page;
  let source: LiveSource;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Locales", slug: "locales" });
    site = await store.updateSite({ ...site, locales: ["en", "es", "ar"] });
    ({ page: about, site } = await store.createPage(site, {
      id: "page_01HZX8K3QABT",
      siteId: site.id,
      path: "/team",
      title: "Team",
      locale: "en",
      status: "published",
      sections: [],
      translation: { group: "page_01HZX8K3QABT", method: "original" },
    }));
    const hash = (await store.translationGroup(site, about.id)).members[0]?.hash as string;
    ({ page: acerca, site } = await store.createPage(site, {
      siteId: site.id,
      path: "/equipo",
      title: "Equipo",
      locale: "es",
      status: "published",
      sections: [],
      translation: {
        group: about.id,
        method: "human",
        source: { id: about.id, locale: "en", rev: about.rev, hash },
      },
    }));
    source = new LiveSource(store, site.id);
  });

  it("resolves pages in the request's locale", async () => {
    expect(await resolveRoute(source, "/equipo", { locale: "es" })).toMatchObject({
      kind: "page",
      page: { id: acerca.id },
    });
    expect((await resolveRoute(source, "/equipo")).kind).toBe("not-found");
    expect(await resolveRoute(source, "/team")).toMatchObject({ page: { id: about.id } });
  });

  it("lists every version with x-default, each self-canonical in its own locale", async () => {
    const alternates = await alternatesFor(source, acerca, ORIGIN);
    expect(alternates).toEqual([
      { locale: "en", href: "https://example.com/team", current: false },
      { locale: "es", href: "https://example.com/es/equipo", current: true },
      { locale: "x-default", href: "https://example.com/team", current: false },
    ]);
    const head = localizeHead(pageHead(site, acerca, ORIGIN), site, {
      locale: "es",
      origin: ORIGIN,
      alternates,
    });
    expect(head.canonical).toBe("https://example.com/es/equipo");
    expect(head.openGraph).toContainEqual(["og:url", "https://example.com/es/equipo"]);
    expect(head.openGraph).toContainEqual(["og:locale:alternate", "en"]);
    expect(head.alternates).toHaveLength(3);
    // A page without other versions has no hreflang set.
    const home = (await source.pageByPath("/")) as Page;
    expect(await alternatesFor(source, home, ORIGIN)).toEqual([]);
    const ar = localizeHead(pageHead(site, home, ORIGIN), site, {
      locale: "ar",
      origin: ORIGIN,
      alternates: [],
    });
    expect([ar.lang, ar.dir, ar.alternates]).toEqual(["ar", "rtl", undefined]);
  });

  it("sends a localized page's links to the same locale, or back to the default locale", async () => {
    const news = (await store.getTermBySlug(site.id, "category", "news")) as Term;
    await store.updateTerm({
      ...news,
      labels: { ...news.labels, es: { name: "Noticias", slug: "noticias" } },
    });
    expect(await linkLocalizer(source, "en", ORIGIN)).toBeUndefined();
    const es = (await linkLocalizer(source, "es", ORIGIN)) as (p: string) => string;
    expect(es("/team")).toBe("/es/equipo"); // translated
    expect(es("/")).toBe("/"); // the home page has no Spanish version: it stays English
    expect(es("/search")).toBe("/es/search"); // not a node: the same locale
    expect(es("/category/news/page/2")).toBe("/es/category/noticias/page/2");
  });
});
