/**
 * RFC-0038 §3–§4 behavioural suite: changing a collection's permalink leaves a prefix redirect in
 * the site update's batch (chains collapsed, no loops, every locale), and templates, pages and
 * taxonomy archives never overlap. Called by `describeSiteGraphStore`, so it runs on every storage
 * backend (better-sqlite3 and Miniflare D1).
 */
import type { Actor, Page, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { ConflictError, InvariantError } from "./errors.ts";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof InvariantError ? e.code : (e as Error).name;
  }
  throw new Error("expected a rejection");
}

export function permalinksSuite(ctx: SuiteContext): void {
  describe("RFC-0038 collection permalinks in the store", () => {
    let n = 0;
    async function setup(): Promise<Site> {
      const store = ctx.store();
      n++;
      const project = await store.createProject({
        name: "Links",
        slug: `links-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      let site = await store.createSite({
        projectId: project.id,
        name: "Links",
        slug: `links-${n}`,
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
      await store.createDefaultTaxonomies(site, { categoryRequired: false });
      await store.createContentEntry({
        siteId: site.id,
        collection: "posts",
        slug: "hello",
        locale: "en",
        status: "published",
        title: "Hello",
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
      } as never);
      return (await store.getSite(site.id)) as Site;
    }

    const fresh = async (site: Site) => (await ctx.store().getSite(site.id)) as Site;
    const move = async (site: Site, permalink: string | undefined) => {
      const s = await fresh(site);
      const { posts: _drop, ...others } = s.collections ?? {};
      // RFC-0040: back to the default keeps posts declared (`{}`), as the tools and Studio do.
      const collections = { ...others, posts: permalink ? { permalink } : {} };
      return ctx.store().updateSite({ ...s, collections });
    };
    const location = async (site: Site, path: string, locale?: string) =>
      (await ctx.store().redirectFor(site.id, path, locale))?.location;
    const redirects = async (site: Site) =>
      (await ctx.store().listRedirects(site.id)).map((r) => ({
        from: r.from,
        to: r.to,
        match: r.match,
        ...(r.locale ? { locale: r.locale } : {}),
      }));

    it("§3: a new template leaves one prefix redirect per locale in the site's batch", async () => {
      const site = await setup();
      const updated = await move(site, "/blog/{slug}");
      expect(updated.collections?.posts?.permalink).toBe("/blog/{slug}");
      expect(await redirects(site)).toEqual([
        { from: "/posts", to: "/blog", match: "prefix" },
        { from: "/posts", to: "/blog", match: "prefix", locale: "tr" },
      ]);
      const [r] = await ctx.store().listRedirects(site.id);
      expect(r).toMatchObject({ reason: "slug-change", status: 301 });
      expect(await location(site, "/posts/hello")).toBe("/blog/hello");
      expect(await location(site, "/posts/hello", "tr")).toBe("/blog/hello");
      // An update that leaves the template alone writes no redirect.
      await ctx.store().updateSite({ ...(await fresh(site)), name: "Renamed" });
      expect(await redirects(site)).toHaveLength(2);
    });

    it("§5: a dry run checks the template and writes nothing", async () => {
      const site = await setup();
      const s = await fresh(site);
      const next = { ...s, collections: { posts: { permalink: "/blog/{slug}" } } };
      const dry = await ctx.store().updateSite(next, { dryRun: true });
      expect(dry).toMatchObject({ rev: s.rev + 1, collections: next.collections });
      expect((await fresh(site)).rev).toBe(s.rev);
      expect(await redirects(site)).toEqual([]);
      const clash = { ...s, collections: { posts: { permalink: "/tag/{slug}" } } };
      expect(await code(ctx.store().updateSite(clash, { dryRun: true }))).toBe("path_conflict");
    });

    it("§3: moving again collapses the chain; moving back to the default leaves no loop", async () => {
      const site = await setup();
      await move(site, "/blog/{slug}");
      await move(site, "/journal/{slug}");
      expect(await location(site, "/posts/hello")).toBe("/journal/hello");
      expect(await location(site, "/blog/hello")).toBe("/journal/hello");
      expect((await redirects(site)).filter((r) => !r.locale)).toEqual([
        { from: "/blog", to: "/journal", match: "prefix" },
        { from: "/posts", to: "/journal", match: "prefix" },
      ]);
      await move(site, undefined);
      expect(await location(site, "/posts/hello")).toBeUndefined();
      expect(await location(site, "/blog/hello")).toBe("/posts/hello");
      expect(await location(site, "/journal/hello")).toBe("/posts/hello");
      expect(await location(site, "/journal/hello", "tr")).toBe("/posts/hello");
      expect((await redirects(site)).filter((r) => !r.locale)).toEqual([
        { from: "/blog", to: "/posts", match: "prefix" },
        { from: "/journal", to: "/posts", match: "prefix" },
      ]);
    });

    it("§4.1: a template may not overlap a page, an archive, a collection or a reserved path", async () => {
      const site = await setup();
      const store = ctx.store();
      await store.createPage(await fresh(site), {
        siteId: site.id,
        path: "/work/team",
        title: "Team",
        locale: "en",
        status: "draft",
        sections: [],
      });
      await store.createContentEntry({
        siteId: site.id,
        collection: "notes",
        slug: "first",
        locale: "en",
        status: "draft",
        title: "First",
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
      } as never);
      expect(await code(move(site, "/work/{slug}"))).toBe("path_conflict");
      expect(await code(move(site, "/category/{slug}"))).toBe("path_conflict");
      expect(await code(move(site, "/tag/posts/{slug}"))).toBe("path_conflict");
      expect(await code(move(site, "/notes/{slug}"))).toBe("path_conflict");
      expect(await code(move(site, "/search/{slug}"))).toBe("reserved_path");
      expect(await code(move(site, "/tr/{slug}"))).toBe("reserved_path");
      const s = await fresh(site);
      const both = { posts: { permalink: "/blog/{slug}" }, notes: { permalink: "/blog/x/{slug}" } };
      expect(await code(store.updateSite({ ...s, collections: both }))).toBe("path_conflict");
      // Nothing was written by the refused updates.
      expect(await redirects(site)).toEqual([]);
      expect((await fresh(site)).rev).toBe(s.rev);
    });

    it("§4.1 reverse: pages and archives may not enter a configured prefix", async () => {
      let site = await setup();
      const store = ctx.store();
      const page = (path: string) =>
        store.createPage(site, {
          siteId: site.id,
          path,
          title: "P",
          locale: "en",
          status: "draft",
          sections: [],
        });
      // A default prefix keeps today's rule: a page under /posts wins over an entry.
      ({ site } = await page("/posts/landing"));
      // A page in the way is refused when the template moves there, not afterwards.
      site = await move(site, "/blog/{slug}");
      expect(await code(page("/blog/about"))).toBe("path_conflict");
      const about = (await store.listPages(site.id)).find((p) => p.path === "/about");
      expect(about).toBeDefined();
      expect(await code(store.updatePage({ ...(about as Page), path: "/blog/about" }))).toBe(
        "path_conflict",
      );
      const tax = (basePath: string) =>
        store.createTaxonomy({
          siteId: site.id,
          key: "series",
          labels: { en: { singular: "Series", plural: "Series" } },
          hierarchical: false,
          allowNewTerms: "none",
          required: false,
          archive: { enabled: true, basePath },
          feed: false,
          minEntriesToIndex: 1,
        });
      expect(await code(tax("/blog"))).toBe("path_conflict");
      expect(await code(tax("/blog/series"))).toBe("path_conflict");
      // Outside the configured prefix (the old default included), pages are written as before.
      expect((await page("/posts/new")).page.path).toBe("/posts/new");
    });

    it("§4.1: the page at a template's prefix is the collection's index page, not a conflict", async () => {
      let site = await setup();
      const store = ctx.store();
      const page = (path: string) =>
        store.createPage(site, {
          siteId: site.id,
          path,
          title: "P",
          locale: "en",
          status: "draft",
          sections: [],
        });
      // The listing page exists first; entries then move under it. Both writes run their SQL race
      // guards (`noPageUnder`, `configuredPrefixFree`) in the batch, so those pass too.
      ({ site } = await page("/blog"));
      site = await move(site, "/blog/{slug}");
      expect(site.collections?.posts?.permalink).toBe("/blog/{slug}");
      // …or the template is there first and the listing page comes after.
      site = await move(site, "/notes/{slug}");
      ({ site } = await page("/notes"));
      expect((await store.listPages(site.id)).map((p) => p.path)).toContain("/notes");
    });

    it("§3: a stale site rev raises ConflictError and writes no redirect", async () => {
      const site = await setup();
      const stale = await fresh(site);
      await ctx.store().updateSite({ ...stale, name: "Moved on" });
      const blog = { posts: { permalink: "/blog/{slug}" } };
      await expect(ctx.store().updateSite({ ...stale, collections: blog })).rejects.toBeInstanceOf(
        ConflictError,
      );
      // A writer that gets in between the read and the batch: the redirects roll back with the CAS.
      const racing = ctx.racing(async () => {
        await ctx.store().updateSite({ ...(await fresh(site)), name: "Raced" });
      });
      await expect(
        racing.updateSite({ ...(await fresh(site)), collections: blog }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await redirects(site)).toEqual([]);
      expect((await fresh(site)).collections).toBeUndefined();
    });

    it("§4.1 races: an archive taken during the update, or a template taken during an archive write", async () => {
      const site = await setup();
      const series = {
        siteId: site.id,
        key: "series",
        labels: { en: { singular: "Series", plural: "Series" } },
        hierarchical: false,
        allowNewTerms: "none" as const,
        required: false,
        archive: { enabled: true, basePath: "/blog" },
        feed: false,
        minEntriesToIndex: 1,
      };
      const racing = ctx.racing(async () => {
        await ctx.store().createTaxonomy(series);
      });
      expect(
        await code(
          racing.updateSite({
            ...(await fresh(site)),
            collections: { posts: { permalink: "/blog/x/{slug}" } },
          }),
        ),
      ).toBe("path_conflict");
      expect(await redirects(site)).toEqual([]);
      const other = await setup();
      const racing2 = ctx.racing(async () => {
        await move(other, "/series/{slug}");
      });
      expect(
        await code(
          racing2.createTaxonomy({
            ...series,
            siteId: other.id,
            archive: { enabled: true, basePath: "/series" },
          }),
        ),
      ).toBe("path_conflict");
    });
  });
}
