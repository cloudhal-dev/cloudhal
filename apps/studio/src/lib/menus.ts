/**
 * Navigation menus in Studio (RFC-0003 §8): API shapes of `/api/sites/:id/menus`, the editor's
 * draft operations, the item form and its validation, the target picker's options and the
 * save confirmation's delta lines. Tree rules come from `@cloudhal/core-ts/menu` (the store's own
 * functions), so Studio and the server agree on ids, moves, limits and the delta.
 */
import type {
  ContentEntry,
  Menu,
  MenuItem,
  Page,
  Site,
  Snapshot,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import {
  applyMenuOps,
  countMenuItems,
  indexMenu,
  isMenuHref,
  MENU_LIMITS,
  type MenuDelta,
  type MenuHiddenReason,
  menuDelta,
  menuDepth,
  newMenuItemId,
  type ResolvedMenu,
  type ResolvedMenuItem,
  walkMenu,
} from "@cloudhal/core-ts/menu";
import { entryPath } from "@cloudhal/core-ts/permalinks";
import { archivePath, termLabel } from "./taxonomy.ts";

export type { MenuDelta, MenuHiddenReason, ResolvedMenu, ResolvedMenuItem };
export { MENU_LIMITS, menuDelta, newMenuItemId };

// ───────────────────────────── API shapes ─────────────────────────────

/** A shown item as the site renders it (`ActiveNavItem`, `@cloudhal/astro-renderer/navigation`). */
export interface NavItemView {
  id: string;
  kind: MenuItem["kind"];
  label: string;
  href?: string;
  external: boolean;
  newTab: boolean;
  current?: "page" | "true";
  inTrail?: boolean;
  children: NavItemView[];
}

export interface MenuSummary {
  menu: Menu;
  items: number;
  /** Items hidden on the site in the default locale (counted at the hidden subtree's root). */
  hidden: number;
  depth: number;
}

/** `GET /menus`. */
export interface MenusOverview {
  menus: MenuSummary[];
  /** Well-known keys without a menu, with the theme's derived default (today's header). */
  derived: { key: string; items: NavItemView[] }[];
  wellKnown: string[];
  limits: { maxDepth: number; perLevel: number; total: number; labelLength: number; ops: number };
  /** `primary`, `footer`, `sidebar` and `other`. */
  defaultDepth: Record<string, number>;
}

/** One menu of `POST /menus/preview`. */
export interface MenuPreviewResult {
  key: string;
  derived: boolean;
  resolved?: ResolvedMenu;
  navigation: NavItemView[];
  active?: { itemId: string; match: "exact" | "prefix" | "context"; trail: string[] };
}

export interface MenuPreviewResponse {
  locale: string;
  path?: string;
  menus: MenuPreviewResult[];
}

/** Every write answers with the menu, what changed and the one snapshot it took. */
export interface MenuWrite {
  menu: Menu;
  delta: MenuDelta;
  snapshot: Snapshot;
}

/** `POST /menus/from-pages` with `dryRun`. */
export interface FromPagesPreview {
  menu: Menu;
  resolved: ResolvedMenu;
  /** Top-level categories it would add on request. */
  categories: number;
  delta: MenuDelta;
}

/** `GET /menus/references`: where a page, article or term is linked. */
export interface MenuReference {
  menuId: string;
  key: string;
  items: { id: string; label: string; labelSource: string }[];
}

/** `?menus=1` on a snapshot diff: one menu's counts. */
export interface MenuDiffSummary {
  menuId: string;
  key: string;
  change: "added" | "changed" | "removed";
  added: number;
  removed: number;
  moved: number;
  changed: number;
  before: number;
  after: number;
}

// ───────────────────────────── keys and places ─────────────────────────────

/** Tabs: the header, the footer, the docs sidebar, then custom keys alphabetically. */
const PLACE_ORDER = ["primary", "footer", "sidebar"];

export type MenuPlace = "primary" | "footer" | "sidebar";

export function isWellKnown(key: string): key is MenuPlace {
  return PLACE_ORDER.includes(key);
}

export function orderedKeys(keys: Iterable<string>): string[] {
  const rank = (k: string) => {
    const i = PLACE_ORDER.indexOf(k);
    return i < 0 ? PLACE_ORDER.length : i;
  };
  return [...new Set(keys)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const MENU_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type MenuKeyError = "required" | "invalid" | "taken" | "tooLong";

export function validateMenuKey(key: string, taken: readonly string[]): MenuKeyError | undefined {
  if (!key) return "required";
  if (key.length > 128) return "tooLong";
  if (!MENU_KEY_PATTERN.test(key)) return "invalid";
  if (taken.includes(key)) return "taken";
  return undefined;
}

// ───────────────────────────── draft operations ─────────────────────────────

export interface MenuDraft {
  maxDepth: number;
  items: MenuItem[];
}

/** A tree move from `MenuTree` (`applyMenuOps` semantics: out, then in at `index`). */
export function moveItem(
  draft: MenuDraft,
  move: { itemId: string; parentId: string | null; index: number },
): MenuDraft {
  const next = applyMenuOps(
    { siteId: "", maxDepth: draft.maxDepth, items: draft.items },
    [{ op: "move", itemId: move.itemId, parent: move.parentId, index: move.index }],
    newMenuItemId,
  );
  return { ...draft, items: next.items };
}

export function removeItem(draft: MenuDraft, itemId: string): MenuDraft {
  const next = applyMenuOps(
    { siteId: "", maxDepth: draft.maxDepth, items: draft.items },
    [{ op: "remove", itemId }],
    newMenuItemId,
  );
  return { ...draft, items: next.items };
}

/** Inserts `item` under `parentId` (null: top level) at `index` (absent: last). */
export function insertItem(
  draft: MenuDraft,
  item: MenuItem,
  parentId: string | null,
  index?: number,
): MenuDraft {
  const into = (list: MenuItem[]): MenuItem[] => {
    const next = [...list];
    next.splice(index ?? next.length, 0, item);
    return next;
  };
  if (parentId === null) return { ...draft, items: into(draft.items) };
  const walk = (list: MenuItem[]): MenuItem[] =>
    list.map((i) =>
      i.id === parentId
        ? ({ ...i, children: into(i.children ?? []) } as MenuItem)
        : i.children
          ? ({ ...i, children: walk(i.children) } as MenuItem)
          : i,
    );
  return { ...draft, items: walk(draft.items) };
}

/** Replaces one item's own fields (target, labels, new tab), keeping its id and children. */
export function replaceItem(draft: MenuDraft, itemId: string, next: MenuItem): MenuDraft {
  const walk = (list: MenuItem[]): MenuItem[] =>
    list.map((i) => {
      if (i.id === itemId) {
        const children = i.children;
        const { children: _drop, ...own } = next as MenuItem & { children?: MenuItem[] };
        return (children?.length ? { ...own, children } : own) as MenuItem;
      }
      return i.children ? ({ ...i, children: walk(i.children) } as MenuItem) : i;
    });
  return { ...draft, items: walk(draft.items) };
}

export function findItem(items: readonly MenuItem[], id: string): MenuItem | undefined {
  return indexMenu(items).get(id)?.item;
}

/** Depth of an item (1 = top level) and the levels its subtree takes. */
export function itemDepth(items: readonly MenuItem[], id: string): number {
  return indexMenu(items).get(id)?.depth ?? 0;
}

/** The menu as the editor sends it (`PUT /menus/:id`). */
export function saveBody(menu: Pick<Menu, "rev">, draft: MenuDraft) {
  return { rev: menu.rev, maxDepth: draft.maxDepth, items: draft.items };
}

export function sameDraft(a: MenuDraft, b: MenuDraft): boolean {
  return a.maxDepth === b.maxDepth && JSON.stringify(a.items) === JSON.stringify(b.items);
}

// ───────────────────────────── limits ─────────────────────────────

export interface MenuUsage {
  total: number;
  depth: number;
  /** The fullest level: its parent (null: top level) and how many items it holds. */
  fullest: { parentId: string | null; count: number };
  /** Item count per parent id (`""`: top level). */
  perParent: Map<string, number>;
}

export function menuUsage(items: readonly MenuItem[]): MenuUsage {
  const perParent = new Map<string, number>([["", items.length]]);
  walkMenu(items, (item) => {
    if (item.children?.length) perParent.set(item.id, item.children.length);
  });
  let fullest = { parentId: null as string | null, count: items.length };
  for (const [parent, count] of perParent)
    if (count > fullest.count) fullest = { parentId: parent || null, count };
  return { total: countMenuItems(items), depth: menuDepth(items), fullest, perParent };
}

/** Counters turn to warnings from 80 % of a limit. */
export function nearLimit(count: number, limit: number): boolean {
  return count >= Math.floor(limit * 0.8);
}

// ───────────────────────────── item form ─────────────────────────────

export type TargetChoice =
  | { kind: "page"; id: string }
  | { kind: "contentEntry"; id: string }
  | { kind: "term"; id: string }
  | { kind: "collection"; collection: string }
  | { kind: "url" }
  | { kind: "group" };

export interface ItemForm {
  target: TargetChoice | undefined;
  href: string;
  newTab: boolean;
  /** Label per site locale; empty: none (falls back). */
  labels: Record<string, string>;
}

export function emptyForm(): ItemForm {
  return { target: undefined, href: "", newTab: false, labels: {} };
}

export function formOf(item: MenuItem): ItemForm {
  const labels = { ...((item.labels ?? {}) as Record<string, string>) };
  switch (item.kind) {
    case "page":
      return { target: { kind: "page", id: item.pageId }, href: "", newTab: false, labels };
    case "contentEntry":
      return {
        target: { kind: "contentEntry", id: item.entryId },
        href: "",
        newTab: false,
        labels,
      };
    case "term":
      return { target: { kind: "term", id: item.termId }, href: "", newTab: false, labels };
    case "collection":
      return {
        target: { kind: "collection", collection: item.collection },
        href: "",
        newTab: false,
        labels,
      };
    case "url":
      return { target: { kind: "url" }, href: item.href, newTab: item.newTab === true, labels };
    case "group":
      return { target: { kind: "group" }, href: "", newTab: false, labels };
  }
}

/** Items of these kinds have no title to fall back to: a default-locale label is required. */
export function needsLabel(target: TargetChoice | undefined): boolean {
  return target?.kind === "collection" || target?.kind === "url" || target?.kind === "group";
}

/** The stored item for a form (labels trimmed, empty ones dropped). Call after `validateItemForm`. */
export function itemFromForm(form: ItemForm, id: string): MenuItem {
  const labels: Record<string, string> = {};
  for (const [locale, text] of Object.entries(form.labels))
    if (text.trim()) labels[locale] = text.trim();
  const withLabels = Object.keys(labels).length > 0 ? { labels } : {};
  const target = form.target as TargetChoice;
  switch (target.kind) {
    case "page":
      return { id, kind: "page", pageId: target.id, ...withLabels };
    case "contentEntry":
      return { id, kind: "contentEntry", entryId: target.id, ...withLabels };
    case "term":
      return { id, kind: "term", termId: target.id, ...withLabels };
    case "collection":
      return {
        id,
        kind: "collection",
        collection: target.collection,
        labels: labels as MenuItem["labels"] & object,
      };
    case "url":
      return {
        id,
        kind: "url",
        href: form.href.trim(),
        ...(form.newTab ? { newTab: true } : {}),
        labels: labels as MenuItem["labels"] & object,
      };
    case "group":
      // Children are kept by `replaceItem`; a new group is empty until the person nests items
      // under it (saving refuses an empty group, invariant 6).
      return { id, kind: "group", labels } as unknown as MenuItem;
  }
}

export type LabelError = "required" | "tooLong" | "invalid";
export type HrefError = "required" | "insecure" | "invalid";

export interface ItemFormErrors {
  target?: "required";
  href?: HrefError;
  labels: Record<string, LabelError>;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the contract forbids control characters
const CONTROL = /[\x00-\x1F\x7F]/;

/** The contract's label rule (RFC-0003 invariant 6), after trimming. */
export function labelError(text: string): LabelError | undefined {
  const value = text.trim();
  if (!value) return undefined;
  if (value.length > MENU_LIMITS.labelLength) return "tooLong";
  if (CONTROL.test(value)) return "invalid";
  return undefined;
}

export function hrefError(href: string): HrefError | undefined {
  const value = href.trim();
  if (!value) return "required";
  if (/^http:\/\//i.test(value)) return "insecure";
  if (!isMenuHref(value)) return "invalid";
  return undefined;
}

export function validateItemForm(
  form: ItemForm,
  site: Pick<Site, "defaultLocale">,
): ItemFormErrors {
  const errors: ItemFormErrors = { labels: {} };
  if (!form.target) errors.target = "required";
  if (form.target?.kind === "url") {
    const e = hrefError(form.href);
    if (e) errors.href = e;
  }
  for (const [locale, text] of Object.entries(form.labels)) {
    const e = labelError(text);
    if (e) errors.labels[locale] = e;
  }
  if (needsLabel(form.target) && !form.labels[site.defaultLocale]?.trim())
    errors.labels[site.defaultLocale] = "required";
  return errors;
}

export function hasFormErrors(e: ItemFormErrors): boolean {
  return Boolean(e.target || e.href || Object.keys(e.labels).length > 0);
}

/** The external link's host, shown next to its label so a label cannot hide where it goes. */
export function hostOf(href: string): string | undefined {
  try {
    return new URL(href).host;
  } catch {
    return undefined;
  }
}

// ───────────────────────────── targets ─────────────────────────────

/** What Studio knows about the site to name targets and offer them. */
export interface TargetData {
  site: Pick<Site, "defaultLocale" | "locales" | "collections">;
  pages: readonly Page[];
  entries: readonly ContentEntry[];
  taxonomies: readonly Taxonomy[];
  terms: readonly Term[];
}

/** Collections an item can link to: those with articles, and those a page lists. */
export function collectionsOf(data: Pick<TargetData, "pages" | "entries">): string[] {
  const set = new Set<string>(data.entries.map((e) => e.collection));
  for (const p of data.pages)
    for (const s of p.sections) if (s.kind === "contentList") set.add(s.collection);
  return [...set].sort();
}

export type TargetGroup = "pages" | "articles" | "terms" | "collections" | "other";

export interface TargetOption {
  /** `page:<id>`, `contentEntry:<id>`, `term:<id>`, `collection:<slug>`, `url`, `group`. */
  value: string;
  group: TargetGroup;
  /** Taxonomy key of a term option. */
  taxonomy?: string;
  label: string;
  /** Path, archive path or collection slug. */
  detail?: string;
  /** Not linkable on the site right now (a draft, an archived page, an internal term). */
  status?: string;
  depth?: number;
}

export function choiceValue(choice: TargetChoice | undefined): string | null {
  if (!choice) return null;
  switch (choice.kind) {
    case "page":
    case "contentEntry":
    case "term":
      return `${choice.kind}:${choice.id}`;
    case "collection":
      return `collection:${choice.collection}`;
    default:
      return choice.kind;
  }
}

export function choiceOf(value: string): TargetChoice | undefined {
  if (value === "url" || value === "group") return { kind: value };
  const at = value.indexOf(":");
  const kind = value.slice(0, at);
  const rest = value.slice(at + 1);
  if (kind === "page" || kind === "contentEntry" || kind === "term") return { kind, id: rest };
  if (kind === "collection") return { kind, collection: rest };
  return undefined;
}

/** Every target the picker offers, grouped: pages, articles, each taxonomy, collections, other. */
export function targetOptions(data: TargetData): TargetOption[] {
  const locale = data.site.defaultLocale;
  const pages: TargetOption[] = [...data.pages]
    .filter((p) => p.locale === locale)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((p) => ({
      value: `page:${p.id}`,
      group: "pages" as const,
      label: p.title,
      detail: p.path,
      ...(p.status !== "published" ? { status: p.status } : {}),
    }));
  const articles: TargetOption[] = [...data.entries]
    .filter((e) => e.locale === locale)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((e) => ({
      value: `contentEntry:${e.id}`,
      group: "articles" as const,
      label: e.title,
      detail: entryPath(data.site, e),
      ...(e.status !== "published" ? { status: e.status } : {}),
    }));
  const terms: TargetOption[] = [];
  for (const tax of data.taxonomies) {
    const own = data.terms.filter((t) => t.taxonomyId === tax.id && t.status !== "retired");
    const byParent = new Map<string, Term[]>();
    for (const t of own) {
      const k = t.parentId ?? "";
      byParent.set(k, [...(byParent.get(k) ?? []), t]);
    }
    const walk = (parent: string, depth: number) => {
      const list = [...(byParent.get(parent) ?? [])].sort(
        (a, b) =>
          (a.position ?? 1e9) - (b.position ?? 1e9) ||
          termLabel(a, locale).localeCompare(termLabel(b, locale)),
      );
      for (const t of list) {
        terms.push({
          value: `term:${t.id}`,
          group: "terms",
          taxonomy: tax.key,
          label: termLabel(t, locale, ...data.site.locales),
          ...(tax.archive.enabled ? { detail: archivePath(tax, t.slug) } : {}),
          ...(t.status === "proposed"
            ? { status: "proposed" }
            : t.visibility === "internal"
              ? { status: "internal" }
              : {}),
          depth,
        });
        if (depth < 16) walk(t.id, depth + 1);
      }
    };
    walk("", 0);
  }
  const collections: TargetOption[] = collectionsOf(data).map((c) => ({
    value: `collection:${c}`,
    group: "collections" as const,
    label: c,
    detail: c,
  }));
  return [
    ...pages,
    ...articles,
    ...terms,
    ...collections,
    { value: "url", group: "other", label: "url" },
    { value: "group", group: "other", label: "group" },
  ];
}

/** The target's own title in `locale` (the label fallback), if it has one and still exists. */
export function targetTitle(
  choice: TargetChoice | undefined,
  data: TargetData,
  locale: string,
): string | undefined {
  if (!choice) return undefined;
  switch (choice.kind) {
    case "page":
      return data.pages.find((p) => p.id === choice.id)?.title;
    case "contentEntry":
      return data.entries.find((e) => e.id === choice.id)?.title;
    case "term": {
      const term = data.terms.find((t) => t.id === choice.id);
      return term ? termLabel(term, locale, data.site.defaultLocale) : undefined;
    }
    default:
      return undefined;
  }
}

/** Where an item links, for chips and delta lines: a path, a host, a collection, or nothing. */
export interface TargetSummary {
  kind: MenuItem["kind"];
  /** A path on the site, an external host, or a collection slug. */
  where?: string;
  /** For node targets: the target is gone. */
  missing?: boolean;
  /** The target's title or name (node targets). */
  title?: string;
  newTab?: boolean;
  /** Taxonomy key of a term target. */
  taxonomy?: string;
}

export function summarizeTarget(item: MenuItem, data: TargetData): TargetSummary {
  switch (item.kind) {
    case "page": {
      const p = data.pages.find((x) => x.id === item.pageId);
      return p ? { kind: "page", where: p.path, title: p.title } : { kind: "page", missing: true };
    }
    case "contentEntry": {
      const e = data.entries.find((x) => x.id === item.entryId);
      return e
        ? { kind: "contentEntry", where: entryPath(data.site, e), title: e.title }
        : { kind: "contentEntry", missing: true };
    }
    case "term": {
      const t = data.terms.find((x) => x.id === item.termId);
      const tax = t && data.taxonomies.find((x) => x.id === t.taxonomyId);
      return t
        ? {
            kind: "term",
            title: termLabel(t, data.site.defaultLocale),
            ...(tax ? { taxonomy: tax.key } : {}),
            ...(tax?.archive.enabled ? { where: archivePath(tax, t.slug) } : {}),
          }
        : { kind: "term", missing: true };
    }
    case "collection":
      return { kind: "collection", where: item.collection };
    case "url": {
      const host = hostOf(item.href);
      return { kind: "url", ...(host ? { where: host } : {}), newTab: item.newTab === true };
    }
    case "group":
      return { kind: "group" };
  }
}

/** The label an item shows in the default locale: its own, else the target's title. */
export function shownLabel(item: MenuItem, data: TargetData): { text: string; fallback: boolean } {
  const labels = (item.labels ?? {}) as Record<string, string | undefined>;
  const own = labels[data.site.defaultLocale] ?? Object.values(labels).find(Boolean);
  if (own) return { text: own, fallback: false };
  return { text: summarizeTarget(item, data).title ?? "", fallback: true };
}

// ───────────────────────────── resolution ─────────────────────────────

/** Resolved items by id (from the preview helper). */
export function resolvedById(resolved: ResolvedMenu | undefined): Map<string, ResolvedMenuItem> {
  const out = new Map<string, ResolvedMenuItem>();
  const go = (list: readonly ResolvedMenuItem[]) => {
    for (const i of list) {
      out.set(i.id, i);
      go(i.children);
    }
  };
  if (resolved) go(resolved.items);
  return out;
}

/** Items hidden for a reason of their own (not only because an item above is hidden). */
export function hiddenRoots(resolved: ResolvedMenu | undefined): ResolvedMenuItem[] {
  return [...resolvedById(resolved).values()].filter(
    (i) => i.state === "hidden" && i.reason !== "parent-hidden",
  );
}

// ───────────────────────────── delta lines (§6.3) ─────────────────────────────

export type DeltaLine =
  | {
      sign: "+";
      id: string;
      label: string;
      fallback: boolean;
      target: TargetSummary;
      parent?: string;
      position: number;
      below: number;
    }
  | {
      sign: "−";
      id: string;
      label: string;
      fallback: boolean;
      target: TargetSummary;
      below: number;
    }
  | { sign: "↕"; id: string; label: string; fallback: boolean; from: number; to: number }
  | {
      sign: "↳";
      id: string;
      label: string;
      fallback: boolean;
      parent?: string;
      was?: string;
    }
  | {
      sign: "~";
      id: string;
      label: string;
      fallback: boolean;
      change: "label";
      locale: string;
      from?: string;
      to?: string;
    }
  | {
      sign: "~";
      id: string;
      label: string;
      fallback: boolean;
      change: "target";
      from: TargetSummary;
      to: TargetSummary;
    }
  | { sign: "~"; id: string; label: string; fallback: boolean; change: "newTab"; to: boolean }
  | {
      sign: "!";
      id: string;
      label: string;
      fallback: boolean;
      reason: MenuHiddenReason;
      kind: MenuItem["kind"];
    };

/**
 * What the save confirmation lists, in the RFC-0003 §6.3 order: additions, removals, moves, edits,
 * then items the change adds or edits that stay hidden on the site.
 */
export function deltaLines(
  before: Pick<Menu, "items">,
  after: MenuDraft,
  data: TargetData,
  resolved?: ResolvedMenu,
): { delta: MenuDelta; lines: DeltaLine[] } {
  const delta = menuDelta(before, after);
  const oldIndex = indexMenu(before.items);
  const newIndex = indexMenu(after.items);
  const name = (id: string) => {
    const item = newIndex.get(id)?.item ?? oldIndex.get(id)?.item;
    const l = item ? shownLabel(item, data) : { text: id, fallback: false };
    return { label: l.text || id, fallback: l.fallback };
  };
  const lines: DeltaLine[] = [];
  for (const a of delta.added) {
    const item = newIndex.get(a.id)?.item as MenuItem;
    lines.push({
      sign: "+",
      id: a.id,
      ...name(a.id),
      target: summarizeTarget(item, data),
      ...(a.parentId ? { parent: name(a.parentId).label } : {}),
      position: a.index + 1,
      below: a.descendants,
    });
  }
  for (const r of delta.removed) {
    const item = oldIndex.get(r.id)?.item as MenuItem;
    lines.push({
      sign: "−",
      id: r.id,
      ...name(r.id),
      target: summarizeTarget(item, data),
      below: r.descendants,
    });
  }
  for (const m of delta.moved)
    lines.push(
      m.reparented
        ? {
            sign: "↳",
            id: m.id,
            ...name(m.id),
            ...(m.to.parentId ? { parent: name(m.to.parentId).label } : {}),
            ...(m.from.parentId ? { was: name(m.from.parentId).label } : {}),
          }
        : { sign: "↕", id: m.id, ...name(m.id), from: m.from.index + 1, to: m.to.index + 1 },
    );
  for (const c of delta.changed) {
    for (const l of c.labels ?? [])
      lines.push({
        sign: "~",
        id: c.id,
        ...name(c.id),
        change: "label",
        locale: l.locale,
        ...(l.from !== undefined ? { from: l.from } : {}),
        ...(l.to !== undefined ? { to: l.to } : {}),
      });
    if (c.target)
      lines.push({
        sign: "~",
        id: c.id,
        ...name(c.id),
        change: "target",
        from: summarizeTarget(c.target.from, data),
        to: summarizeTarget(c.target.to, data),
      });
    if (c.newTab)
      lines.push({ sign: "~", id: c.id, ...name(c.id), change: "newTab", to: c.newTab.to });
  }
  if (resolved) {
    const touched = new Set([...delta.added.map((a) => a.id), ...delta.changed.map((c) => c.id)]);
    for (const r of hiddenRoots(resolved))
      if (touched.has(r.id) && r.reason)
        lines.push({ sign: "!", id: r.id, ...name(r.id), reason: r.reason, kind: r.kind });
  }
  return { delta, lines };
}

// ───────────────────────────── save checks ─────────────────────────────

export type DraftProblem =
  | { code: "emptyGroup"; itemId: string }
  | { code: "label"; itemId: string }
  | { code: "depth"; itemId: string; max: number }
  | { code: "perLevel"; max: number }
  | { code: "total"; max: number };

/**
 * What would make the store refuse the draft, found before anyone confirms: an empty group, an
 * item that needs a default-locale label, an item deeper than `maxDepth`, too many items.
 */
export function draftProblem(
  draft: MenuDraft,
  site: Pick<Site, "defaultLocale">,
): DraftProblem | undefined {
  let problem: DraftProblem | undefined;
  walkMenu(draft.items, (item, depth) => {
    if (problem) return;
    if (item.kind === "group" && !item.children?.length)
      problem = { code: "emptyGroup", itemId: item.id };
    else if (
      (item.kind === "group" || item.kind === "url" || item.kind === "collection") &&
      !(item.labels as Record<string, string> | undefined)?.[site.defaultLocale]
    )
      problem = { code: "label", itemId: item.id };
    else if (depth > draft.maxDepth)
      problem = { code: "depth", itemId: item.id, max: draft.maxDepth };
  });
  if (problem) return problem;
  const usage = menuUsage(draft.items);
  if (usage.total > MENU_LIMITS.total) return { code: "total", max: MENU_LIMITS.total };
  if (usage.fullest.count > MENU_LIMITS.perLevel)
    return { code: "perLevel", max: MENU_LIMITS.perLevel };
  return undefined;
}
