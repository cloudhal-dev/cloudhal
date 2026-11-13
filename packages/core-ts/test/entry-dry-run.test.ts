/**
 * `NodeWriteOptions.dryRun` and `deleteContentEntry`'s `dryRun` (RFC-0045 §6, MCP's precheck): the
 * store's plan-time refusals are thrown, and nothing is written either way.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { SiteGraphStore, seedStarterSite } from "../src/index.ts";

const author = { kind: "human" as const, id: "user_dryrun0001", name: "Halil" };
const L = (label: string) => ({ en: { label } });

async function world() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({
    sql,
    blobs: new MemoryBlobStore(),
    fieldTypes: { supported: () => true },
  });
  const project = await store.createProject({
    name: "Dry",
    slug: "dry",
    ownerId: author.id,
    siteIds: [],
  });
  const created = await store.createSite({
    projectId: project.id,
    name: "Dry",
    slug: "dry",
    defaultLocale: "en",
    locales: ["en"],
    domains: [],
    pageIds: [],
    theme: { name: "blog" },
  });
  const site = await store.updateSite({
    ...created,
    collections: {
      places: {},
      events: {
        fields: [
          {
            key: "venue",
            type: "reference",
            labels: L("Venue"),
            localized: false,
            collections: ["places"],
          },
        ],
      },
    },
  } as Site);
  const entry = (collection: string, over: Partial<ContentEntry> = {}) =>
    store.createContentEntry({
      siteId: site.id,
      collection,
      slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
      locale: "en",
      status: "draft",
      title: "Untitled",
      body: { format: "markdown", value: "Body" },
      fields: {},
      tags: [],
      author,
      ...over,
    } as never) as Promise<ContentEntry>;
  return { store, site, entry };
}

describe("entry dry runs", () => {
  it("plan, refuse and write nothing", async () => {
    const { store, site, entry } = await world();
    const hall = await entry("places", { title: "Main hall" });
    const count = async () => (await store.listContentEntries(site.id)).length;
    const before = await count();
    const draft = {
      siteId: site.id,
      collection: "events",
      slug: "launch",
      locale: "en",
      status: "draft" as const,
      title: "Launch",
      body: { format: "markdown" as const, value: "Body" },
      fields: { venue: hall.id },
      tags: [],
      author,
    };
    const planned = await store.createContentEntry(draft, { dryRun: true });
    expect(planned.fields).toEqual({ venue: hall.id });
    expect(await count()).toBe(before);
    await expect(
      store.createContentEntry(
        { ...draft, fields: { venue: "entry_01HZX8K3QGONE1" } },
        { dryRun: true },
      ),
    ).rejects.toMatchObject({ code: "unknown_entry" });

    const event = await entry("events", { status: "published", fields: { venue: hall.id } });
    await store.updateContentEntry({ ...event, title: "Renamed" }, { dryRun: true });
    expect((await store.getContentEntry(event.id))?.title).toBe(event.title);

    await expect(store.deleteContentEntry(hall, { dryRun: true })).rejects.toMatchObject({
      code: "entry_referenced",
    });
    const annex = await entry("places");
    await store.deleteContentEntry(annex, { dryRun: true });
    expect(await store.getContentEntry(annex.id)).toBeDefined();
  });

  it("runs the term invariants too: publishing without a required category is refused", async () => {
    const { store } = await world();
    const site = await seedStarterSite(store, { name: "Blog", slug: "blog" });
    const post = await store.createContentEntry({
      siteId: site.id,
      collection: "posts",
      slug: "hello",
      locale: "en",
      status: "draft",
      title: "Hello",
      body: { format: "markdown", value: "Body" },
      fields: {},
      tags: [],
      author,
    } as never);
    await expect(
      store.updateContentEntry({ ...post, status: "published" }, { dryRun: true }),
    ).rejects.toMatchObject({ code: "required_term" });
    expect((await store.getContentEntry(post.id))?.status).toBe("draft");
  });
});
