import { describe, expect, it } from "vitest";
import { collectionPermalink, entryAt, entryPath } from "../src/permalinks.ts";

const plain = {};
const site = {
  collections: {
    posts: { permalink: "/blog/{slug}" },
    guides: { permalink: "/docs/guides/{slug}" },
    docs: { permalink: "/docs/{slug}" },
    news: {},
  },
};
const e = (collection: string, slug: string) => ({ collection, slug });

describe("permalinks (RFC-0038)", () => {
  it("defaults to /<collection>/{slug}, as before", () => {
    expect(entryPath(plain, e("posts", "hello"))).toBe("/posts/hello");
    expect(entryPath(undefined, e("posts", "hello"))).toBe("/posts/hello");
    expect(entryAt(plain, "/posts/hello")).toEqual(e("posts", "hello"));
    expect(collectionPermalink(site, "news")).toBe("/news/{slug}");
  });

  it("uses a collection's template both ways", () => {
    expect(entryPath(site, e("posts", "hello"))).toBe("/blog/hello");
    expect(entryPath(site, e("guides", "setup"))).toBe("/docs/guides/setup");
    expect(entryAt(site, "/blog/hello")).toEqual(e("posts", "hello"));
    expect(entryAt(site, "/news/today")).toEqual(e("news", "today"));
  });

  it("prefers the longest prefix, and a slug is one segment", () => {
    expect(entryAt(site, "/docs/guides/setup")).toEqual(e("guides", "setup"));
    expect(entryAt(site, "/docs/intro")).toEqual(e("docs", "intro"));
    expect(entryAt(site, "/docs/guides/setup/more")).toBeUndefined();
    expect(entryAt(site, "/")).toBeUndefined();
    expect(entryAt(site, "/about")).toBeUndefined();
  });

  it("does not answer at a moved collection's old prefix", () => {
    expect(entryAt(site, "/posts/hello")).toBeUndefined();
  });

  it("round-trips every entry", () => {
    for (const x of [
      e("posts", "a"),
      e("guides", "b"),
      e("docs", "c"),
      e("news", "d"),
      e("misc", "e"),
    ])
      expect(entryAt(site, entryPath(site, x))).toEqual(x);
  });

  it("still answers the old one-argument call of themes copied before 0.3.11", () => {
    expect(entryPath(e("posts", "hello"))).toBe("/posts/hello");
    expect([e("posts", "a"), e("news", "b")].map(entryPath)).toEqual(["/posts/a", "/news/b"]);
  });
});
