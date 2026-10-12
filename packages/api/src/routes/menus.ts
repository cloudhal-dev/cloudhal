import { archiveSummaries } from "@cloudhal/astro-renderer/archive";
import {
  type ActiveNavItem,
  activeItem,
  derivedNavigation,
  type LookupData,
  markActive,
  markCurrent,
  menuLookup,
  type NavItem,
  toNavigation,
} from "@cloudhal/astro-renderer/navigation";
import { archivePath, taxonomyIndex, termAncestors } from "@cloudhal/astro-renderer/taxonomy";
import type { Menu, MenuItem, Site } from "@cloudhal/core-contracts";
import {
  ConflictError,
  InvariantError,
  normalisePath,
  type SiteGraphStore,
} from "@cloudhal/core-ts";
import {
  addedTargets,
  applyMenuOps,
  countMenuItems,
  defaultMaxDepth,
  MENU_DEFAULT_DEPTH,
  MENU_LIMITS,
  MENU_MAX_OPS,
  type MenuDelta,
  type MenuOp,
  menuDelta,
  menuDepth,
  newMenuItemId,
  type ResolvedMenu,
  resolveMenu,
  type TargetRef,
  validateMenuTree,
} from "@cloudhal/core-ts/menu";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, badRequest, notFound } from "../errors.ts";
import { requireSite, snapshotAfter } from "../governance.ts";
import { param } from "../params.ts";

/** Keys every theme knows (RFC-0003 answer 12): listed even when the site has no menu for them. */
export const WELL_KNOWN_MENUS = ["primary", "footer"] as const;

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const TARGET_KINDS = new Set(["page", "contentEntry", "term"]);

/** A menu with what Studio's tabs show next to it. */
export interface MenuSummary {
  menu: Menu;
  /** Items at every level. */
  items: number;
  /** Items hidden on the site in the default locale (their own reason, not a hidden parent's). */
  hidden: number;
  /** Deepest level in use. */
  depth: number;
}

/** One menu as the preview renders it (the starter's `Base.astro` rules). */
export interface MenuPreview {
  key: string;
  /** No menu under this key: the theme's derived default (today's header, the default footer). */
  derived: boolean;
  /** Every item with its state; absent for the derived default. */
  resolved?: ResolvedMenu;
  /** Shown items with the active one marked for `path`. */
  navigation: ActiveNavItem[];
  active?: { itemId: string; match: "exact" | "prefix" | "context"; trail: string[] };
}

/** Where an item links, for the "used in menus" lists. */
export interface MenuReference {
  menuId: string;
  key: string;
  items: { id: string; label: string; labelSource: string }[];
}

/** Every node of the site, as the next publish would serve it (published only). */
async function lookupData(store: SiteGraphStore, site: Site): Promise<LookupData> {
  const [pages, entries, taxonomies, terms] = await Promise.all([
    store.listPages(site.id),
    store.listContentEntries(site.id),
    store.listTaxonomies(site.id),
    store.listTerms(site.id),
  ]);
  return { site, pages, entries, taxonomies, terms };
}

function localeOf(c: Context<Env>, site: Site, raw?: unknown): string {
  const locale = typeof raw === "string" && raw ? raw : (c.req.query("locale") ?? "");
  if (!locale) return site.defaultLocale;
  if (!LOCALE.test(locale)) throw badRequest(`"${locale}" is not a locale`);
  return locale;
}

function hiddenRoots(resolved: ResolvedMenu): number {
  let n = 0;
  const go = (items: ResolvedMenu["items"]) => {
    for (const i of items) {
      if (i.state === "hidden" && i.reason !== "parent-hidden") n++;
      go(i.children);
    }
  };
  go(resolved.items);
  return n;
}

/** Fills missing item ids (a person's editor may send new items without one). */
function withIds(items: unknown): MenuItem[] {
  if (!Array.isArray(items)) throw badRequest("items must be an array");
  const fill = (list: unknown[]): unknown[] =>
    list.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw badRequest("every item must be an object");
      const item = raw as Record<string, unknown>;
      return {
        ...item,
        id: typeof item.id === "string" && item.id ? item.id : newMenuItemId(),
        ...(Array.isArray(item.children) ? { children: fill(item.children) } : {}),
      };
    });
  return fill(items) as MenuItem[];
}

function maxDepthOf(raw: unknown, fallback: number): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== "number" || !Number.isInteger(raw))
    throw badRequest("maxDepth must be a whole number");
  return raw;
}

/**
 * Invariant 9 for writes the store does not run (dry runs): every target the write adds names a
 * node of the expected kind in this site, and no term is retired.
 */
async function checkTargets(store: SiteGraphStore, site: Site, targets: readonly TargetRef[]) {
  const missing: TargetRef[] = [];
  for (const t of targets) {
    const node =
      t.kind === "page"
        ? await store.getPage(t.id)
        : t.kind === "contentEntry"
          ? await store.getContentEntry(t.id)
          : await store.getTerm(t.id);
    const retired =
      t.kind === "term" && (node as { status?: string } | undefined)?.status === "retired";
    if (!node || node.siteId !== site.id || retired) missing.push(t);
  }
  if (missing.length > 0)
    throw new InvariantError(
      "unknown_target",
      `menu items link to nodes that are not in this site (or a retired term): ${missing
        .slice(0, 10)
        .map((t) => t.id)
        .join(", ")}`,
      { targets: missing },
    );
}

/** A CAS failure answers 409 with the menu as it is now, so the editor can offer to reload. */
async function conflictOr<T>(c: Context<Env>, menuId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
    const current = (await c.get("store").getMenu(menuId)) ?? null;
    throw apiError(409, "conflict", e.message, {
      kind: e.kind,
      id: e.id,
      expectedRev: e.expectedRev,
      actualRev: e.actualRev,
      current,
    });
  }
}

async function loadMenu(c: Context<Env>): Promise<Menu> {
  const menu = await c.get("store").getMenu(param(c, "menuId"));
  if (!menu || menu.siteId !== param(c, "siteId")) throw notFound("menu not found");
  return menu;
}

async function readJson(c: Context<Env>): Promise<Record<string, unknown>> {
  const body = (await c.req.json().catch(() => undefined)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw badRequest("send a JSON object");
  return body as Record<string, unknown>;
}

function revOf(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0)
    throw badRequest("rev is required (the menu's current revision)");
  return raw;
}

/** The theme's derived header: published top-level pages, then served top-level categories. */
function derivedHeader(data: LookupData, locale: string): NavItem[] {
  const published = data.entries.filter((e) => e.status === "published");
  const categories = archiveSummaries(
    taxonomyIndex(data.taxonomies, data.terms, locale),
    published,
  ).filter((a) => a.taxonomy.key === "category" && !a.term.parentId);
  return derivedNavigation(
    data.site,
    data.pages.filter((p) => p.status === "published"),
    categories,
    locale,
  ).items;
}

function preview(
  key: string,
  menu: Pick<Menu, "id" | "key" | "items"> | undefined,
  data: LookupData,
  locale: string,
  path: string | undefined,
): MenuPreview {
  if (!menu) {
    const items = key === "primary" ? derivedHeader(data, locale) : [];
    const nav = { key, locale, items };
    return { key, derived: true, navigation: path ? markCurrent(nav, path) : markActive(nav) };
  }
  const resolved = resolveMenu(menu, menuLookup(data), locale);
  const nav = toNavigation(resolved);
  if (!path) return { key, derived: false, resolved, navigation: markActive(nav) };
  const clean = normalisePath(path);
  const entry = data.entries.find((e) => `/${e.collection}/${e.slug}` === clean);
  const index = taxonomyIndex(data.taxonomies, data.terms, locale);
  const archive = data.terms.find((t) => {
    const tax = index.byId.get(t.taxonomyId);
    if (!tax?.archive.enabled) return false;
    const root = archivePath(tax, t.slug);
    return clean === root || clean.startsWith(`${root}/`);
  });
  const active = activeItem(
    nav,
    {
      path: clean,
      ...(entry ? { entry } : {}),
      ...(archive && !entry ? { archiveTermId: archive.id } : {}),
    },
    (id) => {
      const term = index.terms.get(id);
      return term ? termAncestors(index, term).map((a) => a.id) : [];
    },
  );
  return {
    key,
    derived: false,
    resolved,
    navigation: markActive(nav, active),
    ...(active
      ? {
          active: {
            itemId: active.itemId,
            match: active.match,
            trail: active.trail.map((i) => i.id),
          },
        }
      : {}),
  };
}

function summary(menu: Menu, data: LookupData): MenuSummary {
  const resolved = resolveMenu(menu, menuLookup(data), data.site.defaultLocale);
  return {
    menu,
    items: countMenuItems(menu.items),
    hidden: hiddenRoots(resolved),
    depth: menuDepth(menu.items),
  };
}

/**
 * `/api/sites/:siteId/menus` (RFC-0003 §5): people edit navigation menus here; agents use MCP.
 * Reads are `site:read`, writes `site:write` (Editor and above). Every write is one CAS and exactly
 * one snapshot labelled `<op> by <actor>`, and answers with the menu, its `menuDelta` and the
 * snapshot. A stale `rev` is 409 `conflict` with the current menu in `details.current`.
 */
export const menus: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const [list, data] = await Promise.all([store.listMenus(site.id), lookupData(store, site)]);
    const missing = WELL_KNOWN_MENUS.filter((k) => !list.some((m) => m.key === k));
    return c.json({
      menus: list.map((m) => summary(m, data)),
      derived: missing.map((key) => ({
        key,
        items: key === "primary" ? derivedHeader(data, site.defaultLocale) : [],
      })),
      wellKnown: WELL_KNOWN_MENUS,
      limits: { ...MENU_LIMITS, ops: MENU_MAX_OPS },
      defaultDepth: { ...MENU_DEFAULT_DEPTH, other: defaultMaxDepth("") },
    });
  })
  .post("/", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const body = await readJson(c);
    const key = body.key;
    if (typeof key !== "string" || !KEY.test(key) || key.length > 128)
      throw badRequest("key must be a slug, e.g. primary, footer or social-links");
    const menu = await store.createMenu({
      siteId: site.id,
      key,
      maxDepth: maxDepthOf(body.maxDepth, defaultMaxDepth(key)),
      items: body.items === undefined ? [] : withIds(body.items),
    });
    const snapshot = await snapshotAfter(c, site.id, "create_menu");
    return c.json({ menu, delta: menuDelta(undefined, menu), snapshot }, 201);
  })
  .post("/from-pages", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const body = await readJson(c);
    const key = typeof body.key === "string" ? body.key : "primary";
    if (!KEY.test(key)) throw badRequest("key must be a slug");
    const categories = body.categories === true;
    const options = {
      categories,
      ...(body.maxDepth !== undefined ? { maxDepth: maxDepthOf(body.maxDepth, 1) } : {}),
    };
    if (body.dryRun === true) {
      if (await store.getMenuByKey(site.id, key))
        throw new InvariantError("key_taken", `this site already has a "${key}" menu`, { key });
      // Always look at the categories too, so the dialog can say how many it would add.
      const all = await store.createMenuFromPages(site, key, {
        ...options,
        categories: true,
        dryRun: true,
      });
      const pages = all.items.filter((i) => i.kind === "page");
      const terms = all.items.filter((i) => i.kind === "term");
      const menu: Menu = { ...all, items: categories ? all.items : pages };
      const data = await lookupData(store, site);
      return c.json({
        menu,
        resolved: resolveMenu(menu, menuLookup(data), site.defaultLocale),
        categories: terms.length,
        delta: menuDelta(undefined, menu),
      });
    }
    const menu = await store.createMenuFromPages(site, key, options);
    const snapshot = await snapshotAfter(c, site.id, "create_menu");
    return c.json({ menu, delta: menuDelta(undefined, menu), snapshot }, 201);
  })
  .post("/preview", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const body = await readJson(c);
    const locale = localeOf(c, site, body.locale);
    const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : undefined;
    const wanted = body.menus;
    if (!Array.isArray(wanted) || wanted.length === 0 || wanted.length > 4)
      throw badRequest("menus must list 1–4 menus: [{ key, items? }]");
    const [stored, data] = await Promise.all([store.listMenus(site.id), lookupData(store, site)]);
    const out: MenuPreview[] = [];
    for (const raw of wanted) {
      const w = (raw ?? {}) as { key?: unknown; items?: unknown };
      if (typeof w.key !== "string" || !KEY.test(w.key)) throw badRequest("every menu needs a key");
      const saved = stored.find((m) => m.key === w.key);
      let menu: Pick<Menu, "id" | "key" | "items"> | undefined = saved;
      if (w.items !== undefined) {
        const items = withIds(w.items);
        if (countMenuItems(items) > MENU_LIMITS.total)
          throw badRequest(`a menu holds at most ${MENU_LIMITS.total} items`);
        menu = { id: saved?.id ?? "menu_draft00001", key: w.key, items };
      }
      out.push(preview(w.key, menu, data, locale, path));
    }
    return c.json({ locale, ...(path ? { path } : {}), menus: out });
  })
  .get("/references", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const kind = c.req.query("kind") ?? "";
    const id = c.req.query("id") ?? "";
    if (!TARGET_KINDS.has(kind) || !id)
      throw badRequest("pass kind (page, contentEntry or term) and id");
    const refs = await store.menuReferences(site.id, { kind: kind as TargetRef["kind"], id });
    if (refs.length === 0) return c.json({ items: [] });
    const data = await lookupData(store, site);
    const lookup = menuLookup(data);
    const items: MenuReference[] = refs.map(({ menu, itemIds }) => {
      const resolved = resolveMenu(menu, lookup, site.defaultLocale);
      const byId = new Map<string, ResolvedMenu["items"][number]>();
      const flat = (list: ResolvedMenu["items"]) => {
        for (const i of list) {
          byId.set(i.id, i);
          flat(i.children);
        }
      };
      flat(resolved.items);
      return {
        menuId: menu.id,
        key: menu.key,
        items: itemIds.map((itemId) => ({
          id: itemId,
          label: byId.get(itemId)?.label ?? "",
          labelSource: byId.get(itemId)?.labelSource ?? "none",
        })),
      };
    });
    return c.json({ items });
  })
  .get("/:menuId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const menu = await loadMenu(c);
    const locale = localeOf(c, site);
    const data = await lookupData(store, site);
    return c.json({ menu, locale, resolved: resolveMenu(menu, menuLookup(data), locale) });
  })
  .get("/:menuId/resolve", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const menu = await loadMenu(c);
    const data = await lookupData(store, site);
    return c.json(resolveMenu(menu, menuLookup(data), localeOf(c, site)));
  })
  .put("/:menuId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const stored = await loadMenu(c);
    const body = await readJson(c);
    if (body.key !== undefined && body.key !== stored.key)
      throw new InvariantError("immutable_field", "a menu's key cannot change", {
        key: stored.key,
      });
    const next: Menu = {
      ...stored,
      rev: revOf(body.rev),
      maxDepth: maxDepthOf(body.maxDepth, stored.maxDepth),
      items: withIds(body.items),
    };
    const menu = await conflictOr(c, stored.id, () => store.updateMenu(next));
    const snapshot = await snapshotAfter(c, site.id, "set_menu");
    return c.json({ menu, delta: menuDelta(stored, menu), snapshot });
  })
  .post("/:menuId/ops", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const stored = await loadMenu(c);
    const body = await readJson(c);
    const rev = revOf(body.rev);
    const ops = body.ops;
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > MENU_MAX_OPS)
      throw badRequest(`send 1–${MENU_MAX_OPS} operations`);
    if (rev !== stored.rev)
      throw apiError(
        409,
        "conflict",
        `menu ${stored.id}: expected rev ${rev} but found ${stored.rev}`,
        {
          kind: "menu",
          id: stored.id,
          expectedRev: rev,
          actualRev: stored.rev,
          current: stored,
        },
      );
    const next = applyMenuOps(stored, ops as MenuOp[], newMenuItemId, site);
    validateMenuTree(next, site, stored);
    const delta: MenuDelta = menuDelta(stored, next);
    if (body.dryRun === true) {
      await checkTargets(store, site, addedTargets(stored, next));
      const data = await lookupData(store, site);
      return c.json({
        menu: next,
        delta,
        resolved: resolveMenu(next, menuLookup(data), site.defaultLocale),
      });
    }
    const menu = await conflictOr(c, stored.id, () => store.updateMenu(next));
    const snapshot = await snapshotAfter(c, site.id, "update_menu");
    return c.json({ menu, delta, snapshot });
  })
  .delete("/:menuId", async (c) => {
    const store = c.get("store");
    const site = await requireSite(c);
    const stored = await loadMenu(c);
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    await conflictOr(c, stored.id, () => store.deleteMenu({ ...stored, rev }));
    const snapshot = await snapshotAfter(c, site.id, "delete_menu");
    return c.json({ snapshot });
  });
