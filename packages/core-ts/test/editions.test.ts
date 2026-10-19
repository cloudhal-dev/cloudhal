import type { Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createEdition } from "../src/editions.ts";
import { seedStarterSite } from "../src/seed.ts";
import { readTranslationGroup } from "../src/store/translations.ts";
import { SiteGraphStore } from "../src/store.ts";

async function installation() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  return { sql, store };
}

describe("createEdition (RFC-0034 §6)", () => {
  it("starts a site in the same project from the source's pages, menus and settings", async () => {
    const { sql, store } = await installation();
    const source = await seedStarterSite(store, {
      name: "Newsroom",
      slug: "newsroom",
      locale: "tr",
    });
    await store.createMenuFromPages((await store.getSite(source.id)) as Site, "header");
    const r = await createEdition(store, {
      fromSiteId: source.id,
      name: "Newsroom English",
      slug: "newsroom-en",
      locale: "en",
    });

    expect(r.site.projectId).toBe(source.projectId);
    expect(r.site.defaultLocale).toBe("en");
    expect(r.site.theme).toEqual(((await store.getSite(source.id)) as Site).theme);
    expect(r.skipped).toEqual([]);
    expect(r.pages).toBe(2);
    const pages = await store.listPages(r.site.id);
    expect(pages.map((p) => [p.path, p.locale, p.status]).sort()).toEqual([
      ["/", "en", "draft"],
      ["/about", "en", "draft"],
    ]);
    // Each copy is the English member of the Turkish page's translation group.
    const srcHome = (await store.listPages(source.id)).find((p) => p.path === "/");
    const home = pages.find((p) => p.path === "/");
    expect(home?.translation).toMatchObject({
      group: srcHome?.id,
      layout: "linked",
      source: { id: srcHome?.id, siteId: source.id, locale: "tr" },
    });
    const group = await readTranslationGroup(store, sql, r.site, srcHome?.id as string);
    expect(
      group.members.map((m) => [m.siteId === source.id ? "tr" : "en", m.stale]).sort(),
    ).toEqual([
      ["en", false],
      ["tr", false],
    ]);
    // The header menu points at the copies.
    expect(r.menus).toBe(1);
    const menu = await store.getMenuByKey(r.site.id, "header");
    const ids = new Set(pages.map((p) => p.id));
    const pageItems = (menu?.items ?? []).filter((i) => i.kind === "page") as { pageId: string }[];
    expect(pageItems.length).toBeGreaterThan(0);
    expect(pageItems.every((i) => ids.has(i.pageId))).toBe(true);
    // Articles are not copied; the source is untouched and nothing is published.
    expect(await store.listContentEntries(r.site.id)).toEqual([]);
    expect(r.site.publishedSnapshotId).toBeUndefined();
    expect((await store.listPages(source.id)).length).toBe(2);
  });
});
