/**
 * RFC-0042 §3–§4 in the published sources: derived gates (`unlist` keeps the page and leaves
 * every list, feed, sitemap and search; `hide` is a 404), the gate index with derived and
 * list-field instants, date expiry in the site's zone, `queryEntries` on both sources (parity),
 * `contentList` sections by field, and the preview notice.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { edgeMaxAge } from "@cloudhal/core-ts/availability";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { archiveSummaries } from "../src/archive.ts";
import {
  contentListEntries,
  listOrigin,
  queryEntries,
  rememberList,
  sectionQuery,
} from "../src/entry-query.ts";
import { rssXml, sitemapUrls } from "../src/feeds.ts";
import { localizedSitemap } from "../src/locale-feeds.ts";
import { renderEntryPreview } from "../src/preview.ts";
import { resolveRoute, routablePaths, staticPaths } from "../src/routing.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "../src/source.ts";
import { loadTaxonomyIndex } from "../src/taxonomy.ts";
import { EVENTS, HOUR, iso, OFFERS, type Stage3, stage3, T } from "./stage3-fixture.ts";

const ORIGIN = "https://stage3.example";
const ids = (list: readonly { id: string }[]) => list.map((e) => e.id).sort();
/** 5 November ends in Istanbul at 21:00 UTC; 4 November ended at 21:00 UTC on the 4th. */
const TODAY_ENDS = Date.UTC(2026, 10, 5, 21, 0, 0);
const YESTERDAY_ENDS = Date.UTC(2026, 10, 4, 21, 0, 0);

describe("derived gates on the published site (RFC-0042 §3)", () => {
  let fx: Stage3;
  let snapshot: SnapshotSource;
  beforeAll(async () => {
    fx = await stage3();
    snapshot = await SnapshotSource.open(fx.store, fx.snapshotId);
  });
  const sources = (now: number): [string, GraphSource][] => [
    ["snapshot", snapshot.at(now)],
    ["live", new LiveSource(fx.store, fx.site.id, { includeDrafts: false, now: () => now })],
  ];

  it("unlist: the page answers, every list leaves it out", async () => {
    for (const [name, source] of sources(T)) {
      const route = await resolveRoute(source, "/events/past-gig");
      expect(route.kind, name).toBe("entry");
      expect(await source.entryBySlug("events", "past-gig"), name).toBeDefined();
      expect(await source.entryById?.(fx.past.id), name).toBeDefined();
      expect(ids(await source.entries("events")), name).not.toContain(fx.past.id);
      expect(ids(await source.allEntries()), name).not.toContain(fx.past.id);
      expect(ids((await source.routableEntries?.()) ?? []), name).toContain(fx.past.id);
      // static builds still write its page; the sitemap, feed and archives do not list it
      expect(await routablePaths(source), name).toContain("/events/past-gig");
      expect((await staticPaths(source)).pages, name).toContain("/events/past-gig");
      const all = await source.allEntries();
      const index = await loadTaxonomyIndex(source);
      const site = await source.site();
      const sitemap = sitemapUrls(site, await source.pages(), all, ORIGIN, []);
      expect(JSON.stringify(sitemap), name).not.toContain("past-gig");
      expect(
        JSON.stringify(await localizedSitemap(source, ORIGIN, "stage3.example")),
      ).not.toContain("past-gig");
      expect(rssXml({ site, origin: ORIGIN, entries: all, taxonomy: index }), name).not.toContain(
        "ZQXU7",
      );
      const archives = archiveSummaries(index, all);
      for (const a of archives) {
        const listed = await source.entriesByTerm(a.taxonomy.key, a.term.id);
        expect(ids(listed), `${name} ${a.path}`).not.toContain(fx.past.id);
      }
    }
  });

  it("hide: a 404 everywhere, exactly at the start of the next day in the site's zone", async () => {
    for (const [name, source] of sources(T)) {
      expect((await resolveRoute(source, "/offers/old-offer")).kind, name).toBe("not-found");
      expect(await source.entryById?.(fx.oldOffer.id), name).toBeUndefined();
      expect(ids((await source.routableEntries?.()) ?? []), name).not.toContain(fx.oldOffer.id);
      expect((await resolveRoute(source, "/offers/today-offer")).kind, name).toBe("entry");
    }
    for (const [name, source] of sources(TODAY_ENDS - 1))
      expect((await resolveRoute(source, "/offers/today-offer")).kind, `${name} −1 ms`).toBe(
        "entry",
      );
    for (const [name, source] of sources(TODAY_ENDS))
      expect((await resolveRoute(source, "/offers/today-offer")).kind, `${name} at`).toBe(
        "not-found",
      );
    for (const [name, source] of sources(YESTERDAY_ENDS - 1))
      expect((await resolveRoute(source, "/offers/old-offer")).kind, `${name} day before`).toBe(
        "entry",
      );
  });

  it("an unlisted entry comes back to lists when its gate is still ahead", async () => {
    for (const [name, source] of sources(T - HOUR - 1)) {
      expect(ids(await source.entries("events")), name).toContain(fx.past.id);
    }
    for (const [name, source] of sources(T - HOUR))
      expect(ids(await source.entries("events")), name).not.toContain(fx.past.id);
  });

  it("the gate index holds derived instants and list-field instants, so the cache caps there", async () => {
    // after t: soon-gig starts (t+2h, +1 ms) and ends (t+4h), today's offer ends (21:00 UTC)
    for (const [name, source] of sources(T)) {
      expect(await source.nextGate?.(), name).toBe(T + 2 * HOUR);
      expect(edgeMaxAge(await source.nextGate?.(), T)).toBe(7200);
    }
    for (const [name, source] of sources(T + 2 * HOUR))
      expect(await source.nextGate?.(), name).toBe(T + 2 * HOUR + 1);
    for (const [name, source] of sources(T + 2 * HOUR + 1))
      expect(await source.nextGate?.(), name).toBe(T + 4 * HOUR);
    for (const [name, source] of sources(T + 4 * HOUR))
      expect(await source.nextGate?.(), name).toBe(TODAY_ENDS);
  });

  it("previews ignore derived gates and say so", async () => {
    for (const preview of [snapshot.ungated(), new LiveSource(fx.store, fx.site.id)]) {
      expect((await resolveRoute(preview, "/offers/old-offer")).kind).toBe("entry");
      expect(ids(await preview.entries("events"))).toContain(fx.past.id);
      expect(await preview.nextGate?.()).toBeUndefined();
    }
    const ended = renderEntryPreview(fx.site, fx.past, undefined, T).html;
    expect(ended).toContain('data-gate="ended"');
    expect(ended).toContain("left out of lists");
    expect(renderEntryPreview(fx.site, fx.oldOffer, undefined, T).html).toContain(
      'data-gate="expired"',
    );
    expect(renderEntryPreview(fx.site, fx.soon, undefined, T).html).not.toContain("data-gate=");
  });

  it("search rows carry the derived gate (gateUntil = min)", async () => {
    const search = (now: number) =>
      fx.store.search(fx.site.id, "Gig", { locale: "en", now, snapshotId: fx.snapshotId });
    const hits = async (now: number) => (await search(now)).hits.map((r) => r.href);
    expect(await hits(T - HOUR - 1)).toContain("/events/past-gig");
    expect(await hits(T)).not.toContain("/events/past-gig");
    expect(await hits(T)).toContain("/events/soon-gig");
    const offers = async (now: number) =>
      (
        await fx.store.search(fx.site.id, "Offer", { locale: "en", now, snapshotId: fx.snapshotId })
      ).hits.map((r) => r.href);
    expect(await offers(T)).toEqual(["/offers/today-offer"]);
    expect(await offers(TODAY_ENDS)).toEqual([]);
  });
});

describe("queryEntries (RFC-0042 §4)", () => {
  let fx: Stage3;
  let snapshot: SnapshotSource;
  beforeAll(async () => {
    fx = await stage3();
    snapshot = await SnapshotSource.open(fx.store, fx.snapshotId);
  });
  const both = (now: number): [string, GraphSource][] => [
    ["snapshot", snapshot.at(now)],
    ["live", new LiveSource(fx.store, fx.site.id, { includeDrafts: false, now: () => now })],
  ];
  const slugs = (r: { entries: ContentEntry[] }) => r.entries.map((e) => e.slug);

  it("filters and orders by list fields, with now at the source's instant", async () => {
    for (const [name, source] of both(T)) {
      const upcoming = await queryEntries(source, {
        collection: "events",
        where: [{ field: "startsAt", op: "gte", value: "now" }],
        orderBy: { field: "startsAt", direction: "asc" },
      });
      expect(slugs(upcoming), name).toEqual(["soon-gig", "later-gig"]);
      expect(upcoming.total, name).toBe(2);
      const desc = await queryEntries(source, {
        collection: "events",
        orderBy: { field: "startsAt", direction: "desc" },
      });
      // entries without a value sort last in both directions; the unlisted one is left out
      expect(slugs(desc), name).toEqual(["later-gig", "soon-gig", "undated-gig"]);
      const cancelled = await queryEntries(source, {
        collection: "events",
        where: [{ field: "eventStatus", op: "in", values: ["cancelled"] }],
      });
      expect(slugs(cancelled), name).toEqual(["later-gig"]);
      // `date` now is today in Istanbul
      const today = await queryEntries(source, {
        collection: "events",
        where: [{ field: "day", op: "eq", value: "now" }],
      });
      expect(slugs(today), name).toEqual(["soon-gig"]);
    }
  });

  it("includeExpired adds unlisted entries, never hidden ones", async () => {
    for (const [name, source] of both(T)) {
      const past = await queryEntries(source, {
        collection: "events",
        where: [{ field: "startsAt", op: "lt", value: "now" }],
        includeExpired: true,
      });
      expect(slugs(past), name).toEqual(["past-gig"]);
      const offers = await queryEntries(source, { collection: "offers", includeExpired: true });
      expect(slugs(offers), name).toEqual(["today-offer"]);
    }
  });

  it("pages with limit and offset, and the two sources agree", async () => {
    for (const now of [T - 4 * HOUR, T, T + 3 * HOUR, T + 49 * HOUR]) {
      const [a, b] = both(now).map(([, s]) => s) as [GraphSource, GraphSource];
      for (const q of [
        { collection: "events", limit: 1, offset: 1, sort: "title" as const },
        { collection: "events", where: [{ field: "startsAt", op: "set" as const }] },
        { collection: "events", orderBy: { field: "price", direction: "asc" as const } },
        { collection: "events", filter: "category:news", includeExpired: true },
      ]) {
        const [x, y] = [await queryEntries(a, q), await queryEntries(b, q)];
        expect(slugs(x), `${iso(now)} ${JSON.stringify(q)}`).toEqual(slugs(y));
        expect(x.total).toBe(y.total);
      }
    }
    const source = snapshot.at(T);
    const paged = await queryEntries(source, { collection: "events", limit: 1, offset: 1 });
    expect(paged.entries).toHaveLength(1);
    expect(paged.total).toBe(3);
  });

  it("an invalid query matches nothing and is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [name, source] of both(T)) {
      const r = await queryEntries(source, {
        collection: "events",
        where: [{ field: "venue", op: "eq", value: "x" }],
      });
      expect(r, name).toEqual({ entries: [], total: 0 });
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not one of the collection's list"));
    warn.mockRestore();
  });

  it("contentList sections list by field, on old themes' lists too", async () => {
    for (const [name, source] of both(T)) {
      const home = (await source.pageByPath("/")) as NonNullable<
        Awaited<ReturnType<GraphSource["pageByPath"]>>
      >;
      const section = home.sections.find((s) => s.id === "sec_upcoming0001");
      if (section?.kind !== "contentList") throw new Error("fixture");
      // the starter: keyed by section id, already queried
      const lists = await contentListEntries(source, home.sections, "en");
      expect(
        lists.sec_upcoming0001?.map((e) => e.slug),
        name,
      ).toEqual(["soon-gig", "later-gig"]);
      expect(listOrigin(lists.sec_upcoming0001 ?? []), name).toBe("queried");
      // the collection's list keeps today's meaning (newest, listed only)
      expect(ids(lists.events ?? []), name).toEqual(ids(await source.entries("events")));
      // an old theme passes `source.entries(...)`: ContentList finds its source and queries it
      const old = await source.entries("events", "en");
      const origin = listOrigin(old);
      if (!origin || origin === "queried") throw new Error(`${name}: no origin`);
      const viaOld = await queryEntries(origin.source, sectionQuery(section, origin.locale));
      expect(
        viaOld.entries.map((e) => e.slug),
        name,
      ).toEqual(["soon-gig", "later-gig"]);
    }
    expect(listOrigin(rememberList([], "queried"))).toBe("queried");
    expect(listOrigin([])).toBeUndefined();
  });

  it("works on a source without queryEntries (themes' own sources)", async () => {
    const real = snapshot.at(T);
    const bare: GraphSource = {
      mode: "snapshot",
      site: () => real.site(),
      pages: () => real.pages(),
      pageByPath: (p, l) => real.pageByPath(p, l),
      entries: (c, l) => real.entries(c, l),
      entryBySlug: (c, s, l) => real.entryBySlug(c, s, l),
      allEntries: (l) => real.allEntries(l),
      taxonomies: () => real.taxonomies(),
      terms: (k) => real.terms(k),
      termBySlug: (k, s) => real.termBySlug(k, s),
      vocabulary: (k) => real.vocabulary(k),
      entriesByFilter: (f, o) => real.entriesByFilter(f, o),
      entriesByTerm: (k, s, o) => real.entriesByTerm(k, s, o),
      redirectFor: (p, l) => real.redirectFor(p, l),
      redirects: () => real.redirects(),
      menu: (k) => real.menu(k),
      navigation: (k, l, o) => real.navigation(k, l, o),
    };
    const r = await queryEntries(bare, {
      collection: "events",
      orderBy: { field: "startsAt", direction: "asc" },
    });
    expect(slugs(r)).toEqual(["soon-gig", "later-gig", "undated-gig"]);
  });
});

describe("sites without stage 3 settings keep today's lists", () => {
  it("no expiry: nothing unlisted, no derived instants", async () => {
    const { listFields: _l, expiry: _e, structuredData: _s, ...plain } = EVENTS;
    const fx = await stage3({ events: plain, offers: { fields: OFFERS.fields ?? [] } as never });
    const source = (await SnapshotSource.open(fx.store, fx.snapshotId)).at(T);
    expect(ids(await source.entries("events"))).toContain(fx.past.id);
    expect(ids(await source.allEntries())).toEqual(ids((await source.routableEntries?.()) ?? []));
    expect(await source.nextGate()).toBeUndefined();
    const site: Site = await source.site();
    expect(site.collections?.events?.expiry).toBeUndefined();
  });
});
