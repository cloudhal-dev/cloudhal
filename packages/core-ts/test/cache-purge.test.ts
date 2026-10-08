/**
 * planCachePurge (RFC-0002 §7): a publish purges the tags of what changed between the live and the
 * new snapshot — node, term and list tags — and the site tag only for structure.
 */
import type { ContentEntry, Site, Taxonomy, Term } from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { listCacheTag, nodeCacheTag, siteCacheTag, termCacheTag } from "../src/cache-tags.ts";
import { seedStarterSite } from "../src/seed.ts";
import { type PublishChange, SiteGraphStore } from "../src/store.ts";

const human = { kind: "human" as const, id: "user_purge000001", name: "Editor" };

describe("planCachePurge", () => {
  let store: SiteGraphStore;
  let site: Site;
  let news: Term;
  let cloudhal: Term;
  let hello: ContentEntry;
  let category: Taxonomy;
  const changes: PublishChange[] = [];

  /** Snapshot the current state and publish it; returns the pointer move. */
  const publish = async (): Promise<PublishChange> => {
    const snap = await store.createSnapshot(site.id, { actor: human, reason: "publish" });
    site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
    return changes.at(-1) as PublishChange;
  };
  const plan = async () => store.planCachePurge(await publish());
  const tagsOf = async () => {
    const p = await plan();
    expect(p.mode).toBe("tags");
    return p.mode === "tags" ? [...p.tags].sort() : [];
  };
  const entry = (slug: string, terms: ContentEntry["terms"], status: ContentEntry["status"]) =>
    store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug,
      locale: "en",
      status,
      title: slug,
      body: { format: "markdown", value: "Body." },
      fields: {},
      tags: [],
      ...(terms ? { terms } : {}),
      author: human,
    });

  beforeEach(async () => {
    changes.length = 0;
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
      onPublished: async (_site, change) => {
        changes.push(change);
      },
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Purge", slug: "purge" });
    news = (await store.getTermBySlug(site.id, "category", "news")) as Term;
    cloudhal = (await store.getTermBySlug(site.id, "tag", "cloudhal")) as Term;
    category = (await store.getTaxonomyByKey(site.id, "category")) as Taxonomy;
    hello = (await store.listContentEntries(site.id, "posts"))[0] as ContentEntry;
    await publish();
  });

  it("purges everything on the first publish and nothing when the content is the same", async () => {
    expect(changes[0]?.from).toBeUndefined();
    expect(await store.planCachePurge(changes[0] as PublishChange)).toMatchObject({
      mode: "everything",
      reason: "no previously published snapshot",
    });
    // publishing again only moves the pointer (the site node's rev and pointer differ)
    expect(await tagsOf()).toEqual([]);
  });

  it("an edited article: its node, the site's lists and the lists of its terms — not the site", async () => {
    await store.updateContentEntry({ ...hello, title: "Hello again" });
    expect(await tagsOf()).toEqual(
      [
        nodeCacheTag(hello.id),
        listCacheTag(site.id),
        listCacheTag(news.id),
        listCacheTag(cloudhal.id),
      ].sort(),
    );
  });

  it("re-filing an article purges the archives it left and joined, with their ancestors", async () => {
    const parent = await store.createTerm({
      siteId: site.id,
      taxonomyId: category.id,
      slug: "world",
      status: "active",
      visibility: "public",
      labels: { en: { name: "World" } },
    });
    const child = await store.createTerm({
      siteId: site.id,
      taxonomyId: category.id,
      slug: "europe",
      status: "active",
      visibility: "public",
      labels: { en: { name: "Europe" } },
      parentId: parent.id,
    });
    await entry("other", { category: { ids: [child.id], primary: child.id } }, "published");
    await publish();
    const current = (await store.getContentEntry(hello.id)) as ContentEntry;
    await store.updateContentEntry({
      ...current,
      terms: { ...current.terms, category: { ids: [news.id, child.id], primary: news.id } },
    });
    const tags = await tagsOf();
    expect(tags).toContain(listCacheTag(child.id));
    expect(tags).toContain(listCacheTag(parent.id));
    expect(tags).toContain(listCacheTag(news.id));
    expect(tags).not.toContain(siteCacheTag(site.id));
  });

  it("a new article in a category that already has one purges lists, not the site", async () => {
    await entry("second", { category: { ids: [news.id], primary: news.id } }, "published");
    const tags = await tagsOf();
    expect(tags).not.toContain(siteCacheTag(site.id));
    expect(tags).toContain(listCacheTag(news.id));
  });

  it("the first article of a top-level category changes the header: the site", async () => {
    const sports = await store.createTerm({
      siteId: site.id,
      taxonomyId: category.id,
      slug: "sports",
      status: "active",
      visibility: "public",
      labels: { en: { name: "Sports" } },
    });
    await publish(); // a new public term is structure
    await entry("match", { category: { ids: [sports.id], primary: sports.id } }, "draft");
    // a draft does not count
    expect(await tagsOf()).not.toContain(siteCacheTag(site.id));
    const draft = (await store.listContentEntries(site.id, "posts")).find(
      (e) => e.slug === "match",
    ) as ContentEntry;
    await store.updateContentEntry({ ...draft, status: "published" });
    expect(await tagsOf()).toEqual([siteCacheTag(site.id)]);
  });

  it("a term's name: its term tag (and ancestors) and the site's lists", async () => {
    await store.updateTerm({ ...news, labels: { en: { name: "Latest news" } } });
    expect(await tagsOf()).toEqual([termCacheTag(news.id), listCacheTag(site.id)].sort());
  });

  it("structure purges the site: pages, redirects, term slugs, the site's settings", async () => {
    const about = (await store.listPages(site.id)).find((p) => p.path === "/about");
    await store.updatePage({ ...(about as NonNullable<typeof about>), title: "About us" });
    expect(await tagsOf()).toEqual([siteCacheTag(site.id)]);

    await store.renameTerm((await store.getTerm(cloudhal.id)) as Term, "cloudhal-news");
    expect(await tagsOf()).toEqual([siteCacheTag(site.id)]);

    await store.updateSite({ ...((await store.getSite(site.id)) as Site), name: "Purged" });
    expect(await tagsOf()).toEqual([siteCacheTag(site.id)]);
  });

  it("rollback plans from the live snapshot back to the target", async () => {
    const before = site.publishedSnapshotId as string;
    await store.updateContentEntry({ ...hello, title: "Changed" });
    await publish();
    const { site: rolled } = await store.rollback(site, before, human);
    site = rolled;
    const p = await store.planCachePurge(changes.at(-1) as PublishChange);
    expect(p).toMatchObject({ mode: "tags" });
    expect(p.mode === "tags" && p.tags).toContain(nodeCacheTag(hello.id));
  });

  it("falls back to everything when the diff is too large or unreadable", async () => {
    await store.updateContentEntry({ ...hello, title: "Hello again" });
    const change = await publish();
    expect(await store.planCachePurge(change, { maxTags: 2 })).toMatchObject({
      mode: "everything",
    });
    expect(await store.planCachePurge(change, { maxReads: 1 })).toMatchObject({
      mode: "everything",
    });
    expect(
      await store.planCachePurge({ from: "snap_missing", to: change.to as string }),
    ).toMatchObject({ mode: "everything" });
    expect(await store.planCachePurge({ from: change.from as string })).toMatchObject({
      mode: "everything",
      reason: "the site is no longer published",
    });
  });
});
