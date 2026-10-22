import { describe, expect, it } from "vitest";
import {
  collectionLabel,
  collectionRegistry,
  collectionSettings,
  isRegistered,
} from "../src/collections.ts";

const site = {
  defaultLocale: "en",
  collections: {
    events: {
      labels: {
        en: { singular: "Event", plural: "Events" },
        tr: { singular: "Etkinlik", plural: "Etkinlikler" },
      },
      feed: false,
      sort: "oldest" as const,
    },
    team: {},
  },
};

describe("RFC-0040 collection registry", () => {
  it("declared first, then inferred and posts, each in key order", () => {
    const list = collectionRegistry(site, [
      { collection: "jobs", status: "draft", count: 2 },
      { collection: "events", status: "published", count: 1 },
      { collection: "jobs", status: "published", count: 3 },
    ]);
    expect(list.map((c) => [c.key, c.declared])).toEqual([
      ["events", true],
      ["team", true],
      ["jobs", false],
      ["posts", false],
    ]);
    expect(list.find((c) => c.key === "jobs")?.counts).toEqual({ draft: 2, published: 3 });
    expect(list.find((c) => c.key === "team")?.settings).toEqual({});
  });

  it("a declared posts is not listed twice", () => {
    const list = collectionRegistry({ collections: { posts: { icon: "pen" } } }, []);
    expect(list).toEqual([{ key: "posts", declared: true, settings: { icon: "pen" }, counts: {} }]);
  });

  it("registered means declared, inferred or posts", () => {
    const list = collectionRegistry(site, [{ collection: "jobs", status: "draft", count: 1 }]);
    expect(["events", "team", "jobs", "posts", "faq"].map((k) => isRegistered(list, k))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("labels fall back to the default locale, then the key", () => {
    expect(collectionLabel(site, "events", "tr").plural).toBe("Etkinlikler");
    expect(collectionLabel(site, "events", "de").plural).toBe("Events");
    expect(collectionLabel(site, "team", "en")).toEqual({ singular: "team", plural: "team" });
    expect(collectionLabel(site, "jobs", "en")).toEqual({ singular: "jobs", plural: "jobs" });
  });

  it("settings default to feed, sitemap and newest", () => {
    expect(collectionSettings(site, "events")).toMatchObject({
      feed: false,
      sitemap: true,
      sort: "oldest",
    });
    expect(collectionSettings(undefined, "posts")).toEqual({
      feed: true,
      sitemap: true,
      sort: "newest",
    });
  });
});
