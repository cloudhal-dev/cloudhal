/**
 * Navigation (RFC-0003 §7): menus resolved for rendering, the active item, breadcrumbs and prev/next
 * for docs sidebars, and the derived header for sites without a menu. Pure functions over graph
 * nodes, so the starter, previews and MCP agree on one set of rules:
 *
 * - an item links only to what the site serves (`resolveMenu` in `@cloudhal/core-ts/menu`): a
 *   missing, unpublished or retired target, an empty archive or a collection without an index
 *   hides the item and its subtree;
 * - the active item is the exact match, then the longest prefix, then the context (an entry's
 *   primary category, its ancestors, then its collection);
 * - without a menu, `derivedNavigation` is today's header (`navLinks` + `categoryNavLinks`).
 */
import type {
  ContentEntry,
  Menu,
  MenuItem,
  Page,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { normalisePath, termName } from "@cloudhal/core-ts";
import {
  type MenuLookup,
  type MenuLookupNode,
  type ResolvedMenu,
  type ResolvedMenuItem,
  resolveMenu,
} from "@cloudhal/core-ts/menu";
import { type ArchiveSummary, archiveState } from "./archive.ts";
import { nodeCacheTag, termCacheTag } from "./cache-tags.ts";
import { archiveMembers, archivePath, taxonomyIndex } from "./taxonomy.ts";

/** A menu resolved for one locale: only shown items, with labels and hrefs. */
export interface Navigation {
  readonly key: string;
  /** Absent: the theme's derived default (no menu stored under `key`). */
  readonly menuId?: string;
  readonly locale: string;
  readonly items: NavItem[];
}

export interface NavItem {
  readonly id: string;
  readonly kind: MenuItem["kind"];
  readonly label: string;
  /** Absent for groups. */
  readonly href?: string;
  readonly external: boolean;
  readonly newTab: boolean;
  readonly target?:
    | { readonly kind: "page" | "contentEntry" | "term"; readonly id: string }
    | { readonly kind: "collection"; readonly collection: string };
  /** Shown children only. */
  readonly children: NavItem[];
}

/**
 * Where a theme serves a collection's index in a locale (`undefined`: it does not). Starters own
 * routes (ADR-0009); the blog starter exports one from `theme.ts`.
 */
export type CollectionIndexHook = (collection: string, locale: string) => string | undefined;

export interface NavigationOptions {
  readonly collectionIndex?: CollectionIndexHook;
}

/** What a lookup is built from: every node of the site in any status, and which statuses are served. */
export interface LookupData {
  readonly site: Site;
  readonly pages: readonly Page[];
  readonly entries: readonly ContentEntry[];
  readonly taxonomies: readonly Taxonomy[];
  readonly terms: readonly Term[];
  /** Live dev source: drafts render (everything but archived is served). Default false. */
  readonly includeDrafts?: boolean;
  readonly collectionIndex?: CollectionIndexHook;
}

/** `/<collection>/<slug>`. */
const entryHref = (e: Pick<ContentEntry, "collection" | "slug">) => `/${e.collection}/${e.slug}`;

/**
 * A `MenuLookup` over a site's nodes (§7.1 table). Term items follow `archiveState` (200 only when
 * the archive lists entries the site serves in the locale); a collection index comes from the theme
 * hook, else the first served page (in `Site.pageIds` order) of the locale with an unfiltered
 * `contentList` of that collection (answer 5).
 */
export function menuLookup(data: LookupData): MenuLookup {
  const served = (status: Page["status"]) =>
    data.includeDrafts ? status !== "archived" : status === "published";
  const pages = new Map(data.pages.map((p) => [p.id, p]));
  const entries = new Map(data.entries.map((e) => [e.id, e]));
  const terms = new Map(data.terms.map((t) => [t.id, t]));
  const taxonomies = new Map(data.taxonomies.map((t) => [t.id, t]));
  const order = new Map(data.site.pageIds.map((id, i) => [id, i]));
  const counts = new Map<string, Map<string, number>>();
  const countsFor = (locale: string) => {
    let c = counts.get(locale);
    if (!c) {
      const index = taxonomyIndex(data.taxonomies, data.terms, locale);
      const members = archiveMembers(
        index,
        data.entries.filter((e) => e.locale === locale && served(e.status)),
      );
      c = new Map([...members].map(([id, list]) => [id, list.length]));
      counts.set(locale, c);
    }
    return c;
  };
  const node = (n: Page | ContentEntry, path: string): MenuLookupNode => ({
    path,
    title: n.title,
    locale: n.locale,
    served: served(n.status),
  });
  return {
    defaultLocale: data.site.defaultLocale,
    page: (id) => {
      const p = pages.get(id);
      return p ? node(p, p.path) : undefined;
    },
    entry: (id) => {
      const e = entries.get(id);
      return e ? node(e, entryHref(e)) : undefined;
    },
    term: (id, locale) => {
      const term = terms.get(id);
      if (!term) return undefined;
      const taxonomy = taxonomies.get(term.taxonomyId);
      if (!taxonomy) return undefined;
      const state = archiveState(taxonomy, term, countsFor(locale).get(term.id) ?? 0, locale);
      return {
        name: termName(term, locale),
        state: state.status,
        ...(taxonomy.archive.enabled ? { path: archivePath(taxonomy, term.slug) } : {}),
      };
    },
    collectionIndex: (collection, locale) => {
      const hooked = data.collectionIndex?.(collection, locale);
      if (hooked !== undefined) return hooked;
      return [...data.pages]
        .filter((p) => p.locale === locale && served(p.status))
        .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
        .find((p) =>
          p.sections.some(
            (s) => s.kind === "contentList" && s.collection === collection && !s.filter,
          ),
        )?.path;
    },
  };
}

function shownItems(items: readonly ResolvedMenuItem[]): NavItem[] {
  return items
    .filter((i) => i.state === "shown")
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      label: i.label,
      ...(i.href !== undefined ? { href: i.href } : {}),
      external: i.external,
      newTab: i.newTab,
      ...(i.target ? { target: i.target } : {}),
      children: shownItems(i.children),
    }));
}

/** The shown part of a resolved menu. */
export function toNavigation(resolved: ResolvedMenu): Navigation {
  return {
    key: resolved.key,
    menuId: resolved.menuId,
    locale: resolved.locale,
    items: shownItems(resolved.items),
  };
}

/** `resolveMenu` + `toNavigation` over a lookup built from `data`. */
export function navigationFor(menu: Menu, data: LookupData, locale: string): Navigation {
  return toNavigation(resolveMenu(menu, menuLookup(data), locale));
}

// ───────────────────────────── derived default ─────────────────────────────

/**
 * The header of a site without a `primary` menu, in the `Navigation` shape: the top-level pages of
 * the default locale in `Site.pageIds` order (home excluded), then the given categories (themes
 * pass the served top-level ones, or none). Exactly what `navLinks` + `categoryNavLinks` list.
 */
export function derivedNavigation(
  site: Site,
  pages: readonly Page[],
  categories: readonly ArchiveSummary[],
  locale: string,
): Navigation {
  const link = (id: string, kind: "page" | "term", label: string, href: string): NavItem => ({
    id,
    kind,
    label,
    href,
    external: false,
    newTab: false,
    target: { kind, id },
    children: [],
  });
  return {
    key: "primary",
    locale,
    items: [
      ...pages
        .filter(
          (p) => p.locale === site.defaultLocale && p.path !== "/" && /^\/[^/]+$/.test(p.path),
        )
        .map((p) => link(p.id, "page", p.title, p.path)),
      ...categories
        .filter((a) => a.taxonomy.key === "category" && !a.term.parentId)
        .map((a) => link(a.term.id, "term", termName(a.term, locale), a.path)),
    ],
  };
}

// ───────────────────────────── active item (§7.2) ─────────────────────────────

export interface Active {
  readonly itemId: string;
  readonly match: "exact" | "prefix" | "context";
  /** Root → item (the breadcrumb, and the path a sidebar expands). */
  readonly trail: NavItem[];
}

export interface ActiveNavItem extends NavItem {
  /** `page` on the exact match, `true` on a prefix or context match. */
  readonly current?: "page" | "true";
  /** The active item or one of its ancestors. */
  readonly inTrail: boolean;
  readonly children: ActiveNavItem[];
}

export interface ActiveRoute {
  /** The request path (query, fragment and a trailing slash are ignored). */
  readonly path: string;
  /** The entry the page renders, for context matching. */
  readonly entry?: Pick<ContentEntry, "collection" | "terms">;
  /** The term whose archive the page renders. */
  readonly archiveTermId?: string;
}

/** Items depth-first with their trail (root → item). */
function flatten(
  items: readonly NavItem[],
  trail: NavItem[] = [],
): { item: NavItem; trail: NavItem[] }[] {
  return items.flatMap((item) => {
    const t = [...trail, item];
    return [{ item, trail: t }, ...flatten(item.children, t)];
  });
}

const cleanPath = normalisePath;

/**
 * The active item (§7.2): the first item whose href equals the path; else the longest href the
 * path continues with `/` (never `/` itself); else the context — for an entry, the item for its
 * primary category, then that term's nearest ancestor in the menu, then the entry's collection; for
 * an archive, the term's item or its nearest ancestor's. `ancestors(termId)` lists a term's
 * ancestors root first. Ties go to the first item in depth-first order; external links never match.
 */
export function activeItem(
  nav: Navigation,
  route: ActiveRoute,
  ancestors: (termId: string) => readonly string[] = () => [],
): Active | undefined {
  const path = cleanPath(route.path);
  const all = flatten(nav.items).filter((x) => !x.item.external);
  const exact = all.find((x) => x.item.href !== undefined && cleanPath(x.item.href) === path);
  if (exact) return { itemId: exact.item.id, match: "exact", trail: exact.trail };
  let best: (typeof all)[number] | undefined;
  let bestLength = 0;
  for (const x of all) {
    if (x.item.href === undefined) continue;
    const href = cleanPath(x.item.href);
    if (href === "/" || !path.startsWith(`${href}/`)) continue;
    if (href.length > bestLength) {
      best = x;
      bestLength = href.length;
    }
  }
  if (best) return { itemId: best.item.id, match: "prefix", trail: best.trail };
  const byTerm = (termId: string) =>
    all.find(
      (x) => x.item.target?.kind === "term" && "id" in x.item.target && x.item.target.id === termId,
    );
  const nearest = (termId: string) => {
    for (const id of [termId, ...[...ancestors(termId)].reverse()]) {
      const hit = byTerm(id);
      if (hit) return hit;
    }
    return undefined;
  };
  let context: (typeof all)[number] | undefined;
  if (route.entry) {
    const primary = route.entry.terms?.category?.primary;
    context = primary ? nearest(primary) : undefined;
    const collection = route.entry.collection;
    context ??= all.find(
      (x) =>
        x.item.target?.kind === "collection" &&
        "collection" in x.item.target &&
        x.item.target.collection === collection,
    );
  } else if (route.archiveTermId) context = nearest(route.archiveTermId);
  return context ? { itemId: context.item.id, match: "context", trail: context.trail } : undefined;
}

/** The tree with `current` on the active item and `inTrail` on it and its ancestors. */
export function markActive(nav: Navigation, active?: Active): ActiveNavItem[] {
  const trail = new Set(active?.trail.map((i) => i.id) ?? []);
  const mark = (items: readonly NavItem[]): ActiveNavItem[] =>
    items.map((item) => ({
      ...item,
      ...(active?.itemId === item.id
        ? { current: active.match === "exact" ? ("page" as const) : ("true" as const) }
        : {}),
      inTrail: trail.has(item.id),
      children: mark(item.children),
    }));
  return mark(nav.items);
}

/**
 * Today's header rule for the derived default (kept so a site without a menu renders byte-for-byte
 * the same): every item whose href is the path or a prefix of it is `current="page"`.
 */
export function markCurrent(nav: Navigation, path: string): ActiveNavItem[] {
  const mark = (items: readonly NavItem[]): ActiveNavItem[] =>
    items.map((item) => {
      const current =
        item.href !== undefined && (path === item.href || path.startsWith(`${item.href}/`));
      return {
        ...item,
        ...(current ? { current: "page" as const } : {}),
        inTrail: current,
        children: mark(item.children),
      };
    });
  return mark(nav.items);
}

/** The breadcrumb of the active item (root → item); empty when nothing is active. */
export function breadcrumbs(active?: Active): NavItem[] {
  return active ? [...active.trail] : [];
}

/** Previous and next linked items in depth-first order around the active one (docs sidebars). */
export function neighbours(nav: Navigation, active?: Active): { prev?: NavItem; next?: NavItem } {
  if (!active) return {};
  const linked = flatten(nav.items)
    .map((x) => x.item)
    .filter((i) => i.href !== undefined && !i.external);
  const at = linked.findIndex((i) => i.id === active.itemId);
  if (at < 0) return {};
  const prev = linked[at - 1];
  const next = linked[at + 1];
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}

/**
 * Edge-cache tags of a page that renders `nav` (RFC-0003 §7.3): the menu node and the terms of
 * the term items it shows. Derived navigation has no node and adds nothing (the site tag covers it).
 */
export function navigationCacheTags(nav: Navigation | undefined): string[] {
  if (!nav?.menuId) return [];
  const tags = [nodeCacheTag(nav.menuId)];
  for (const { item } of flatten(nav.items))
    if (item.target?.kind === "term" && "id" in item.target)
      tags.push(termCacheTag(item.target.id));
  return tags;
}
