/**
 * RFC-0042 §3 route sweep fixture on the real clock (the Site Worker's sweep on workerd,
 * `packages/cli/test/cloudflare-gates.test.ts`), applied on top of the starter seed relative to an
 * instant `t`:
 *
 * - `shows` (datetime `endsAt`, `expiry: endsAt, unlist`): one show that ended at t−1h (`ZQXUA1`),
 *   one ending three days later (`ZQXUA2`);
 * - `deals` (datetime `validUntil`, `expiry: validUntil, hide`): one deal that ended at t−1h
 *   (`ZQXUA3`), one valid for three more days (`ZQXUA4`);
 * - a `/shows` page listing the shows.
 *
 * No list fields, so the gate index gains only the derived instants (t−1h, t+3d): the RFC-0008
 * fixture's next gate (t+1h) stays the next one. Markers follow `gates-fixture.ts` (a `U` keeps them
 * out of generated ids).
 */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";

const HOUR = 3_600_000;
const writer = { kind: "human" as const, id: "user_derived00001", name: "Gate Keeper" };

/** An entry the sweep watches past its derived gate, with every string that would give it away. */
export interface DerivedWatched {
  readonly name: string;
  readonly action: "unlist" | "hide";
  readonly entry: ContentEntry;
  readonly path: string;
  /** Id, path, title marker. */
  readonly leaks: readonly string[];
}

export interface DerivedGatesFixture {
  /** Past their gate at any instant after `t`. */
  readonly watched: readonly DerivedWatched[];
  /** Still open for three days: listed, in the collection feeds. */
  readonly open: readonly ContentEntry[];
}

const datetime = (key: string, label: string): [FieldDefinition] => [
  { key, type: "datetime", labels: { en: { label } }, localized: false },
];

export async function applyDerivedGatesFixture(
  store: SiteGraphStore,
  siteId: string,
  t: number,
): Promise<DerivedGatesFixture> {
  const site = await store.getSite(siteId);
  const hello = (await store.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
  if (!site || !hello) throw new Error("fixture: seed missing");
  await store.updateSite({
    ...site,
    collections: {
      ...site.collections,
      shows: {
        labels: { en: { singular: "Show", plural: "Shows" } },
        fields: datetime("endsAt", "Ends"),
        expiry: { field: "endsAt", action: "unlist" },
      },
      deals: {
        labels: { en: { singular: "Deal", plural: "Deals" } },
        fields: datetime("validUntil", "Valid until"),
        expiry: { field: "validUntil", action: "hide" },
      },
    },
  });
  const at = (ms: number) => ({ at: new Date(ms).toISOString(), timeZone: "UTC" });
  const entry = (collection: string, slug: string, title: string, fields: object) =>
    store.createContentEntry({
      siteId,
      collection,
      slug,
      locale: site.defaultLocale,
      status: "published",
      title,
      summary: `About ${title}`,
      body: { format: "markdown", value: `All about ${title}.` },
      fields,
      tags: [],
      ...(hello.terms ? { terms: hello.terms } : {}),
      author: writer,
    } as never);
  const endedShow = await entry("shows", "ended-show", "Show ZQXUA1", { endsAt: at(t - HOUR) });
  const nextShow = await entry("shows", "next-show", "Show ZQXUA2", { endsAt: at(t + 72 * HOUR) });
  const endedDeal = await entry("deals", "ended-deal", "Deal ZQXUA3", {
    validUntil: at(t - HOUR),
  });
  const openDeal = await entry("deals", "open-deal", "Deal ZQXUA4", {
    validUntil: at(t + 72 * HOUR),
  });
  await store.createPage((await store.getSite(siteId)) ?? site, {
    siteId,
    path: "/shows",
    title: "Shows",
    locale: site.defaultLocale,
    status: "published",
    sections: [
      {
        id: "sec_showlist0001",
        kind: "contentList",
        collection: "shows",
        limit: 10,
        sort: "newest",
      },
    ],
  } as never);
  const watch = (name: string, action: DerivedWatched["action"], e: ContentEntry) => {
    const path = `/${e.collection}/${e.slug}`;
    const marker = /ZQXU\w+/.exec(e.title)?.[0] as string;
    return { name, action, entry: e, path, leaks: [e.id, path, marker] };
  };
  return {
    watched: [
      watch("show past its unlist expiry", "unlist", endedShow),
      watch("deal past its hide expiry", "hide", endedDeal),
    ],
    open: [nextShow, openDeal],
  };
}
