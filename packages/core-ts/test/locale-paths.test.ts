import { describe, expect, it } from "vitest";
import {
  itemUrl,
  type LocaleSite,
  localeRouting,
  localeUrl,
  localizedPath,
} from "../src/locale-paths.ts";

const ORIGIN = "https://example.com";
const site = (over: Partial<LocaleSite> = {}) => ({
  defaultLocale: "en",
  collections: { posts: { permalink: "/blog/{slug}" } },
  ...over,
});
const all = site({ localization: { routing: "prefix-all" } });
const domains = site({ localization: { domains: { ar: "ar.example.com" } } });

describe("locale paths (RFC-0033 §4)", () => {
  it("prefixes every locale but the default, unless the routing is prefix-all", () => {
    expect(localeRouting(site())).toBe("prefix-except-default");
    expect(localeRouting(all)).toBe("prefix-all");
    expect(localizedPath(site(), "en", "/about")).toBe("/about");
    expect(localizedPath(site(), "en", "/")).toBe("/");
    expect(localizedPath(site(), "tr", "/hakkinda")).toBe("/tr/hakkinda");
    expect(localizedPath(site(), "tr", "/")).toBe("/tr");
    expect(localizedPath(all, "en", "/")).toBe("/en");
    expect(localizedPath(all, "en", "/about")).toBe("/en/about");
  });

  it("serves a locale with its own domain at that domain's root", () => {
    expect(localeUrl(domains, "ar", "/about", ORIGIN)).toBe("https://ar.example.com/about");
    expect(localeUrl(domains, "ar", "/", ORIGIN)).toBe("https://ar.example.com/");
    expect(localeUrl(domains, "es", "/", ORIGIN)).toBe("https://example.com/es");
    expect(localeUrl(domains, "en", "/", ORIGIN)).toBe("https://example.com/");
  });

  it("builds a page's and an entry's public URL in their locale", () => {
    const trPage = { path: "/hakkinda", locale: "tr" };
    const trPost = { collection: "posts", slug: "merhaba", locale: "tr" };
    expect(itemUrl(site(), ORIGIN, trPage)).toBe("https://example.com/tr/hakkinda");
    expect(itemUrl(site(), ORIGIN, trPost)).toBe("https://example.com/tr/blog/merhaba");
    expect(itemUrl(site(), ORIGIN, { path: "/", locale: "en" })).toBe("https://example.com/");
    expect(itemUrl(site(), ORIGIN, { path: "/", locale: "tr" })).toBe("https://example.com/tr");
    expect(itemUrl(all, ORIGIN, { path: "/about", locale: "en" })).toBe(
      "https://example.com/en/about",
    );
    expect(itemUrl(domains, ORIGIN, { ...trPost, locale: "ar" })).toBe(
      "https://ar.example.com/blog/merhaba",
    );
    // Without an origin: the localized path, or the locale's own domain.
    expect(itemUrl(site(), undefined, trPage)).toBe("/tr/hakkinda");
    expect(itemUrl(domains, undefined, { path: "/", locale: "ar" })).toBe(
      "https://ar.example.com/",
    );
  });
});
