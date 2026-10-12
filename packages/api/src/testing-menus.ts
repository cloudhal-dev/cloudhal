/**
 * Shared API suite for RFC-0003 §5 (navigation menus) — runs against any SiteGraphStore backend,
 * like `testing.ts`: list with derived keys, create, from-pages, whole-tree and operation writes,
 * resolution, references, the preview helper, deletes, and the snapshot diff's menu deltas.
 */
import type { Menu, MenuItem, Page, Snapshot } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import type { MenuDelta, ResolvedMenu } from "@cloudhal/core-ts/menu";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
const agent = { kind: "agent" as const, id: "agent_apitest0001", name: "Bot" };

type Json = Record<string, unknown>;

export function describeMenusApi(label: string, factory: ApiStoreFactory): void {
  describe(`API menus: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const post = (path: string, body: unknown) =>
      call(path, { method: "POST", body: JSON.stringify(body) });
    const put = (path: string, body: unknown) =>
      call(path, { method: "PUT", body: JSON.stringify(body) });
    const base = () => `/api/sites/${siteId}/menus`;
    const snapshots = async () => store.listSnapshots(siteId, 500);
    const about = async () =>
      (await store.listPages(siteId)).find((p) => p.path === "/about") as Page;

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "Menu Site", slug: "menu-site" })).id;
      app = createApi({
        store,
        resolveActor: async (c) => {
          const who = c.req.header("x-test-user");
          return who === "agent" ? agent : who ? human : undefined;
        },
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("is for people: anonymous 401, agent keys 403", async () => {
      expect((await app.request(base())).status).toBe(401);
      const r = await app.request(base(), { headers: { "x-test-user": "agent" } });
      expect(r.status).toBe(403);
    });

    it("lists menus, the well-known keys without one (derived header) and the limits", async () => {
      const r = await call(base());
      expect(r.status).toBe(200);
      expect(r.body.menus).toEqual([]);
      const derived = r.body.derived as { key: string; items: { label: string; href: string }[] }[];
      expect(derived.map((d) => d.key)).toEqual(["primary", "footer"]);
      // Today's header: top-level pages (home excluded), then served top-level categories.
      expect(derived[0]?.items.map((i) => [i.label, i.href])).toEqual([
        ["About", "/about"],
        ["News", "/category/news"],
      ]);
      expect(derived[1]?.items).toEqual([]);
      expect(r.body.limits).toMatchObject({ maxDepth: 6, perLevel: 100, total: 500, ops: 50 });
      expect(r.body.defaultDepth).toMatchObject({ primary: 3, footer: 2, sidebar: 6, other: 3 });
    });

    it("creates from current pages: a dry run first (no snapshot), then one snapshot", async () => {
      const before = (await snapshots()).length;
      const dry = await post(`${base()}/from-pages`, { key: "primary", dryRun: true });
      expect(dry.status, JSON.stringify(dry.body)).toBe(200);
      const menu = dry.body.menu as Menu;
      expect(menu.items).toEqual([
        { id: expect.stringMatching(/^item_/), kind: "page", pageId: (await about()).id },
      ]);
      expect(dry.body.categories).toBe(1);
      const resolved = dry.body.resolved as ResolvedMenu;
      expect(resolved.items[0]).toMatchObject({ state: "shown", label: "About", href: "/about" });
      expect((await snapshots()).length).toBe(before);
      expect(await store.getMenuByKey(siteId, "primary")).toBeUndefined();

      const withCats = await post(`${base()}/from-pages`, {
        key: "primary",
        dryRun: true,
        categories: true,
      });
      expect((withCats.body.menu as Menu).items.map((i) => i.kind)).toEqual(["page", "term"]);

      const created = await post(`${base()}/from-pages`, { key: "primary", categories: true });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect((created.body.menu as Menu).maxDepth).toBe(3);
      expect((created.body.delta as MenuDelta).added).toHaveLength(2);
      const after = await snapshots();
      expect(after.length).toBe(before + 1);
      expect((created.body.snapshot as Snapshot).label).toBe("create_menu by Tester");
      // Taken now.
      const again = await post(`${base()}/from-pages`, { key: "primary", dryRun: true });
      expect(again.status).toBe(409);
      expect(again.body.error).toBe("key_taken");
    });

    it("creates a custom menu; refuses a taken key, a bad key, bad labels and depth", async () => {
      const created = await post(base(), {
        key: "social",
        items: [
          {
            kind: "url",
            href: "https://github.com/cloudhal-dev",
            labels: { en: "GitHub" },
            newTab: true,
          },
        ],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const social = created.body.menu as Menu;
      expect(social.maxDepth).toBe(3);
      expect(social.items[0]?.id).toMatch(/^item_/);
      expect((created.body.snapshot as Snapshot).label).toBe("create_menu by Tester");

      const taken = await post(base(), { key: "social" });
      expect(taken.status).toBe(409);
      expect(taken.body.error).toBe("key_taken");
      expect((await post(base(), { key: "Not A Slug" })).status).toBe(400);
      const noLabel = await post(base(), {
        key: "links",
        items: [{ kind: "url", href: "https://example.com" }],
      });
      expect(noLabel.status).toBe(422);
      expect(noLabel.body.error).toBe("invalid_label");
      const deep = await post(base(), {
        key: "deep",
        maxDepth: 1,
        items: [
          {
            kind: "group",
            labels: { en: "More" },
            children: [{ kind: "page", pageId: (await about()).id }],
          },
        ],
      });
      expect(deep.status).toBe(422);
      expect(deep.body.error).toBe("too_deep");
      const unknown = await post(base(), {
        key: "ghost",
        items: [{ kind: "page", pageId: "page_doesnotexist" }],
      });
      expect(unknown.status).toBe(422);
      expect(unknown.body.error).toBe("unknown_target");
    });

    it("reads a menu with its resolved state per locale, and /resolve", async () => {
      const page = await about();
      const created = await post(base(), {
        key: "primary",
        items: [
          { kind: "page", pageId: page.id },
          { kind: "collection", collection: "posts", labels: { en: "Blog" } },
        ],
      });
      const menu = created.body.menu as Menu;
      const got = await call(`${base()}/${menu.id}`);
      expect(got.status).toBe(200);
      expect(got.body.locale).toBe("en");
      const resolved = got.body.resolved as ResolvedMenu;
      expect(resolved.items.map((i) => [i.label, i.labelSource, i.state, i.href])).toEqual([
        ["About", "target", "shown", "/about"],
        ["Blog", "item", "shown", "/"],
      ]);
      const r = await call(`${base()}/${menu.id}/resolve?locale=en`);
      expect((r.body as unknown as ResolvedMenu).shown).toBe(2);
      expect((await call(`${base()}/${menu.id}?locale=Not Valid`)).status).toBe(400);
      expect((await call(`${base()}/menu_nothere0001`)).status).toBe(404);
    });

    it("PUT replaces the tree: ids filled in, one snapshot, delta; a stale rev is 409 with the current menu", async () => {
      const page = await about();
      const created = await post(base(), {
        key: "primary",
        items: [{ kind: "page", pageId: page.id }],
      });
      const menu = created.body.menu as Menu;
      const before = (await snapshots()).length;
      const next = await put(`${base()}/${menu.id}`, {
        rev: menu.rev,
        items: [
          { ...(menu.items[0] as MenuItem), labels: { en: "About us" } },
          { kind: "url", href: "https://status.example.com", labels: { en: "Status" } },
        ],
      });
      expect(next.status, JSON.stringify(next.body)).toBe(200);
      const saved = next.body.menu as Menu;
      expect(saved.rev).toBe(menu.rev + 1);
      expect(saved.items[1]?.id).toMatch(/^item_/);
      const delta = next.body.delta as MenuDelta;
      expect(delta.added.map((a) => a.id)).toEqual([saved.items[1]?.id]);
      expect(delta.changed.map((c) => c.id)).toEqual([menu.items[0]?.id]);
      expect((await snapshots()).length).toBe(before + 1);
      expect((next.body.snapshot as Snapshot).label).toBe("set_menu by Tester");

      const stale = await put(`${base()}/${menu.id}`, { rev: menu.rev, items: [] });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("conflict");
      expect((stale.body.details as { current: Menu }).current.rev).toBe(saved.rev);
      expect((await snapshots()).length).toBe(before + 1);
      // Depth is data: lowering maxDepth below the tree is refused, raising it is fine.
      const changeKey = await put(`${base()}/${menu.id}`, {
        rev: saved.rev,
        key: "footer",
        items: [],
      });
      expect(changeKey.status).toBe(400);
      expect(changeKey.body.error).toBe("immutable_field");
      expect((await put(`${base()}/${menu.id}`, { rev: saved.rev, items: [] })).status).toBe(200);
    });

    it("ops: dry run checks targets and writes nothing; a run is one CAS and one snapshot", async () => {
      const page = await about();
      const created = await post(base(), {
        key: "primary",
        items: [{ kind: "page", pageId: page.id }],
      });
      const menu = created.body.menu as Menu;
      const first = menu.items[0] as MenuItem;
      const before = (await snapshots()).length;
      const ops = [
        {
          op: "add",
          item: {
            target: { kind: "group" },
            labels: { en: "More" },
            children: [
              { target: { kind: "url", href: "https://docs.example.com" }, labels: { en: "Docs" } },
            ],
          },
        },
        { op: "move", itemId: first.id, parent: null, index: 1 },
        { op: "update", itemId: first.id, labels: { en: "Who we are" } },
      ];
      const dry = await post(`${base()}/${menu.id}/ops`, { rev: menu.rev, ops, dryRun: true });
      expect(dry.status, JSON.stringify(dry.body)).toBe(200);
      expect((dry.body.menu as Menu).items.map((i) => i.kind)).toEqual(["group", "page"]);
      // The group is added; "About" keeps its place among its old siblings (no move), and its label changes.
      expect((dry.body.delta as MenuDelta).changes).toBe(2);
      expect((await snapshots()).length).toBe(before);
      expect((await store.getMenu(menu.id))?.rev).toBe(menu.rev);

      const ghost = await post(`${base()}/${menu.id}/ops`, {
        rev: menu.rev,
        dryRun: true,
        ops: [{ op: "add", item: { target: { kind: "page", ref: "page_doesnotexist" } } }],
      });
      expect(ghost.status).toBe(422);
      expect(ghost.body.error).toBe("unknown_target");
      const unknownItem = await post(`${base()}/${menu.id}/ops`, {
        rev: menu.rev,
        ops: [{ op: "remove", itemId: "item_nothere0001" }],
      });
      expect(unknownItem.status).toBe(422);
      expect(unknownItem.body.error).toBe("unknown_item");

      const run = await post(`${base()}/${menu.id}/ops`, { rev: menu.rev, ops });
      expect(run.status, JSON.stringify(run.body)).toBe(200);
      expect((run.body.menu as Menu).rev).toBe(menu.rev + 1);
      expect((await snapshots()).length).toBe(before + 1);
      expect((run.body.snapshot as Snapshot).label).toBe("update_menu by Tester");
      const stale = await post(`${base()}/${menu.id}/ops`, {
        rev: menu.rev,
        ops: [{ op: "remove", itemId: first.id }],
      });
      expect(stale.status).toBe(409);
      expect((stale.body.details as { current: Menu }).current.rev).toBe(menu.rev + 1);
    });

    it("a deleted page hides its item with a reason; references name the menus and items", async () => {
      const page = await about();
      const created = await post(base(), {
        key: "primary",
        items: [{ kind: "page", pageId: page.id, labels: { en: "About us" } }],
      });
      const menu = created.body.menu as Menu;
      const refs = await call(`${base()}/references?kind=page&id=${page.id}`);
      expect(refs.status).toBe(200);
      expect(refs.body.items).toEqual([
        {
          menuId: menu.id,
          key: "primary",
          items: [{ id: menu.items[0]?.id, label: "About us", labelSource: "item" }],
        },
      ]);
      expect((await call(`${base()}/references?kind=page&id=page_nothere0001`)).body.items).toEqual(
        [],
      );
      expect((await call(`${base()}/references?kind=site&id=x`)).status).toBe(400);

      const site = await store.getSite(siteId);
      if (!site) throw new Error("no site");
      await store.deletePage(site, page);
      const resolved = (await call(`${base()}/${menu.id}/resolve`)).body as unknown as ResolvedMenu;
      expect(resolved.items[0]).toMatchObject({
        state: "hidden",
        reason: "missing",
        label: "About us",
      });
      const list = await call(base());
      expect((list.body.menus as { hidden: number; items: number }[])[0]).toMatchObject({
        items: 1,
        hidden: 1,
        depth: 1,
      });
    });

    it("previews unsaved trees with the active item, and the derived default without a menu", async () => {
      const page = await about();
      const derived = await post(`${base()}/preview`, {
        path: "/about",
        menus: [{ key: "primary" }, { key: "footer" }],
      });
      expect(derived.status, JSON.stringify(derived.body)).toBe(200);
      const [header, footer] = derived.body.menus as {
        derived: boolean;
        navigation: { label: string; current?: string }[];
      }[];
      expect(header?.derived).toBe(true);
      expect(header?.navigation.map((i) => [i.label, i.current])).toEqual([
        ["About", "page"],
        ["News", undefined],
      ]);
      expect(footer).toMatchObject({ derived: true, navigation: [] });

      const draft = await post(`${base()}/preview`, {
        path: "/posts/hello-world",
        menus: [
          {
            key: "primary",
            items: [
              { id: "item_draft000001", kind: "page", pageId: page.id },
              {
                id: "item_draft000002",
                kind: "group",
                labels: { en: "Topics" },
                children: [
                  {
                    id: "item_draft000003",
                    kind: "term",
                    termId: (await store.getTermBySlug(siteId, "category", "news"))?.id,
                  },
                ],
              },
              { id: "item_draft000004", kind: "page", pageId: "page_gone00000001" },
            ],
          },
        ],
      });
      expect(draft.status, JSON.stringify(draft.body)).toBe(200);
      const p = (
        draft.body.menus as {
          resolved: ResolvedMenu;
          active: { itemId: string; match: string; trail: string[] };
          navigation: unknown[];
        }[]
      )[0];
      // The entry's primary category matches by context; the trail opens its group.
      expect(p?.active).toEqual({
        itemId: "item_draft000003",
        match: "context",
        trail: ["item_draft000002", "item_draft000003"],
      });
      expect(p?.resolved.items.map((i) => i.state)).toEqual(["shown", "shown", "hidden"]);
      expect(p?.navigation).toHaveLength(2);
      expect((await post(`${base()}/preview`, { menus: [] })).status).toBe(400);
    });

    it("deletes with rev (one snapshot); the key falls back to the derived default", async () => {
      const created = await post(base(), { key: "footer", items: [] });
      const menu = created.body.menu as Menu;
      expect((await call(`${base()}/${menu.id}`, { method: "DELETE" })).status).toBe(400);
      const stale = await call(`${base()}/${menu.id}?rev=7`, { method: "DELETE" });
      expect(stale.status).toBe(409);
      const before = (await snapshots()).length;
      const gone = await call(`${base()}/${menu.id}?rev=${menu.rev}`, { method: "DELETE" });
      expect(gone.status).toBe(200);
      expect((gone.body.snapshot as Snapshot).label).toBe("delete_menu by Tester");
      expect((await snapshots()).length).toBe(before + 1);
      expect(((await call(base())).body.derived as { key: string }[]).map((d) => d.key)).toEqual([
        "primary",
        "footer",
      ]);
    });

    it("the snapshot diff reports menu deltas with ?menus=1", async () => {
      const page = await about();
      const created = await post(base(), {
        key: "primary",
        items: [{ kind: "page", pageId: page.id }],
      });
      const menu = created.body.menu as Menu;
      const first = created.body.snapshot as Snapshot;
      const next = await put(`${base()}/${menu.id}`, {
        rev: menu.rev,
        items: [
          { kind: "url", href: "https://status.example.com", labels: { en: "Status" } },
          menu.items[0],
        ],
      });
      const second = next.body.snapshot as Snapshot;
      const diff = await call(
        `/api/sites/${siteId}/snapshots/${first.id}/diff/${second.id}?menus=1`,
      );
      expect(diff.status).toBe(200);
      expect(diff.body.menus).toEqual([
        {
          menuId: menu.id,
          key: "primary",
          change: "changed",
          added: 1,
          removed: 0,
          moved: 0,
          changed: 0,
          before: 1,
          after: 2,
        },
      ]);
      const plain = await call(`/api/sites/${siteId}/snapshots/${first.id}/diff/${second.id}`);
      expect(plain.body.menus).toBeUndefined();
    });
  });
}
