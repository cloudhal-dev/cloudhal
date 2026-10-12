/**
 * Navigation menus (RFC-0003): tree validation, operations, the approval-prompt delta and render-time
 * resolution. Pure and Worker-safe (no storage, no Node APIs), shared by the store, MCP, the renderer
 * and later the REST API and Studio. Every rule here is a data invariant of RFC-0003 §3; the store
 * runs `validateMenuTree` on every write and on `sync` import.
 */
import type { Menu, MenuItem, Site } from "@cloudhal/core-contracts";
import { InvariantError } from "./errors.ts";
import { ID_PREFIX, newId } from "./ids.ts";

export const MENU_LIMITS = { maxDepth: 6, perLevel: 100, total: 500, labelLength: 100 } as const;

/** Default `maxDepth` per well-known key (RFC-0003 answer 11); other keys get 3. */
export const MENU_DEFAULT_DEPTH: Readonly<Record<string, number>> = {
  primary: 3,
  footer: 2,
  sidebar: 6,
};

/** At most this many operations per `applyMenuOps` call (§6.2). */
export const MENU_MAX_OPS = 50;

export function defaultMaxDepth(key: string): number {
  return MENU_DEFAULT_DEPTH[key] ?? 3;
}

/** A new item id (`item_…`), for editors that build items before saving (Studio). */
export function newMenuItemId(): string {
  return newId(ID_PREFIX.menuItem);
}

/** A node an item links to by id. */
export interface TargetRef {
  readonly kind: "page" | "contentEntry" | "term";
  readonly id: string;
}

export type MenuItemKind = MenuItem["kind"];

/** What an item links to, as operations name it. Node targets carry an id in `ref`. */
export type TargetInput =
  | { readonly kind: "page" | "contentEntry" | "term"; readonly ref: string }
  | { readonly kind: "collection"; readonly collection: string }
  | { readonly kind: "url"; readonly href: string };

export interface ItemInput {
  /** Keep an item's identity (whole-tree writes); absent: a new id. */
  readonly id?: string;
  readonly target: TargetInput | { readonly kind: "group" };
  readonly labels?: Readonly<Record<string, string>>;
  readonly newTab?: boolean;
  readonly children?: readonly ItemInput[];
}

export type MenuOp =
  | {
      readonly op: "add";
      readonly item: ItemInput;
      /** Parent item id; null or absent: top level. */
      readonly parent?: string | null;
      /** 0-based position among the siblings; absent: append. */
      readonly index?: number;
    }
  | { readonly op: "remove"; readonly itemId: string }
  | {
      readonly op: "move";
      readonly itemId: string;
      readonly parent?: string | null;
      readonly index?: number;
    }
  | {
      readonly op: "update";
      readonly itemId: string;
      /** `null` deletes a locale's label. */
      readonly labels?: Readonly<Record<string, string | null>>;
      readonly target?: TargetInput;
      /** URL items only; `null` clears it. */
      readonly newTab?: boolean | null;
    };

const ITEM_ID = /^item_[A-Za-z0-9]{6,32}$/;
const NODE_ID = /^[a-z]+_[A-Za-z0-9]{6,32}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
// RFC-0003 §2.1 (the schema's `href` and label patterns, kept in sync by the invalid fixtures).
const HREF =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the contract forbids control characters
  /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s\\\x00-\x1F\x7F]*)?$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: the contract forbids control characters
const LABEL = /^[^\s\x00-\x1F\x7F](?:[^\x00-\x1F\x7F]*[^\s\x00-\x1F\x7F])?$/;

// ───────────────────────────── walking ─────────────────────────────

/** Depth-first, pre-order; top-level items have depth 1. */
export function walkMenu(
  items: readonly MenuItem[],
  visit: (item: MenuItem, depth: number, parent?: MenuItem) => void,
): void {
  const go = (list: readonly MenuItem[], depth: number, parent?: MenuItem) => {
    for (const item of list) {
      visit(item, depth, parent);
      if (item.children) go(item.children, depth + 1, item);
    }
  };
  go(items, 1);
}

/** Items in the menu (every level). */
export function countMenuItems(items: readonly MenuItem[]): number {
  let n = 0;
  walkMenu(items, () => n++);
  return n;
}

/** Deepest level in use (0 for an empty menu). */
export function menuDepth(items: readonly MenuItem[]): number {
  let max = 0;
  walkMenu(items, (_i, d) => {
    if (d > max) max = d;
  });
  return max;
}

/** The node an item links to, if it links to a node. */
export function itemTarget(item: MenuItem): TargetRef | undefined {
  switch (item.kind) {
    case "page":
      return { kind: "page", id: item.pageId };
    case "contentEntry":
      return { kind: "contentEntry", id: item.entryId };
    case "term":
      return { kind: "term", id: item.termId };
    default:
      return undefined;
  }
}

/** Every node the menu links to, deduplicated, in tree order. */
export function menuTargets(menu: Pick<Menu, "items">): TargetRef[] {
  const out = new Map<string, TargetRef>();
  walkMenu(menu.items, (item) => {
    const t = itemTarget(item);
    if (t) out.set(`${t.kind}:${t.id}`, t);
  });
  return [...out.values()];
}

/** `kind:id` keys of the targets `after` links to that `before` did not (invariant 9). */
export function addedTargets(before: Pick<Menu, "items"> | undefined, after: Pick<Menu, "items">) {
  const had = new Set((before ? menuTargets(before) : []).map((t) => `${t.kind}:${t.id}`));
  return menuTargets(after).filter((t) => !had.has(`${t.kind}:${t.id}`));
}

/** Items by id with their parent id (undefined: top level) and sibling index. */
export function indexMenu(
  items: readonly MenuItem[],
): Map<string, { item: MenuItem; parentId: string | undefined; index: number; depth: number }> {
  const out = new Map<
    string,
    { item: MenuItem; parentId: string | undefined; index: number; depth: number }
  >();
  const go = (list: readonly MenuItem[], depth: number, parentId?: string) => {
    list.forEach((item, index) => {
      out.set(item.id, { item, parentId, index, depth });
      if (item.children) go(item.children, depth + 1, item.id);
    });
  };
  go(items, 1);
  return out;
}

// ───────────────────────────── validation ─────────────────────────────

/** Labels trimmed (the store trims before validating, invariant 6). */
export function canonicalMenu<T extends Pick<Menu, "items">>(menu: T): T {
  const fix = (item: MenuItem): MenuItem => {
    const { labels, children, ...rest } = item as MenuItem & {
      labels?: Record<string, string | undefined>;
      children?: MenuItem[];
    };
    const out: Record<string, unknown> = { ...rest };
    if (labels) {
      const trimmed: Record<string, string> = {};
      for (const [k, v] of Object.entries(labels)) if (v !== undefined) trimmed[k] = v.trim();
      out.labels = trimmed;
    }
    if (children) out.children = children.map(fix);
    return out as unknown as MenuItem;
  };
  return { ...menu, items: menu.items.map(fix) };
}

function labelProblem(text: string): string | undefined {
  if (text.length === 0) return "is empty";
  if (text.length > MENU_LIMITS.labelLength)
    return `is longer than ${MENU_LIMITS.labelLength} characters`;
  if (!LABEL.test(text)) return "has control characters or surrounding whitespace";
  return undefined;
}

/** Whether an external link is acceptable (invariant 8): https, ASCII host, no user-info. */
export function isMenuHref(href: string): boolean {
  return href.length <= 2048 && HREF.test(href);
}

const NEEDS_LABELS: ReadonlySet<MenuItemKind> = new Set(["collection", "url", "group"]);

interface ValidateOptions {
  /** Intermediate state of an operation list: skips the canonical-form checks (empty groups). */
  readonly partial?: boolean;
}

/**
 * Invariants 2, 4, 5, 6, 7 and 8 (§3), throwing `InvariantError`: item ids are `item_` ids and
 * unique; depth ≤ `maxDepth` ≤ 6; ≤ 100 items per level and 500 in total; labels are 1–100
 * characters of plain text; `collection`, `url` and `group` items have a default-locale label;
 * label locales that the write adds (relative to `before`) are locales of the site; external links
 * are https with an ASCII host. Pass `before = menu` to accept every label as already present
 * (`sync` import: labels of a dropped locale are kept, invariant 7).
 */
export function validateMenuTree(
  menu: Pick<Menu, "items" | "maxDepth" | "siteId">,
  site: Pick<Site, "id" | "defaultLocale" | "locales">,
  before?: Pick<Menu, "items">,
  options: ValidateOptions = {},
): void {
  if (menu.siteId !== site.id)
    throw new InvariantError("invalid_menu", "menu.siteId must match the site");
  if (!Number.isInteger(menu.maxDepth) || menu.maxDepth < 1 || menu.maxDepth > MENU_LIMITS.maxDepth)
    throw new InvariantError(
      "too_deep",
      `maxDepth must be between 1 and ${MENU_LIMITS.maxDepth} (got ${menu.maxDepth})`,
      { maxDepth: MENU_LIMITS.maxDepth },
    );
  const old = before ? indexMenu(before.items) : new Map();
  const siteLocales = new Set([site.defaultLocale, ...site.locales]);
  const ids = new Set<string>();
  let total = 0;
  const check = (list: readonly MenuItem[], depth: number) => {
    if (list.length > MENU_LIMITS.perLevel)
      throw new InvariantError(
        "too_large",
        `a menu level holds at most ${MENU_LIMITS.perLevel} items (got ${list.length})`,
        { perLevel: MENU_LIMITS.perLevel },
      );
    for (const item of list) {
      const what = `menu item ${item.id}`;
      if (typeof item.id !== "string" || !ITEM_ID.test(item.id))
        throw new InvariantError("invalid_menu", `${what}: item ids look like item_01HZX8K3Q9`, {
          itemId: item.id,
        });
      if (ids.has(item.id))
        throw new InvariantError("invalid_menu", `${what} appears twice; item ids are unique`, {
          itemId: item.id,
        });
      ids.add(item.id);
      if (++total > MENU_LIMITS.total)
        throw new InvariantError(
          "too_large",
          `a menu holds at most ${MENU_LIMITS.total} items in total`,
          { total: MENU_LIMITS.total },
        );
      if (depth > menu.maxDepth)
        throw new InvariantError(
          "too_deep",
          `${what} sits at level ${depth}, deeper than this menu's maxDepth ${menu.maxDepth}`,
          { itemId: item.id, depth, maxDepth: menu.maxDepth },
        );
      const target = itemTarget(item);
      if (target && !NODE_ID.test(target.id))
        throw new InvariantError("invalid_menu", `${what}: ${target.id} is not a node id`, {
          itemId: item.id,
        });
      if (item.kind === "collection" && !SLUG.test(item.collection))
        throw new InvariantError("invalid_menu", `${what}: "${item.collection}" is not a slug`, {
          itemId: item.id,
        });
      if (item.kind === "url" && !isMenuHref(item.href))
        throw new InvariantError(
          "invalid_menu",
          `${what}: external links must be https:// with an ASCII host (punycode for international names), no user-info, whitespace or backslashes, at most 2,048 characters; link pages, articles and terms by id instead of a site path`,
          { itemId: item.id },
        );
      const labels = (item.labels ?? undefined) as Record<string, string | undefined> | undefined;
      if (labels) {
        const entries = Object.entries(labels).filter(([, v]) => v !== undefined) as [
          string,
          string,
        ][];
        if (entries.length === 0)
          throw new InvariantError(
            "invalid_label",
            `${what}: omit labels rather than send an empty map`,
            {
              itemId: item.id,
            },
          );
        const was = old.get(item.id)?.item.labels as Record<string, string> | undefined;
        for (const [locale, text] of entries) {
          if (!LOCALE.test(locale))
            throw new InvariantError("invalid_label", `${what}: "${locale}" is not a locale`, {
              itemId: item.id,
              locale,
            });
          const problem = labelProblem(text);
          if (problem)
            throw new InvariantError("invalid_label", `${what}: the ${locale} label ${problem}`, {
              itemId: item.id,
              locale,
            });
          if (!siteLocales.has(locale) && was?.[locale] === undefined)
            throw new InvariantError(
              "invalid_label",
              `${what}: ${locale} is not a locale of this site (${[...siteLocales].join(", ")})`,
              { itemId: item.id, locale },
            );
        }
      }
      if (NEEDS_LABELS.has(item.kind) && !labels?.[site.defaultLocale])
        throw new InvariantError(
          "invalid_label",
          `${what}: ${item.kind} items need a label in the site's default locale (${site.defaultLocale}); they have no title to fall back to`,
          { itemId: item.id, locale: site.defaultLocale },
        );
      if (
        item.kind !== "url" &&
        "newTab" in item &&
        (item as { newTab?: unknown }).newTab !== undefined
      )
        throw new InvariantError("invalid_menu", `${what}: only external links open in a new tab`, {
          itemId: item.id,
        });
      const children = item.children as MenuItem[] | undefined;
      if (!options.partial) {
        if (children && children.length === 0)
          throw new InvariantError("invalid_menu", `${what}: omit children rather than send []`, {
            itemId: item.id,
          });
        if (item.kind === "group" && !children?.length)
          throw new InvariantError("invalid_menu", `${what}: a group needs at least one item`, {
            itemId: item.id,
          });
      }
      if (children) check(children, depth + 1);
    }
  };
  check(menu.items, 1);
}

// ───────────────────────────── operations ─────────────────────────────

type Mutable = Record<string, unknown> & { id: string; kind: MenuItemKind; children?: Mutable[] };

function clone(items: readonly MenuItem[]): Mutable[] {
  return JSON.parse(JSON.stringify(items)) as Mutable[];
}

/** Drops empty `children` and `labels` (canonical form, invariant 6). */
function tidy(items: Mutable[]): MenuItem[] {
  for (const item of items) {
    if (item.children) {
      if (item.children.length === 0) delete item.children;
      else tidy(item.children);
    }
    const labels = item.labels as Record<string, unknown> | undefined;
    if (labels && Object.keys(labels).length === 0) delete item.labels;
  }
  return items as unknown as MenuItem[];
}

function setTarget(item: Mutable, target: TargetInput | { kind: "group" }): void {
  for (const k of ["pageId", "entryId", "termId", "collection", "href"]) delete item[k];
  item.kind = target.kind;
  switch (target.kind) {
    case "page":
      item.pageId = target.ref;
      break;
    case "contentEntry":
      item.entryId = target.ref;
      break;
    case "term":
      item.termId = target.ref;
      break;
    case "collection":
      item.collection = target.collection;
      break;
    case "url":
      item.href = target.href;
      break;
  }
  if (target.kind !== "url") delete item.newTab;
}

/** An item (and its children) from operation input; new ids from `newId` unless the input keeps one. */
export function buildMenuItem(input: ItemInput, newId: () => string): MenuItem {
  const item: Mutable = { id: input.id ?? newId(), kind: input.target.kind };
  setTarget(item, input.target);
  if (input.newTab !== undefined) {
    if (input.target.kind !== "url")
      throw new InvariantError("invalid_menu", "only external links open in a new tab");
    item.newTab = input.newTab;
  }
  if (input.labels && Object.keys(input.labels).length > 0) item.labels = { ...input.labels };
  if (input.children && input.children.length > 0)
    item.children = input.children.map((c) => buildMenuItem(c, newId) as unknown as Mutable);
  return item as unknown as MenuItem;
}

/** Whole-tree input → items (`set_menu`, `PUT`). */
export function buildMenuItems(inputs: readonly ItemInput[], newId: () => string): MenuItem[] {
  return inputs.map((i) => buildMenuItem(i, newId));
}

interface Located {
  item: Mutable;
  list: Mutable[];
  index: number;
}

function locate(items: Mutable[], id: string): Located | undefined {
  for (let index = 0; index < items.length; index++) {
    const item = items[index] as Mutable;
    if (item.id === id) return { item, list: items, index };
    if (item.children) {
      const found = locate(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function contains(item: Mutable, id: string): boolean {
  return (item.children ?? []).some((c) => c.id === id || contains(c, id));
}

/**
 * Applies operations in order to a copy of the menu (§6.2). All or nothing: the first failing
 * operation throws an `InvariantError` whose `details.opIndex` names it — an unknown item, a move
 * into its own subtree, or (with `site`) a tree that breaks depth, size or label rules at that step.
 * Item ids are stable: no operation re-ids an item.
 */
export function applyMenuOps<T extends Pick<Menu, "items" | "maxDepth" | "siteId">>(
  menu: T,
  ops: readonly MenuOp[],
  newId: () => string,
  site?: Pick<Site, "id" | "defaultLocale" | "locales">,
): T {
  if (ops.length > MENU_MAX_OPS)
    throw new InvariantError(
      "too_large",
      `at most ${MENU_MAX_OPS} operations per call (got ${ops.length})`,
    );
  const items = clone(menu.items);
  const siblings = (parent: string | null | undefined, opIndex: number): Mutable[] => {
    if (parent === null || parent === undefined) return items;
    const p = locate(items, parent);
    if (!p)
      throw new InvariantError("unknown_item", `operation ${opIndex}: no item ${parent}`, {
        opIndex,
        itemId: parent,
      });
    p.item.children ??= [];
    return p.item.children;
  };
  const insert = (list: Mutable[], item: Mutable, index: number | undefined) => {
    const at =
      index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.trunc(index)));
    list.splice(at, 0, item);
  };
  ops.forEach((op, opIndex) => {
    try {
      switch (op.op) {
        case "add": {
          const item = buildMenuItem(op.item, newId) as unknown as Mutable;
          insert(siblings(op.parent, opIndex), item, op.index);
          break;
        }
        case "remove": {
          const at = locate(items, op.itemId);
          if (!at)
            throw new InvariantError("unknown_item", `operation ${opIndex}: no item ${op.itemId}`, {
              itemId: op.itemId,
            });
          at.list.splice(at.index, 1);
          break;
        }
        case "move": {
          const at = locate(items, op.itemId);
          if (!at)
            throw new InvariantError("unknown_item", `operation ${opIndex}: no item ${op.itemId}`, {
              itemId: op.itemId,
            });
          if (op.parent && (op.parent === op.itemId || contains(at.item, op.parent)))
            throw new InvariantError(
              "cycle",
              `operation ${opIndex}: cannot move ${op.itemId} under itself or one of its own items`,
              { itemId: op.itemId },
            );
          at.list.splice(at.index, 1);
          insert(siblings(op.parent, opIndex), at.item, op.index);
          break;
        }
        case "update": {
          const at = locate(items, op.itemId);
          if (!at)
            throw new InvariantError("unknown_item", `operation ${opIndex}: no item ${op.itemId}`, {
              itemId: op.itemId,
            });
          const item = at.item;
          if (op.target) setTarget(item, op.target);
          if (op.labels) {
            const labels = { ...((item.labels as Record<string, string> | undefined) ?? {}) };
            for (const [locale, text] of Object.entries(op.labels))
              if (text === null) delete labels[locale];
              else labels[locale] = text;
            if (Object.keys(labels).length > 0) item.labels = labels;
            else delete item.labels;
          }
          if (op.newTab !== undefined) {
            if (op.newTab === null) delete item.newTab;
            else if (item.kind !== "url")
              throw new InvariantError(
                "invalid_menu",
                `operation ${opIndex}: only external links open in a new tab`,
                { itemId: op.itemId },
              );
            else item.newTab = op.newTab;
          }
          break;
        }
        default:
          throw new InvariantError("invalid_menu", `operation ${opIndex}: unknown operation`);
      }
      if (site)
        validateMenuTree({ ...menu, items: items as unknown as MenuItem[] }, site, menu, {
          partial: true,
        });
    } catch (e) {
      if (e instanceof InvariantError && e.details.opIndex === undefined)
        throw new InvariantError(
          e.code,
          e.message.startsWith("operation ") ? e.message : `operation ${opIndex}: ${e.message}`,
          { ...e.details, opIndex },
        );
      throw e;
    }
  });
  return { ...menu, items: tidy(items) };
}

// ───────────────────────────── delta (§6.3) ─────────────────────────────

export interface MenuDelta {
  /** Items in the old and new tree. */
  readonly before: number;
  readonly after: number;
  /** New items whose parent is not new, with the number of new items below them. */
  readonly added: ReadonlyArray<{
    id: string;
    parentId?: string;
    index: number;
    descendants: number;
  }>;
  /** Removed items whose parent was not removed, with the number of items removed below them. */
  readonly removed: ReadonlyArray<{ id: string; parentId?: string; descendants: number }>;
  /**
   * Items that changed parent (`reparented`), or changed position among the same siblings outside
   * the longest common subsequence (so one insertion does not move its neighbours).
   */
  readonly moved: ReadonlyArray<{
    id: string;
    reparented: boolean;
    from: { parentId?: string; index: number };
    to: { parentId?: string; index: number };
  }>;
  /** Label, target or new-tab edits of items in both trees. */
  readonly changed: ReadonlyArray<{
    id: string;
    labels?: ReadonlyArray<{ locale: string; from?: string; to?: string }>;
    target?: { from: MenuItem; to: MenuItem };
    newTab?: { from: boolean; to: boolean };
  }>;
  /** added + removed + moved + changed. */
  readonly changes: number;
}

/** Longest common subsequence of two id lists (the ids kept in place). */
function lcs(a: readonly string[], b: readonly string[]): Set<string> {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      (dp[i] as number[])[j] =
        a[i] === b[j]
          ? ((dp[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((dp[i + 1] as number[])[j] as number, (dp[i] as number[])[j + 1] as number);
  const out = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.add(a[i] as string);
      i++;
      j++;
    } else if (((dp[i + 1] as number[])[j] as number) >= ((dp[i] as number[])[j + 1] as number))
      i++;
    else j++;
  }
  return out;
}

const targetKey = (item: MenuItem): string => {
  switch (item.kind) {
    case "page":
      return `page:${item.pageId}`;
    case "contentEntry":
      return `contentEntry:${item.entryId}`;
    case "term":
      return `term:${item.termId}`;
    case "collection":
      return `collection:${item.collection}`;
    case "url":
      return `url:${item.href}`;
    case "group":
      return "group";
  }
};

/** What changed between two versions of a menu, items matched by id (§6.3). */
export function menuDelta(
  before: Pick<Menu, "items"> | undefined,
  after: Pick<Menu, "items">,
): MenuDelta {
  const old = indexMenu(before?.items ?? []);
  const now = indexMenu(after.items);
  const descendants = (item: MenuItem) => countMenuItems(item.children ?? []);
  const added: MenuDelta["added"][number][] = [];
  const removed: MenuDelta["removed"][number][] = [];
  const moved: MenuDelta["moved"][number][] = [];
  const changed: MenuDelta["changed"][number][] = [];
  for (const [id, at] of now) {
    if (old.has(id)) continue;
    if (at.parentId && !old.has(at.parentId)) continue;
    added.push({
      id,
      ...(at.parentId ? { parentId: at.parentId } : {}),
      index: at.index,
      descendants: [...now.values()].filter(
        (x) => isBelow(now, x.item.id, id) && !old.has(x.item.id),
      ).length,
    });
  }
  for (const [id, at] of old) {
    if (now.has(id)) continue;
    if (at.parentId && !now.has(at.parentId)) continue;
    removed.push({
      id,
      ...(at.parentId ? { parentId: at.parentId } : {}),
      descendants: descendants(at.item),
    });
  }
  // Moves: a new parent, or a new place among the same siblings outside the LCS.
  const siblingsOf = (index: typeof now, parentId: string | undefined) =>
    [...index.values()]
      .filter((x) => x.parentId === parentId)
      .sort((a, b) => a.index - b.index)
      .map((x) => x.item.id);
  const kept = new Map<string | undefined, Set<string>>();
  const stay = (parentId: string | undefined) => {
    let set = kept.get(parentId);
    if (!set) {
      const common = (ids: string[]) =>
        ids.filter(
          (id) => old.get(id)?.parentId === parentId && now.get(id)?.parentId === parentId,
        );
      set = lcs(common(siblingsOf(old, parentId)), common(siblingsOf(now, parentId)));
      kept.set(parentId, set);
    }
    return set;
  };
  for (const [id, at] of now) {
    const was = old.get(id);
    if (!was) continue;
    const from = { ...(was.parentId ? { parentId: was.parentId } : {}), index: was.index };
    const to = { ...(at.parentId ? { parentId: at.parentId } : {}), index: at.index };
    if (was.parentId !== at.parentId) moved.push({ id, reparented: true, from, to });
    else if (!stay(at.parentId).has(id)) moved.push({ id, reparented: false, from, to });
    const a = was.item;
    const b = at.item;
    const la = (a.labels ?? {}) as Record<string, string | undefined>;
    const lb = (b.labels ?? {}) as Record<string, string | undefined>;
    const labels = [...new Set([...Object.keys(la), ...Object.keys(lb)])]
      .sort()
      .filter((l) => la[l] !== lb[l])
      .map((locale) => ({
        locale,
        ...(la[locale] !== undefined ? { from: la[locale] } : {}),
        ...(lb[locale] !== undefined ? { to: lb[locale] } : {}),
      }));
    const tabA = a.kind === "url" && a.newTab === true;
    const tabB = b.kind === "url" && b.newTab === true;
    const target = targetKey(a) !== targetKey(b);
    if (labels.length > 0 || target || (tabA !== tabB && !target))
      changed.push({
        id,
        ...(labels.length > 0 ? { labels } : {}),
        ...(target ? { target: { from: a, to: b } } : {}),
        ...(tabA !== tabB && !target ? { newTab: { from: tabA, to: tabB } } : {}),
      });
  }
  return {
    before: old.size,
    after: now.size,
    added,
    removed,
    moved,
    changed,
    changes: added.length + removed.length + moved.length + changed.length,
  };
}

function isBelow(index: ReturnType<typeof indexMenu>, id: string, ancestor: string): boolean {
  let cursor = index.get(id)?.parentId;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = index.get(cursor)?.parentId;
  }
  return false;
}

// ───────────────────────────── resolution (§7.1) ─────────────────────────────

/** Why an item is not rendered (§7.1 table). `parent-hidden`: an ancestor is hidden (answer 3). */
export type MenuHiddenReason =
  | "missing"
  | "unpublished"
  | "other-locale"
  | "not-served"
  | "retired"
  | "no-index"
  | "empty-group"
  | "parent-hidden";

export interface MenuLookupNode {
  readonly path: string;
  readonly title: string;
  readonly locale: string;
  /** Published (the live dev source: not archived). */
  readonly served: boolean;
}

/** What `resolveMenu` needs to know about targets; built by the renderer, MCP or the API. */
export interface MenuLookup {
  /** The site's default locale (label fallback, invariant 7). */
  readonly defaultLocale: string;
  page(id: string): MenuLookupNode | undefined;
  entry(id: string): MenuLookupNode | undefined;
  /** A term's archive in `locale`: its path (when archives are on), name and status (`archiveState`). */
  term(
    id: string,
    locale: string,
  ): { readonly path?: string; readonly name: string; readonly state: 200 | 404 | 410 } | undefined;
  /** Path of the collection's index in `locale`, or undefined when no index is served. */
  collectionIndex(collection: string, locale: string): string | undefined;
}

export type LabelSource = "item" | "default-locale" | "target" | "none";

export interface ResolvedMenuItem {
  readonly id: string;
  readonly kind: MenuItemKind;
  readonly state: "shown" | "hidden";
  readonly reason?: MenuHiddenReason;
  /** The label shown (empty when nothing is known: a missing target without labels). */
  readonly label: string;
  readonly labelSource: LabelSource;
  readonly href?: string;
  readonly external: boolean;
  readonly newTab: boolean;
  readonly target?: TargetRef | { readonly kind: "collection"; readonly collection: string };
  readonly children: ResolvedMenuItem[];
}

export interface ResolvedMenu {
  readonly key: string;
  readonly menuId: string;
  readonly locale: string;
  readonly items: ResolvedMenuItem[];
  readonly shown: number;
  readonly hidden: number;
}

/**
 * Resolves every item for one locale (§7.1): its state, label (item label in the locale → the
 * default locale's → the target's title) and href. A hidden item hides its subtree (answer 3); a
 * group without a shown child is hidden. Pure: `lookup` answers from whatever state is rendered.
 */
export function resolveMenu(
  menu: Pick<Menu, "id" | "key" | "items">,
  lookup: MenuLookup,
  locale: string,
): ResolvedMenu {
  let shown = 0;
  let hidden = 0;
  const label = (
    item: MenuItem,
    fallback: string | undefined,
  ): { label: string; labelSource: LabelSource } => {
    const labels = (item.labels ?? {}) as Record<string, string | undefined>;
    const own = labels[locale];
    if (own) return { label: own, labelSource: "item" };
    const def = labels[lookup.defaultLocale];
    if (def) return { label: def, labelSource: "default-locale" };
    if (fallback) return { label: fallback, labelSource: "target" };
    return { label: "", labelSource: "none" };
  };
  const one = (item: MenuItem, parentHidden: boolean): ResolvedMenuItem => {
    let reason: MenuHiddenReason | undefined;
    let href: string | undefined;
    let title: string | undefined;
    let target: ResolvedMenuItem["target"];
    switch (item.kind) {
      case "page":
      case "contentEntry": {
        const id = item.kind === "page" ? item.pageId : item.entryId;
        target = { kind: item.kind, id };
        const node = item.kind === "page" ? lookup.page(id) : lookup.entry(id);
        if (!node) reason = "missing";
        else {
          title = node.title;
          if (!node.served) reason = "unpublished";
          else if (node.locale !== locale) reason = "other-locale";
          else href = node.path;
        }
        break;
      }
      case "term": {
        target = { kind: "term", id: item.termId };
        const term = lookup.term(item.termId, locale);
        if (!term) reason = "missing";
        else {
          title = term.name;
          if (term.state === 410) reason = "retired";
          else if (term.state !== 200 || !term.path) reason = "not-served";
          else href = term.path;
        }
        break;
      }
      case "collection": {
        target = { kind: "collection", collection: item.collection };
        href = lookup.collectionIndex(item.collection, locale);
        if (href === undefined) reason = "no-index";
        break;
      }
      case "url":
        href = item.href;
        break;
      case "group":
        break;
    }
    const childHidden = parentHidden || reason !== undefined;
    const children = (item.children ?? []).map((c) => one(c, childHidden));
    if (!reason && item.kind === "group" && !children.some((c) => c.state === "shown"))
      reason = "empty-group";
    if (!reason && parentHidden) reason = "parent-hidden";
    if (reason) hidden++;
    else shown++;
    return {
      id: item.id,
      kind: item.kind,
      state: reason ? "hidden" : "shown",
      ...(reason ? { reason } : {}),
      ...label(item, title),
      ...(href !== undefined && !reason ? { href } : {}),
      external: item.kind === "url",
      newTab: item.kind === "url" && item.newTab === true,
      ...(target ? { target } : {}),
      children,
    };
  };
  const items = menu.items.map((i) => one(i, false));
  return { key: menu.key, menuId: menu.id, locale, items, shown, hidden };
}

/** Item ids (and their subtree sizes) whose state differs between two resolutions of menus. */
export function menuStateChanges(
  before: ResolvedMenu | undefined,
  after: ResolvedMenu,
): Array<{ item: ResolvedMenuItem; was: ResolvedMenuItem }> {
  if (!before) return [];
  const flat = (items: readonly ResolvedMenuItem[], out = new Map<string, ResolvedMenuItem>()) => {
    for (const i of items) {
      out.set(i.id, i);
      flat(i.children, out);
    }
    return out;
  };
  const was = flat(before.items);
  const out: Array<{ item: ResolvedMenuItem; was: ResolvedMenuItem }> = [];
  for (const item of flat(after.items).values()) {
    const w = was.get(item.id);
    if (!w || w.state === item.state) continue;
    // A subtree hidden with its parent is reported once, at the parent.
    if (item.reason === "parent-hidden" || w.reason === "parent-hidden") continue;
    out.push({ item, was: w });
  }
  return out;
}
