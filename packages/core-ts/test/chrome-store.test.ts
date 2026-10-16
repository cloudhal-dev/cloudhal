/** RFC-0025 25d: the footer's surface region and mega menu items, as the store checks them. */
import type { Menu, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyChromeForm, resolveChrome } from "../src/chrome.ts";
import { SiteGraphStore, seedStarterSite } from "../src/index.ts";

const region = (components: unknown[]) => ({
  id: "sec_footreg001",
  kind: "surface",
  catalog: "blog@1",
  components,
});

describe("site chrome in the store (RFC-0025 25d)", () => {
  let store: SiteGraphStore;
  let site: Site;
  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    site = (await store.getSite(
      (
        await seedStarterSite(store, { name: "Bars", slug: "bars" })
      ).id,
    )) as Site;
  });

  it("keeps a footer region that checks, refuses one that does not, and resolves the bars", async () => {
    const ok = region([
      { id: "root", component: "Stack", children: ["t"] },
      { id: "t", component: "Text", props: { text: "Newsletter" } },
    ]);
    const saved = await store.updateSite({
      ...site,
      chrome: {
        footer: { region: ok as never },
        announcement: { id: "spring", text: "Hello", tone: "brand" },
        consent: { mode: "notice", policy: "/privacy" },
      },
    });
    const c = resolveChrome(saved);
    expect(c.footer.region?.id).toBe("sec_footreg001");
    expect(c.announcement).toEqual({
      id: "spring",
      text: "Hello",
      link: undefined,
      tone: "brand",
      dismissible: true,
    });
    expect(c.consent).toEqual({ mode: "notice", policy: "/privacy" });
    expect(resolveChrome(saved, { chrome: { footer: "minimal" } }).footer.region).toBeUndefined();

    await expect(
      store.updateSite({
        ...saved,
        chrome: {
          footer: {
            region: region([
              { id: "root", component: "Nope" },
              { id: "x", component: "Text" },
            ]) as never,
          },
        },
      }),
    ).rejects.toThrow(/chrome\.footer\.region/);
    await expect(
      store.updateSite({
        ...saved,
        chrome: {
          footer: { region: { id: "sec_footreg002", kind: "hero", heading: "Hi" } as never },
        },
      }),
    ).rejects.toThrow(/a surface section/);

    // A form (Studio, cloudhal chrome set) never edits the region: it stays unless removed.
    const form = await applyChromeForm(
      saved,
      { footer: { layout: "minimal" } },
      { menus: ["primary"], resolve: async () => undefined },
    );
    expect(form.site.chrome?.footer).toMatchObject({
      layout: "minimal",
      region: { id: "sec_footreg001" },
    });
    const removed = await applyChromeForm(
      saved,
      { footer: { layout: "minimal", region: null } },
      { menus: ["primary"], resolve: async () => undefined },
    );
    expect(removed.site.chrome?.footer?.region).toBeUndefined();
  });

  it("allows mega only on a top-level item with children", async () => {
    const pages = await store.listPages(site.id);
    const page = pages[0]?.id as string;
    const base = { siteId: site.id, key: "primary", maxDepth: 3 } as const;
    const menu = await store.createMenu({
      ...base,
      items: [
        {
          id: "item_MEGA000001",
          kind: "group",
          labels: { en: "Product" },
          display: "mega",
          children: [
            {
              id: "item_COL0000001",
              kind: "group",
              labels: { en: "Col" },
              children: [{ id: "item_LNK0000001", kind: "page", pageId: page }],
            },
          ],
        },
      ],
    } as never);
    expect((menu as Menu).items[0]?.display).toBe("mega");
    await expect(
      store.createMenu({
        ...base,
        key: "other",
        items: [{ id: "item_LONE000001", kind: "page", pageId: page, display: "mega" }],
      } as never),
    ).rejects.toThrow(/display mega belongs to a top-level item with children/);
  });
});
