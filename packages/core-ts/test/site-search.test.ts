/** RFC-0029 §7: Studio and agent search over a site's own nodes, drafts included. */
import type { Actor, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { seedStarterSite } from "../src/seed.ts";
import { searchSiteNodes, siteSearchWords } from "../src/site-search.ts";
import { SiteGraphStore } from "../src/store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };

describe("searchSiteNodes", () => {
  let store: SiteGraphStore;
  let site: Site;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Desk", slug: "desk" });
    const category = (await store.listTaxonomies(site.id)).find((t) => t.key === "category");
    await store.createTerm({
      siteId: site.id,
      taxonomyId: category?.id as string,
      slug: "ic-haberler",
      status: "active",
      visibility: "public",
      labels: { en: { name: "İç Haberler", altNames: ["Domestic"] } },
    });
    await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "budget-draft",
      locale: "en",
      status: "draft",
      title: "The budget, line by line",
      summary: "Where the money goes.",
      body: { format: "markdown", value: "Draft." },
      fields: {},
      tags: [],
      author: human,
    });
    await store.createRedirect({
      siteId: site.id,
      from: "/old-budget",
      to: "/posts/budget-draft",
      status: 301,
      match: "exact",
      reason: "manual",
      note: "moved after the redesign",
    });
  });

  const find = (q: string, o?: Parameters<typeof searchSiteNodes>[3]) =>
    searchSiteNodes(store, site.id, q, o);
  const keys = async (q: string, o?: Parameters<typeof searchSiteNodes>[3]) =>
    (await find(q, o)).hits.map((h) => `${h.kind}:${h.title}`);

  it("finds drafts, live nodes and redirects by what people call them", async () => {
    expect(await keys("budget")).toEqual([
      "entry:The budget, line by line",
      "redirect:/old-budget",
    ]);
    const [entry] = (await find("budget")).hits;
    expect(entry).toMatchObject({
      kind: "entry",
      status: "draft",
      detail: "/posts/budget-draft",
      context: "posts",
      locale: "en",
    });
    expect(await keys("money")).toEqual(["entry:The budget, line by line"]); // the summary
    expect(await keys("redesign")).toEqual(["redirect:/old-budget"]); // its note
    expect(await keys("about")).toContain("page:About");
    expect((await find("about", { kinds: ["page"] })).hits.every((h) => h.kind === "page")).toBe(
      true,
    );
  });

  it("folds Turkish letters and matches every word as a prefix, titles first", async () => {
    expect(await keys("ic hab")).toEqual(["term:İç Haberler"]);
    expect(await keys("domestic")).toEqual(["term:İç Haberler"]); // an alternative name
    const [term] = (await find("haberler")).hits;
    expect(term).toMatchObject({ kind: "term", context: "Category", ref: "category" });
    expect(await keys("budget money nothing")).toEqual([]);
    expect(await keys("  ")).toEqual([]);
    expect(siteSearchWords("İç Haberler!")).toEqual(["ic", "haberler"]);
  });

  it("finds menu items by their labels, with the menu and item a link needs", async () => {
    const menu = await store.createMenu({
      siteId: site.id,
      key: "footer",
      maxDepth: 2,
      items: [
        {
          id: "item_T000000001",
          kind: "url",
          href: "https://example.com/press",
          labels: { en: "Press kit" },
        },
      ] as never,
    });
    expect((await find("press")).hits).toEqual([
      { kind: "menu", id: menu.id, title: "Press kit", context: "footer", ref: "item_T000000001" },
    ]);
  });

  it("caps hits per kind", async () => {
    for (let i = 0; i < 12; i++)
      await store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: `note-${i}`,
        locale: "en",
        status: "draft",
        title: `Field note ${i}`,
        body: { format: "markdown", value: "" },
        fields: {},
        tags: [],
        author: human,
      });
    expect((await find("field")).hits).toHaveLength(5);
    expect((await find("field", { limit: 50 })).hits).toHaveLength(10);
  });
});
