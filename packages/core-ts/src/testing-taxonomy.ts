/**
 * RFC-0002 behavioural suite (taxonomy, terms, governance, redirects, filters, migration). Called by
 * `describeSiteGraphStore`, so it runs on every storage backend (better-sqlite3 and Miniflare D1).
 * Test names cite the invariant(s) of RFC-0002 §3 they prove.
 */
import type { Actor, ContentEntry, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver, SqlStatement, SqlValue } from "@cloudhal/storage";
import { describe, expect, it } from "vitest";
import { ConflictError, InvariantError, UniqueConstraintError } from "./errors.ts";
import { FilterError, matches, parseFilter, resolveFilter } from "./filter.ts";
import { insertNodeStatement } from "./node-sql.ts";
import { NODE_KINDS, uniquenessKey } from "./nodes.ts";
import type { SiteGraphStore } from "./store.ts";

export interface SuiteContext {
  store(): SiteGraphStore;
  sql(): SqlDriver;
  blobs(): BlobStore;
  /** A second store over the same storage whose first node write first runs `hook` (a concurrent writer). */
  racing(hook: () => Promise<void>, when?: (sql: string) => boolean): SiteGraphStore;
}

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const robot: Actor = { kind: "agent", id: "agent_01HZX8K3Q9YZ", name: "Newsroom Agent" };

const isNodeWrite = (q: string) =>
  /^\s*(INSERT INTO nodes|UPDATE nodes|DELETE FROM nodes)/i.test(q);

/** A driver whose first matching write runs `hook` before it (a writer that got in first). */
export function racingDriver(
  sql: SqlDriver,
  hook: () => Promise<void>,
  when: (q: string) => boolean = isNodeWrite,
): SqlDriver {
  let fired = false;
  const fire = async (qs: string[]) => {
    if (!fired && qs.some(when)) {
      fired = true;
      await hook();
    }
  };
  return {
    name: `${sql.name}+race`,
    get: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) =>
      sql.get<T>(q, p),
    all: <T extends Record<string, unknown>>(q: string, p?: readonly SqlValue[]) =>
      sql.all<T>(q, p),
    run: async (q: string, p?: readonly SqlValue[]) => {
      await fire([q]);
      return sql.run(q, p);
    },
    batch: async (s: readonly SqlStatement[]) => {
      await fire(s.map((x) => x.sql));
      return sql.batch(s);
    },
    exec: (q: string) => sql.exec(q),
    close: async () => {},
  };
}

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

export function taxonomySuite(ctx: SuiteContext): void {
  describe("RFC-0002 taxonomy and redirects", () => {
    interface World {
      site: Site;
      category: Taxonomy;
      tag: Taxonomy;
      news: Term;
      world: Term;
      tech: Term;
      ai: Term;
      llm: Term;
    }

    async function setup(): Promise<World> {
      const store = ctx.store();
      const project = await store.createProject({
        name: "Tax",
        slug: "tax",
        ownerId: person.id,
        siteIds: [],
      });
      let site = await store.createSite({
        projectId: project.id,
        name: "Haber",
        slug: "haber",
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      ({ site } = await store.createPage(site, {
        siteId: site.id,
        path: "/about",
        title: "About",
        locale: "en",
        status: "published",
        sections: [],
      }));
      const [category, tag] = (await store.createDefaultTaxonomies(site)) as [Taxonomy, Taxonomy];
      const term = (taxonomyId: string, slug: string, name: string, extra: Partial<Term> = {}) =>
        store.createTerm({
          siteId: site.id,
          taxonomyId,
          slug,
          status: "active",
          visibility: "public",
          labels: { en: { name } },
          ...extra,
        });
      const news = await term(category.id, "news", "News", { position: 1 });
      const world = await term(category.id, "world", "World", { parentId: news.id });
      const tech = await term(category.id, "tech", "Tech", { position: 0 });
      const ai = await term(tag.id, "ai", "AI");
      const llm = await term(tag.id, "llm", "LLM");
      return { site, category, tag, news, world, tech, ai, llm };
    }

    let n = 0;
    function entry(w: World, overrides: Partial<ContentEntry> = {}) {
      n++;
      return ctx.store().createContentEntry({
        siteId: w.site.id,
        collection: "posts",
        slug: `post-${n}`,
        locale: "en",
        status: "draft",
        title: `Post ${n}`,
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
        ...overrides,
      } as never);
    }
    const cat = (...ids: string[]) => ({
      category: { ids: ids as [string, ...string[]], primary: ids[0] as string },
    });

    it("invariant 15: node kinds are explicit — registry, prefixes, keys and snapshot refs", async () => {
      const w = await setup();
      const store = ctx.store();
      expect(NODE_KINDS).toEqual([
        "site",
        "page",
        "contentEntry",
        "taxonomy",
        "term",
        "redirect",
        "menu",
      ]);
      expect(w.category.id).toMatch(/^tax_/);
      expect(w.news.id).toMatch(/^term_/);
      expect(uniquenessKey("taxonomy", w.category)).toBe("category");
      expect(uniquenessKey("term", w.news)).toBe(`${w.category.id}:news`);
      const r = await store.createRedirect({
        siteId: w.site.id,
        from: "/old",
        to: "/about",
        status: 301,
        match: "exact",
        reason: "manual",
      });
      expect(r.id).toMatch(/^redir_/);
      expect(uniquenessKey("redirect", r)).toBe("/old");
      const rows = await ctx
        .sql()
        .all<{ kind: string; key: string }>(
          "SELECT kind, key FROM nodes WHERE site_id = ? AND kind IN ('taxonomy', 'term', 'redirect') ORDER BY kind, key",
          [w.site.id],
        );
      expect(rows.map((x) => x.kind)).toEqual([
        "redirect",
        "taxonomy",
        "taxonomy",
        "term",
        "term",
        "term",
        "term",
        "term",
      ]);
      const snap = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      expect(new Set(snap.nodes.map((x) => x.kind))).toEqual(
        new Set(["site", "page", "taxonomy", "term", "redirect"]),
      );
      expect(
        await store.readSnapshotNode<Term>(snap.nodes.find((x) => x.id === w.news.id) as never),
      ).toEqual(w.news);
    });

    it("§1 + invariant 7: default taxonomies follow the table; keys are unique, immutable and not reserved", async () => {
      const w = await setup();
      const store = ctx.store();
      expect(w.category).toMatchObject({
        key: "category",
        hierarchical: true,
        allowNewTerms: "none",
        required: true,
        maxPerEntry: 3,
        archive: { enabled: true, basePath: "/category" },
        feed: true,
        minEntriesToIndex: 3,
        labels: {
          en: { singular: "Category", plural: "Categories" },
          tr: { singular: "Kategori" },
        },
      });
      expect(w.tag).toMatchObject({
        key: "tag",
        hierarchical: false,
        allowNewTerms: "propose",
        required: false,
        maxPerEntry: 10,
      });
      // idempotent
      expect((await store.createDefaultTaxonomies(w.site)).map((t) => t.id)).toEqual([
        w.category.id,
        w.tag.id,
      ]);
      expect((await store.listTaxonomies(w.site.id)).length).toBe(2);
      const base = {
        siteId: w.site.id,
        labels: { en: { singular: "Series", plural: "Series" } },
        hierarchical: false,
        allowNewTerms: "none" as const,
        required: false,
        archive: { enabled: true, basePath: "/series" },
        feed: true,
        minEntriesToIndex: 3,
      };
      expect(await code(store.createTaxonomy({ ...base, key: "status" }))).toBe("reserved_key");
      expect(await code(store.createTaxonomy({ ...base, key: "primary" }))).toBe("reserved_key");
      expect(
        await rejects(
          store.createTaxonomy({ ...base, key: "tag", archive: { enabled: true, basePath: "/x" } }),
        ),
      ).toBeInstanceOf(UniqueConstraintError);
      expect(
        await code(
          store.createTaxonomy({
            ...base,
            key: "series",
            labels: { tr: { singular: "Dizi", plural: "Diziler" } },
          }),
        ),
      ).toBe("invalid_labels");
      const series = await store.createTaxonomy({ ...base, key: "series" });
      expect(await code(store.updateTaxonomy({ ...series, key: "serial" }))).toBe("reserved_key");
      expect(await store.getTaxonomyByKey(w.site.id, "series")).toEqual(series);
      const renamed = await store.updateTaxonomy({
        ...series,
        labels: { en: { singular: "Run", plural: "Runs" } },
      });
      expect(renamed.rev).toBe(1);
      expect(await rejects(store.updateTaxonomy(series))).toBeInstanceOf(ConflictError);
    });

    it("invariant 13: archive paths never collide with pages, collections or each other; feeds need archives", async () => {
      const w = await setup();
      const store = ctx.store();
      const site = (await store.getSite(w.site.id)) as Site;
      const page = (path: string) =>
        store.createPage(site, {
          siteId: site.id,
          path,
          title: "P",
          locale: "en",
          status: "draft",
          sections: [],
        });
      expect(await code(page("/tag"))).toBe("path_conflict");
      expect(await code(page("/category/news"))).toBe("path_conflict");
      expect((await store.getSite(site.id))?.rev).toBe(site.rev);
      const { page: tagsPage } = await page("/tags");
      expect(await code(store.updatePage({ ...tagsPage, path: "/tag/x" }))).toBe("path_conflict");
      await entry(w, { collection: "notes" });
      const base = {
        siteId: w.site.id,
        key: "series",
        labels: { en: { singular: "Series", plural: "Series" } },
        hierarchical: false,
        allowNewTerms: "none" as const,
        required: false,
        feed: false,
        minEntriesToIndex: 3,
      };
      for (const basePath of ["/about", "/notes", "/notes/series", "/tag/series", "/category"])
        expect(
          await code(store.createTaxonomy({ ...base, archive: { enabled: true, basePath } })),
          basePath,
        ).toBe("path_conflict");
      expect(
        await code(
          store.createTaxonomy({
            ...base,
            feed: true,
            archive: { enabled: false, basePath: "/series" },
          }),
        ),
      ).toBe("path_conflict");
      // a disabled archive may sit above a page, but still never shares a base path
      const off = await store.createTaxonomy({
        ...base,
        archive: { enabled: false, basePath: "/tags" },
      });
      expect(
        await code(store.updateTaxonomy({ ...off, archive: { enabled: true, basePath: "/tags" } })),
      ).toBe("path_conflict");
      // an entry collection may not live under an archive either
      expect(await code(entry(w, { collection: "category" }))).toBe("path_conflict");
    });

    it("invariants 8, 11, 12: slugs incl. history are unique, proposed terms need permission, labels and synonyms are checked", async () => {
      const w = await setup();
      const store = ctx.store();
      const t = (slug: string, extra: Partial<Term> = {}) =>
        store.createTerm({
          siteId: w.site.id,
          taxonomyId: w.tag.id,
          slug,
          status: "active",
          visibility: "public",
          labels: { en: { name: slug.toUpperCase() } },
          ...extra,
        });
      expect(await code(t("ai"))).toBe("slug_taken");
      expect(
        await code(
          store.createTerm({
            ...w.news,
            id: undefined,
            slug: "breaking",
            status: "proposed",
          } as never),
        ),
      ).toBe("not_allowed");
      const proposed = await t("rust", { status: "proposed", proposedBy: robot });
      expect(proposed.status).toBe("proposed");
      expect(await code(t("go", { labels: { tr: { name: "Go" } } }))).toBe("invalid_labels");
      expect(await code(t("ml", { labels: { en: { name: "ML", altNames: ["A.I"] } } }))).toBe(
        "invalid_labels",
      );
      expect(await code(t("ml", { labels: { en: { name: "ML", altNames: ["llm"] } } }))).toBe(
        "invalid_labels",
      );
      expect(await code(t("ml", { status: "retired" }))).toBe("invalid_status");
      expect(await code(t("ml", { slugHistory: ["x"] }))).toBe("immutable_field");
      expect(await code(store.updateTerm({ ...w.ai, slug: "a-i" }))).toBe("immutable_field");
      const relabelled = await store.updateTerm({
        ...w.ai,
        labels: { en: { name: "AI", altNames: ["Artificial intelligence"] } },
      });
      expect(relabelled.rev).toBe(1);

      // a renamed term keeps its old slug reserved; a person may reclaim it
      const renamed = await store.renameTerm(relabelled, "artificial-intelligence");
      expect(renamed.redirects.map((r) => r.from)).toEqual(["/tag/ai"]);
      expect(await code(t("ai"))).toBe("slug_taken");
      const fresh = await store.createTerm(
        {
          siteId: w.site.id,
          taxonomyId: w.tag.id,
          slug: "ai",
          status: "active",
          visibility: "public",
          labels: { en: { name: "Adobe Illustrator" } },
        },
        { reclaim: true },
      );
      expect(fresh.slug).toBe("ai");
      expect((await store.getTerm(w.ai.id))?.slugHistory).toBeUndefined();
      expect(await store.redirectFor(w.site.id, "/tag/ai")).toBeUndefined();
      expect((await store.getTermBySlug(w.site.id, "tag", "ai"))?.id).toBe(fresh.id);
      // renaming onto a reserved slug needs the same reclaim
      await store.renameTerm(w.llm, "large-language-model");
      expect(await code(store.renameTerm(fresh, "llm"))).toBe("slug_taken");
      const moved = await store.renameTerm(fresh, "llm", { reclaim: true });
      expect(moved.terms.map((t) => [t.id, t.slug]).reverse()).toEqual([
        [w.llm.id, "large-language-model"],
        [fresh.id, "llm"],
      ]);
      expect((await store.getTerm(w.llm.id))?.slugHistory).toBeUndefined();
      expect(moved.redirects.map((r) => [r.from, r.to])).toEqual([["/tag/ai", "/tag/llm"]]);
      expect((await store.redirectFor(w.site.id, "/tag/llm"))?.location).toBeUndefined();
    });

    it("invariant 9: parents only in hierarchical taxonomies, never retired, no cycles, at most 5 levels", async () => {
      const w = await setup();
      const store = ctx.store();
      expect(
        await code(
          store.createTerm({
            ...w.ai,
            id: undefined,
            slug: "child",
            labels: { en: { name: "Child" } },
            parentId: w.llm.id,
          } as never),
        ),
      ).toBe("invalid_parent");
      expect(await code(store.setTermParent(w.news, w.world.id))).toBe("cycle");
      expect(await code(store.setTermParent(w.news, w.news.id))).toBe("cycle");
      let parent = w.world; // depth 2
      for (const slug of ["l3", "l4", "l5"])
        parent = await store.createTerm({
          siteId: w.site.id,
          taxonomyId: w.category.id,
          slug,
          status: "active",
          visibility: "public",
          labels: { en: { name: slug } },
          parentId: parent.id,
        });
      expect(
        await code(
          store.createTerm({
            ...parent,
            id: undefined,
            slug: "l6",
            labels: { en: { name: "l6" } },
            parentId: parent.id,
          } as never),
        ),
      ).toBe("too_deep");
      // moving a 2-level subtree (news → world → …) under tech would be 6 deep
      expect(await code(store.setTermParent(w.news, w.tech.id))).toBe("too_deep");
      const moved = await store.setTermParent(w.world, w.tech.id);
      expect(moved.terms[0]?.parentId).toBe(w.tech.id);
      const root = await store.setTermParent(moved.terms[0] as Term, null);
      expect(root.terms[0]?.parentId).toBeUndefined();
      expect((await store.setTermParent(root.terms[0] as Term, null)).terms).toEqual([]);
      const listed = await store.listTerms(w.site.id, { taxonomy: "category", parentId: null });
      expect(listed.map((t) => t.slug)).toEqual(["tech", "news", "world"]);
    });

    it("invariants 9 + 16: two concurrent setTermParent calls cannot build a cycle", async () => {
      const w = await setup();
      const store = ctx.store();
      // tech → news commits while the racing store moves news → tech on what it read before.
      const racing = ctx.racing(async () => {
        await store.setTermParent(w.tech, w.news.id);
      });
      // The racing store's own checks passed on what it read; its batch's assertion (tech unchanged)
      // failed, and the diagnosis names the cycle the concurrent move would have closed.
      const e = await rejects(racing.setTermParent(w.news, w.tech.id));
      expect((e as InvariantError).code).toBe("cycle");
      const [news, tech] = [await store.getTerm(w.news.id), await store.getTerm(w.tech.id)];
      expect(tech?.parentId).toBe(w.news.id);
      expect(news?.parentId).toBeUndefined();
      expect(news?.rev).toBe(w.news.rev);
    });

    it("invariants 1–6: every entry write checks primary, required, taxonomy, status and limits, and is canonical", async () => {
      const w = await setup();
      const store = ctx.store();
      expect(
        await code(entry(w, { terms: { category: { ids: [w.news.id], primary: w.tech.id } } })),
      ).toBe("primary_not_assigned");
      expect(await code(entry(w, { status: "published" }))).toBe("required_term");
      expect(
        await code(entry(w, { status: "review", terms: { category: { ids: [w.news.id] } } })),
      ).toBe("required_term");
      expect(await code(entry(w, { terms: { category: { ids: [w.ai.id] } } }))).toBe(
        "invalid_assignment",
      );
      expect(await code(entry(w, { terms: { series: { ids: [w.ai.id] } } }))).toBe(
        "invalid_assignment",
      );
      expect(await code(entry(w, { terms: { category: { ids: ["term_doesnotexist"] } } }))).toBe(
        "invalid_assignment",
      );
      const four = await store.createTerm({
        ...w.tech,
        id: undefined,
        slug: "sport",
        labels: { en: { name: "Sport" } },
      } as never);
      expect(
        await code(
          entry(w, { terms: { category: { ids: [w.news.id, w.world.id, w.tech.id, four.id] } } }),
        ),
      ).toBe("too_many_terms");
      // collections: a taxonomy restricted to notes does not apply to posts
      const series = await store.createTaxonomy({
        siteId: w.site.id,
        key: "series",
        labels: { en: { singular: "Series", plural: "Series" } },
        hierarchical: false,
        allowNewTerms: "none",
        required: false,
        maxPerEntry: 50,
        collections: ["notes"],
        archive: { enabled: false, basePath: "/series" },
        feed: false,
        minEntriesToIndex: 3,
      });
      const s1 = await store.createTerm({
        siteId: w.site.id,
        taxonomyId: series.id,
        slug: "s1",
        status: "active",
        visibility: "public",
        labels: { en: { name: "S1" } },
      });
      expect(await code(entry(w, { terms: { series: { ids: [s1.id] } } }))).toBe(
        "invalid_assignment",
      );
      expect(
        (await entry(w, { collection: "notes", terms: { series: { ids: [s1.id] } } })).terms?.series
          ?.ids,
      ).toEqual([s1.id]);
      // at most 60 term ids per entry across taxonomies
      const many: string[] = [s1.id];
      for (let i = 2; i <= 50; i++)
        many.push(
          (
            await store.createTerm({
              siteId: w.site.id,
              taxonomyId: series.id,
              slug: `s${i}`,
              status: "active",
              visibility: "public",
              labels: { en: { name: `S${i}` } },
            })
          ).id,
        );
      const tags: string[] = [w.ai.id, w.llm.id];
      for (let i = 0; i < 8; i++)
        tags.push(
          (
            await store.createTerm({
              ...w.ai,
              id: undefined,
              slug: `t${i}`,
              labels: { en: { name: `T${i}` } },
            } as never)
          ).id,
        );
      await store.updateTaxonomy({ ...series, collections: ["notes", "posts"] });
      expect(
        await code(
          entry(w, {
            terms: {
              series: { ids: many as never },
              tag: { ids: tags as never },
              category: { ids: [w.news.id], primary: w.news.id },
            },
          }),
        ),
      ).toBe("too_many_terms");
      // canonical form: empty assignments vanish, tags are written as []
      const draft = await entry(w, {
        terms: { tag: { ids: [] as never }, category: { ids: [w.news.id], primary: w.news.id } },
        tags: [],
      });
      expect(draft.terms).toEqual({ category: { ids: [w.news.id], primary: w.news.id } });
      const emptied = await store.updateContentEntry({
        ...draft,
        terms: { category: { ids: [] as never } },
      });
      expect(emptied.terms).toBeUndefined();
      expect(emptied.tags).toEqual([]);
      // a published entry with a primary category is fine; drafts may be incomplete
      const ok = await entry(w, { status: "published", terms: cat(w.news.id) });
      expect(ok.publishedAt).toBe(ok.updatedAt);
      // retired terms cannot be assigned
      await store.retireTerm(w.llm);
      expect(await code(entry(w, { terms: { tag: { ids: [w.llm.id] } } }))).toBe(
        "term_not_assignable",
      );
    });

    it("invariant 4: an entry write conflicts when a term it assigns is merged before the write lands", async () => {
      const w = await setup();
      const store = ctx.store();
      const racing = ctx.racing(async () => {
        await store.mergeTerms(
          [(await store.getTerm(w.llm.id)) as Term],
          (await store.getTerm(w.ai.id)) as Term,
        );
      });
      const e = await rejects(
        racing.createContentEntry({
          siteId: w.site.id,
          collection: "posts",
          slug: "racing",
          locale: "en",
          status: "draft",
          title: "Racing",
          body: { format: "markdown", value: "x" },
          fields: {},
          tags: [],
          terms: { tag: { ids: [w.llm.id] } },
          author: person,
        }),
      );
      expect(e).toBeInstanceOf(InvariantError);
      expect((e as InvariantError).code).toBe("term_not_assignable");
      expect(await store.listContentEntries(w.site.id)).toEqual([]);
    });

    it("invariant 16: a merge conflicts (and changes nothing) when an entry write lands between its read and its batch", async () => {
      const w = await setup();
      const store = ctx.store();
      const e1 = await entry(w, { terms: { tag: { ids: [w.llm.id] } } });
      // 1. an entry that already used the source is edited concurrently
      let racing = ctx.racing(async () => {
        await store.updateContentEntry({ ...e1, title: "Edited meanwhile" });
      });
      let e = await rejects(racing.mergeTerms([w.llm], w.ai));
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as ConflictError).id).toBe(e1.id);
      // 2. a new entry starts using the source concurrently
      racing = ctx.racing(async () => {
        await entry(w, { slug: "late", terms: { tag: { ids: [w.llm.id] } } });
      });
      e = await rejects(racing.mergeTerms([w.llm], w.ai));
      expect(e).toBeInstanceOf(ConflictError);
      expect((await store.getTerm(w.llm.id))?.status).toBe("active");
      expect((await store.getTerm(w.ai.id))?.rev).toBe(w.ai.rev);
      expect(await store.listRedirects(w.site.id)).toEqual([]);
      const usage = await store.termUsage(w.site.id, "tag");
      expect(usage.get(w.llm.id)?.total).toBe(2);
      // with fresh reads the merge goes through
      const done = await store.mergeTerms(
        [(await store.getTerm(w.llm.id)) as Term],
        (await store.getTerm(w.ai.id)) as Term,
      );
      expect(done.entries).toBe(2);
    });

    it("rename: one changed term plus redirects, no entry changes; chains collapse; renaming back removes the redirect", async () => {
      const w = await setup();
      const store = ctx.store();
      const e1 = await entry(w, {
        status: "published",
        terms: { ...cat(w.news.id), tag: { ids: [w.ai.id] } },
      });
      const s0 = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      const r1 = await store.renameTerm(w.ai, "artificial-intelligence");
      expect(r1.entries).toBe(0);
      expect(r1.terms.map((t) => [t.id, t.slug, t.slugHistory])).toEqual([
        [w.ai.id, "artificial-intelligence", ["ai"]],
      ]);
      expect(r1.redirects).toEqual([
        expect.objectContaining({
          from: "/tag/ai",
          to: "/tag/artificial-intelligence",
          status: 301,
          match: "prefix",
          reason: "slug-change",
          source: { kind: "term", id: w.ai.id },
        }),
      ]);
      const s1 = await store.createSnapshot(w.site.id, {
        actor: person,
        reason: "manual",
        label: "rename_term by Halil",
      });
      const diff = await store.diffSnapshots(s0.id, s1.id);
      expect(diff.changed.map((c) => c.after.id)).toEqual([w.ai.id]);
      expect(diff.added.map((a) => a.kind)).toEqual(["redirect"]);
      expect(diff.removed).toEqual([]);
      expect((await store.getContentEntry(e1.id))?.rev).toBe(e1.rev);
      expect((await store.getTermBySlug(w.site.id, "tag", "ai"))?.id).toBe(w.ai.id);
      expect((await store.redirectFor(w.site.id, "/tag/ai/page/2"))?.location).toBe(
        "/tag/artificial-intelligence/page/2",
      );
      expect((await store.redirectFor(w.site.id, "/tag/ai/rss.xml"))?.location).toBe(
        "/tag/artificial-intelligence/rss.xml",
      );
      // chains collapse onto the newest slug
      const r2 = await store.renameTerm(r1.terms[0] as Term, "a-i");
      expect(r2.terms[0]?.slugHistory).toEqual(["ai", "artificial-intelligence"]);
      expect((await store.listRedirects(w.site.id)).map((r) => [r.from, r.to])).toEqual([
        ["/tag/ai", "/tag/a-i"],
        ["/tag/artificial-intelligence", "/tag/a-i"],
      ]);
      // renaming back frees the path again and drops the self-redirect
      const r3 = await store.renameTerm(r2.terms[0] as Term, "ai");
      expect(r3.terms[0]?.slugHistory).toEqual(["artificial-intelligence", "a-i"]);
      expect((await store.listRedirects(w.site.id)).map((r) => [r.from, r.to])).toEqual([
        ["/tag/a-i", "/tag/ai"],
        ["/tag/artificial-intelligence", "/tag/ai"],
      ]);
      expect(await store.redirectFor(w.site.id, "/tag/ai")).toBeUndefined();
      // renaming to another term's slug or history is refused; a proposed term leaves no redirect
      expect(await code(store.renameTerm(r3.terms[0] as Term, "llm"))).toBe("slug_taken");
      const p = await store.createTerm({
        ...w.llm,
        id: undefined,
        slug: "draft-tag",
        status: "proposed",
        labels: { en: { name: "Draft tag" } },
      } as never);
      expect((await store.renameTerm(p, "drafted")).redirects).toEqual([]);
    });

    it("merge (invariant 10): re-points entries, primaries, synonyms, slug history, children, earlier merges and redirects", async () => {
      const w = await setup();
      const store = ctx.store();
      const llms = await store.createTerm({
        siteId: w.site.id,
        taxonomyId: w.tag.id,
        slug: "llms",
        status: "active",
        visibility: "public",
        labels: {
          en: { name: "LLMs", altNames: ["Large language models"] },
          tr: { name: "Büyük dil modelleri" },
        },
      });
      const gpt = await store.createTerm({
        ...w.ai,
        id: undefined,
        slug: "gpt",
        labels: { en: { name: "GPT" } },
      } as never);
      await store.mergeTerms([gpt], llms); // an earlier merge into the source
      const e1 = await entry(w, {
        terms: {
          tag: { ids: [(await store.getTerm(llms.id))?.id as string, w.ai.id], primary: llms.id },
        },
      });
      const e2 = await entry(w, { terms: { tag: { ids: [w.llm.id, llms.id] } } });
      const e3 = await entry(w, { terms: { tag: { ids: [w.ai.id] } } });
      const manual = await store.createRedirect({
        siteId: w.site.id,
        from: "/models",
        to: "/tag/llms?ref=menu",
        status: 302,
        match: "exact",
        reason: "manual",
      });
      const s0 = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      const src = (await store.getTerm(llms.id)) as Term;
      const r = await store.mergeTerms([src], w.llm);
      expect(r.entries).toBe(2);
      const after = {
        src: (await store.getTerm(llms.id)) as Term,
        tgt: (await store.getTerm(w.llm.id)) as Term,
        gpt: (await store.getTerm(gpt.id)) as Term,
      };
      expect(after.src).toMatchObject({ status: "retired", mergedInto: w.llm.id });
      expect(after.gpt.mergedInto).toBe(w.llm.id);
      // names in locales the target lacks join its default-locale synonyms
      expect(after.tgt.labels.en?.altNames).toEqual([
        "LLMs",
        "Large language models",
        "GPT",
        "Büyük dil modelleri",
      ]);
      expect(after.tgt.labels.tr).toBeUndefined();
      expect(after.tgt.slugHistory).toEqual(expect.arrayContaining(["llms", "gpt"]));
      expect((await store.getContentEntry(e1.id))?.terms?.tag).toEqual({
        ids: [w.llm.id, w.ai.id],
        primary: w.llm.id,
      });
      expect((await store.getContentEntry(e2.id))?.terms?.tag).toEqual({ ids: [w.llm.id] });
      expect((await store.getContentEntry(e3.id))?.rev).toBe(e3.rev);
      const redirects = await store.listRedirects(w.site.id);
      expect(redirects.map((x) => [x.from, x.to, x.reason])).toEqual([
        ["/models", "/tag/llm?ref=menu", "manual"],
        ["/tag/gpt", "/tag/llm", "merge"],
        ["/tag/llms", "/tag/llm", "merge"],
      ]);
      expect((await store.getRedirect(manual.id))?.rev).toBe(1);
      // names and slugs of the merged term still resolve to the target
      const res = await store.resolveTerms(w.site.id, "tag", [
        "llms",
        "Large Language Models",
        "Büyük dil modelleri",
        "gpt",
      ]);
      expect(res.map((x) => (x.matched ? x.termId : x.reason))).toEqual([
        w.llm.id,
        w.llm.id,
        w.llm.id,
        w.llm.id,
      ]);
      // one snapshot covers the whole operation
      const s1 = await store.createSnapshot(w.site.id, { actor: person, reason: "manual" });
      const diff = await store.diffSnapshots(s0.id, s1.id);
      expect(diff.changed.map((c) => c.after.kind).sort()).toEqual([
        "contentEntry",
        "contentEntry",
        "redirect",
        "redirect",
        "term",
        "term",
        "term",
      ]);
      expect(diff.added.map((a) => a.kind)).toEqual(["redirect"]);
      // hierarchical: children of the source move under the target; refuse merging into a descendant
      const sub = await store.createTerm({
        ...w.tech,
        id: undefined,
        slug: "gadgets",
        parentId: w.tech.id,
        labels: { en: { name: "Gadgets" } },
      } as never);
      expect(
        await code(store.mergeTerms([w.news], (await store.getTerm(w.world.id)) as Term)),
      ).toBe("cycle");
      const m = await store.mergeTerms(
        [(await store.getTerm(w.tech.id)) as Term],
        (await store.getTerm(w.news.id)) as Term,
      );
      expect(m.terms.find((t) => t.id === sub.id)?.parentId).toBe(w.news.id);
      expect(await code(store.mergeTerms([w.ai], after.src))).toBe("invalid_status");
      expect(await code(store.mergeTerms([w.ai], (await store.getTerm(w.news.id)) as Term))).toBe(
        "invalid_assignment",
      );
    });

    it("retire: with redirectTo, to a public parent, without a redirect, and never orphaning a required primary", async () => {
      const w = await setup();
      const store = ctx.store();
      const e1 = await entry(w, { terms: { tag: { ids: [w.ai.id] } } });
      const e2 = await entry(w, { terms: { tag: { ids: [w.ai.id, w.llm.id], primary: w.ai.id } } });
      // without a redirect: removed from entries, no redirect (the archive answers 410)
      const r1 = await store.retireTerm(w.ai);
      expect(r1).toMatchObject({ entries: 2, redirects: [] });
      expect((await store.getContentEntry(e1.id))?.terms).toBeUndefined();
      expect((await store.getContentEntry(e2.id))?.terms?.tag).toEqual({ ids: [w.llm.id] });
      expect((await store.getTerm(w.ai.id))?.status).toBe("retired");
      expect(await store.redirectFor(w.site.id, "/tag/ai")).toBeUndefined();
      // with redirectTo
      const ml = await store.createTerm({
        ...w.llm,
        id: undefined,
        slug: "ml",
        labels: { en: { name: "ML" } },
      } as never);
      const r2 = await store.retireTerm(ml, { redirectTo: w.llm });
      expect(r2.redirects.map((r) => [r.from, r.to, r.reason, r.match])).toEqual([
        ["/tag/ml", "/tag/llm", "retire", "prefix"],
      ]);
      expect(
        await code(store.retireTerm(w.llm, { redirectTo: (await store.getTerm(ml.id)) as Term })),
      ).toBe("invalid_status");
      // hierarchical: a public parent takes the redirect and the children
      const europe = await store.createTerm({
        ...w.world,
        id: undefined,
        slug: "europe",
        parentId: w.world.id,
        labels: { en: { name: "Europe" } },
      } as never);
      const r3 = await store.retireTerm(w.world);
      expect(r3.redirects.map((r) => [r.from, r.to])).toEqual([
        ["/category/world", "/category/news"],
      ]);
      expect((await store.getTerm(europe.id))?.parentId).toBe(w.news.id);
      // a published entry's primary category is never removed by a retire
      const pub = await entry(w, { status: "published", terms: cat(w.tech.id) });
      const e = await rejects(store.retireTerm(w.tech));
      expect((e as InvariantError).code).toBe("required_term");
      expect((e as InvariantError).details).toMatchObject({ entries: [pub.id], count: 1 });
      expect((await store.getTerm(w.tech.id))?.status).toBe("active");
    });

    it("governance refuses operations over 400 entries with too_large and changes nothing", async () => {
      const w = await setup();
      const store = ctx.store();
      const ts = "2026-10-08T00:00:00.000Z";
      const statements: SqlStatement[] = [];
      for (let i = 0; i < 401; i++) {
        const body: ContentEntry = {
          schemaVersion: 1,
          id: `entry_bulk${String(i).padStart(6, "0")}`,
          siteId: w.site.id,
          collection: "posts",
          slug: `bulk-${i}`,
          locale: "en",
          status: "draft",
          title: `Bulk ${i}`,
          body: { format: "markdown", value: "x" },
          fields: {},
          tags: [],
          terms: { tag: { ids: [w.ai.id] } },
          author: person,
          rev: 0,
          createdAt: ts,
          updatedAt: ts,
        };
        statements.push(await insertNodeStatement("contentEntry", body, ts));
      }
      await ctx.sql().batch(statements);
      for (const op of [() => store.mergeTerms([w.ai], w.llm), () => store.retireTerm(w.ai)]) {
        const e = await rejects(op());
        expect((e as InvariantError).code).toBe("too_large");
        expect((e as InvariantError).details).toMatchObject({ entries: 401, limit: 400 });
      }
      expect((await store.getTerm(w.ai.id))?.rev).toBe(w.ai.rev);
      expect((await store.termUsage(w.site.id, "tag")).get(w.ai.id)).toMatchObject({
        total: 401,
        published: 0,
      });
    });

    it("§4.5: published entry slug changes and published page path changes leave redirects; chains collapse; renaming back", async () => {
      const w = await setup();
      const store = ctx.store();
      let e = await entry(w, { slug: "a", status: "published", terms: cat(w.news.id) });
      e = await store.updateContentEntry({ ...e, slug: "b" });
      expect(
        (await store.listRedirects(w.site.id)).map((r) => [
          r.from,
          r.to,
          r.match,
          r.reason,
          r.source?.id,
        ]),
      ).toEqual([["/posts/a", "/posts/b", "exact", "slug-change", e.id]]);
      e = await store.updateContentEntry({ ...e, slug: "c" });
      expect((await store.listRedirects(w.site.id)).map((r) => [r.from, r.to])).toEqual([
        ["/posts/a", "/posts/c"],
        ["/posts/b", "/posts/c"],
      ]);
      e = await store.updateContentEntry({ ...e, slug: "a" });
      expect((await store.listRedirects(w.site.id)).map((r) => [r.from, r.to])).toEqual([
        ["/posts/b", "/posts/a"],
        ["/posts/c", "/posts/a"],
      ]);
      expect((await store.redirectFor(w.site.id, "/posts/b/"))?.location).toBe("/posts/a");
      // drafts and other locales leave no redirect
      let d = await entry(w, { slug: "draft-a" });
      d = await store.updateContentEntry({ ...d, slug: "draft-b" });
      let tr = await entry(w, {
        slug: "tr-a",
        locale: "tr",
        status: "published",
        terms: cat(w.news.id),
      });
      tr = await store.updateContentEntry({ ...tr, slug: "tr-b" });
      expect((await store.listRedirects(w.site.id)).length).toBe(2);
      // a newly published entry at a redirected path takes the path back
      const back = await entry(w, { slug: "b", status: "published", terms: cat(w.news.id) });
      expect(back.slug).toBe("b");
      expect((await store.listRedirects(w.site.id)).map((r) => r.from)).toEqual(["/posts/c"]);
      // pages
      const about = (await store.listPages(w.site.id)).find(
        (p) => p.path === "/about",
      ) as NonNullable<Awaited<ReturnType<typeof store.getPage>>>;
      const company = await store.updatePage({ ...about, path: "/company" });
      expect((await store.redirectFor(w.site.id, "/about"))?.redirect).toMatchObject({
        to: "/company",
        reason: "slug-change",
        source: { kind: "page", id: about.id },
      });
      const aboutAgain = await store.updatePage({ ...company, path: "/about" });
      expect(await store.redirectFor(w.site.id, "/about")).toBeUndefined();
      expect((await store.redirectFor(w.site.id, "/company"))?.location).toBe("/about");
      const draft = await store.updatePage({ ...aboutAgain, status: "draft" });
      await store.updatePage({ ...draft, path: "/who" });
      expect(await store.redirectFor(w.site.id, "/about")).toBeUndefined();
      void d;
      void tr;
    });

    it("invariant 14: manual redirects — unique, never a served path, no self or loops, chains collapsed, 302 only manual", async () => {
      const w = await setup();
      const store = ctx.store();
      const mk = (from: string, to: string, extra: Record<string, unknown> = {}) =>
        store.createRedirect({
          siteId: w.site.id,
          from,
          to,
          status: 301,
          match: "exact",
          reason: "manual",
          ...extra,
        } as never);
      expect(await code(mk("/about", "/x"))).toBe("invalid_redirect");
      expect(await code(mk("/tag/ai", "/x"))).toBe("invalid_redirect");
      expect(await code(mk("/x", "/x?y=1"))).toBe("invalid_redirect");
      await entry(w, { slug: "live", status: "published", terms: cat(w.news.id) });
      expect(await code(mk("/posts/live", "/x"))).toBe("invalid_redirect");
      expect(await code(mk("/x", "/y", { status: 302, reason: "slug-change" }))).toBe(
        "invalid_redirect",
      );
      await mk("/a", "/b");
      expect(await rejects(mk("/a", "/c"))).toBeInstanceOf(UniqueConstraintError);
      expect(await code(mk("/b", "/a"))).toBe("invalid_redirect");
      // the new redirect's target is collapsed; redirects that pointed at its from follow it
      const c = await mk("/c", "/a#top");
      expect(c.to).toBe("/b#top");
      await mk("/b", "/d");
      expect((await store.listRedirects(w.site.id)).map((r) => [r.from, r.to])).toEqual([
        ["/a", "/d"],
        ["/b", "/d"],
        ["/c", "/d#top"],
      ]);
      // prefix redirects append the rest of the path before the target's query
      await mk("/old", "/new?src=old", { match: "prefix", status: 302 });
      expect((await store.redirectFor(w.site.id, "/old/x/y"))?.location).toBe("/new/x/y?src=old");
      expect((await store.redirectFor(w.site.id, "/old"))?.location).toBe("/new?src=old");
      expect(await store.redirectFor(w.site.id, "/older")).toBeUndefined();
      expect(await code(mk("/new", "/old"))).toBe("invalid_redirect");
      const ext = await mk("/press", "https://press.example.com/kit");
      expect(ext.to).toBe("https://press.example.com/kit");
      // update keeps from; delete is a CAS
      const updated = await store.updateRedirect({ ...ext, to: "/about", status: 302 });
      expect(updated).toMatchObject({ rev: 1, to: "/about", status: 302 });
      expect(await code(store.updateRedirect({ ...updated, from: "/pr" }))).toBe("immutable_field");
      expect(await code(store.updateRedirect({ ...updated, to: "/press" }))).toBe(
        "invalid_redirect",
      );
      await expect(store.deleteRedirect(ext)).rejects.toThrow(ConflictError);
      await store.deleteRedirect(updated);
      expect(await store.getRedirect(ext.id)).toBeUndefined();
    });

    it("§4.4: deprecated tags — agents propose terms, people create active ones; the store writes tags: []", async () => {
      const w = await setup();
      const store = ctx.store();
      const byAgent = await entry(w, { author: robot, tags: ["ai", "new-thing", "llms"] });
      expect(byAgent.tags).toEqual([]);
      const ids = byAgent.terms?.tag?.ids ?? [];
      expect(ids[0]).toBe(w.ai.id);
      expect(ids[2]).toBe(w.llm.id);
      const proposed = (await store.getTerm(ids[1] as string)) as Term;
      expect(proposed).toMatchObject({
        slug: "new-thing",
        status: "proposed",
        proposedBy: robot,
        labels: { en: { name: "New thing" } },
      });
      const byPerson = await entry(w, { tags: ["fresh"], terms: { tag: { ids: [w.ai.id] } } });
      const active = (await store.getTerm(byPerson.terms?.tag?.ids[1] as string)) as Term;
      expect(active).toMatchObject({ slug: "fresh", status: "active" });
      expect(active.proposedBy).toBeUndefined();
      // update path too, and no duplicates
      const again = await store.updateContentEntry({ ...byPerson, tags: ["fresh", "ai"] });
      expect(again.terms?.tag?.ids).toEqual([w.ai.id, active.id]);
      // a free taxonomy lets agents create active terms; none refuses them
      await store.reviewTerm(proposed, { approve: true });
      await store.updateTaxonomy({
        ...((await store.getTaxonomy(w.tag.id)) as Taxonomy),
        allowNewTerms: "free",
      });
      const free = await entry(w, { author: robot, tags: ["freely"] });
      expect((await store.getTerm(free.terms?.tag?.ids[0] as string))?.status).toBe("active");
      await store.updateTaxonomy({
        ...((await store.getTaxonomy(w.tag.id)) as Taxonomy),
        allowNewTerms: "none",
      });
      expect(await code(entry(w, { author: robot, tags: ["refused"] }))).toBe("not_allowed");
      // a site without taxonomies keeps tags as they are (until it is migrated)
      const bare = await store.createSite({
        projectId: "proj_01HZX8K3Q9AB",
        name: "Bare",
        slug: "bare",
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      const legacy = await store.createContentEntry({
        siteId: bare.id,
        collection: "posts",
        slug: "l",
        locale: "en",
        status: "published",
        title: "L",
        body: { format: "markdown", value: "x" },
        fields: {},
        tags: ["kept"],
        author: person,
      });
      expect(legacy.tags).toEqual(["kept"]);
    });

    it("review, visibility and usage: approve / reject / mergeInto; public terms free their archive path", async () => {
      const w = await setup();
      const store = ctx.store();
      const p = (slug: string) =>
        store.createTerm({
          siteId: w.site.id,
          taxonomyId: w.tag.id,
          slug,
          status: "proposed",
          visibility: "public",
          proposedBy: robot,
          labels: { en: { name: slug } },
        });
      const [a, b, c] = [await p("pa"), await p("pb"), await p("pc")];
      expect((await store.reviewTerm(a, { approve: true })).terms[0]?.status).toBe("active");
      expect((await store.reviewTerm(b, { reject: true })).terms[0]?.status).toBe("retired");
      const m = await store.reviewTerm(c, { mergeInto: w.ai });
      expect(m.terms[0]).toMatchObject({ status: "retired", mergedInto: w.ai.id });
      expect(m.redirects).toEqual([]);
      expect(
        await code(store.reviewTerm((await store.getTerm(w.ai.id)) as Term, { approve: true })),
      ).toBe("invalid_status");
      // internal term: a stale redirect from its path goes when it becomes public
      const internal = await store.setTermVisibility(w.llm, "internal");
      await store.createRedirect({
        siteId: w.site.id,
        from: "/tag/llm",
        to: "/about",
        status: 301,
        match: "exact",
        reason: "manual",
      });
      await store.setTermVisibility(internal.terms[0] as Term, "public");
      expect(await store.redirectFor(w.site.id, "/tag/llm")).toBeUndefined();
      // usage counts and ordering
      await entry(w, {
        status: "published",
        terms: { ...cat(w.news.id), tag: { ids: [w.ai.id] } },
      });
      await entry(w, { terms: { tag: { ids: [w.ai.id] } } });
      const usage = await store.termUsage(w.site.id);
      expect(usage.get(w.ai.id)).toMatchObject({ total: 2, published: 1 });
      expect(usage.get(w.news.id)).toMatchObject({ total: 1, published: 1 });
      expect(usage.get(w.ai.id)?.lastUsedAt).toBeDefined();
      expect((await store.termUsage(w.site.id, "category")).has(w.ai.id)).toBe(false);
      expect(
        (await store.listTerms(w.site.id, { taxonomy: "category" })).map((t) => t.slug),
      ).toEqual(["tech", "news", "world"]);
      expect(
        (await store.listTerms(w.site.id, { taxonomy: "tag", status: ["retired"] }))
          .map((t) => t.slug)
          .sort(),
      ).toEqual(["pb", "pc"]);
      expect(await store.listTerms(w.site.id, { taxonomy: "nope" })).toEqual([]);
    });

    it("§4.6: listContentEntries compiles filters, locale and status to SQL and agrees with matches()", async () => {
      const w = await setup();
      const store = ctx.store();
      const europe = await store.createTerm({
        ...w.world,
        id: undefined,
        slug: "europe",
        parentId: w.world.id,
        labels: { en: { name: "Europe" } },
      } as never);
      await entry(w, {
        status: "published",
        terms: { ...cat(w.news.id), tag: { ids: [w.ai.id] } },
      });
      await entry(w, {
        status: "published",
        terms: {
          category: { ids: [europe.id, w.tech.id], primary: w.tech.id },
          tag: { ids: [w.llm.id] },
        },
      });
      await entry(w, { collection: "notes", terms: { category: { ids: [w.tech.id] } } });
      await entry(w, { locale: "tr", terms: { tag: { ids: [w.ai.id, w.llm.id] } } });
      await entry(w, {});
      const all = await store.listContentEntries(w.site.id);
      const vocab = {
        taxonomies: await store.listTaxonomies(w.site.id),
        terms: await store.listTerms(w.site.id),
      };
      for (const expr of [
        "category:news",
        "category:news>*",
        "category:world>*+tag:llm",
        "tag:[ai,llm]+-tag:llm",
        "primary:category:tech",
        "-primary:category:tech",
        "collection:notes",
        "-tag:ai",
        `tag:${w.ai.id}`,
      ]) {
        const f = resolveFilter(parseFilter(expr), vocab);
        const viaSql = (await store.listContentEntries(w.site.id, { filter: expr })).map(
          (e) => e.id,
        );
        expect(viaSql, expr).toEqual(all.filter((e) => matches(f, e)).map((e) => e.id));
      }
      expect(
        (await store.listContentEntries(w.site.id, { filter: "tag:ai", locale: "tr" })).length,
      ).toBe(1);
      expect((await store.listContentEntries(w.site.id, { status: ["published"] })).length).toBe(2);
      expect((await store.listContentEntries(w.site.id, "notes")).length).toBe(1);
      expect(
        (
          await store.listContentEntries(w.site.id, {
            collection: "posts",
            filter: "category:news>*",
          })
        ).length,
      ).toBe(2);
      const e = await rejects(store.listContentEntries(w.site.id, { filter: "tag:a1" }));
      expect(e).toBeInstanceOf(FilterError);
      expect((e as FilterError).code).toBe("unknown_term");
      // renamed slugs keep filtering through slugHistory
      await store.renameTerm(w.ai, "artificial-intelligence");
      expect((await store.listContentEntries(w.site.id, { filter: "tag:ai" })).length).toBe(2);
    });

    it("migration: tags → terms (dry run, interrupted + resumed, idempotent) and revert", async () => {
      const store = ctx.store();
      const site = await store.createSite({
        projectId: "proj_01HZX8K3Q9AB",
        name: "Old",
        slug: "old",
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      const mk = (slug: string, tags: string[], status: ContentEntry["status"] = "published") =>
        store.createContentEntry({
          siteId: site.id,
          collection: "posts",
          slug,
          locale: "en",
          status,
          title: slug,
          body: { format: "markdown", value: "x" },
          fields: {},
          tags,
          author: person,
        });
      const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
      const e1 = await mk("one", ["machine-learning", "ai"]);
      const e2 = await mk("two", ["ai"], "draft");
      const e3 = await mk("three", many);
      const e4 = await mk("four", []);
      const dry = await store.migrateTagsToTerms(site.id, person, { dryRun: true });
      expect(dry).toMatchObject({
        dryRun: true,
        entries: 3,
        termsCreated: 14,
        termsReused: 0,
        taxonomiesCreated: ["category", "tag"],
      });
      expect(dry.tags).toEqual(["ai", "machine-learning", ...many].sort());
      expect(await store.listTaxonomies(site.id)).toEqual([]);
      expect(await store.listSnapshots(site.id)).toEqual([]);

      // interrupted: the entry rewrite fails after taxonomies and terms exist
      let batches = 0;
      const failing = ctx.racing(
        async () => {
          throw new Error("power cut");
        },
        (q) => /^UPDATE nodes/.test(q) && ++batches > 0,
      );
      await expect(failing.migrateTagsToTerms(site.id, person)).rejects.toThrow(/power cut/);
      expect((await store.listTaxonomies(site.id)).map((t) => [t.key, t.required]).sort()).toEqual([
        ["category", false],
        ["tag", false],
      ]);
      expect((await store.getContentEntry(e1.id))?.tags).toEqual(["machine-learning", "ai"]);

      const run = await store.migrateTagsToTerms(site.id, person);
      expect(run).toMatchObject({
        resumed: true,
        entries: 3,
        termsCreated: 0,
        termsReused: 14,
        skipped: [],
      });
      const before = (await store.getSnapshot(run.migrationId)) as NonNullable<
        Awaited<ReturnType<typeof store.getSnapshot>>
      >;
      expect(before).toMatchObject({
        label: "before tags-to-terms",
        reason: "manual",
        metadata: { "cloudhal.migration": "0002-tags" },
      });
      const afterSnap = await store.getSnapshot(run.afterSnapshotId as string);
      expect(afterSnap).toMatchObject({ label: "tags-to-terms", reason: "manual" });
      const tag = (await store.getTaxonomyByKey(site.id, "tag")) as Taxonomy;
      expect(tag.maxPerEntry).toBe(12);
      const m1 = (await store.getContentEntry(e1.id)) as ContentEntry;
      expect(m1.tags).toEqual([]);
      const slugs = await Promise.all(
        (m1.terms?.tag?.ids ?? []).map(async (id) => (await store.getTerm(id))?.slug),
      );
      expect(slugs).toEqual(["machine-learning", "ai"]);
      expect(m1.terms?.tag?.primary).toBeUndefined();
      const ml = (await store.getTermBySlug(site.id, "tag", "machine-learning")) as Term;
      expect(ml).toMatchObject({
        status: "active",
        visibility: "public",
        labels: { en: { name: "Machine learning" } },
        metadata: { "cloudhal.migration": "0002-tags", "cloudhal.migration.id": run.migrationId },
      });
      expect((await store.getContentEntry(e3.id))?.terms?.tag?.ids).toHaveLength(12);
      expect((await store.getContentEntry(e4.id))?.rev).toBe(e4.rev);
      // idempotent
      expect(await store.migrateTagsToTerms(site.id, person)).toMatchObject({
        upToDate: true,
        entries: 0,
      });

      // revert: an entry edited since keeps its edit and its terms
      const edited = await store.updateContentEntry({
        ...((await store.getContentEntry(e2.id)) as ContentEntry),
        title: "Edited",
      });
      const rv = await store.revertTagsToTerms(site.id, run.migrationId, { actor: person });
      expect(rv).toMatchObject({ restored: 2, edited: [e2.id], taxonomiesDeleted: ["category"] });
      expect(rv.termsDeleted).toBe(13);
      expect((await store.getContentEntry(e1.id))?.tags).toEqual(["machine-learning", "ai"]);
      expect((await store.getContentEntry(e1.id))?.terms).toBeUndefined();
      expect((await store.getContentEntry(e2.id))?.title).toBe(edited.title);
      expect((await store.listTerms(site.id)).map((t) => t.slug)).toEqual(["ai"]);
      expect((await store.getSnapshot(rv.snapshotId))?.label).toBe("revert tags-to-terms");
      await expect(store.revertTagsToTerms(site.id, "snap_doesnotexist")).rejects.toThrow(
        /not found/,
      );
    });

    it("op_guards: a governance batch ends with assertion rows and a replayed op id cannot apply twice", async () => {
      const w = await setup();
      const store = ctx.store();
      const r = await store.renameTerm(w.ai, "a-i");
      const rows = await ctx
        .sql()
        .all<{ op_id: string; ok: number }>("SELECT op_id, ok FROM op_guards WHERE op_id = ?", [
          r.opId,
        ]);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((x) => x.ok === 1)).toBe(true);
      await expect(
        ctx.sql().batch([
          {
            sql: "INSERT INTO op_guards (op_id, seq, ok, created_at) VALUES (?, 0, 1, ?)",
            params: [r.opId, "x"],
          },
        ]),
      ).rejects.toThrow();
      await expect(
        ctx.sql().batch([
          { sql: "UPDATE nodes SET rev = rev + 1 WHERE id = ?", params: [w.llm.id] },
          {
            sql: "INSERT INTO op_guards (op_id, seq, ok, created_at) SELECT 'op_manual0001', 0, CASE WHEN 0 THEN 1 END, 'x'",
            params: [],
          },
        ]),
      ).rejects.toThrow();
      expect((await store.getTerm(w.llm.id))?.rev).toBe(0);
      expect(
        (await ctx.sql().get<{ rev: number }>("SELECT rev FROM nodes WHERE id = ?", [w.llm.id]))
          ?.rev,
      ).toBe(0);
    });
  });
}
