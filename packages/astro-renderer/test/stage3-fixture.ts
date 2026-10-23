/**
 * RFC-0042 fixture for the renderer's tests: on top of the starter seed, a site in
 * `Europe/Istanbul` (UTC+3, no DST) with
 *
 * - `events` (datetime `startsAt`/`endsAt`, date `day`, text, number and select fields; list
 *   fields; `expiry: endsAt, unlist`; an `Event` preset) and four entries: one past its end at
 *   `t` (`ZQXU7`), one ending at t+4h, one two days later (cancelled), one without dates;
 * - `offers` (date `validUntil`; `expiry: validUntil, hide`) with one offer that ended yesterday
 *   (`ZQXU8`) and one valid all of today (`ZQXU9`, ends at 21:00 UTC);
 * - a home-page `contentList` of upcoming events (`startsAt gte now`, soonest first).
 *
 * `t` is 5 November 2026, 12:00 UTC (15:00 in Istanbul).
 */
import type {
  CollectionSettings,
  ContentEntry,
  FieldDefinition,
  Page,
  Site,
} from "@cloudhal/core-contracts";
import { GATES_ENFORCED, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";

export const T = Date.UTC(2026, 10, 5, 12, 0, 0);
export const HOUR = 3_600_000;
export const iso = (ms: number) => new Date(ms).toISOString();
const writer = { kind: "human" as const, id: "user_stage3000001", name: "Halil" };
const L = (label: string) => ({ en: { label } });

export const EVENT_FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "endsAt", type: "datetime", labels: L("Ends"), localized: false },
  { key: "day", type: "date", labels: L("Day"), localized: false },
  { key: "venue", type: "text", labels: L("Venue"), localized: true },
  { key: "city", type: "text", labels: L("City"), localized: false },
  { key: "price", type: "number", labels: L("Price"), localized: false },
  {
    key: "eventStatus",
    type: "select",
    labels: L("Status"),
    localized: false,
    options: [
      { value: "scheduled", labels: { en: "Scheduled" } },
      { value: "cancelled", labels: { en: "Cancelled" } },
    ],
  },
];

export const EVENTS: CollectionSettings = {
  labels: { en: { singular: "Event", plural: "Events" } },
  fields: EVENT_FIELDS,
  listFields: ["startsAt", "eventStatus", "price", "day"],
  expiry: { field: "endsAt", action: "unlist" },
  structuredData: {
    type: "Event",
    properties: {
      startDate: { kind: "field", field: "startsAt" },
      endDate: { kind: "field", field: "endsAt" },
      "location.name": { kind: "field", field: "venue" },
      "location.address.addressLocality": { kind: "field", field: "city" },
      eventStatus: { kind: "field", field: "eventStatus" },
      "offers.price": { kind: "field", field: "price" },
      "offers.priceCurrency": { kind: "constant", value: "TRY" },
    },
  },
};

export const OFFERS: CollectionSettings = {
  labels: { en: { singular: "Offer", plural: "Offers" } },
  fields: [{ key: "validUntil", type: "date", labels: L("Valid until"), localized: false }],
  listFields: ["validUntil"],
  expiry: { field: "validUntil", action: "hide" },
};

export interface Stage3 {
  readonly store: SiteGraphStore;
  readonly site: Site;
  readonly home: Page;
  readonly past: ContentEntry;
  readonly soon: ContentEntry;
  readonly later: ContentEntry;
  readonly undated: ContentEntry;
  readonly oldOffer: ContentEntry;
  readonly todayOffer: ContentEntry;
  /** The derived gate instants and list-field instants the gate index must hold. */
  readonly snapshotId: string;
}

const at = (ms: number) => ({ at: iso(ms), timeZone: "Europe/Istanbul" });

/** A fresh store with the fixture, published once. `settings` overrides the collections. */
export async function stage3(
  settings: { events?: CollectionSettings; offers?: CollectionSettings } = {},
): Promise<Stage3> {
  const store = new SiteGraphStore({
    sql: await BetterSqlite3Driver.open(":memory:"),
    blobs: new MemoryBlobStore(),
    now: () => new Date(T - 86_400_000),
    gates: GATES_ENFORCED,
  });
  await store.init();
  const seeded = await seedStarterSite(store, { name: "Stage Three", slug: "stage-three" });
  const site0 = await store.updateSite({
    ...seeded,
    timeZone: "Europe/Istanbul",
    collections: {
      ...seeded.collections,
      events: settings.events ?? EVENTS,
      offers: settings.offers ?? OFFERS,
    },
  });
  const [hello] = await store.listContentEntries(site0.id, "posts");
  const entry = (collection: string, slug: string, title: string, fields: object) =>
    store.createContentEntry({
      siteId: site0.id,
      collection,
      slug,
      locale: site0.defaultLocale,
      status: "published",
      title,
      summary: `About ${title}`,
      body: { format: "markdown", value: `All about ${title}.` },
      fields,
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author: writer,
    } as never);
  const past = await entry("events", "past-gig", "Gig ZQXU7", {
    startsAt: at(T - 3 * HOUR),
    endsAt: at(T - HOUR),
    day: "2026-11-05",
    venue: "Old Hall",
    city: "Istanbul",
  });
  const soon = await entry("events", "soon-gig", "Gig soon", {
    startsAt: at(T + 2 * HOUR),
    endsAt: at(T + 4 * HOUR),
    day: "2026-11-05",
    venue: "Kadıköy </script><script>alert(1)</script> & Co",
    city: "Istanbul",
    price: 250,
    eventStatus: "scheduled",
  });
  const later = await entry("events", "later-gig", "Gig later", {
    startsAt: at(T + 48 * HOUR),
    endsAt: at(T + 50 * HOUR),
    day: "2026-11-07",
    venue: "Moda Stage",
    city: "Istanbul",
    eventStatus: "cancelled",
  });
  const undated = await entry("events", "undated-gig", "Gig undated", { venue: "Somewhere" });
  const oldOffer = await entry("offers", "old-offer", "Offer ZQXU8", { validUntil: "2026-11-04" });
  const todayOffer = await entry("offers", "today-offer", "Offer ZQXU9", {
    validUntil: "2026-11-05",
  });
  let site = (await store.getSite(site0.id)) as Site;
  const home = (await store.listPages(site.id)).find((p) => p.path === "/") as Page;
  const lists = (settings.events ?? EVENTS).listFields?.includes("startsAt");
  const updatedHome = await store.updatePage({
    ...home,
    sections: [
      ...home.sections,
      ...(lists
        ? [
            {
              id: "sec_upcoming0001",
              kind: "contentList",
              collection: "events",
              limit: 10,
              sort: "newest",
              where: [{ field: "startsAt", op: "gte", value: "now" }],
              orderBy: { field: "startsAt", direction: "asc" },
            },
          ]
        : []),
    ],
  } as Page);
  const snap = await store.createSnapshot(site.id, {
    actor: writer,
    reason: "publish",
  });
  site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
  return {
    store,
    site,
    home: updatedHome,
    past,
    soon,
    later,
    undated,
    oldOffer,
    todayOffer,
    snapshotId: snap.id,
  };
}
