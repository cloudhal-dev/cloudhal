/**
 * RFC-0045 step 3b (§2 "Purges", Test plan "Renderer"): the purge planner's referrer closure.
 * Pages carry only the node tags they already carry, so a theme that emits no new tags is purged:
 * every case asserts `cloudhal-node-<id>` tags of referrers, "used by" targets and their language
 * versions. The closure reads only the `from`/`to` snapshots' bodies (bundles first), never the
 * working copy, so edits after a snapshot never hide a referrer. The types stay refused in
 * production; this store enables them (`fieldTypes`), as the shared suites do.
 */
import type {
  ContentEntry,
  FieldDefinition,
  NodeRef,
  Site,
  Snapshot,
  Term,
} from "@cloudhal/core-contracts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { GATES_ENFORCED } from "../src/availability.ts";
import type { BundleReadOptions } from "../src/bundles.ts";
import { type CachePurgeOptions, planCachePurge, type SnapshotReader } from "../src/cache-purge.ts";
import { nodeCacheTag, siteCacheTag } from "../src/cache-tags.ts";
import { continueFieldOperation, runFieldOperation } from "../src/fields-operations/index.ts";
import { canonicalJson, nodeHash } from "../src/hash.ts";
import { PNG_1X1 } from "../src/media/fixtures.ts";
import { seedStarterSite } from "../src/seed.ts";
import { type PublishChange, SiteGraphStore } from "../src/store.ts";

const human = { kind: "human" as const, id: "user_refpurge001", name: "Editor" };
const L = (label: string) => ({ en: { label } });
const VENUE: FieldDefinition = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places", "events"],
};
const RELATED: FieldDefinition = {
  key: "related",
  type: "reference",
  labels: L("Related"),
  localized: false,
  multiple: true,
  collections: ["events"],
};
const NOTES: FieldDefinition = { key: "notes", type: "text", labels: L("Notes"), localized: true };

describe("planCachePurge: the referrer closure (RFC-0045 §2)", () => {
  let store: SiteGraphStore;
  let site: Site;
  let terms: ContentEntry["terms"];
  const changes: PublishChange[] = [];
  /** What the planner read: node reads, bundle reads. */
  const counts = { nodes: 0, bundles: 0 };
  const reader: SnapshotReader = {
    getSnapshot: (id) => store.getSnapshot(id),
    readSnapshotNode: (ref: NodeRef) => {
      counts.nodes++;
      return store.readSnapshotNode(ref);
    },
    readSnapshotBundle: (s: Snapshot, o?: BundleReadOptions) => {
      counts.bundles++;
      return store.readSnapshotBundle(s, o);
    },
  };

  const fresh = async () => (await store.getSite(site.id)) as Site;
  const get = async (e: ContentEntry) => (await store.getContentEntry(e.id)) as ContentEntry;
  const snap = (reason: "publish" | "manual") =>
    store.createSnapshot(site.id, { actor: human, reason });
  /** Moves the pointer to `id` (a publish, an approved request, a restore). */
  const point = async (id: string): Promise<PublishChange> => {
    site = await store.publish(await fresh(), id);
    return changes.at(-1) as PublishChange;
  };
  const publish = async () => point((await snap("publish")).id);
  const plan = (change: PublishChange, o: CachePurgeOptions = {}) => {
    counts.nodes = 0;
    counts.bundles = 0;
    return planCachePurge(reader, change.from, change.to, o);
  };
  const tagsOf = async (change: PublishChange, o: CachePurgeOptions = {}) => {
    const p = await plan(change, o);
    if (p.mode !== "tags") throw new Error(`expected tags, got everything: ${p.reason}`);
    return new Set(p.tags);
  };
  const node = (e: { id: string }) => nodeCacheTag(e.id);
  const make = (collection: string, slug: string, over: Partial<ContentEntry> = {}) =>
    store.createContentEntry({
      siteId: site.id,
      collection,
      slug,
      locale: "en",
      status: "published",
      title: slug,
      body: { format: "markdown", value: `About ${slug}.` },
      fields: {},
      tags: [],
      ...(terms ? { terms } : {}),
      author: human,
      ...over,
    } as never) as Promise<ContentEntry>;
  const translate = async (of: ContentEntry, slug: string, over: Partial<ContentEntry> = {}) =>
    make(of.collection, slug, {
      locale: "tr",
      translation: {
        group: of.id,
        method: "human",
        source: { id: of.id, locale: of.locale, rev: of.rev, hash: await nodeHash(of) },
      },
      ...over,
    });
  const edit = async (e: ContentEntry, over: Partial<ContentEntry>) =>
    store.updateContentEntry({ ...(await get(e)), ...over });

  beforeEach(async () => {
    changes.length = 0;
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
      gates: GATES_ENFORCED,
      fieldTypes: { supported: () => true },
      onPublished: async (_site, change) => {
        changes.push(change);
      },
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Refs", slug: "refs" });
    site = await store.updateSite({
      ...site,
      locales: ["en", "tr"],
      collections: {
        ...site.collections,
        places: {},
        events: { fields: [VENUE, RELATED, NOTES] },
      },
    });
    terms = (await store.listContentEntries(site.id, "posts"))[0]?.terms;
    await publish();
  });

  /** hall, an event naming it, and its Turkish translation (inheriting the venue). */
  async function world() {
    const hall = await make("places", "hall");
    const event = await make("events", "launch", { fields: { venue: hall.id } });
    const eventTr = await translate(event, "lansman");
    const other = await make("events", "other");
    await publish();
    return { hall, event, eventTr, other };
  }

  it("a target retitled, unpublished or newly published purges its referrers' pages", async () => {
    const { hall, event, eventTr, other } = await world();
    await edit(hall, { title: "Main hall" });
    const retitled = await tagsOf(await publish());
    for (const e of [hall, event, eventTr]) expect(retitled.has(node(e))).toBe(true);
    expect(retitled.has(node(other))).toBe(false);
    expect(retitled.has(siteCacheTag(site.id))).toBe(false);
    await edit(hall, { status: "draft" });
    const unpublished = await tagsOf(await publish());
    for (const e of [hall, event, eventTr]) expect(unpublished.has(node(e))).toBe(true);
    await edit(hall, { status: "published" });
    const republished = await tagsOf(await publish());
    for (const e of [hall, event, eventTr]) expect(republished.has(node(e))).toBe(true);
  });

  it("a target newly translated, or with a changed cover, purges its referrers", async () => {
    const { hall, event, eventTr } = await world();
    await translate(hall, "salon");
    const translated = await tagsOf(await publish());
    for (const e of [event, eventTr]) expect(translated.has(node(e))).toBe(true);
    const { asset } = await store.ingestAsset({
      siteId: site.id,
      bytes: PNG_1X1,
      filename: "hall.png",
      uploadedBy: human,
      source: { kind: "upload" },
      fields: { decorative: true },
    });
    await edit(hall, { coverImage: { assetId: asset.id, alt: "" } as never });
    await publish();
    // only the asset changes: the asset rule reaches hall, the closure its referrers
    await store.updateAsset({ ...asset, slug: "hall-renamed" });
    const cover = await tagsOf(await publish());
    for (const e of [hall, event, eventTr]) expect(cover.has(node(e))).toBe(true);
  });

  it("depth 2: A → B → C, with C unpublished, purges A", async () => {
    const c = await make("events", "c");
    const b = await make("events", "b", { fields: { related: [c.id] } });
    const a = await make("events", "a", { fields: { related: [b.id] } });
    const far = await make("events", "far", { fields: { related: [a.id] } });
    await publish();
    await edit(c, { status: "draft" });
    const tags = await tagsOf(await publish());
    for (const e of [c, b, a]) expect(tags.has(node(e)), e.slug).toBe(true);
    // three hops away: its page shows a's card, not a's fields
    expect(tags.has(node(far))).toBe(false);
  });

  it('a "used by" page follows referrers that appear or go, a translation that only inherits too', async () => {
    const { hall, event } = await world();
    const salon = await translate(hall, "salon");
    await publish();
    const gig = await make("events", "gig", { fields: { venue: hall.id } });
    const appeared = await tagsOf(await publish());
    for (const e of [hall, salon]) expect(appeared.has(node(e))).toBe(true);
    // a translation that only inherits the venue appears on its own
    const gigTr = await translate(gig, "konser");
    const inherited = await tagsOf(await publish());
    expect(inherited.has(node(gigTr))).toBe(true);
    for (const e of [hall, salon]) expect(inherited.has(node(e))).toBe(true);
    await store.deleteContentEntry(await get(gigTr));
    await store.deleteContentEntry(await get(gig));
    const gone = await tagsOf(await publish());
    for (const e of [hall, salon]) expect(gone.has(node(e))).toBe(true);
    // editing a referrer away from its venue purges the venue it left
    await edit(event, { fields: {} });
    const left = await tagsOf(await publish());
    for (const e of [hall, salon]) expect(left.has(node(e))).toBe(true);
  });

  it("a rollback whose referrer was since edited to draft still purges the referrer", async () => {
    const { hall, event } = await world();
    const before = site.publishedSnapshotId as string;
    await edit(hall, { title: "Main hall" });
    await publish();
    await edit(event, { status: "draft" });
    const { site: back } = await store.rollback(await fresh(), before, human);
    site = back;
    const tags = await tagsOf(changes.at(-1) as PublishChange);
    expect(tags.has(node(event))).toBe(true);
  });

  it("an approved request publishing an older snapshot, after the referrer was edited and the target unpublished, purges the referrer", async () => {
    const { hall, event, eventTr } = await world();
    // the request's snapshot: hall unpublished, the event still naming it
    await edit(hall, { status: "draft" });
    const request = await snap("manual");
    // meanwhile the referrer stops naming the target (only in the working copy)
    await edit(event, { fields: {} });
    const tags = await tagsOf(await point(request.id));
    for (const e of [hall, event, eventTr]) expect(tags.has(node(e))).toBe(true);
  });

  it("a referrer edited away or deleted between snapshot and purge is still purged from to's bodies", async () => {
    const { hall, event, eventTr } = await world();
    await edit(hall, { title: "Main hall" });
    const s = await snap("publish");
    await edit(event, { fields: {} });
    await store.deleteContentEntry(await get(eventTr));
    const tags = await tagsOf(await point(s.id));
    for (const e of [event, eventTr]) expect(tags.has(node(e))).toBe(true);
    // and deleted outright
    await edit(hall, { title: "Great hall" });
    const s2 = await snap("publish");
    await store.deleteContentEntry(await get(event));
    expect((await tagsOf(await point(s2.id))).has(node(event))).toBe(true);
  });

  it("a translation in to that only inherits, deleted since, is still purged", async () => {
    const { hall, eventTr } = await world();
    await edit(hall, { title: "Main hall" });
    const s = await snap("publish");
    await store.deleteContentEntry(await get(eventTr));
    expect((await tagsOf(await point(s.id))).has(node(eventTr))).toBe(true);
  });

  it("a snapshot without a bundle costs one bundle plus its items, never purge-everything", async () => {
    const { hall, event } = await world();
    for (let i = 0; i < 30; i++) await make("events", `filler-${i}`);
    await publish();
    // a release run's `scheduled` snapshot and an approval's manual one have no bundle
    await edit(hall, { title: "Main hall" });
    const manual = await snap("manual");
    const tags = await tagsOf(await point(manual.id), { maxReads: 20 });
    expect(tags.has(node(event))).toBe(true);
    // `to` has none, `from` has one: two bundle attempts, and node reads only for the diff
    expect(counts.bundles).toBe(2);
    expect(counts.nodes).toBeLessThan(10);
  });

  it("a site without reference definitions reads no bundle at all", async () => {
    const plain = await seedStarterSite(store, { name: "Plain", slug: "plain" });
    const s1 = await store.createSnapshot(plain.id, { actor: human, reason: "publish" });
    let p = await store.publish(plain, s1.id);
    const post = (await store.listContentEntries(plain.id, "posts"))[0] as ContentEntry;
    await store.updateContentEntry({ ...post, title: "Retitled" });
    const s2 = await store.createSnapshot(plain.id, { actor: human, reason: "publish" });
    p = await store.publish((await store.getSite(plain.id)) as Site, s2.id);
    expect(p.publishedSnapshotId).toBe(s2.id);
    const out = await plan({ from: s1.id, to: s2.id });
    expect(out.mode).toBe("tags");
    expect(counts.bundles).toBe(0);
  });

  it("the byte, node, read and tag budgets fall back to purge-everything", async () => {
    const { hall } = await world();
    await edit(hall, { title: "Main hall" });
    const change = await publish();
    const reason = async (o: CachePurgeOptions) => {
      const p = await plan(change, o);
      return p.mode === "everything" ? p.reason : "tags";
    };
    expect(await reason({ maxBodyBytes: 10 })).toMatch(/too large/);
    expect(await reason({ maxNodes: 2 })).toMatch(/too large/);
    expect(await reason({ maxTags: 1 })).toMatch(/tags/);
    expect(await reason({})).toBe("tags");
    // without bundles every entry body is a node read
    await edit(hall, { title: "Great hall" });
    const manual = await snap("manual");
    await edit(hall, { title: "Grand hall" });
    const manual2 = await snap("manual");
    const p = await plan({ from: manual.id, to: manual2.id }, { maxReads: 3 });
    expect(p).toMatchObject({ mode: "everything" });
    expect(p.mode === "everything" ? p.reason : "").toMatch(/node reads/);
  });

  it("any field-operation marker on from or to purges everything", async () => {
    const { hall, event } = await world();
    await edit(event, { fields: { venue: hall.id, notes: "Doors at 7" } });
    await make("events", "second", { fields: { notes: "Late" } });
    await publish();
    // a rename of a text field, stopped by its budget: the marker stays on the site node
    const part = await runFieldOperation(
      store,
      site.id,
      { op: "rename_field", collection: "events", from: "notes", to: "remarks" },
      { actor: human, budget: { entries: 1 } },
    );
    expect(part.done).toBe(false);
    // purging everything: the whole site's tag, or mode `everything`
    const all = (p: Awaited<ReturnType<typeof plan>>) =>
      p.mode === "everything" || (p.tags.length === 1 && p.tags[0] === siteCacheTag(site.id));
    await edit(hall, { title: "Main hall" });
    // the marker's own publish changed the site node: the site tag already
    expect(all(await plan(await publish()))).toBe(true);
    // the marker on both snapshots, the site node unchanged: the closure purges everything
    await edit(hall, { title: "Great hall" });
    const onBoth = await plan(await publish());
    expect(onBoth.mode === "everything" ? onBoth.reason : "").toMatch(/field operation/);
    // on `from` only: the operation finished (the site node changed again)
    const done = await continueFieldOperation(store, site.id, part.operationId, { actor: human });
    expect(done.done).toBe(true);
    expect(all(await plan(await publish()))).toBe(true);
  });

  it("a publish that changes no entry and no shown asset reads nothing: a term's tags only", async () => {
    await world();
    const news = (await store.getTermBySlug(site.id, "category", "news")) as Term;
    await store.updateTerm({ ...news, labels: { en: { name: "Latest news" } } });
    const p = await plan(await publish());
    expect(p.mode).toBe("tags");
    expect(p.mode === "tags" ? p.tags : []).toContain(`cloudhal-term-${news.id}`);
    expect(counts.bundles).toBe(0);
  });

  it("without bundles the closure's own reads keep to the byte budget", async () => {
    const { hall } = await world();
    await edit(hall, { title: "Great hall" });
    const a = await snap("manual");
    await edit(hall, { title: "Grand hall" });
    const b = await snap("manual");
    const p = await plan({ from: a.id, to: b.id }, { maxBodyBytes: 300 });
    expect(p.mode === "everything" ? p.reason : "tags").toMatch(/too large/);
    expect((await plan({ from: a.id, to: b.id })).mode).toBe("tags");
  });

  it("the closure's own reads count against maxReads (not just the planner's)", async () => {
    const { hall, event } = await world();
    for (let i = 0; i < 20; i++) await make("events", `filler-${i}`);
    await edit(hall, { title: "Great hall" });
    const a = await snap("manual");
    await edit(hall, { title: "Grand hall" });
    const b = await snap("manual");
    const change = { from: a.id, to: b.id };
    // the planner's own reads, the closure aside
    await plan(change, { references: false });
    const own = counts.nodes;
    const tight = await plan(change, { maxReads: own + 5 });
    expect(tight.mode === "everything" ? tight.reason : "tags").toMatch(/node reads/);
    expect((await tagsOf(change, { maxReads: own + 100 })).has(node(event))).toBe(true);
  });

  it("spends no shard reads on a snapshot known to have no bundle", async () => {
    const { hall } = await world();
    await edit(hall, { title: "Main hall" });
    const s = await snap("manual");
    await tagsOf(await point(s.id), { unbundled: new Set([s.id]) });
    expect(counts.bundles).toBe(1);
  });

  it("a conversion from references counts as references: its marker purges everything", async () => {
    const { hall } = await world();
    // `change_field_type` reference → text, phase A: the definition is text with the marker, and
    // no reference field is left (written directly: the operation tools need rollout step 4)
    const s = await fresh();
    const events = s.collections?.events;
    const fields = (events?.fields ?? []).flatMap((d): FieldDefinition[] =>
      d.key === "venue"
        ? [
            {
              key: "venue",
              type: "text",
              labels: L("Venue"),
              localized: false,
              migration: { id: "fop_01HZX8K3Q9CD", fromType: "reference" },
            },
          ]
        : d.type === "reference"
          ? []
          : [d],
    );
    const next = {
      ...s,
      rev: s.rev + 1,
      collections: { ...s.collections, events: { ...events, fields } },
    } as unknown as Site;
    await store.sql.run("UPDATE nodes SET rev = ?, hash = ?, body = ? WHERE id = ?", [
      next.rev,
      await nodeHash(next),
      canonicalJson(next),
      s.id,
    ]);
    await publish();
    // a retitled target, both snapshots converting: its referrers' pages show its title
    await edit(hall, { title: "Main hall" });
    const p = await plan(await publish());
    expect(p.mode === "everything" ? p.reason : "tags").toMatch(/field operation/);
  });
});
