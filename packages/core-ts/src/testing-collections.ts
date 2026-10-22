/**
 * RFC-0040 §2 behavioural suite: `listCollections` is the registry (declared keys, collections
 * inferred from entries, and the built-in `posts`) with entry counts per status, and reading it
 * writes nothing. Called by `describeSiteGraphStore`, so it runs on every storage backend.
 */
import type { Actor, ContentEntry, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { InvariantError } from "./errors.ts";
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

export function collectionsSuite(ctx: SuiteContext): void {
  describe("RFC-0040 collection registry in the store", () => {
    let n = 0;
    async function setup(collections?: Site["collections"]): Promise<Site> {
      const store = ctx.store();
      n++;
      const project = await store.createProject({
        name: "Registry",
        slug: `registry-${n}`,
        ownerId: person.id,
        siteIds: [],
      });
      return store.createSite({
        projectId: project.id,
        name: "Registry",
        slug: `registry-${n}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        ...(collections ? { collections } : {}),
      });
    }
    const entry = (
      site: Site,
      collection: string,
      slug: string,
      extra: Partial<ContentEntry> = {},
    ) =>
      ctx.store().createContentEntry({
        siteId: site.id,
        collection,
        slug,
        locale: "en",
        status: "draft",
        title: slug,
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: person,
        ...extra,
      } as never);

    it("an empty site lists only the built-in posts, inferred", async () => {
      const site = await setup();
      expect(await ctx.store().listCollections(site.id)).toEqual([
        { key: "posts", declared: false, settings: {}, counts: {} },
      ]);
    });

    it("declared first, then inferred, with counts per status across locales", async () => {
      const site = await setup({
        team: { labels: { en: { singular: "Member", plural: "Team" } } },
      });
      await entry(site, "events", "launch");
      await entry(site, "events", "meetup", { status: "published" });
      await entry(site, "events", "meetup", { status: "published", locale: "tr" });
      await entry(site, "posts", "hello");
      const list = await ctx.store().listCollections(site.id);
      expect(list.map((c) => [c.key, c.declared])).toEqual([
        ["team", true],
        ["events", false],
        ["posts", false],
      ]);
      expect(list[0]?.settings.labels?.en?.plural).toBe("Team");
      expect(list[0]?.counts).toEqual({});
      expect(list[1]?.counts).toEqual({ draft: 1, published: 2 });
      expect(list[2]?.counts).toEqual({ draft: 1 });
    });

    it("reading the registry writes nothing", async () => {
      const site = await setup();
      await entry(site, "events", "launch");
      const before = (await ctx.store().getSite(site.id)) as Site;
      await ctx.store().listCollections(site.id);
      expect(await ctx.store().getSite(site.id)).toEqual(before);
    });

    describe("§3 invariants", () => {
      const fresh = async (site: Site) => (await ctx.store().getSite(site.id)) as Site;
      const withTaxonomies = async (collections?: Site["collections"]) => {
        const site = await setup(collections);
        await ctx.store().createDefaultTaxonomies(site, { categoryRequired: false });
        return fresh(site);
      };

      it("the first entry of a new collection may not take another's URLs", async () => {
        const site = await withTaxonomies({ posts: { permalink: "/blog/{slug}" } });
        expect(await code(entry(site, "blog", "first"))).toBe("path_conflict");
        expect(await code(entry(site, "tag", "first"))).toBe("path_conflict");
        expect(await code(entry(site, "tr", "first"))).toBe("reserved_path");
        expect(await code(entry(site, "search", "first"))).toBe("reserved_path");
        expect(await ctx.store().listContentEntries(site.id)).toEqual([]);
        // A free prefix, then a second entry in the now-used collection, are fine.
        await entry(site, "events", "one");
        await entry(site, "events", "two");
        expect((await ctx.store().listContentEntries(site.id, "events")).length).toBe(2);
      });

      it("moving an entry into a new collection runs the same check", async () => {
        const site = await withTaxonomies({ posts: { permalink: "/blog/{slug}" } });
        const e = (await entry(site, "posts", "hello")) as ContentEntry;
        expect(await code(ctx.store().updateContentEntry({ ...e, collection: "blog" }))).toBe(
          "path_conflict",
        );
        const moved = await ctx.store().updateContentEntry({ ...e, collection: "notes" });
        expect(moved.collection).toBe("notes");
      });

      it("declaring a collection checks its default prefix", async () => {
        const site = await withTaxonomies({ posts: { permalink: "/blog/{slug}" } });
        const clash = { ...site, collections: { ...site.collections, blog: {} } };
        expect(await code(ctx.store().updateSite(clash))).toBe("path_conflict");
        const ok = { ...site, collections: { ...site.collections, events: {} } };
        expect((await ctx.store().updateSite(ok)).collections?.events).toEqual({});
      });

      it("a declared collection with entries, or named by a taxonomy, stays declared", async () => {
        const site = await withTaxonomies({ events: {}, team: {}, notes: {} });
        await entry(site, "events", "launch");
        const drop = (s: Site, key: string) => {
          const { [key]: _gone, ...rest } = s.collections ?? {};
          return ctx.store().updateSite({ ...s, collections: rest });
        };
        expect(await code(drop(site, "events"))).toBe("collection_in_use");
        const tag = (await ctx.store().listTaxonomies(site.id)).find((t) => t.key === "tag");
        if (tag) await ctx.store().updateTaxonomy({ ...tag, collections: ["notes"] });
        expect(await code(drop(await fresh(site), "notes"))).toBe("collection_in_use");
        const after = await drop(await fresh(site), "team");
        expect(Object.keys(after.collections ?? {}).sort()).toEqual(["events", "notes"]);
      });
    });

    it("an unknown site is not found", async () => {
      await expect(ctx.store().listCollections("site_01HZX8K3Q9ZZ")).rejects.toThrow("not found");
    });
  });
}
