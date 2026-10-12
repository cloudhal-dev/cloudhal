/** RFC-0003 §7 on the public site: menus resolved by the sources, the active item, the derived header. */
import type { ContentEntry, MenuItem, Page, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { archiveSummaries } from "../src/archive.ts";
import {
  activeItem,
  breadcrumbs,
  derivedNavigation,
  markActive,
  markCurrent,
  type Navigation,
  navigationCacheTags,
  neighbours,
} from "../src/navigation.ts";
import { categoryNavLinks, navLinks } from "../src/routing.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "../src/source.ts";
import { loadTaxonomyIndex, termAncestors } from "../src/taxonomy.ts";

const human = { kind: "human" as const, id: "user_writer0001", name: "Ayşe" };
let store: SiteGraphStore;
let site: Site;
let about: Page;
let draft: Page;
let news: Term;
let world: Term;
let sports: Term;
let category: Taxonomy;
let cup: ContentEntry;

beforeEach(async () => {
  store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
  });
  await store.init();
  site = await seedStarterSite(store, { name: "Nav", slug: "nav" });
  site = await store.updateSite({ ...site, locales: ["en", "tr"] });
  about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
  ({ page: draft, site } = await store.createPage(site, {
    siteId: site.id,
    path: "/draft",
    title: "Draft",
    locale: "en",
    status: "draft",
    sections: [],
  }));
  category = (await store.getTaxonomyByKey(site.id, "category")) as Taxonomy;
  news = (await store.getTermBySlug(site.id, "category", "news")) as Term;
  const term = (slug: string, name: string, extra: Partial<Term> = {}) =>
    store.createTerm({
      siteId: site.id,
      taxonomyId: category.id,
      slug,
      status: "active",
      visibility: "public",
      labels: { en: { name } },
      ...extra,
    });
  world = await term("world", "World", { parentId: news.id });
  sports = await term("sports", "Sports");
  cup = await store.createContentEntry({
    siteId: site.id,
    collection: "posts",
    slug: "world-cup",
    locale: "en",
    status: "published",
    title: "World cup",
    body: { format: "markdown", value: "." },
    fields: {},
    tags: [],
    terms: { category: { ids: [world.id], primary: world.id } },
    author: human,
  });
});

const items = (): MenuItem[] => [
  {
    id: "item_HOME000001",
    kind: "collection",
    collection: "posts",
    labels: { en: "Blog", tr: "Yazılar" },
  },
  { id: "item_ABOUT00001", kind: "page", pageId: about.id, labels: { tr: "Hakkımızda" } },
  {
    id: "item_DRAFT00001",
    kind: "page",
    pageId: draft.id,
    children: [{ id: "item_UNDER00001", kind: "page", pageId: about.id }],
  },
  {
    id: "item_TOPICS0001",
    kind: "group",
    labels: { en: "Topics" },
    children: [
      { id: "item_NEWS000001", kind: "term", termId: news.id },
      { id: "item_SPORTS0001", kind: "term", termId: sports.id },
    ],
  },
  { id: "item_DOCS000001", kind: "collection", collection: "docs", labels: { en: "Docs" } },
  {
    id: "item_GH00000001",
    kind: "url",
    href: "https://github.com/cloudhal-dev",
    labels: { en: "GitHub" },
    newTab: true,
  },
];

async function sources(): Promise<GraphSource[]> {
  const snap = await store.createSnapshot(site.id, {
    actor: { kind: "system", id: "sys_test0001" },
    reason: "manual",
  });
  return [
    new LiveSource(store, site.id, { includeDrafts: false }),
    await SnapshotSource.open(store, snap.id),
  ];
}

const shape = (nav: Navigation | undefined) =>
  nav?.items.map((i) => [
    i.label,
    i.href ?? null,
    i.children.map((c) => [c.label, c.href ?? null]),
  ]);

describe("GraphSource.navigation (§7.1)", () => {
  it("no menu: undefined, and the theme falls back to the derived header", async () => {
    for (const source of await sources()) {
      expect(await source.menu("primary")).toBeUndefined();
      expect(await source.navigation("primary")).toBeUndefined();
    }
  });

  it("resolves shown items with labels and hrefs; hides each unresolved item with its subtree", async () => {
    const menu = await store.createMenu({
      siteId: site.id,
      key: "primary",
      maxDepth: 3,
      items: items(),
    });
    for (const source of await sources()) {
      expect((await source.menu("primary"))?.id).toBe(menu.id);
      const nav = await source.navigation("primary");
      expect(nav?.menuId).toBe(menu.id);
      // Blog → the home page lists posts (answer 5); the draft page hides its subtree; Sports has
      // no posts (404 archive); Docs has no index; the external link stays.
      expect(shape(nav)).toEqual([
        ["Blog", "/", []],
        ["About", "/about", []],
        ["Topics", null, [["News", "/category/news"]]],
        ["GitHub", "https://github.com/cloudhal-dev", []],
      ]);
      expect(nav?.items.at(-1)).toMatchObject({ external: true, newTab: true });
      const tr = await source.navigation("primary", "tr");
      // Only the default locale is routed: en pages, posts and archives are hidden in tr, and
      // the external link falls back to the default-locale label.
      expect(tr?.items.map((i) => i.label)).toEqual(["GitHub"]);
    }
  });

  it("the theme hook wins for collection indexes; a live dev source shows drafts", async () => {
    await store.createMenu({ siteId: site.id, key: "primary", maxDepth: 3, items: items() });
    const [, snapshot] = await sources();
    const hooked = await snapshot?.navigation("primary", undefined, {
      collectionIndex: (c) => (c === "docs" ? "/docs" : undefined),
    });
    expect(hooked?.items.map((i) => i.href)).toContain("/docs");
    // the hook said nothing for posts, so the page rule still applies
    expect(hooked?.items[0]?.href).toBe("/");
    const dev = await new LiveSource(store, site.id).navigation("primary");
    expect(shape(dev)?.[2]).toEqual(["Draft", "/draft", [["About", "/about"]]]);
  });

  it("a deleted page or an emptied archive hides the item on the next render", async () => {
    await store.createMenu({
      siteId: site.id,
      key: "footer",
      maxDepth: 2,
      items: items()
        .slice(1, 2)
        .concat([{ id: "item_SPORTS0002", kind: "term", termId: world.id }]),
    });
    const [live] = await sources();
    expect(shape(await live?.navigation("footer"))).toEqual([
      ["About", "/about", []],
      ["World", "/category/world", []],
    ]);
    await store.deletePage(site, (await store.getPage(about.id)) as Page);
    await store.updateContentEntry({ ...cup, status: "draft" });
    expect(shape(await live?.navigation("footer"))).toEqual([]);
  });

  it("cache tags name the menu node and its shown terms", async () => {
    const menu = await store.createMenu({
      siteId: site.id,
      key: "primary",
      maxDepth: 3,
      items: items(),
    });
    const [, snapshot] = await sources();
    expect(navigationCacheTags(await snapshot?.navigation("primary"))).toEqual([
      `cloudhal-node-${menu.id}`,
      `cloudhal-term-${news.id}`,
    ]);
    expect(navigationCacheTags(undefined)).toEqual([]);
  });
});

describe("active item, breadcrumbs and neighbours (§7.2)", () => {
  const link = (
    id: string,
    href: string,
    children: Navigation["items"] = [],
    target?: Navigation["items"][number]["target"],
  ) => ({
    id,
    kind: "page" as const,
    label: id,
    href,
    external: false,
    newTab: false,
    ...(target ? { target } : {}),
    children,
  });
  const nav: Navigation = {
    key: "sidebar",
    menuId: "menu_01HZX8K3Q9SB",
    locale: "en",
    items: [
      link("home", "/"),
      link("docs", "/docs", [
        link("deploy", "/docs/deploy", [link("workers", "/docs/deploy/workers")]),
        link("api", "/docs/api"),
      ]),
      {
        ...link("news", "/category/news", [], { kind: "term", id: "term_NEWS000001" }),
        kind: "term",
      },
      { ...link("blog", "/", [], { kind: "collection", collection: "posts" }), kind: "collection" },
      { ...link("ext", "https://example.com/docs"), external: true },
    ],
  };

  it("exact, then longest prefix (never /), then context; ties go depth-first", () => {
    expect(activeItem(nav, { path: "/docs/deploy/" })).toMatchObject({
      itemId: "deploy",
      match: "exact",
    });
    expect(activeItem(nav, { path: "/docs/deploy/workers/extra?x=1" })).toMatchObject({
      itemId: "workers",
      match: "prefix",
    });
    expect(activeItem(nav, { path: "/category/news/page/2" })).toMatchObject({
      itemId: "news",
      match: "prefix",
    });
    expect(activeItem(nav, { path: "/nowhere" })).toBeUndefined();
    // an entry in a sub-category of News: the nearest ancestor in the menu
    const entry = {
      collection: "posts",
      terms: { category: { ids: ["term_WORLD00001"], primary: "term_WORLD00001" } },
    } as never;
    const ancestors = (id: string) => (id === "term_WORLD00001" ? ["term_NEWS000001"] : []);
    expect(activeItem(nav, { path: "/posts/x", entry }, ancestors)).toMatchObject({
      itemId: "news",
      match: "context",
    });
    // no category in the menu: the collection
    expect(
      activeItem(nav, { path: "/posts/x", entry: { collection: "posts" } as never }),
    ).toMatchObject({
      itemId: "blog",
      match: "context",
    });
    expect(
      activeItem(nav, { path: "/category/world", archiveTermId: "term_WORLD00001" }, ancestors),
    ).toMatchObject({
      itemId: "news",
    });
  });

  it("marks aria-current and the trail; breadcrumbs and prev/next follow the tree", () => {
    const active = activeItem(nav, { path: "/docs/deploy/workers" });
    expect(breadcrumbs(active).map((i) => i.id)).toEqual(["docs", "deploy", "workers"]);
    const marked = markActive(nav, active);
    const docs = marked[1];
    expect(docs).toMatchObject({ inTrail: true });
    expect(docs?.current).toBeUndefined();
    expect(docs?.children[0]?.children[0]).toMatchObject({ current: "page", inTrail: true });
    expect(docs?.children[1]).toMatchObject({ inTrail: false });
    const prefix = markActive(nav, activeItem(nav, { path: "/docs/api/v2" }));
    expect(prefix[1]?.children[1]?.current).toBe("true");
    expect(neighbours(nav, active)).toMatchObject({ prev: { id: "deploy" }, next: { id: "api" } });
    expect(neighbours(nav, activeItem(nav, { path: "/" }))).toMatchObject({ next: { id: "docs" } });
    expect(neighbours(nav, undefined)).toEqual({});
  });
});

describe("derivedNavigation", () => {
  it("is today's navLinks + categoryNavLinks in the Navigation shape, with today's current rule", async () => {
    const [, snapshot] = await sources();
    const source = snapshot as GraphSource;
    const index = await loadTaxonomyIndex(source);
    const categories = archiveSummaries(index, await source.allEntries());
    const pages = await source.pages();
    for (const path of ["/", "/about", "/category/news/page/2", "/posts/world-cup"]) {
      const nav = derivedNavigation(site, pages, categories, "en");
      expect(nav.menuId).toBeUndefined();
      const legacy = [...navLinks(site, pages, path), ...categoryNavLinks(categories, path, "en")];
      expect(
        markCurrent(nav, path).map((i) => ({
          href: i.href,
          label: i.label,
          current: i.current === "page",
        })),
      ).toEqual(legacy);
    }
    expect(termAncestors(index, world).map((t) => t.id)).toEqual([news.id]);
  });
});
