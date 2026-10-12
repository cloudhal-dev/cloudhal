import type { Menu, MenuItem } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { translate } from "../src/i18n/index.tsx";
import {
  choiceOf,
  choiceValue,
  collectionsOf,
  deltaLines,
  draftProblem,
  formOf,
  hrefError,
  insertItem,
  itemFromForm,
  labelError,
  type MenuDraft,
  menuUsage,
  moveItem,
  nearLimit,
  orderedKeys,
  removeItem,
  replaceItem,
  saveBody,
  shownLabel,
  summarizeTarget,
  targetOptions,
  validateItemForm,
  validateMenuKey,
} from "../src/lib/menus.ts";
import { DATA } from "./menus-fixtures.ts";
import { SITE } from "./taxonomy-fixtures.ts";

const about: MenuItem = { id: "item_about00001", kind: "page", pageId: "page_about0001" };
const status: MenuItem = {
  id: "item_status0001",
  kind: "url",
  href: "https://status.example.com/now",
  newTab: true,
  labels: { en: "Status" },
};
const help: MenuItem = {
  id: "item_help000001",
  kind: "group",
  labels: { en: "Help" },
  children: [status],
};

const menu = (items: MenuItem[], maxDepth = 3): Menu => ({
  schemaVersion: 1,
  id: "menu_primary001",
  siteId: "site_1",
  key: "primary",
  maxDepth,
  items,
  rev: 4,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
});

describe("menu keys", () => {
  it("orders the header, the footer, the sidebar, then custom keys", () => {
    expect(orderedKeys(["social", "footer", "primary", "aside", "sidebar"])).toEqual([
      "primary",
      "footer",
      "sidebar",
      "aside",
      "social",
    ]);
  });
  it("validates a new key: a free slug of at most 128 characters", () => {
    expect(validateMenuKey("", [])).toBe("required");
    expect(validateMenuKey("Social Links", [])).toBe("invalid");
    expect(validateMenuKey("social", ["social"])).toBe("taken");
    expect(validateMenuKey("a".repeat(129), [])).toBe("tooLong");
    expect(validateMenuKey("social-links", ["primary"])).toBeUndefined();
  });
});

describe("draft operations (applyMenuOps semantics)", () => {
  const draft: MenuDraft = { maxDepth: 3, items: [about, help] };
  it("moves, inserts, replaces and removes, keeping ids and canonical children", () => {
    const moved = moveItem(draft, { itemId: "item_status0001", parentId: null, index: 0 });
    expect(moved.items.map((i) => i.id)).toEqual([
      "item_status0001",
      "item_about00001",
      "item_help000001",
    ]);
    // The emptied group drops `children` (canonical form); saving then flags it.
    expect(moved.items[2]?.children).toBeUndefined();
    expect(draftProblem(moved, SITE)).toEqual({ code: "emptyGroup", itemId: "item_help000001" });

    const inserted = insertItem(
      draft,
      { id: "item_new0000001", kind: "page", pageId: "page_draft0001" },
      "item_help000001",
      0,
    );
    expect(inserted.items[1]?.children?.map((i) => i.id)).toEqual([
      "item_new0000001",
      "item_status0001",
    ]);

    const renamed = replaceItem(draft, "item_help000001", {
      id: "item_help000001",
      kind: "group",
      labels: { en: "Support" },
    } as unknown as MenuItem);
    expect(renamed.items[1]).toMatchObject({ labels: { en: "Support" }, children: [status] });

    expect(removeItem(draft, "item_help000001").items).toEqual([about]);
  });

  it("saves the whole tree with the menu's rev and depth", () => {
    expect(saveBody(menu([about]), { maxDepth: 2, items: [about, status] })).toEqual({
      rev: 4,
      maxDepth: 2,
      items: [about, status],
    });
  });

  it("finds what the store would refuse before anyone confirms", () => {
    expect(draftProblem({ maxDepth: 1, items: [about, help] }, SITE)).toEqual({
      code: "depth",
      itemId: "item_status0001",
      max: 1,
    });
    expect(
      draftProblem(
        {
          maxDepth: 3,
          items: [{ id: "item_url0000001", kind: "url", href: "https://x.example" } as MenuItem],
        },
        SITE,
      ),
    ).toEqual({ code: "label", itemId: "item_url0000001" });
    const many = Array.from({ length: 101 }, (_, i) => ({
      id: `item_many${String(i).padStart(6, "0")}`,
      kind: "page" as const,
      pageId: "page_about0001",
    }));
    expect(draftProblem({ maxDepth: 3, items: many }, SITE)).toEqual({
      code: "perLevel",
      max: 100,
    });
    expect(draftProblem({ maxDepth: 3, items: [about, help] }, SITE)).toBeUndefined();
  });

  it("counts items, levels and the fullest level; warns from 80 %", () => {
    const usage = menuUsage([about, help]);
    expect(usage).toMatchObject({ total: 3, depth: 2, fullest: { parentId: null, count: 2 } });
    expect(nearLimit(399, 500)).toBe(false);
    expect(nearLimit(400, 500)).toBe(true);
    expect(nearLimit(80, 100)).toBe(true);
  });
});

describe("item form", () => {
  it("round-trips every kind; empty labels are dropped and kept ones trimmed", () => {
    for (const item of [about, status, help]) {
      const form = formOf(item);
      const back = itemFromForm(form, item.id);
      expect(back).toMatchObject({ id: item.id, kind: item.kind });
    }
    const form = { ...formOf(about), labels: { en: "  About us ", tr: "" } };
    expect(itemFromForm(form, about.id)).toEqual({ ...about, labels: { en: "About us" } });
    expect(itemFromForm(formOf(about), about.id)).toEqual(about);
  });

  it("requires a target, an https address and a default-locale label where there is no title", () => {
    expect(
      validateItemForm({ target: undefined, href: "", newTab: false, labels: {} }, SITE),
    ).toEqual({
      target: "required",
      labels: {},
    });
    const url = {
      target: { kind: "url" as const },
      href: "http://x.example",
      newTab: false,
      labels: {},
    };
    expect(validateItemForm(url, SITE)).toEqual({ href: "insecure", labels: { en: "required" } });
    expect(hrefError("https://bank.example@evil.example")).toBe("invalid");
    expect(hrefError("javascript:alert(1)")).toBe("invalid");
    expect(hrefError("https://status.example.com/a?b#c")).toBeUndefined();
    expect(labelError("a".repeat(101))).toBe("tooLong");
    expect(labelError("About\n+ Approved")).toBe("invalid");
    expect(labelError("   ")).toBeUndefined();
    // Page items fall back to the page title: no label needed.
    expect(validateItemForm(formOf(about), SITE)).toEqual({ labels: {} });
  });
});

describe("targets", () => {
  it("offers pages, articles, each taxonomy's terms as a tree, collections, then link and group", () => {
    const options = targetOptions(DATA);
    expect(options.map((o) => o.value)).toEqual([
      "page:page_home00001",
      "page:page_about0001",
      "page:page_draft0001",
      "contentEntry:entry_hello001",
      "term:term_news0001",
      "term:term_world001",
      "collection:posts",
      "url",
      "group",
    ]);
    expect(options.find((o) => o.value === "page:page_draft0001")).toMatchObject({
      status: "draft",
    });
    expect(options.find((o) => o.value === "term:term_world001")).toMatchObject({
      depth: 1,
      detail: "/category/world",
      taxonomy: "category",
    });
    expect(collectionsOf(DATA)).toEqual(["posts"]);
    expect(choiceOf(choiceValue({ kind: "term", id: "term_x0000001" }) as string)).toEqual({
      kind: "term",
      id: "term_x0000001",
    });
    expect(choiceOf("url")).toEqual({ kind: "url" });
  });

  it("names targets and falls back to their title; deleted targets say so", () => {
    expect(summarizeTarget(about, DATA)).toEqual({ kind: "page", where: "/about", title: "About" });
    expect(summarizeTarget(status, DATA)).toEqual({
      kind: "url",
      where: "status.example.com",
      newTab: true,
    });
    expect(summarizeTarget({ ...about, pageId: "page_gone00001" }, DATA)).toEqual({
      kind: "page",
      missing: true,
    });
    expect(shownLabel(about, DATA)).toEqual({ text: "About", fallback: true });
    expect(shownLabel({ ...about, labels: { en: "Who we are" } }, DATA)).toEqual({
      text: "Who we are",
      fallback: false,
    });
  });
});

describe("delta lines (RFC-0003 §6.3)", () => {
  it("lists additions, removals, moves and edits in order, and hidden additions", () => {
    const before = menu([about, help]);
    const pricing: MenuItem = { id: "item_price00001", kind: "page", pageId: "page_draft0001" };
    const after: MenuDraft = {
      maxDepth: 3,
      items: [
        { ...help, labels: { en: "Support" }, children: [status, pricing] } as MenuItem,
        { ...about, labels: { en: "About us" } },
      ],
    };
    const resolved = {
      key: "primary",
      menuId: before.id,
      locale: "en",
      shown: 3,
      hidden: 1,
      items: [
        {
          id: "item_price00001",
          kind: "page" as const,
          state: "hidden" as const,
          reason: "unpublished" as const,
          label: "Pricing",
          labelSource: "target" as const,
          external: false,
          newTab: false,
          children: [],
        },
      ],
    };
    const { delta, lines } = deltaLines(before, after, DATA, resolved);
    expect(delta.changes).toBe(4);
    expect(lines.map((l) => l.sign)).toEqual(["+", "↕", "~", "~", "!"]);
    const t = (key: Parameters<typeof translate>[1], p?: Record<string, string | number>) =>
      translate("en", key, p);
    expect(lines[0]).toMatchObject({
      label: "Pricing",
      fallback: true,
      parent: "Support",
      position: 2,
    });
    expect(
      t("menus.delta.add", {
        label: "“Pricing” (title)",
        where: "/pricing (page)",
        place: "under “Support”, position 2",
        below: "",
      }),
    ).toBe("“Pricing” (title) → /pricing (page), under “Support”, position 2");
    expect(lines[2]).toMatchObject({ change: "label", locale: "en", to: "Support" });
    expect(lines[4]).toMatchObject({ sign: "!", reason: "unpublished", kind: "page" });
  });
});
