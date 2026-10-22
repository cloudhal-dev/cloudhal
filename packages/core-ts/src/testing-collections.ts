/**
 * RFC-0040 §2 behavioural suite: `listCollections` is the registry (declared keys, collections
 * inferred from entries, and the built-in `posts`) with entry counts per status, and reading it
 * writes nothing. Called by `describeSiteGraphStore`, so it runs on every storage backend.
 */
import type { Actor, ContentEntry, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import type { SuiteContext } from "./testing-taxonomy.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };

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

    it("an unknown site is not found", async () => {
      await expect(ctx.store().listCollections("site_01HZX8K3Q9ZZ")).rejects.toThrow("not found");
    });
  });
}
