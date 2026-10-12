/**
 * The route sweep (RFC-0008 §7.2, invariant S9), in the renderer at any clock: a fixture site with
 * pages and entries embargoed, expired and gated exactly at `t`, and an image riding only with an
 * embargoed entry, published once. At every gate instant −1 ms, exactly, and +1 ms, it enumerates
 * every route the blog starter serves (pages, entries, archives and their pages, feeds, redirects)
 * plus every gated node's own URL, renders what the starter renders for each (head, body, menus,
 * related posts, lists), the site feed, sitemap and robots.txt, the media route for every asset,
 * the comments lookup and the analytics resolver — and fails if any public output names a node the
 * public must not see. Previews must show them, with a notice. The same fixture runs on workerd
 * through the real starter in `packages/cli/test/cloudflare-gates.test.ts`.
 */
import type { Site } from "@cloudhal/core-contracts";
import { GATES_ENFORCED, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { edgeMaxAge } from "@cloudhal/core-ts/availability";
import { mediaPath } from "@cloudhal/core-ts/media";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { publishedNode } from "../src/analytics.ts";
import { archiveSummaries } from "../src/archive.ts";
import { archiveFeedXml, robotsTxt, rssXml, sitemapUrls, sitemapXml } from "../src/feeds.ts";
import { renderEntryArticle } from "../src/markdown.ts";
import { loadAssetIndex, type MediaContext } from "../src/media.ts";
import { serveMediaRequest } from "../src/media-route.ts";
import { derivedNavigation } from "../src/navigation.ts";
import { renderEntryPreview, renderPagePreview, renderSectionHtml } from "../src/preview.ts";
import { resolveRoute, staticPaths } from "../src/routing.ts";
import { archiveHead, entryHead, pageHead } from "../src/seo.ts";
import { type GraphSource, LiveSource, SnapshotSource } from "../src/source.ts";
import { entryTaxonomy, loadTaxonomyIndex, relatedEntries } from "../src/taxonomy.ts";
import { applyGatesFixture, type GatesFixture } from "./gates-fixture.ts";

const ORIGIN = "https://gates.example";
const T = Date.UTC(2026, 10, 2, 6, 0, 0);
const person = { kind: "human" as const, id: "user_gates000002", name: "Halil" };

interface Swept {
  /** Every public body and header, joined: what a leak would show up in. */
  readonly text: string;
  /** What each path answered (`page`, `entry`, `archive`, `feed`, `not-found`, …). */
  readonly routes: Map<string, string>;
  /** Media URL → status. */
  readonly media: Map<string, number>;
}

/** What the blog starter's routes put on the wire for one source, path by path. */
async function sweep(
  source: GraphSource,
  candidates: readonly string[],
  assets: readonly string[],
  store: SiteGraphStore,
): Promise<Swept> {
  const out: string[] = [];
  const routes = new Map<string, string>();
  const site = await source.site();
  const locale = site.defaultLocale;
  const index = await loadTaxonomyIndex(source);
  const media: MediaContext = {
    assets: await loadAssetIndex(source),
    locale,
    defaultLocale: locale,
  };
  const all = await source.allEntries();
  const primary = await source.navigation("primary", locale);
  const header = derivedNavigation(
    site,
    await source.pages(),
    archiveSummaries(index, all).filter((a) => a.taxonomy.key === "category"),
    locale,
  );
  out.push(JSON.stringify(primary), JSON.stringify(header));
  const { pages, feeds } = await staticPaths(source);
  for (const path of new Set([...pages, ...feeds, ...candidates])) {
    const route = await resolveRoute(source, path);
    routes.set(path, route.kind);
    if (route.kind === "page") {
      const lists: Record<string, Awaited<ReturnType<GraphSource["entries"]>>> = {};
      for (const s of route.page.sections)
        if (s.kind === "contentList") lists[s.collection] = await source.entries(s.collection);
      out.push(
        JSON.stringify(pageHead(site, route.page, ORIGIN, media)),
        ...route.page.sections.map((s) => renderSectionHtml(s, lists, media)),
      );
    } else if (route.kind === "entry") {
      const terms = entryTaxonomy(index, route.entry);
      out.push(
        JSON.stringify(entryHead(site, route.entry, ORIGIN, terms, media)),
        renderEntryArticle(route.entry, locale, media),
        JSON.stringify(terms),
        JSON.stringify(relatedEntries(route.entry, all, index, 3).map((e) => [e.id, e.title])),
      );
    } else if (route.kind === "archive") {
      out.push(
        JSON.stringify(archiveHead(site, route.archive, ORIGIN, media)),
        JSON.stringify(route.archive.entries.map((e) => [e.id, e.title, e.summary])),
        String(route.archive.total),
      );
    } else if (route.kind === "feed") {
      out.push(archiveFeedXml({ site, origin: ORIGIN, archive: route.archive, taxonomy: index }));
    } else if (route.kind === "redirect") {
      out.push(route.location);
    }
  }
  out.push(
    rssXml({
      site,
      origin: ORIGIN,
      entries: all,
      taxonomy: index,
      assets: await loadAssetIndex(source),
    }),
    sitemapXml(sitemapUrls(site, await source.pages(), all, ORIGIN, archiveSummaries(index, all))),
    robotsTxt(ORIGIN),
  );
  const mediaStatus = new Map<string, number>();
  for (const url of assets) {
    const res = (await serveMediaRequest(new Request(`${ORIGIN}${url}`), {
      siteId: site.id,
      mode: "published",
      assetByPrefix: async (p) => source.assetByPrefix?.(p),
      blobState: (sha) => store.blobState(site.id, sha),
      blobs: store.blobs,
    })) as Response;
    mediaStatus.set(url, res.status);
    out.push(JSON.stringify([...res.headers]));
    await res.body?.cancel();
  }
  return { text: out.join("\n"), routes, media: mediaStatus };
}

describe("route sweep: no gated node in any public output (S9)", () => {
  let store: SiteGraphStore;
  let site: Site;
  let fx: GatesFixture;
  let published: SnapshotSource;
  let candidates: string[];
  let assetUrls: string[];

  beforeAll(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
      now: () => new Date(T - 86_400_000),
      gates: GATES_ENFORCED,
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Gates", slug: "gates" });
    fx = await applyGatesFixture(store, site.id, T);
    const snap = await store.createSnapshot(site.id, { actor: person, reason: "publish" });
    site = await store.publish((await store.getSite(site.id)) as Site, snap.id);
    published = await SnapshotSource.open(store, snap.id);
    // Everything the site has, gated or not: every route of the ungated view, every gated URL.
    const everything = await staticPaths(published.ungated());
    candidates = [
      ...everything.pages,
      ...everything.feeds,
      ...fx.watched.map((w) => w.path),
      fx.tagPath,
      `${fx.tagPath}/rss.xml`,
      "/nope",
    ];
    assetUrls = (await published.ungated().assets?.())?.map((a) => mediaPath(a)) ?? [];
    expect(candidates).toContain(fx.tagPath);
    expect(assetUrls).toContain(mediaPath(fx.ridingAsset));
  });

  const clocks = () =>
    fx.gates.flatMap((g) => [
      { label: `${new Date(g).toISOString()} −1 ms`, now: g - 1 },
      { label: `${new Date(g).toISOString()} exactly`, now: g },
      { label: `${new Date(g).toISOString()} +1 ms`, now: g + 1 },
    ]);

  it("covers every gate at three clocks", () => {
    // t−2h, t−1h, t, t+1h, t+2h
    expect(fx.gates).toHaveLength(5);
    expect(clocks()).toHaveLength(15);
  });

  it("leaks nothing at any clock, and shows what is open", async () => {
    for (const { label, now } of clocks()) {
      const source = published.at(now);
      const swept = await sweep(source, candidates, assetUrls, store);
      const hidden = fx.hiddenAt(now);
      const shown = fx.watched.filter((w) => !hidden.includes(w));
      for (const w of hidden) {
        expect(swept.routes.get(w.path), `${label}: ${w.name} route`).toBe("not-found");
        for (const leak of w.leaks)
          expect(swept.text.includes(leak), `${label}: ${w.name} leaks "${leak}"`).toBe(false);
        // comments and analytics resolve nothing for it
        if ("collection" in w.node)
          expect(await source.entryById?.(w.node.id), `${label}: ${w.name} by id`).toBeUndefined();
        expect(await publishedNode(source, w.path), `${label}: ${w.name} beacon`).toBeUndefined();
      }
      for (const w of shown) {
        expect(swept.routes.get(w.path), `${label}: ${w.name} route`).toBe(
          "collection" in w.node ? "entry" : "page",
        );
        expect(swept.text, `${label}: ${w.name} in the sitemap`).toContain(`${ORIGIN}${w.path}`);
      }
      // the embargoed entry's assets: the one riding only with it is hidden, the shared one is not
      const embargoHidden = hidden.some((w) => w.name === "embargoed entry");
      const riding = mediaPath(fx.ridingAsset);
      expect(swept.media.get(riding), `${label}: riding asset`).toBe(embargoHidden ? 404 : 200);
      expect(swept.media.get(mediaPath(fx.sharedAsset)), `${label}: shared asset`).toBe(200);
      if (embargoHidden) {
        expect(swept.text.includes(fx.ridingAsset.id), `${label}: riding asset id`).toBe(false);
        expect(swept.text.includes(riding.split("/")[2] as string), `${label}: riding url`).toBe(
          false,
        );
        // its only tag's archive lists nothing, so it is not served
        expect(swept.routes.get(fx.tagPath), `${label}: tag archive`).toBe("not-found");
      } else {
        expect(swept.routes.get(fx.tagPath), `${label}: tag archive`).toBe("archive");
      }
      // the cache cap: the next gate strictly after now
      const next = fx.gates.find((g) => g > now);
      expect(await source.nextGate(), label).toBe(next);
      expect(edgeMaxAge(await source.nextGate(), now)).toBe(
        next === undefined ? 31_536_000 : Math.max(1, Math.ceil((next - now) / 1000)),
      );
    }
  });

  it("defaults to the wall clock and agrees with LiveSource without drafts", async () => {
    const realNow = Date.now();
    const live = new LiveSource(store, site.id, { includeDrafts: false, now: () => T - 1 });
    const frozen = published.at(T - 1);
    expect((await live.allEntries()).map((e) => e.id).sort()).toEqual(
      (await frozen.allEntries()).map((e) => e.id).sort(),
    );
    expect((await live.pages()).map((p) => p.id)).toEqual((await frozen.pages()).map((p) => p.id));
    expect(await live.nextGate()).toBe(T);
    // the default view of a snapshot (comments, analytics) checks gates against the real clock
    const hidden = fx.hiddenAt(realNow).filter((w) => "collection" in w.node);
    for (const w of hidden) expect(await published.entryById(w.node.id)).toBeUndefined();
  });

  it("previews show every gated node, with a notice", async () => {
    const before = T - 1;
    for (const preview of [published.ungated(), new LiveSource(store, site.id)]) {
      for (const w of fx.watched)
        expect((await resolveRoute(preview, w.path)).kind, w.name).toBe(
          "collection" in w.node ? "entry" : "page",
        );
      expect(await preview.nextGate?.()).toBeUndefined();
      const assets = await loadAssetIndex(preview);
      expect(assets.has(fx.ridingAsset.id)).toBe(true);
    }
    const scoop = fx.watched.find((w) => w.name === "embargoed entry")?.node;
    const launch = fx.watched.find((w) => w.name === "embargoed page")?.node;
    const expired = fx.watched.find((w) => w.name === "expired entry")?.node;
    if (!scoop || !launch || !expired || !("collection" in scoop) || !("collection" in expired))
      throw new Error("fixture");
    if ("collection" in launch) throw new Error("fixture");
    const doc = renderEntryPreview(site, scoop, undefined, before);
    expect(doc.html).toContain('data-gate="embargoed"');
    // the gate is t+1h = 07:00 UTC; ICU words the date ("November 2, 2026 at 7:00 AM")
    expect(doc.html).toMatch(/Embargoed until November 2, 2026\D+7:00\D+\(UTC\)/);
    expect(renderEntryPreview(site, expired, undefined, before).html).toContain("Expired on ");
    expect(renderPagePreview(site, launch, {}, undefined, before).html).toContain(
      'data-gate="embargoed"',
    );
    // open nodes have no notice; the zone is the site's
    expect(renderEntryPreview(site, scoop, undefined, T + 3_600_000).html).not.toContain(
      "data-gate=",
    );
    const istanbul = { ...site, timeZone: "Europe/Istanbul" };
    expect(renderEntryPreview(istanbul, scoop, undefined, before).html).toMatch(
      /November 2, 2026\D+10:00\D+\(Istanbul\)/,
    );
  });
});
