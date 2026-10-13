/**
 * RFC-0008 route sweep fixture (§7.2), shared by the renderer's sweep (`gates-sweep.test.ts`, any
 * clock) and the Site Worker's on workerd (`packages/cli/test/cloudflare-gates.test.ts`, the real
 * clock). Applied on top of the starter seed (home lists posts, About, News, Cloudhal tag, "Hello,
 * world"), relative to an instant `t`:
 *
 * - entries: embargoed until t+1h (cover image and an inline image only it uses, a tag only it
 *   has, related to "Hello, world" through News), expired at t−1h, opening exactly at t, closing
 *   exactly at t;
 * - pages: `/launch` embargoed until t+2h, `/old-campaign` expired at t−2h;
 * - a shared image used by the embargoed entry and by "Hello, world" (never gated);
 * - a `primary` menu linking About, the embargoed page and the embargoed entry.
 *
 * Every gated node carries a marker (`ZQXU…`) in its title and summary or heading, so a sweep can
 * look for leaks as plain text in any body or header. The `U` keeps a marker out of every generated
 * id (Crockford base32 has no I, L, O or U) and every hex hash, so a match is a leak, never a random
 * id that happens to contain the marker (a bare `ZQX6` did, about once in a thousand runs).
 */
import type { Asset, ContentEntry, Page } from "@cloudhal/core-contracts";
import { isAvailable, type SiteGraphStore } from "@cloudhal/core-ts";
import { makePng } from "@cloudhal/core-ts/media/fixtures";

const HOUR = 3_600_000;
const writer = { kind: "human" as const, id: "user_gates000001", name: "Gate Keeper" };

/** A node the sweep watches, with every string that would give it away. */
export interface Watched {
  readonly name: string;
  readonly node: Page | ContentEntry;
  /** Id, path, title marker, summary marker. */
  readonly leaks: readonly string[];
  /** The URL the public would use. */
  readonly path: string;
}

export interface GatesFixture {
  readonly t: number;
  readonly watched: readonly Watched[];
  /** The image only the embargoed entry uses: hidden (404) until its embargo opens. */
  readonly ridingAsset: Asset;
  /** The image the embargoed entry shares with an ungated entry: always served. */
  readonly sharedAsset: Asset;
  /** The tag only the embargoed entry has: its archive is empty (404) until then. */
  readonly tagPath: string;
  /** Every gate instant, sorted. */
  readonly gates: readonly number[];
  /** The watched nodes the public must not see at `now`. */
  hiddenAt(now: number): Watched[];
}

export async function applyGatesFixture(
  store: SiteGraphStore,
  siteId: string,
  t: number,
): Promise<GatesFixture> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const site = await store.getSite(siteId);
  const news = await store.getTermBySlug(siteId, "category", "news");
  const tagTax = await store.getTaxonomyByKey(siteId, "tag");
  const hello = (await store.listContentEntries(siteId)).find((e) => e.slug === "hello-world");
  const about = (await store.listPages(siteId)).find((p) => p.path === "/about");
  if (!site || !news || !tagTax || !hello || !about) throw new Error("fixture: seed missing");

  const ingest = async (width: number, filename: string) =>
    (
      await store.ingestAsset({
        siteId,
        bytes: makePng({ width, height: 21 }),
        filename,
        uploadedBy: writer,
        source: { kind: "upload" },
        fields: { alt: { en: `${filename} alt` } },
      })
    ).asset;
  const ridingAsset = await ingest(77, "zqx-riding-cover.png");
  const sharedAsset = await ingest(78, "shared-photo.png");
  await store.updateContentEntry({
    ...hello,
    body: {
      format: "markdown",
      value: `${hello.body.value}\n\n![Shared](asset:${sharedAsset.id})`,
    },
  });

  const wraps = await store.createTerm({
    siteId,
    taxonomyId: tagTax.id,
    slug: "under-wraps",
    status: "active",
    visibility: "public",
    labels: { en: { name: "Under wraps" } },
  });

  const entry = (
    slug: string,
    marker: string,
    availability: ContentEntry["availability"],
    extra: Partial<ContentEntry> = {},
  ) =>
    store.createContentEntry({
      siteId,
      collection: "posts",
      slug,
      locale: "en",
      status: "published",
      title: `Story ${marker}`,
      summary: `Summary ${marker}-summary`,
      body: { format: "markdown", value: `Body of ${marker}.` },
      fields: {},
      tags: [],
      terms: { category: { ids: [news.id], primary: news.id } },
      author: writer,
      ...(availability ? { availability } : {}),
      ...extra,
    });

  const embargoed = await entry(
    "embargoed-scoop",
    "ZQXU1",
    { from: iso(t + HOUR) },
    {
      coverImage: { assetId: ridingAsset.id, src: "", alt: "" },
      body: {
        format: "markdown",
        value: `Body of ZQXU1.\n\n![Inline](asset:${ridingAsset.id})\n\n![Shared](asset:${sharedAsset.id})`,
      },
      terms: {
        category: { ids: [news.id], primary: news.id },
        tag: { ids: [wraps.id] },
      },
    },
  );
  const expired = await entry("expired-offer", "ZQXU2", { until: iso(t - HOUR) });
  const opensNow = await entry("opens-now", "ZQXU3", { from: iso(t) });
  const closesNow = await entry("closes-now", "ZQXU4", { until: iso(t) });

  let current = (await store.getSite(siteId)) ?? site;
  const page = async (
    path: string,
    marker: string,
    availability: NonNullable<Page["availability"]>,
  ) => {
    const r = await store.createPage(current, {
      siteId,
      path,
      title: `Page ${marker}`,
      locale: "en",
      status: "published",
      sections: [
        { id: `sec_${marker.toLowerCase()}00001`, kind: "hero", heading: `Heading ${marker}` },
      ],
      seo: { description: `Description ${marker}-summary` },
      availability,
    });
    current = r.site;
    return r.page;
  };
  const launch = await page("/launch", "ZQXU5", { from: iso(t + 2 * HOUR) });
  const campaign = await page("/old-campaign", "ZQXU6", { until: iso(t - 2 * HOUR) });

  await store.createMenu({
    siteId,
    key: "primary",
    maxDepth: 3,
    items: [
      { id: "item_GATEABOUT1", kind: "page", pageId: about.id },
      { id: "item_GATELAUNCH", kind: "page", pageId: launch.id },
      { id: "item_GATESCOOP1", kind: "contentEntry", entryId: embargoed.id },
    ],
  });

  const watch = (name: string, node: Page | ContentEntry, marker: string): Watched => {
    const path = "path" in node ? node.path : `/${node.collection}/${node.slug}`;
    return { name, node, path, leaks: [node.id, path, marker] };
  };
  const watched: Watched[] = [
    watch("embargoed entry", embargoed, "ZQXU1"),
    watch("expired entry", expired, "ZQXU2"),
    watch("entry opening at t", opensNow, "ZQXU3"),
    watch("entry closing at t", closesNow, "ZQXU4"),
    watch("embargoed page", launch, "ZQXU5"),
    watch("expired page", campaign, "ZQXU6"),
  ];
  const gates = [
    ...new Set(
      watched.flatMap((w) =>
        [w.node.availability?.from, w.node.availability?.until]
          .filter((x): x is string => x !== undefined)
          .map((x) => Date.parse(x)),
      ),
    ),
  ].sort((a, b) => a - b);
  return {
    t,
    watched,
    ridingAsset,
    sharedAsset,
    tagPath: "/tag/under-wraps",
    gates,
    hiddenAt: (now) => watched.filter((w) => !isAvailable(w.node, now)),
  };
}
