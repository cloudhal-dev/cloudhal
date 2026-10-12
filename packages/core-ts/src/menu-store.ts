/**
 * Menu nodes in storage (RFC-0003 §4.2). Every write is one statement: the insert (create) or the
 * CAS update carries invariant 9 as a guard over the targets the write adds — they must be nodes of
 * the expected kind in the same site, and terms must not be retired — so a concurrent delete of a
 * target makes the write match no row instead of linking a dead node. Internal to core-ts.
 */
import {
  assertValid,
  type ContentEntry,
  type Menu,
  type MenuItem,
  type Page,
  type Site,
  type Taxonomy,
  type Term,
} from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { ConflictError, InvariantError, isUniqueViolation, NotFoundError } from "./errors.ts";
import { ID_PREFIX } from "./ids.ts";
import {
  addedTargets,
  canonicalMenu,
  defaultMaxDepth,
  menuTargets,
  type TargetRef,
  validateMenuTree,
  walkMenu,
} from "./menu.ts";
import { termName } from "./names.ts";
import {
  type Cond,
  casDeleteStatement,
  casUpdateStatement,
  insertNodeStatement,
} from "./node-sql.ts";
import type { Creatable } from "./nodes.ts";

export interface MenuEngineDeps {
  readonly sql: SqlDriver;
  readonly stamp: () => string;
  readonly newId: (prefix: string) => string;
  readonly getSite: (id: string) => Promise<Site | undefined>;
}

/** Invariant 9 as one guard: every `kind:id` in `targets` is a node of this site, no retired term. */
function targetsGuard(siteId: string, targets: readonly TargetRef[]): Cond | undefined {
  if (targets.length === 0) return undefined;
  const keys = [...new Set(targets.map((t) => `${t.kind}:${t.id}`))];
  return {
    sql: `(SELECT count(*) FROM nodes
            WHERE site_id = ? AND kind || ':' || id IN (SELECT value FROM json_each(?))
              AND NOT (kind = 'term' AND json_extract(body, '$.status') = 'retired')) = ?`,
    params: [siteId, JSON.stringify(keys), keys.length],
  };
}

export class MenuEngine {
  readonly #d: MenuEngineDeps;

  constructor(deps: MenuEngineDeps) {
    this.#d = deps;
  }

  async getMenu(id: string): Promise<Menu | undefined> {
    const row = await this.#d.sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE id = ? AND kind = 'menu'",
      [id],
    );
    return row ? (JSON.parse(row.body) as Menu) : undefined;
  }

  async getMenuByKey(siteId: string, key: string): Promise<Menu | undefined> {
    const row = await this.#d.sql.get<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'menu' AND key = ?",
      [siteId, key],
    );
    return row ? (JSON.parse(row.body) as Menu) : undefined;
  }

  /** Ordered by key. */
  async listMenus(siteId: string): Promise<Menu[]> {
    const rows = await this.#d.sql.all<{ body: string }>(
      "SELECT body FROM nodes WHERE site_id = ? AND kind = 'menu' ORDER BY key",
      [siteId],
    );
    return rows.map((r) => JSON.parse(r.body) as Menu);
  }

  async #site(siteId: string): Promise<Site> {
    const site = await this.#d.getSite(siteId);
    if (!site) throw new NotFoundError("site", siteId);
    return site;
  }

  /** Which of `targets` do not name a linkable node of the site right now (invariant 9). */
  async missingTargets(siteId: string, targets: readonly TargetRef[]): Promise<TargetRef[]> {
    if (targets.length === 0) return [];
    const keys = [...new Set(targets.map((t) => `${t.kind}:${t.id}`))];
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += 200) {
      const rows = await this.#d.sql.all<{ k: string }>(
        `SELECT kind || ':' || id AS k FROM nodes
          WHERE site_id = ? AND kind || ':' || id IN (SELECT value FROM json_each(?))
            AND NOT (kind = 'term' AND json_extract(body, '$.status') = 'retired')`,
        [siteId, JSON.stringify(keys.slice(i, i + 200))],
      );
      for (const r of rows) found.add(r.k);
    }
    return targets.filter((t) => !found.has(`${t.kind}:${t.id}`));
  }

  #unknown(missing: readonly TargetRef[]): InvariantError {
    const ids = missing.map((t) => t.id);
    return new InvariantError(
      "unknown_target",
      `menu items link to ${ids.length === 1 ? "a node" : "nodes"} that ${ids.length === 1 ? "is" : "are"} not in this site (or a retired term): ${ids.slice(0, 10).join(", ")}${ids.length > 10 ? ", …" : ""}`,
      { targets: missing },
    );
  }

  /**
   * Creates the menu for a key. One guarded insert: the site exists and every target is linkable
   * (invariant 9); a taken key raises `key_taken`.
   */
  async createMenu(input: Creatable<Menu>): Promise<Menu> {
    const ts = this.#d.stamp();
    const menu: Menu = canonicalMenu({
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#d.newId(ID_PREFIX.menu),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    });
    const site = await this.#site(menu.siteId);
    validateMenuTree(menu, site);
    assertValid("menu", menu);
    const targets = menuTargets(menu);
    const siteGuard: Cond = {
      sql: "EXISTS (SELECT 1 FROM nodes WHERE id = ? AND kind = 'site')",
      params: [site.id],
    };
    const guard = targetsGuard(site.id, targets);
    const statement = await insertNodeStatement("menu", menu, ts, {
      sql: guard ? `(${siteGuard.sql}) AND (${guard.sql})` : siteGuard.sql,
      params: [...siteGuard.params, ...(guard?.params ?? [])],
    });
    let changes: number;
    try {
      changes = (await this.#d.sql.run(statement.sql, statement.params ?? [])).changes;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new InvariantError(
          "key_taken",
          `this site already has a "${menu.key}" menu; update it instead`,
          { key: menu.key },
        );
      throw e;
    }
    if (changes !== 1) {
      const missing = await this.missingTargets(site.id, targets);
      if (missing.length > 0) throw this.#unknown(missing);
      throw new NotFoundError("site", site.id);
    }
    return menu;
  }

  /**
   * Replaces the tree (CAS on `rev`; the key is immutable). The guard covers only the targets the
   * write adds; unchanged items may point at deleted nodes (hidden, invariant 10).
   */
  async updateMenu(menu: Menu): Promise<Menu> {
    const stored = await this.getMenu(menu.id);
    if (!stored || stored.rev !== menu.rev)
      throw new ConflictError("menu", menu.id, menu.rev, stored?.rev);
    if (stored.key !== menu.key || stored.siteId !== menu.siteId)
      throw new InvariantError("immutable_field", "a menu's key and site cannot change", {
        key: stored.key,
      });
    const next: Menu = canonicalMenu({ ...menu, rev: menu.rev + 1, updatedAt: this.#d.stamp() });
    const site = await this.#site(next.siteId);
    validateMenuTree(next, site, stored);
    assertValid("menu", next);
    const added = addedTargets(stored, next);
    const statement = await casUpdateStatement(
      "menu",
      next,
      stored.rev,
      targetsGuard(site.id, added),
    );
    const r = await this.#d.sql.run(statement.sql, statement.params ?? []);
    if (r.changes !== 1) {
      const now = await this.getMenu(menu.id);
      if (now?.rev !== stored.rev) throw new ConflictError("menu", menu.id, menu.rev, now?.rev);
      const missing = await this.missingTargets(site.id, added);
      if (missing.length > 0) throw this.#unknown(missing);
      throw new ConflictError("menu", menu.id, menu.rev, now?.rev);
    }
    return next;
  }

  /** CAS delete; the key falls back to the theme's derived default. */
  async deleteMenu(menu: Menu): Promise<void> {
    const statement = casDeleteStatement("menu", menu);
    const r = await this.#d.sql.run(statement.sql, statement.params ?? []);
    if (r.changes !== 1)
      throw new ConflictError("menu", menu.id, menu.rev, (await this.getMenu(menu.id))?.rev);
  }

  /** Menus (and their item ids) that link to `target` (delete dialogs and prompts, invariant 10). */
  async menuReferences(
    siteId: string,
    target: TargetRef,
  ): Promise<{ menu: Menu; itemIds: string[] }[]> {
    const out: { menu: Menu; itemIds: string[] }[] = [];
    for (const menu of await this.listMenus(siteId)) {
      const itemIds: string[] = [];
      walkMenu(menu.items, (item) => {
        const id =
          item.kind === "page"
            ? item.pageId
            : item.kind === "contentEntry"
              ? item.entryId
              : item.kind === "term"
                ? item.termId
                : undefined;
        if (item.kind === target.kind && id === target.id) itemIds.push(item.id);
      });
      if (itemIds.length > 0) out.push({ menu, itemIds });
    }
    return out;
  }

  /**
   * The items "Create menu from current pages" proposes (§8, compatibility): page items without
   * labels for the pages today's derived header lists (top-level, default locale, `Site.pageIds`
   * order, home excluded), plus on request the top-level public categories with a served archive.
   */
  async itemsFromPages(
    site: Site,
    data: { pages: Page[]; entries: ContentEntry[]; taxonomies: Taxonomy[]; terms: Term[] },
    options: { categories?: boolean } = {},
  ): Promise<MenuItem[]> {
    const order = new Map(site.pageIds.map((id, i) => [id, i]));
    const pages = data.pages
      .filter(
        (p) =>
          p.status !== "archived" &&
          p.locale === site.defaultLocale &&
          p.path !== "/" &&
          /^\/[^/]+$/.test(p.path),
      )
      .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
    const items: MenuItem[] = pages.map((p) => ({
      id: this.#d.newId(ID_PREFIX.menuItem),
      kind: "page",
      pageId: p.id,
    }));
    if (options.categories) {
      const category = data.taxonomies.find((t) => t.key === "category");
      if (category?.archive.enabled) {
        const terms = new Map(data.terms.map((t) => [t.id, t]));
        const served = new Set<string>();
        for (const e of data.entries) {
          if (e.status !== "published" || e.locale !== site.defaultLocale) continue;
          for (const id of e.terms?.category?.ids ?? []) {
            let t = terms.get(id);
            for (let n = 0; t && n < 16; n++) {
              served.add(t.id);
              t = t.parentId ? terms.get(t.parentId) : undefined;
            }
          }
        }
        const top = data.terms
          .filter(
            (t) =>
              t.taxonomyId === category.id &&
              !t.parentId &&
              t.status === "active" &&
              t.visibility === "public" &&
              served.has(t.id),
          )
          .sort(
            (a, b) =>
              (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
              termName(a, site.defaultLocale).localeCompare(termName(b, site.defaultLocale)) ||
              a.slug.localeCompare(b.slug),
          );
        for (const t of top)
          items.push({ id: this.#d.newId(ID_PREFIX.menuItem), kind: "term", termId: t.id });
      }
    }
    return items;
  }

  defaultDepth(key: string): number {
    return defaultMaxDepth(key);
  }
}
