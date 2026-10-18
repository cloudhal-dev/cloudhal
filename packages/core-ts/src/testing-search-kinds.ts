/**
 * RFC-0029 §1–2 in the store: pages, terms and authors are found next to articles; an archive only
 * while a visible article in the reader's locale carries its term; `kinds` narrows; taxonomy and
 * term changes reach the index incrementally; a failing provider falls back to FTS5. Part of the
 * shared suite, so it runs on SQLite and Miniflare D1. `searchProviderCases` needs no database.
 */
import type { Actor, ContentEntry, Page, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { dropAllTables } from "@cloudhal/storage/testing";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GATES_ENFORCED } from "./availability.ts";
import type { SearchResults, SearchRow } from "./search-common.ts";
import { searchRows } from "./search-memory.ts";
import { memoryProvider, type SearchProvider, withFallback } from "./search-provider.ts";
import { sectionText, termSearchRows } from "./search-rows.ts";
import { seedStarterSite } from "./seed.ts";
import { SiteGraphStore } from "./store.ts";

const human: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const T0 = Date.UTC(2026, 9, 18, 9, 0, 0);
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

export function searchKindsSuite(
  label: string,
  factory: { create(): Promise<{ sql: SqlDriver; blobs: BlobStore }>; dispose?(): Promise<void> },
): void {
  describe(`RFC-0029 search kinds in the store: ${label}`, () => {
    let sql: SqlDriver;
    let blobs: BlobStore;
    let now = T0;
    let store: SiteGraphStore;
    let site: Site;
    let category: Taxonomy;
    let author: Taxonomy;

    const open = (search?: SearchProvider) =>
      new SiteGraphStore({
        sql,
        blobs,
        now: () => new Date(now),
        gates: GATES_ENFORCED,
        ...(search ? { search, onHookError: () => {} } : {}),
      });

    beforeEach(async () => {
      const opened = await factory.create();
      sql = opened.sql;
      blobs = opened.blobs;
      await dropAllTables(sql);
      now = T0;
      store = open();
      await store.init();
      site = await seedStarterSite(store, { name: "Kinds", slug: "kinds" });
      const taxonomies = await store.listTaxonomies(site.id);
      category = taxonomies.find((t) => t.key === "category") as Taxonomy;
      author = taxonomies.find((t) => t.key === "author") as Taxonomy;
    });

    afterAll(async () => {
      await sql?.close();
      await factory.dispose?.();
    });

    const fresh = async () => (await store.getSite(site.id)) as Site;
    const publish = async () => {
      const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
      site = await store.publish(await fresh(), snap.id);
      return snap.id;
    };
    const term = (taxonomy: Taxonomy, slug: string, name: string, over: Partial<Term> = {}) =>
      store.createTerm({
        siteId: site.id,
        taxonomyId: taxonomy.id,
        slug,
        status: "active",
        visibility: "public",
        labels: { en: { name } },
        ...over,
      });
    const article = (
      slug: string,
      title: string,
      terms: NonNullable<ContentEntry["terms"]>,
      over: Partial<ContentEntry> = {},
    ) =>
      store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug,
        locale: "en",
        status: "published",
        title,
        body: { format: "markdown", value: "Words." },
        fields: {},
        tags: [],
        terms,
        author: human,
        publishedAt: iso(T0 - HOUR),
        ...over,
      });
    const page = async (path: string, title: string, over: Partial<Page> = {}) =>
      (
        await store.createPage(await fresh(), {
          siteId: site.id,
          path,
          title,
          locale: "en",
          status: "published",
          sections: [
            {
              id: `sec_${path.replace(/\W/g, "")}0000000`.slice(0, 20),
              kind: "richText",
              format: "markdown",
              body: "Our **newsroom** keeps a corrections policy. [Read it](/policy).",
            },
          ],
          ...over,
        })
      ).page;
    const find = (q: string, extra: { kinds?: SearchRow["kind"][] } = {}) =>
      store.search(site.id, q, { locale: "en", now, ...extra });
    const hits = async (q: string, extra = {}) =>
      (await find(q, extra)).hits.map(
        (h) => `${h.kind}:${h.href}${h.context ? ` (${h.context})` : ""}`,
      );

    it("finds pages by their sections and SEO description, not drafts or noindex pages", async () => {
      await page("/ethics", "Ethics", { seo: { description: "How the desk works" } });
      await page("/draft", "Ethics draft", { status: "draft" });
      await page("/hidden", "Ethics hidden", { seo: { noindex: true } });
      await publish();
      expect(await hits("ethics")).toEqual(["page:/ethics"]);
      expect(await hits("newsroom")).toEqual(["page:/ethics"]);
      expect(await hits("desk")).toEqual(["page:/ethics"]);
      expect(await hits("policy")).toEqual(["page:/ethics"]); // words, not the link's path
      expect(await hits("ethics", { kinds: ["article"] })).toEqual([]);
    });

    it("finds a term or author only while a visible article carries it", async () => {
      const culture = await term(category, "culture", "Culture");
      const empty = await term(category, "culinary", "Culinary");
      const ayse = await term(author, "ayse", "Ayşe Yılmaz", {
        labels: { en: { name: "Ayşe Yılmaz", role: "Culture editor" } },
      });
      await article(
        "museum",
        "A new museum",
        {
          category: { ids: [culture.id], primary: culture.id },
          author: { ids: [ayse.id], primary: ayse.id },
        },
        { availability: { from: iso(T0 + 2 * HOUR) } },
      );
      await publish();
      // the only article is embargoed: no archive lists it yet
      expect(await hits("cul")).toEqual([]);
      now = T0 + 3 * HOUR;
      expect(await hits("cul")).toEqual([
        "term:/category/culture (Category)",
        "author:/author/ayse (Author)",
      ]);
      expect(await hits("ayse")).toEqual(["author:/author/ayse (Author)"]);
      expect(await hits("culinary")).toEqual([]); // public, but nothing in its archive
      expect(await hits("culture", { kinds: ["author"] })).toEqual([
        "author:/author/ayse (Author)",
      ]);
      expect(empty.id).toBeTruthy();
    });

    it("follows term, taxonomy and article changes incrementally, like a full rebuild", async () => {
      const culture = await term(category, "culture", "Culture");
      const entry = await article("museum", "A new museum", {
        category: { ids: [culture.id], primary: culture.id },
      });
      await publish();
      await store.updateTerm({ ...culture, labels: { en: { name: "Arts" } } });
      await publish();
      expect(await hits("arts")).toEqual(["term:/category/culture (Category)"]);
      expect(await hits("culture")).toEqual([]);
      // an internal term has no archive: it leaves the index
      await store.setTermVisibility((await store.getTerm(culture.id)) as Term, "internal");
      await publish();
      expect(await hits("arts")).toEqual([]);
      await store.setTermVisibility((await store.getTerm(culture.id)) as Term, "public");
      // archives off for the whole taxonomy: every category row goes
      const tax = (await store.getTaxonomy(category.id)) as Taxonomy;
      await store.updateTaxonomy({
        ...tax,
        feed: false,
        archive: { ...tax.archive, enabled: false },
      });
      await publish();
      expect(await hits("arts")).toEqual([]);
      const back = (await store.getTaxonomy(category.id)) as Taxonomy;
      await store.updateTaxonomy({ ...back, archive: { ...back.archive, enabled: true } });
      await publish();
      expect(await hits("arts")).toEqual(["term:/category/culture (Category)"]);
      // the article leaves the archive: so does the term
      await store.deleteContentEntry((await store.getContentEntry(entry.id)) as ContentEntry);
      await publish();
      expect(await hits("arts")).toEqual([]);
      const incremental = (await find("news")).total;
      await store.refreshSearch(site.id, { full: true });
      expect((await find("news")).total).toBe(incremental);
    });

    it("answers from FTS5 when the store's provider fails", async () => {
      await page("/ethics", "Ethics");
      await publish();
      const errors: unknown[] = [];
      const failing: SearchProvider = {
        id: "broken",
        capabilities: { semantic: true, answer: false },
        search: () => Promise.reject(new Error("down")),
        sync: vi.fn(async () => {}),
      };
      store = new SiteGraphStore({
        sql,
        blobs,
        now: () => new Date(now),
        gates: GATES_ENFORCED,
        search: failing,
        onHookError: (e) => errors.push(e),
      });
      const r = await find("ethics");
      expect(r.provider).toBe("fts5");
      expect(r.hits.map((h) => h.href)).toEqual(["/ethics"]);
      expect(errors).toHaveLength(1);
      await page("/policy", "Policy");
      await publish();
      expect(failing.sync).toHaveBeenCalledTimes(1);
    });
  });
}

const row = (
  over: Partial<SearchRow> & Pick<SearchRow, "nodeId" | "kind" | "title">,
): SearchRow => ({
  locale: "en",
  summary: "",
  body: "",
  href: `/${over.nodeId}`,
  ...over,
});

/** Unit checks that need no database. */
export function searchProviderCases(): void {
  describe("RFC-0029 search rows and providers", () => {
    it("reads a page's sections as words, never ids, settings or addresses", () => {
      expect(
        sectionText([
          {
            id: "sec_1",
            kind: "hero",
            heading: "Welcome",
            subheading: "To **the** desk",
            cta: { label: "Start", href: "/start" },
          },
          {
            id: "sec_2",
            kind: "image",
            image: { src: "/m/a.jpg", alt: "The desk" },
            caption: "Night",
          },
          {
            id: "sec_3",
            kind: "surface",
            catalog: "cloudhal",
            components: [
              {
                id: "cta1",
                component: "Row",
                props: { gap: "s", align: "center" },
                children: ["b1"],
              },
              {
                id: "b1",
                component: "Button",
                props: { label: "Read more", href: "/more", variant: "primary" },
              },
              { id: "q1", component: "Quote", props: { text: "Facts first", cite: "Desk" } },
              {
                id: "s1",
                component: "Stat",
                props: { label: "Readers", value: { path: "/readers" } },
              },
              {
                id: "h1",
                component: "Heading",
                props: { text: { path: "/headline" } },
              },
              { id: "l1", component: "List", props: { items: ["Fast", "Fair"] } },
            ],
            data: { readers: "12,500" },
          },
          {
            id: "sec_4",
            kind: "component",
            type: "cards",
            props: {
              items: [
                { title: "One", href: "/one" },
                { title: "Two", url: "https://x.y" },
              ],
            },
          },
          { id: "sec_5", kind: "contentList", collection: "posts", limit: 3 },
        ]),
      ).toBe(
        "Welcome To the desk Start Night The desk Read more Facts first Desk Readers Fast Fair One Two",
      );
    });

    it("gives a public term one row per locale, with its taxonomy as context", () => {
      const taxonomy = {
        id: "tax_1",
        key: "author",
        labels: {
          en: { singular: "Author", plural: "Authors" },
          tr: { singular: "Yazar", plural: "Yazarlar" },
        },
        archive: { enabled: true, basePath: "/author" },
      } as unknown as Taxonomy;
      const ayse = {
        id: "term_1",
        slug: "ayse",
        status: "active",
        visibility: "public",
        labels: { en: { name: "Ayşe", role: "Editor", altNames: ["A. Y."] } },
      } as unknown as Term;
      expect(termSearchRows(taxonomy, ayse, ["en", "tr"])).toEqual([
        expect.objectContaining({
          locale: "en",
          kind: "author",
          title: "Ayşe",
          summary: "Editor A. Y.",
          href: "/author/ayse",
          context: "Author",
        }),
        expect.objectContaining({ locale: "tr", title: "Ayşe", context: "Yazar" }),
      ]);
      expect(termSearchRows(taxonomy, { ...ayse, status: "proposed" } as Term, ["en"])).toEqual([]);
      // RFC-0033: each locale's row links to the archive under that locale's slug
      const named = {
        ...ayse,
        labels: { ...ayse.labels, tr: { name: "Ayşe", slug: "ayse-hanim" } },
      };
      expect(termSearchRows(taxonomy, named as Term, ["en", "tr"]).map((r) => r.href)).toEqual([
        "/author/ayse",
        "/author/ayse-hanim",
      ]);
    });

    it("searches rows in memory by the index's rules", () => {
      const rows = [
        row({ nodeId: "a1", kind: "article", title: "Museum night", terms: ["t1"] }),
        row({
          nodeId: "a2",
          kind: "article",
          title: "Later",
          terms: ["t2"],
          gateFrom: iso(T0 + HOUR),
        }),
        row({ nodeId: "t1", kind: "term", title: "Museums", context: "Category" }),
        row({ nodeId: "t2", kind: "term", title: "Museology" }),
        row({ nodeId: "p1", kind: "page", title: "Visit the museum" }),
      ];
      const ids = (r: SearchResults) => r.hits.map((h) => h.nodeId);
      expect(ids(searchRows(rows, "muse", { locale: "en", now: T0 }))).toEqual(["a1", "t1", "p1"]);
      expect(ids(searchRows(rows, "muse", { locale: "en", now: T0 + 2 * HOUR }))).toEqual([
        "a1",
        "t1",
        "t2",
        "p1",
      ]);
      expect(ids(searchRows(rows, "muse", { locale: "en", now: T0, kinds: ["page"] }))).toEqual([
        "p1",
      ]);
      expect(searchRows(rows, "muse", { locale: "en", now: T0 }).hits[1]).toMatchObject({
        kind: "term",
        context: "Category",
      });
    });

    it("falls back when a provider fails or is slow, and reports why", async () => {
      const fallback = memoryProvider(() => [row({ nodeId: "p1", kind: "page", title: "Ethics" })]);
      const errors: unknown[] = [];
      const slow: SearchProvider = {
        id: "slow",
        capabilities: { semantic: true, answer: false },
        search: () => new Promise(() => {}),
      };
      const wrapped = withFallback(slow, fallback, {
        timeoutMs: 20,
        onError: (e) => errors.push(e),
      });
      const r = await wrapped.search({ siteId: "site_1", query: "ethics", locale: "en", now: T0 });
      expect(r).toMatchObject({ provider: "memory", total: 1 });
      expect(String(errors[0])).toContain("took over 20 ms");
      expect(wrapped.id).toBe("slow");
    });
  });
}
