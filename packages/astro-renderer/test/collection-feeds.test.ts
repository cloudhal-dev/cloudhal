/**
 * RFC-0042 §5: per-collection feeds, served by the renderer's middleware only where the theme's
 * routes answered 404, over the stage 3 fixture (an `unlist` events collection, a `hide` offers
 * collection) published in a real store.
 */
import type { Site } from "@cloudhal/core-contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { collectionFeedXml, serveCollectionFeed } from "../src/collection-feed-route.ts";
import {
  collectionFeedLink,
  collectionFeedPath,
  collectionForFeedPath,
  feedCollections,
} from "../src/collection-feeds.ts";
import { staticPaths } from "../src/routing.ts";
import { type GraphSource, SnapshotSource } from "../src/source.ts";
import { EVENTS, HOUR, type Stage3, stage3, T } from "./stage3-fixture.ts";

const ORIGIN = "https://feeds.example";
const notFound = () => new Response("not found", { status: 404 });
const get = (path: string, method = "GET") => new Request(`${ORIGIN}${path}`, { method });

/** The middleware over `source`, with the site tag a published Worker response carries. */
function serve(
  source: GraphSource | undefined,
  path: string,
  response = notFound(),
  method?: string,
) {
  return serveCollectionFeed(get(path, method), response, async (headers) => {
    headers.set("cache-tag", "cloudhal-site-test");
    headers.set("cloudflare-cdn-cache-control", "public, max-age=60");
    return source;
  });
}

describe("collection feeds (RFC-0042 §5)", () => {
  let fx: Stage3;
  let published: SnapshotSource;

  beforeAll(async () => {
    fx = await stage3();
    published = (await SnapshotSource.open(fx.store, fx.snapshotId)).at(T);
  });

  it("serves a collection's feed where the theme answered 404, with the site feed's headers", async () => {
    const res = await serve(published, "/events/rss.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(res.headers.get("cache-tag")).toBe(`cloudhal-site-test,cloudhal-list-${fx.site.id}`);
    expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=60");
    const xml = await res.text();
    expect(xml).toContain("<title>Events · Stage Three</title>");
    expect(xml).toContain(`<atom:link href="${ORIGIN}/events/rss.xml" rel="self"`);
    expect(xml).toContain(`<link>${ORIGIN}/events/soon-gig</link>`);
    expect(xml).toContain(`<link>${ORIGIN}/events/undated-gig</link>`);
    // only this collection's entries
    expect(xml).not.toContain("/posts/");
    expect(xml).not.toContain("/offers/");
    // an event past its `unlist` expiry leaves the feed (its page stays)
    expect(xml).not.toContain("ZQXU7");
    expect(xml).not.toContain("/events/past-gig");
  });

  it("leaves the theme's own answer alone", async () => {
    const own = new Response("<rss>theme</rss>", { status: 200 });
    expect(await serve(published, "/events/rss.xml", own)).toBe(own);
    const gone = new Response(null, { status: 410 });
    expect(await serve(published, "/events/rss.xml", gone)).toBe(gone);
    const redirect = new Response(null, { status: 301, headers: { location: "/x" } });
    expect(await serve(published, "/events/rss.xml", redirect)).toBe(redirect);
  });

  it("answers only feed paths of collections with a feed, to GET and HEAD", async () => {
    for (const path of ["/events", "/events/feed.xml", "/nope/rss.xml", "/events/x/rss.xml"]) {
      const miss = notFound();
      expect(await serve(published, path, miss), path).toBe(miss);
    }
    const post = notFound();
    expect(await serve(published, "/events/rss.xml", post, "POST")).toBe(post);
    expect((await serve(published, "/events/rss.xml", notFound(), "HEAD")).status).toBe(200);
    // an unpublished site keeps the 404
    const unpublished = notFound();
    expect(await serve(undefined, "/events/rss.xml", unpublished)).toBe(unpublished);
    // the built-in collection has one too
    expect((await serve(published, "/posts/rss.xml")).status).toBe(200);
  });

  it("drops entries past a `hide` expiry when their gate passes", async () => {
    const today = await (await serve(published, "/offers/rss.xml")).text();
    expect(today).not.toContain("ZQXU8");
    expect(today).toContain("ZQXU9");
    // 21:00 UTC is midnight in Istanbul: the offer valid "all of today" is hidden then
    const tonight = await (await serve(published.at(T + 9 * HOUR), "/offers/rss.xml")).text();
    expect(tonight).not.toContain("ZQXU9");
    expect(tonight).toContain("<title>Offers · Stage Three</title>");
  });

  it("answers 404 for a collection with `feed: false`, and lists no path or link for it", async () => {
    const off = await stage3({ events: { ...EVENTS, feed: false } });
    const source = (await SnapshotSource.open(off.store, off.snapshotId)).at(T);
    const miss = notFound();
    expect(await serve(source, "/events/rss.xml", miss)).toBe(miss);
    expect(collectionFeedLink(off.site, "events", ORIGIN)).toBeUndefined();
    const { feeds } = await staticPaths(source);
    expect(feeds).not.toContain("/events/rss.xml");
    expect(feeds).toContain("/offers/rss.xml");
  });

  it("lists every collection feed for static builds", async () => {
    const { feeds } = await staticPaths(published);
    expect(feeds).toEqual(
      expect.arrayContaining(["/events/rss.xml", "/offers/rss.xml", "/posts/rss.xml"]),
    );
    expect(new Set(feeds).size).toBe(feeds.length);
  });

  it("serves a locale's collection feed under its prefix, in its language", async () => {
    const fy = await stage3();
    const site = await fy.store.updateSite({ ...fy.site, locales: ["en", "es"] });
    const [hello] = await fy.store.listContentEntries(site.id, "posts");
    await fy.store.createContentEntry({
      siteId: site.id,
      collection: "events",
      slug: "fiesta",
      locale: "es",
      status: "published",
      title: "Fiesta ZQXU5",
      body: { format: "markdown", value: "Una fiesta." },
      fields: { venue: "Sala" },
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author: { kind: "human", id: "user_stage3000001", name: "Halil" },
    } as never);
    const snap = await fy.store.createSnapshot(site.id, {
      actor: { kind: "human", id: "user_stage3000001", name: "Halil" },
      reason: "publish",
    });
    await fy.store.publish((await fy.store.getSite(site.id)) as Site, snap.id);
    const source = (await SnapshotSource.open(fy.store, snap.id)).at(T);
    const es = await (await serve(source, "/es/events/rss.xml")).text();
    expect(es).toContain("<language>es</language>");
    expect(es).toContain(`<link>${ORIGIN}/es/events/fiesta</link>`);
    expect(es).toContain(`<atom:link href="${ORIGIN}/es/events/rss.xml" rel="self"`);
    expect(es).not.toContain("soon-gig");
    const en = await (await serve(source, "/events/rss.xml")).text();
    expect(en).not.toContain("ZQXU5");
    // the default locale's prefixed URL moves (the theme answers it): the middleware stays out
    const moved = notFound();
    expect(await serve(source, "/en/events/rss.xml", moved)).toBe(moved);
    expect(collectionFeedLink(site, "events", ORIGIN, "es")).toEqual({
      title: "Events · Stage Three",
      href: `${ORIGIN}/es/events/rss.xml`,
    });
  });

  it("links a collection's feed for themes, and knows which collections have one", () => {
    const site = fx.site;
    expect(collectionFeedLink(site, "events", ORIGIN)).toEqual({
      title: "Events · Stage Three",
      href: `${ORIGIN}/events/rss.xml`,
    });
    // an undeclared collection is labelled by its key
    expect(collectionFeedLink(site, "notes", ORIGIN)?.title).toBe("notes · Stage Three");
    // a permalink without a prefix has no feed of its own (it would be the site's /rss.xml)
    const rooted = {
      ...site,
      collections: { ...site.collections, pages: { permalink: "/{slug}" } },
    } as Site;
    expect(collectionFeedPath(rooted, "pages")).toBeUndefined();
    expect(feedCollections(rooted)).not.toContain("pages");
    // an undeclared collection has a feed once it has entries
    expect(collectionForFeedPath(site, "/notes/rss.xml")).toBeUndefined();
    expect(collectionForFeedPath(site, "/notes/rss.xml", [{ collection: "notes" } as never])).toBe(
      "notes",
    );
  });

  it("titles the channel after the collection and links the page at its prefix", async () => {
    const xml = await collectionFeedXml(published, {
      origin: ORIGIN,
      locale: "en",
      collection: "events",
    });
    // no page at /events in the fixture: the channel links the home page
    expect(xml).toContain(`<link>${ORIGIN}/</link>`);
    expect(xml).toContain("<description>Stage Three</description>");
  });
});
