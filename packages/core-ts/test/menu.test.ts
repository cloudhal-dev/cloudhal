/** RFC-0003 pure rules: operations, the approval delta and render-time resolution. */
import type { Menu, MenuItem, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { InvariantError } from "../src/errors.ts";
import {
  applyMenuOps,
  buildMenuItems,
  defaultMaxDepth,
  type MenuLookup,
  menuDelta,
  menuStateChanges,
  menuTargets,
  resolveMenu,
  validateMenuTree,
} from "../src/menu.ts";

const site = {
  id: "site_01HZX8K3Q9EF",
  defaultLocale: "en",
  locales: ["en", "tr"],
} as unknown as Site;
let n = 0;
const newId = () => `item_N${String(++n).padStart(9, "0")}`;

function menu(items: MenuItem[], maxDepth = 3): Menu {
  return {
    schemaVersion: 1,
    id: "menu_01HZX8K3Q9PR",
    siteId: site.id,
    key: "primary",
    maxDepth,
    items,
    rev: 0,
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
  };
}
const pageItem = (id: string, pageId: string, extra: object = {}) =>
  ({ id, kind: "page", pageId, ...extra }) as MenuItem;

function failure(fn: () => unknown): InvariantError {
  try {
    fn();
  } catch (e) {
    if (e instanceof InvariantError) return e;
    throw e;
  }
  throw new Error("expected an InvariantError");
}

describe("applyMenuOps (§6.2)", () => {
  const base = () =>
    menu([
      pageItem("item_AAAAAAAAA1", "page_ABOUT00001"),
      {
        id: "item_HELP000001",
        kind: "group",
        labels: { en: "Help" },
        children: [pageItem("item_FAQ0000001", "page_FAQ0000001")],
      } as MenuItem,
    ]);

  it("adds, moves, updates and removes in order, keeping item ids", () => {
    const next = applyMenuOps(
      base(),
      [
        {
          op: "add",
          item: {
            target: { kind: "url", href: "https://status.example.com" },
            labels: { en: "Status" },
            newTab: true,
          },
          parent: "item_HELP000001",
        },
        { op: "move", itemId: "item_AAAAAAAAA1", parent: "item_HELP000001", index: 0 },
        { op: "update", itemId: "item_FAQ0000001", labels: { en: "FAQ", tr: "SSS" } },
        { op: "update", itemId: "item_FAQ0000001", labels: { tr: null } },
        {
          op: "update",
          itemId: "item_HELP000001",
          target: { kind: "page", ref: "page_HELP000001" },
        },
      ],
      newId,
      site,
    );
    expect(next.items).toHaveLength(1);
    const help = next.items[0] as MenuItem;
    // the group became a page item: same id, labels and children
    expect(help).toMatchObject({
      id: "item_HELP000001",
      kind: "page",
      pageId: "page_HELP000001",
      labels: { en: "Help" },
    });
    expect(help.children?.map((c) => c.id)).toEqual([
      "item_AAAAAAAAA1",
      "item_FAQ0000001",
      expect.stringMatching(/^item_N/),
    ]);
    expect(help.children?.[1]).toEqual({
      id: "item_FAQ0000001",
      kind: "page",
      pageId: "page_FAQ0000001",
      labels: { en: "FAQ" },
    });
    const removed = applyMenuOps(next, [{ op: "remove", itemId: "item_HELP000001" }], newId, site);
    expect(removed.items).toEqual([]);
  });

  it("is all or nothing and names the failing operation", () => {
    const m = base();
    const e = failure(() =>
      applyMenuOps(
        m,
        [
          { op: "remove", itemId: "item_AAAAAAAAA1" },
          { op: "move", itemId: "item_HELP000001", parent: "item_FAQ0000001" },
        ],
        newId,
        site,
      ),
    );
    expect(e.code).toBe("cycle");
    expect(e.details.opIndex).toBe(1);
    expect(m.items).toHaveLength(2);
    expect(
      failure(() => applyMenuOps(m, [{ op: "remove", itemId: "item_NOPE000001" }], newId)).code,
    ).toBe("unknown_item");
    // depth at the step it is exceeded
    const deep = failure(() =>
      applyMenuOps(
        menu(m.items, 2),
        [
          {
            op: "add",
            item: { target: { kind: "page", ref: "page_X00000001" } },
            parent: "item_FAQ0000001",
          },
        ],
        newId,
        site,
      ),
    );
    expect([deep.code, deep.details.opIndex]).toEqual(["too_deep", 0]);
    // collection, url and group items need a default-locale label
    const label = failure(() =>
      applyMenuOps(
        m,
        [
          {
            op: "add",
            item: {
              target: { kind: "collection", collection: "posts" },
              labels: { tr: "Yazılar" },
            },
          },
        ],
        newId,
        site,
      ),
    );
    expect(label.code).toBe("invalid_label");
    expect(
      failure(() =>
        applyMenuOps(m, [{ op: "update", itemId: "item_AAAAAAAAA1", newTab: true }], newId, site),
      ).code,
    ).toBe("invalid_menu");
    expect(
      failure(() =>
        applyMenuOps(
          m,
          Array.from({ length: 51 }, () => ({ op: "remove" as const, itemId: "x" })),
          newId,
        ),
      ).code,
    ).toBe("too_large");
  });

  it("buildMenuItems keeps given ids and mints the rest", () => {
    const items = buildMenuItems(
      [
        { id: "item_KEEP000001", target: { kind: "page", ref: "page_ABOUT00001" } },
        {
          target: { kind: "group" },
          labels: { en: "G" },
          children: [{ target: { kind: "term", ref: "term_NEWS000001" } }],
        },
      ],
      newId,
    );
    expect(items[0]?.id).toBe("item_KEEP000001");
    expect(items[1]?.children?.[0]).toMatchObject({ kind: "term", termId: "term_NEWS000001" });
    expect(menuTargets(menu(items))).toEqual([
      { kind: "page", id: "page_ABOUT00001" },
      { kind: "term", id: "term_NEWS000001" },
    ]);
    expect([
      defaultMaxDepth("primary"),
      defaultMaxDepth("footer"),
      defaultMaxDepth("sidebar"),
      defaultMaxDepth("x"),
    ]).toEqual([3, 2, 6, 3]);
    expect(() => validateMenuTree(menu(items), site)).not.toThrow();
  });
});

describe("menuDelta (§6.3)", () => {
  const ids = ["item_A00000001", "item_B00000001", "item_C00000001", "item_D00000001"];
  const flat = (order: string[]) => menu(order.map((id) => pageItem(id, `page_${id.slice(5)}`)));

  it("an insertion does not move its siblings; only items outside the LCS move", () => {
    const before = flat(ids);
    const inserted = flat([ids[0], "item_NEW000001", ids[1], ids[2], ids[3]] as string[]);
    const d1 = menuDelta(before, inserted);
    expect(d1.added).toEqual([{ id: "item_NEW000001", index: 1, descendants: 0 }]);
    expect(d1.moved).toEqual([]);
    const moved = menuDelta(before, flat([ids[3], ids[0], ids[1], ids[2]] as string[]));
    expect(moved.moved.map((m) => [m.id, m.from.index, m.to.index])).toEqual([[ids[3], 3, 0]]);
    expect(moved.changes).toBe(1);
  });

  it("reports subtrees once, reparenting, label, target and new-tab edits", () => {
    const before = menu([
      {
        id: "item_RES000001",
        kind: "group",
        labels: { en: "Resources" },
        children: [
          pageItem("item_R10000001", "page_R10000001"),
          pageItem("item_R20000001", "page_R20000001"),
        ],
      } as MenuItem,
      pageItem("item_API000001", "page_API000001"),
      {
        id: "item_DOCS00001",
        kind: "group",
        labels: { en: "Docs" },
        children: [pageItem("item_D10000001", "page_D10000001")],
      } as MenuItem,
      pageItem("item_ABOUT0001", "page_ABOUT00001", { labels: { tr: "Hakkında" } }),
      {
        id: "item_URL000001",
        kind: "url",
        href: "https://a.example",
        labels: { en: "A" },
      } as MenuItem,
    ]);
    const after = menu([
      {
        id: "item_DOCS00001",
        kind: "group",
        labels: { en: "Docs" },
        children: [
          pageItem("item_D10000001", "page_D10000001"),
          pageItem("item_API000001", "page_API000001"),
        ],
      } as MenuItem,
      pageItem("item_ABOUT0001", "page_ABOUT00001", { labels: { tr: "Hakkımızda" } }),
      {
        id: "item_URL000001",
        kind: "url",
        href: "https://a.example",
        labels: { en: "A" },
        newTab: true,
      } as MenuItem,
    ]);
    const d = menuDelta(before, after);
    expect(d.removed).toEqual([{ id: "item_RES000001", descendants: 2 }]);
    expect(d.moved.find((m) => m.id === "item_API000001")).toMatchObject({
      reparented: true,
      to: { parentId: "item_DOCS00001" },
    });
    expect(d.changed).toEqual([
      { id: "item_ABOUT0001", labels: [{ locale: "tr", from: "Hakkında", to: "Hakkımızda" }] },
      { id: "item_URL000001", newTab: { from: false, to: true } },
    ]);
    expect([d.before, d.after]).toEqual([8, 5]);
  });
});

describe("resolveMenu (§7.1)", () => {
  const lookup: MenuLookup = {
    defaultLocale: "en",
    page: (id) =>
      ({
        page_ABOUT00001: { path: "/about", title: "About", locale: "en", served: true },
        page_DRAFT00001: { path: "/draft", title: "Draft", locale: "en", served: false },
        page_TRPAGE0001: { path: "/hakkinda", title: "Hakkında", locale: "tr", served: true },
      })[id],
    entry: () => undefined,
    term: (id, locale) =>
      ({
        term_NEWS000001: {
          path: "/category/news",
          name: locale === "tr" ? "Haberler" : "News",
          state: 200 as const,
        },
        term_EMPTY00001: { path: "/category/empty", name: "Empty", state: 404 as const },
        term_GONE000001: { path: "/category/gone", name: "Gone", state: 410 as const },
      })[id],
    collectionIndex: (c) => (c === "posts" ? "/" : undefined),
  };
  const m = menu([
    pageItem("item_ABOUT0001", "page_ABOUT00001", {
      labels: { tr: "Hakkımızda" },
      children: [pageItem("item_SUB000001", "page_DRAFT00001")],
    }),
    pageItem("item_DRAFT0001", "page_DRAFT00001", {
      children: [pageItem("item_UNDER00001", "page_ABOUT00001")],
    }),
    pageItem("item_GONE000001", "page_MISSING001"),
    pageItem("item_TR00000001", "page_TRPAGE0001"),
    {
      id: "item_TERMS00001",
      kind: "group",
      labels: { en: "Topics" },
      children: [
        { id: "item_NEWS000001", kind: "term", termId: "term_NEWS000001" },
        { id: "item_EMPTY00001", kind: "term", termId: "term_EMPTY00001" },
        { id: "item_RETIRED001", kind: "term", termId: "term_GONE000001" },
      ],
    } as MenuItem,
    {
      id: "item_EMPTYGRP01",
      kind: "group",
      labels: { en: "Nothing" },
      children: [pageItem("item_X00000001", "page_MISSING001")],
    } as MenuItem,
    {
      id: "item_BLOG000001",
      kind: "collection",
      collection: "posts",
      labels: { en: "Blog" },
    } as MenuItem,
    {
      id: "item_DOCS000001",
      kind: "collection",
      collection: "docs",
      labels: { en: "Docs" },
    } as MenuItem,
    {
      id: "item_GH00000001",
      kind: "url",
      href: "https://github.com/x",
      labels: { en: "GitHub" },
      newTab: true,
    } as MenuItem,
  ]);

  it("shows served targets, hides each reason with its subtree, and falls back through labels", () => {
    const en = resolveMenu(m, lookup, "en");
    const by = new Map<string, (typeof en.items)[number]>();
    const walk = (xs: typeof en.items) => {
      for (const x of xs) {
        by.set(x.id, x);
        walk(x.children);
      }
    };
    walk(en.items);
    expect(by.get("item_ABOUT0001")).toMatchObject({
      state: "shown",
      label: "About",
      labelSource: "target",
      href: "/about",
    });
    expect(by.get("item_SUB000001")).toMatchObject({
      state: "hidden",
      reason: "unpublished",
      label: "Draft",
    });
    expect(by.get("item_DRAFT0001")).toMatchObject({ state: "hidden", reason: "unpublished" });
    expect(by.get("item_UNDER00001")).toMatchObject({ state: "hidden", reason: "parent-hidden" });
    expect(by.get("item_GONE000001")).toMatchObject({
      state: "hidden",
      reason: "missing",
      labelSource: "none",
    });
    expect(by.get("item_TR00000001")).toMatchObject({ state: "hidden", reason: "other-locale" });
    expect(by.get("item_NEWS000001")).toMatchObject({
      state: "shown",
      href: "/category/news",
      label: "News",
    });
    expect(by.get("item_EMPTY00001")).toMatchObject({ reason: "not-served" });
    expect(by.get("item_RETIRED001")).toMatchObject({ reason: "retired" });
    expect(by.get("item_TERMS00001")).toMatchObject({ state: "shown" });
    expect(by.get("item_EMPTYGRP01")).toMatchObject({ state: "hidden", reason: "empty-group" });
    expect(by.get("item_BLOG000001")).toMatchObject({
      state: "shown",
      href: "/",
      label: "Blog",
      labelSource: "item",
    });
    expect(by.get("item_DOCS000001")).toMatchObject({ reason: "no-index" });
    expect(by.get("item_GH00000001")).toMatchObject({
      state: "shown",
      external: true,
      newTab: true,
      href: "https://github.com/x",
    });
    expect([en.shown, en.hidden]).toEqual([5, 10]);
    const tr = resolveMenu(m, lookup, "tr");
    expect(tr.items[0]).toMatchObject({
      label: "Hakkımızda",
      labelSource: "item",
      state: "hidden",
      reason: "other-locale",
    });
    const blog = tr.items.find((i) => i.id === "item_BLOG000001");
    expect(blog).toMatchObject({ label: "Blog", labelSource: "default-locale" });
  });

  it("menuStateChanges reports items that became hidden or shown, subtrees once", () => {
    const before = resolveMenu(m, lookup, "en");
    const after = resolveMenu(
      m,
      { ...lookup, page: (id) => (id === "page_ABOUT00001" ? undefined : lookup.page(id)) },
      "en",
    );
    expect(menuStateChanges(before, after).map((c) => [c.item.id, c.item.reason])).toEqual([
      ["item_ABOUT0001", "missing"],
    ]);
  });
});
