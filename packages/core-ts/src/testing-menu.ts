/**
 * RFC-0003 behavioural suite (menus). Called by `describeSiteGraphStore`, so it runs on every
 * storage backend (better-sqlite3 and Miniflare D1). Test names cite the invariant(s) of RFC-0003 §3
 * they prove.
 */
import type {
  Actor,
  ContentEntry,
  Menu,
  MenuItem,
  Page,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, InvariantError } from "./errors.ts";
import { canonicalJson, nodeHash } from "./hash.ts";
import { applyMenuOps, menuDelta } from "./menu.ts";
import { insertNodeStatement } from "./node-sql.ts";
import { uniquenessKey } from "./nodes.ts";
import { exportSite, importSite } from "./sync.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };

async function rejects(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a rejection");
}

async function code(p: Promise<unknown>): Promise<string> {
  const e = await rejects(p);
  if (e instanceof InvariantError) return e.code;
  return e.name;
}

let seq = 0;
const itemId = () => `item_T${String(++seq).padStart(9, "0")}`;
const page = (pageId: string, extra: Partial<MenuItem> = {}): MenuItem =>
  ({ id: itemId(), kind: "page", pageId, ...extra }) as MenuItem;

export function menuSuite(ctx: SuiteContext): void {
  // D1 under Miniflare is slow on a busy machine; each test does a full site setup.
  describe("RFC-0003 menus", { timeout: 90_000 }, () => {
    interface World {
      site: Site;
      about: Page;
      draft: Page;
      category: Taxonomy;
      news: Term;
      post: ContentEntry;
    }

    async function setup(): Promise<World> {
      const store = ctx.store();
      const project = await store.createProject({
        name: "Nav",
        slug: "nav",
        ownerId: person.id,
        siteIds: [],
      });
      let site = await store.createSite({
        projectId: project.id,
        name: "Nav",
        slug: "nav",
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      const r1 = await store.createPage(site, {
        siteId: site.id,
        path: "/about",
        title: "About",
        locale: "en",
        status: "published",
        sections: [],
      });
      const about = r1.page;
      const r2 = await store.createPage(r1.site, {
        siteId: site.id,
        path: "/draft",
        title: "Draft",
        locale: "en",
        status: "draft",
        sections: [],
      });
      const draft = r2.page;
      site = r2.site;
      const [category] = (await store.createDefaultTaxonomies(site)) as [Taxonomy, Taxonomy];
      const news = await store.createTerm({
        siteId: site.id,
        taxonomyId: category.id,
        slug: "news",
        status: "active",
        visibility: "public",
        labels: { en: { name: "News" } },
      });
      const post = await store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "hello",
        locale: "en",
        status: "published",
        title: "Hello",
        body: { format: "markdown", value: "Hi" },
        fields: {},
        tags: [],
        terms: { category: { ids: [news.id], primary: news.id } },
        author: person,
      });
      return { site, about, draft, category, news, post };
    }

    const create = (w: World, items: MenuItem[], extra: Partial<Menu> = {}) =>
      ctx.store().createMenu({ siteId: w.site.id, key: "primary", maxDepth: 3, items, ...extra });

    it("invariants 1, 12, 13: one node per key; the key is unique and immutable; one write, one snapshot", async () => {
      const w = await setup();
      const store = ctx.store();
      const menu = await create(w, [page(w.about.id)]);
      expect(menu.id).toMatch(/^menu_/);
      expect(menu.rev).toBe(0);
      expect(uniquenessKey("menu", menu)).toBe("primary");
      expect(await store.getMenu(menu.id)).toEqual(menu);
      expect(await store.getMenuByKey(w.site.id, "primary")).toEqual(menu);
      expect(await store.getMenuByKey(w.site.id, "footer")).toBeUndefined();
      expect(await code(create(w, []))).toBe("key_taken");
      const footer = await create(w, [], { key: "footer", maxDepth: 2 });
      expect((await store.listMenus(w.site.id)).map((m) => m.key)).toEqual(["footer", "primary"]);
      expect(await code(store.updateMenu({ ...menu, key: "header" }))).toBe("immutable_field");
      // A whole-tree write is one CAS; the caller takes one snapshot holding a `menu` ref.
      const s1 = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      expect(
        s1.nodes
          .filter((n) => n.kind === "menu")
          .map((n) => n.id)
          .sort(),
      ).toEqual([menu.id, footer.id].sort());
      const v1 = await store.updateMenu({ ...menu, items: [...menu.items, page(w.draft.id)] });
      expect(v1.rev).toBe(1);
      const s2 = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      expect(s2.summary).toEqual({ added: 0, changed: 1, removed: 0 });
      expect((await store.diffSnapshots(s1.id, s2.id)).changed[0]?.after).toMatchObject({
        id: menu.id,
        kind: "menu",
        rev: 1,
      });
      expect(
        await store.readSnapshotNode<Menu>(s1.nodes.find((n) => n.id === menu.id) as never),
      ).toEqual(menu);
      // a menu fixture is not valid as any other node kind (and the reverse): the contracts test
    });

    it("invariant 2: item ids are item_ ids, unique and stable across operations", async () => {
      const w = await setup();
      const store = ctx.store();
      const dup = page(w.about.id);
      expect(await code(create(w, [dup, { ...dup }]))).toBe("invalid_menu");
      expect(
        await code(create(w, [{ id: "page_01HZX8K3Q9", kind: "page", pageId: w.about.id }])),
      ).toBe("invalid_menu");
      const a = page(w.about.id);
      const menu = await create(w, [a, page(w.draft.id)]);
      const next = applyMenuOps(
        menu,
        [
          { op: "move", itemId: a.id, index: 1 },
          { op: "update", itemId: a.id, labels: { en: "Who we are" } },
        ],
        itemId,
        w.site,
      );
      expect(next.items[1]?.id).toBe(a.id);
      const saved = await store.updateMenu(next);
      expect(saved.items.map((i) => i.id)).toEqual([menu.items[1]?.id, a.id]);
      const delta = menuDelta(menu, saved);
      expect(delta.added).toEqual([]);
      expect(delta.removed).toEqual([]);
      expect(delta.changed.map((c) => c.id)).toEqual([a.id]);
      expect(delta.moved.length).toBe(1);
    });

    it("invariant 4: depth by maxDepth (hard cap 6); lowering maxDepth below the tree is refused", async () => {
      const w = await setup();
      const store = ctx.store();
      const nest = (n: number): MenuItem =>
        n === 1
          ? page(w.about.id)
          : ({
              id: itemId(),
              kind: "group",
              labels: { en: `Level ${n}` },
              children: [nest(n - 1)],
            } as MenuItem);
      expect(await code(create(w, [nest(4)]))).toBe("too_deep");
      expect(await code(create(w, [], { maxDepth: 7 }))).toBe("too_deep");
      const deep = await create(w, [nest(6)], { key: "sidebar", maxDepth: 6 });
      expect(await code(store.updateMenu({ ...deep, maxDepth: 5 }))).toBe("too_deep");
      const three = await create(w, [nest(3)]);
      expect(await code(store.updateMenu({ ...three, maxDepth: 2 }))).toBe("too_deep");
      expect((await store.updateMenu({ ...three, maxDepth: 4 })).maxDepth).toBe(4);
    });

    it("invariant 5: at most 100 items per level and 500 per menu", async () => {
      const w = await setup();
      const many = (n: number) => Array.from({ length: n }, () => page(w.about.id));
      expect(await rejects(create(w, many(101)))).toMatchObject({ code: "too_large" });
      const group = (n: number): MenuItem =>
        ({
          id: itemId(),
          kind: "group",
          labels: { en: "G" },
          children: many(n),
        }) as unknown as MenuItem;
      // 5 groups × 100 = 505 items
      expect(
        await code(create(w, [group(100), group(100), group(100), group(100), group(100)])),
      ).toBe("too_large");
      const ok = await create(w, [group(100), group(100), group(100), group(100), group(95)]);
      expect(ok.items.length).toBe(5);
    });

    it("invariants 6, 7: labels are trimmed plain text in site locales; collection, url and group need a default-locale label", async () => {
      const w = await setup();
      const store = ctx.store();
      const trimmed = await create(w, [page(w.about.id, { labels: { en: "  About us " } })]);
      expect(trimmed.items[0]?.labels).toEqual({ en: "About us" });
      expect(
        await code(create(w, [page(w.about.id, { labels: { en: "About\n+ ok" } })], { key: "a" })),
      ).toBe("invalid_label");
      expect(
        await code(
          create(w, [page(w.about.id, { labels: { en: "x".repeat(101) } })], { key: "b" }),
        ),
      ).toBe("invalid_label");
      expect(
        await code(create(w, [page(w.about.id, { labels: { de: "Über" } })], { key: "c" })),
      ).toBe("invalid_label");
      expect(
        await code(create(w, [page(w.about.id, { labels: { en: "   " } })], { key: "d" })),
      ).toBe("invalid_label");
      const blog = {
        id: itemId(),
        kind: "collection",
        collection: "posts",
        labels: { tr: "Yazılar" },
      } as MenuItem;
      expect(await code(create(w, [blog], { key: "e" }))).toBe("invalid_label");
      const footer = await create(
        w,
        [{ ...blog, labels: { en: "Blog", tr: "Yazılar" } } as MenuItem],
        {
          key: "footer",
          maxDepth: 2,
        },
      );
      // The site drops `tr`: existing labels are kept and other edits still save.
      const site = (await store.getSite(w.site.id)) as Site;
      await store.updateSite({ ...site, locales: ["en"] });
      const saved = await store.updateMenu({
        ...footer,
        items: [...footer.items, page(w.about.id)],
      });
      expect(saved.items[0]?.labels).toEqual({ en: "Blog", tr: "Yazılar" });
      // …but a write cannot add a label in a locale the site no longer has.
      expect(
        await code(
          store.updateMenu({
            ...saved,
            items: [saved.items[0] as MenuItem, page(w.about.id, { labels: { tr: "Hakkında" } })],
          }),
        ),
      ).toBe("invalid_label");
    });

    it("invariant 8: external links are https with an ASCII host and no user-info", async () => {
      const w = await setup();
      const url = (href: string) =>
        ({ id: itemId(), kind: "url", href, labels: { en: "Link" } }) as MenuItem;
      for (const href of [
        "http://example.com",
        "javascript:alert(1)",
        "//evil.example",
        "https://bank.example@evil.example",
        "https://ex\\ample.com",
        "/about",
      ])
        expect(await rejects(create(w, [url(href)], { key: "x" })), href).toMatchObject({
          code: "invalid_menu",
        });
      const ok = await create(w, [
        { ...url("https://xn--bcher-kva.example:8443/a?b#c"), newTab: true } as MenuItem,
      ]);
      expect(ok.items[0]).toMatchObject({ kind: "url", newTab: true });
    });

    it("invariant 9: new targets exist in the same site (drafts allowed, retired terms not); unchanged targets are not re-checked", async () => {
      const w = await setup();
      const store = ctx.store();
      const other = await setup();
      const missing = page("page_DOESNOTEXIST01");
      const e = await rejects(create(w, [missing]));
      expect(e).toBeInstanceOf(InvariantError);
      expect((e as InvariantError).code).toBe("unknown_target");
      expect((e as InvariantError).details.targets).toEqual([
        { kind: "page", id: "page_DOESNOTEXIST01" },
      ]);
      // a node of another site, or of another kind, is not a target
      expect(await code(create(w, [page(other.about.id)]))).toBe("unknown_target");
      expect(await code(create(w, [page(w.post.id)]))).toBe("unknown_target");
      const menu = await create(w, [
        page(w.about.id),
        page(w.draft.id),
        { id: itemId(), kind: "contentEntry", entryId: w.post.id } as MenuItem,
        { id: itemId(), kind: "term", termId: w.news.id } as MenuItem,
      ]);
      // invariant 10: deleting a target never writes the menu
      const site = (await store.getSite(w.site.id)) as Site;
      await store.deletePage(site, (await store.getPage(w.draft.id)) as Page);
      expect((await store.getMenu(menu.id))?.rev).toBe(0);
      // the dangling item is not re-checked when other parts change
      const v1 = await store.updateMenu({
        ...menu,
        items: [...menu.items, page(w.about.id, { labels: { en: "Again" } })],
      });
      expect(v1.rev).toBe(1);
      // retired terms cannot be added
      const old = await store.createTerm({
        siteId: w.site.id,
        taxonomyId: w.category.id,
        slug: "old",
        status: "active",
        visibility: "public",
        labels: { en: { name: "Old" } },
      });
      await store.retireTerm(old);
      expect(
        await code(
          store.updateMenu({
            ...v1,
            items: [...v1.items, { id: itemId(), kind: "term", termId: old.id } as MenuItem],
          }),
        ),
      ).toBe("unknown_target");
      expect((await store.getMenu(menu.id))?.rev).toBe(1);
    });

    it("invariant 9 under a race: a target deleted between the read and the statement fails with unknown_target", async () => {
      const w = await setup();
      const store = ctx.store();
      const menu = await create(w, []);
      const racing = ctx.racing(
        async () => {
          const site = (await store.getSite(w.site.id)) as Site;
          await store.deletePage(site, (await store.getPage(w.about.id)) as Page);
        },
        (q) => /^\s*UPDATE nodes/i.test(q),
      );
      const e = await rejects(racing.updateMenu({ ...menu, items: [page(w.about.id)] }));
      expect((e as InvariantError).code).toBe("unknown_target");
      expect(await store.getMenu(menu.id)).toEqual(menu);
      // and on create
      const racing2 = ctx.racing(
        async () => {
          const site = (await store.getSite(w.site.id)) as Site;
          await store.deletePage(site, (await store.getPage(w.draft.id)) as Page);
        },
        (q) => /^\s*INSERT INTO nodes/i.test(q),
      );
      expect(
        await code(
          racing2.createMenu({
            siteId: w.site.id,
            key: "footer",
            maxDepth: 2,
            items: [page(w.draft.id)],
          }),
        ),
      ).toBe("unknown_target");
      expect(await store.getMenuByKey(w.site.id, "footer")).toBeUndefined();
    });

    it("invariant 12: two concurrent menu writes — one conflicts", async () => {
      const w = await setup();
      const store = ctx.store();
      const menu = await create(w, [page(w.about.id)]);
      const racing = ctx.racing(
        async () => {
          await store.updateMenu({ ...menu, items: [] });
        },
        (q) => /^\s*UPDATE nodes/i.test(q),
      );
      const e = await rejects(racing.updateMenu({ ...menu, items: [page(w.draft.id)] }));
      expect(e).toBeInstanceOf(ConflictError);
      expect(await store.getMenu(menu.id)).toMatchObject({ rev: 1, items: [] });
      // a stale rev is a conflict without any race
      expect(await rejects(store.updateMenu(menu))).toBeInstanceOf(ConflictError);
      // and so is a stale delete
      expect(await rejects(store.deleteMenu(menu))).toBeInstanceOf(ConflictError);
      await store.deleteMenu((await store.getMenu(menu.id)) as Menu);
      expect(await store.getMenuByKey(w.site.id, "primary")).toBeUndefined();
    });

    it("invariant 9 at scale: 300 new targets are checked in one statement", async () => {
      const w = await setup();
      const store = ctx.store();
      // 300 drafts written straight to storage (the scale is in the menu write, not here)
      const ts = "2026-10-08T12:00:00.000Z";
      const entries: ContentEntry[] = Array.from({ length: 300 }, (_, i) => ({
        schemaVersion: 1,
        id: `entry_SCALE${String(i).padStart(5, "0")}`,
        siteId: w.site.id,
        collection: "docs",
        slug: `doc-${i}`,
        locale: "en",
        status: "draft",
        title: `Doc ${i}`,
        body: { format: "markdown", value: "." },
        fields: {},
        tags: [],
        author: person,
        rev: 0,
        createdAt: ts,
        updatedAt: ts,
      }));
      await ctx
        .sql()
        .batch(await Promise.all(entries.map((e) => insertNodeStatement("contentEntry", e, ts))));
      const items = (ids: string[]) =>
        [0, 1, 2].map(
          (g) =>
            ({
              id: itemId(),
              kind: "group",
              labels: { en: `Part ${g}` },
              children: ids
                .slice(g * 100, g * 100 + 100)
                .map((id) => ({ id: itemId(), kind: "contentEntry", entryId: id })),
            }) as unknown as MenuItem,
        );
      const ids = entries.map((e) => e.id);
      const broken = [...ids.slice(0, 299), "entry_DOESNOTEXIST1"];
      const e = await rejects(create(w, items(broken), { key: "sidebar", maxDepth: 6 }));
      expect((e as InvariantError).details.targets).toEqual([
        { kind: "contentEntry", id: "entry_DOESNOTEXIST1" },
      ]);
      const menu = await create(w, items(ids), { key: "sidebar", maxDepth: 6 });
      expect((await store.getMenu(menu.id))?.items.length).toBe(3);
    });

    it("menuReferences, deleteMenu and createMenuFromPages (the derived header as a menu)", async () => {
      const w = await setup();
      const store = ctx.store();
      const menu = await create(w, [page(w.about.id), page(w.about.id, { labels: { en: "Hi" } })]);
      expect(
        (await store.menuReferences(w.site.id, { kind: "page", id: w.about.id })).map((r) => [
          r.menu.id,
          r.itemIds.length,
        ]),
      ).toEqual([[menu.id, 2]]);
      expect(await store.menuReferences(w.site.id, { kind: "term", id: w.news.id })).toEqual([]);
      await store.deleteMenu(menu);
      const site = (await store.getSite(w.site.id)) as Site;
      const preview = await store.createMenuFromPages(site, "primary", {
        categories: true,
        dryRun: true,
      });
      expect(await store.getMenuByKey(w.site.id, "primary")).toBeUndefined();
      expect(preview.items.map((i) => i.kind)).toEqual(["page", "page", "term"]);
      const made = await store.createMenuFromPages(site, "primary");
      expect(made.maxDepth).toBe(3);
      expect(made.items).toEqual([
        { id: made.items[0]?.id, kind: "page", pageId: w.about.id },
        { id: made.items[1]?.id, kind: "page", pageId: w.draft.id },
      ]);
    });

    it("invariant 13 + sync: import validates menu rows by kind and tree rules, not targets", async () => {
      const w = await setup();
      const store = ctx.store();
      const menu = await create(w, []);
      await store.updateMenu({ ...menu, items: [page(w.about.id)] });
      const site = (await store.getSite(w.site.id)) as Site;
      await store.deletePage(site, (await store.getPage(w.about.id)) as Page);
      const pair = { sql: ctx.sql(), blobs: ctx.blobs() };
      const bundle = await exportSite(pair, w.site.id);
      // a dangling target is a legal state: the same bundle imports (unchanged)
      expect((await importSite(pair, bundle)).nodes.unchanged).toBe(true);
      // a tree the schema accepts but the store would refuse is rejected
      const row = bundle.nodes.find((n) => n.kind === "menu");
      if (!row) throw new Error("no menu row");
      const bad = JSON.parse(row.body) as Menu;
      bad.maxDepth = 1;
      bad.items = [
        {
          id: itemId(),
          kind: "group",
          labels: { en: "G" },
          children: [page(w.draft.id)],
        } as MenuItem,
      ];
      const tampered = {
        ...bundle,
        nodes: bundle.nodes.map((n) =>
          n === row ? { ...n, body: canonicalJson(bad), hash: "" } : n,
        ),
      };
      const fixed = tampered.nodes.find((n) => n.id === row.id) as (typeof tampered.nodes)[number];
      fixed.hash = await nodeHash(bad);
      await expect(importSite(pair, tampered, { mode: "replace" })).rejects.toThrow(/maxDepth/);
    });
  });
}
