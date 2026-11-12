/**
 * RFC-0008's route sweep (§7.2, S9), extended by RFC-0042 and now by RFC-0045 §8: a published
 * referrer names a draft, an archived, an embargoed, an expiring (`availability.until`) and a
 * `hide`-expired target, and one that is always shown. Swept through every route the blog starter
 * serves at each instant −1 ms, exactly and +1 ms, entry routes drawing their fields with cards at
 * depth 2 and their "used by" lists: a target the view does not show must not appear anywhere
 * (id, path, title), and one it shows appears as a card on the referrer's page.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { entryPath, GATES_ENFORCED, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { staticPaths } from "../src/routing.ts";
import { SnapshotSource } from "../src/source.ts";
import { sweep } from "./sweep.ts";

const T = Date.UTC(2026, 10, 12, 6, 0, 0);
const HOUR = 3_600_000;
const person = { kind: "human" as const, id: "user_refsweep0001", name: "Halil" };

interface Target {
  name: string;
  entry: ContentEntry;
  leaks: string[];
}

describe("route sweep: no hidden reference target in any public output (RFC-0045 §8)", () => {
  let store: SiteGraphStore;
  let site: Site;
  let published: SnapshotSource;
  let candidates: string[];
  let targets: Target[];
  let tourPath: string;

  beforeAll(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
      now: () => new Date(T - 24 * HOUR),
      gates: GATES_ENFORCED,
      fieldTypes: { supported: () => true },
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Refs", slug: "refs" });
    const hello = (await store.listContentEntries(site.id)).find((e) => e.slug === "hello-world");
    site = await store.updateSite({
      ...site,
      collections: {
        ...site.collections,
        places: { labels: { en: { singular: "Place", plural: "Places" } } },
        deals: {
          labels: { en: { singular: "Deal", plural: "Deals" } },
          fields: [
            {
              key: "validUntil",
              type: "datetime",
              labels: { en: { label: "Until" } },
              localized: false,
            },
          ],
          expiry: { field: "validUntil", action: "hide" },
        },
        shows: {
          labels: { en: { singular: "Show", plural: "Shows" } },
          fields: [
            {
              key: "spots",
              type: "reference",
              labels: { en: { label: "Spots" } },
              localized: false,
              multiple: true,
              collections: ["places", "deals"],
            },
          ],
        },
      },
    });
    const make = (collection: string, slug: string, title: string, over: object = {}) =>
      store.createContentEntry({
        siteId: site.id,
        collection,
        slug,
        locale: site.defaultLocale,
        status: "published",
        title,
        summary: `About ${title}`,
        body: { format: "markdown", value: `All about ${title}.` },
        fields: {},
        tags: [],
        ...(hello?.terms ? { terms: hello.terms } : {}),
        author: person,
        ...over,
      } as never) as Promise<ContentEntry>;
    const at = (ms: number) => ({ at: new Date(ms).toISOString(), timeZone: "UTC" });
    const draft = await make("places", "draft-spot", "Spot ZQXUR1", { status: "draft" });
    let archived = await make("places", "archived-spot", "Spot ZQXUR2");
    const embargoed = await make("places", "embargoed-spot", "Spot ZQXUR3", {
      availability: { from: new Date(T + HOUR).toISOString() },
    });
    const expiring = await make("places", "expiring-spot", "Spot ZQXUR4", {
      availability: { until: new Date(T + HOUR).toISOString() },
    });
    const deal = await make("deals", "hidden-deal", "Deal ZQXUR6", {
      fields: { validUntil: at(T + HOUR) },
    });
    const always = await make("places", "always-spot", "Spot ZQXUR5");
    const tour = await make("shows", "tour", "Tour", {
      fields: { spots: [draft.id, archived.id, embargoed.id, expiring.id, deal.id, always.id] },
    });
    archived = await store.updateContentEntry({ ...archived, status: "archived" });
    tourPath = entryPath(site, tour);
    const target = (name: string, entry: ContentEntry): Target => ({
      name,
      entry,
      leaks: [entry.id, entryPath(site, entry), /ZQXU\w+/.exec(entry.title)?.[0] as string],
    });
    targets = [
      target("draft", draft),
      target("archived", archived),
      target("embargoed until t+1h", embargoed),
      target("available until t+1h", expiring),
      target("hide-expired at t+1h", deal),
      target("always shown", always),
    ];
    const snap = await store.createSnapshot(site.id, { actor: person, reason: "publish" });
    site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
    published = await SnapshotSource.open(store, snap.id);
    const everything = await staticPaths(published.ungated());
    candidates = [
      ...everything.pages,
      ...everything.feeds,
      ...targets.map((t) => entryPath(site, t.entry)),
      tourPath,
      "/nope",
    ];
  });

  it("shows a target exactly while the view shows it, and leaks nothing of it otherwise", async () => {
    let seenShown = 0;
    for (const now of [T - 1, T + HOUR - 1, T + HOUR, T + HOUR + 1]) {
      const label = new Date(now).toISOString();
      const source = published.at(now);
      const swept = await sweep(source, candidates, [], store);
      expect(swept.routes.get(tourPath), label).toBe("entry");
      const tourPage = swept.byPath.get(tourPath) ?? "";
      for (const t of targets) {
        const shown = (await source.entryById(t.entry.id)) !== undefined;
        if (shown) {
          expect(tourPage, `${label}: ${t.name} card`).toContain(t.entry.title);
          // its own page lists the tour ("used by")
          expect(swept.byPath.get(entryPath(site, t.entry)), `${label}: ${t.name}`).toContain(
            tourPath,
          );
          seenShown++;
          continue;
        }
        for (const leak of t.leaks)
          expect(swept.text.includes(leak), `${label}: ${t.name} leaks "${leak}"`).toBe(false);
      }
    }
    // always: 4; embargoed: 2; expiring and the deal: 2 each
    expect(seenShown).toBe(10);
  });
});
