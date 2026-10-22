import type { Site } from "@cloudhal/core-contracts";
import { Article, CalendarBlank, Files } from "@phosphor-icons/react";
import { describe, expect, it } from "vitest";
import { newCollectionSettings } from "../src/components/NewCollectionDialog.tsx";
import { appliesTo } from "../src/components/useCollectionView.ts";
import { COLLECTION_ICONS } from "../src/lib/collection-icons.ts";
import { collectionIcon, collectionNames, entryTotal } from "../src/lib/collections.ts";
import { labelForm, withForm } from "../src/routes/CollectionSettingsPage.tsx";

const SITE = {
  defaultLocale: "en",
  locales: ["en", "tr"],
  collections: {
    events: { labels: { en: { singular: "Event", plural: "Events" } }, icon: "calendar" },
  },
} as unknown as Site;

describe("RFC-0040 collections in Studio", () => {
  it("names, icons and totals", () => {
    expect(collectionNames(SITE, "events", "tr")?.plural).toBe("Events");
    expect(collectionNames(SITE, "posts", "en")).toBeUndefined();
    expect(
      collectionIcon({ key: "events", settings: { icon: "calendar" } }, COLLECTION_ICONS),
    ).toBe(CalendarBlank);
    expect(collectionIcon({ key: "posts", settings: {} })).toBe(Article);
    expect(collectionIcon({ key: "jobs", settings: { icon: "https://x" } }, COLLECTION_ICONS)).toBe(
      Files,
    );
    expect(entryTotal({ counts: { draft: 2, published: 3 } })).toBe(5);
  });

  it("a taxonomy without collections applies to all", () => {
    expect(appliesTo({}, "events")).toBe(true);
    expect(appliesTo({ collections: ["posts"] }, "events")).toBe(false);
    expect(appliesTo(undefined, "events")).toBe(false);
  });

  it("a new collection: labels in the default locale, permalink only when not the default", () => {
    const base = { key: "events", plural: " Events ", singular: "Event", icon: "calendar" };
    expect(newCollectionSettings({ ...base, prefix: "", locale: "en" })).toEqual({
      labels: { en: { singular: "Event", plural: "Events" } },
      icon: "calendar",
    });
    expect(newCollectionSettings({ ...base, prefix: "/events", locale: "en" }).permalink).toBe(
      undefined,
    );
    expect(newCollectionSettings({ ...base, prefix: "/etkinlik", locale: "tr" }).permalink).toBe(
      "/etkinlik/{slug}",
    );
  });

  it("the settings form keeps the permalink, drops defaults and incomplete label rows", () => {
    const settings = { ...SITE.collections?.events, permalink: "/e/{slug}" };
    const labels = labelForm(SITE, settings);
    expect(Object.keys(labels)).toEqual(["en", "tr"]);
    labels.tr = { singular: "Etkinlik", plural: "", description: "" };
    const next = withForm(settings, {
      labels,
      icon: "calendar",
      feed: false,
      sitemap: true,
      sort: "newest",
    });
    expect(next).toEqual({
      permalink: "/e/{slug}",
      labels: { en: { singular: "Event", plural: "Events" } },
      icon: "calendar",
      feed: false,
    });
  });
});
