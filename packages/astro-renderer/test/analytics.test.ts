/**
 * Site analytics in the renderer (RFC-0006 §5, rollout step 5): the published-node resolver, the
 * deployment switch, which responses are render events, and `SiteAnalytics` end to end on SQLite
 * (beacons, the tag, render events, settings and the Node handler). Hostile beacons — another
 * origin, a draft path, a client-sent node id — store nothing (invariants A1, A2, A4); GPC and DNT
 * suppress the visitor hash (A3); the tag follows the setting (A5).
 */
import { MemoryAnalytics } from "@cloudhal/analytics";
import { AnalyticsService } from "@cloudhal/analytics/service";
import { deleteSalt, putAnalyticsSettings, SqlAnalytics } from "@cloudhal/analytics/sql";
import type { AnalyticsEvent, ContentEntry, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, type SqlDriver } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  analyticsTag,
  deploymentDefaults,
  insertTag,
  isRenderEvent,
  parseHosts,
  publishedNode,
  SiteAnalytics,
} from "../src/analytics.ts";
import { createNodeAnalytics, nodeAnalyticsSettings } from "../src/analytics-node.ts";
import { SnapshotSource } from "../src/source.ts";

const actor = { kind: "human" as const, id: "user_analytics1", name: "Halil" };
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const SCRIPT = "/_cloudhal/p.0123abcd.js";

let sql: SqlDriver;
let store: SiteGraphStore;
let site: Site;
let draft: ContentEntry;
let clock: number;

async function publish(): Promise<string> {
  const current = (await store.getSite(site.id)) as Site;
  const snap = await store.createSnapshot(site.id, { actor, reason: "publish" });
  await store.publish(current, snap.id);
  return snap.id;
}

beforeEach(async () => {
  sql = await BetterSqlite3Driver.open(":memory:");
  store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  site = await seedStarterSite(store, { name: "News", slug: "news" });
  await publish();
  // written after the publish: a draft the published snapshot does not have
  draft = await store.createContentEntry({
    siteId: site.id,
    collection: "posts",
    slug: "secret-draft",
    locale: "en",
    status: "draft",
    title: "Secret draft",
    summary: "Not yet.",
    body: { format: "markdown", value: "Draft." },
    fields: {},
    tags: [],
    author: actor,
  } as never);
  clock = Date.UTC(2026, 9, 11, 12);
});

function analytics(options: Partial<ConstructorParameters<typeof SiteAnalytics>[0]> = {}): {
  a: SiteAnalytics;
  writer: MemoryAnalytics;
} {
  const writer = new MemoryAnalytics();
  const a = new SiteAnalytics({
    siteId: site.id,
    defaults: deploymentDefaults("on", JSON.stringify({ vitalsOneIn: 5 })),
    writer,
    sql: () => sql,
    site: () => store.getSite(site.id),
    snapshot: (id) => SnapshotSource.open(store, id),
    script: SCRIPT,
    hosts: ["news.example"],
    now: () => clock,
    ...options,
  });
  return { a, writer };
}

const beacon = (body: unknown, headers: Record<string, string> = {}, host = "news.example") =>
  new Request(`https://${host}/__cloudhal/e`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "sec-fetch-site": "same-origin",
      "user-agent": CHROME,
      "cf-connecting-ip": "203.0.113.7",
      ...headers,
    },
  });
const view = (path: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  kind: "pageview",
  path,
  referrer: "www.google.com",
  navType: "navigate",
  ...extra,
});

describe("publishedNode", () => {
  it("resolves pages, entries and archive pages of the published snapshot only", async () => {
    const s = await store.getSite(site.id);
    const source = await SnapshotSource.open(store, s?.publishedSnapshotId as string);
    const home = (await store.listPages(site.id)).find((p) => p.path === "/");
    const hello = (await store.listContentEntries(site.id)).find((e) => e.slug === "hello-world");
    const news = await store.getTermBySlug(site.id, "category", "news");
    expect(await publishedNode(source, "/")).toEqual({
      nodeId: home?.id,
      nodeKind: "page",
      locale: "en",
    });
    expect(await publishedNode(source, "/posts/hello-world")).toMatchObject({
      nodeId: hello?.id,
      nodeKind: "entry",
    });
    expect(await publishedNode(source, "/category/news")).toMatchObject({
      nodeId: news?.id,
      nodeKind: "archive",
    });
    expect(await publishedNode(source, `/posts/${draft.slug}`)).toBeUndefined();
    expect(await publishedNode(source, "/nope")).toBeUndefined();
    expect(await publishedNode(source, "/category/news/rss.xml")).toBeUndefined();
  });
});

describe("deployment switch and helpers", () => {
  it("is off unless CLOUDHAL_ANALYTICS is on; enabled defaults to true", () => {
    expect(deploymentDefaults(undefined, undefined)).toBeUndefined();
    expect(deploymentDefaults("off", '{"enabled":true}')).toBeUndefined();
    expect(deploymentDefaults("on", undefined)).toMatchObject({ enabled: true, vitalsOneIn: 5 });
    expect(deploymentDefaults("ON", '{"vitalsOneIn":0,"uniqueVisitors":true}')).toMatchObject({
      enabled: true,
      vitalsOneIn: 0,
      uniqueVisitors: true,
    });
    expect(deploymentDefaults("on", '{"enabled":false}')).toMatchObject({ enabled: false });
    expect(deploymentDefaults("on", "not json")).toMatchObject({ enabled: true });
    expect(parseHosts(" News.example, x.workers.dev ")).toEqual(["news.example", "x.workers.dev"]);
  });

  it("reads Node defaults from the integration options, else the environment", () => {
    expect(nodeAnalyticsSettings({}, {})).toEqual({ defaults: undefined, record: false });
    expect(nodeAnalyticsSettings({ analytics: { enabled: true, dev: true } }, {})).toMatchObject({
      defaults: { enabled: true },
      record: true,
    });
    expect(nodeAnalyticsSettings({ analytics: { enabled: false, dev: true } }, {}).defaults).toBe(
      undefined,
    );
    expect(
      nodeAnalyticsSettings({}, { CLOUDHAL_ANALYTICS: "on", CLOUDHAL_ANALYTICS_DEV: "1" }),
    ).toMatchObject({ defaults: { enabled: true }, record: true });
  });

  it("builds and inserts the tag", () => {
    const tag = analyticsTag(SCRIPT, 5);
    expect(tag).toBe(`<script type="module" src="${SCRIPT}" data-v="5"></script>`);
    expect(insertTag("<html><head><title>x</title></head><body></body></html>", tag)).toBe(
      `<html><head><title>x</title>${tag}</head><body></body></html>`,
    );
    expect(insertTag("<p>no head</p>", tag)).toBe("<p>no head</p>");
  });

  it("knows which responses are render events (§5.4)", () => {
    const get = (p: string, method = "GET") => new Request(`https://news.example${p}`, { method });
    const res = (status: number, headers: Record<string, string> = {}) =>
      new Response(null, { status, headers });
    const html = { "content-type": "text/html", "x-cloudhal-mode": "published" };
    expect(isRenderEvent(get("/about"), res(200, html))).toBe(true);
    expect(isRenderEvent(get("/about", "HEAD"), res(200, html))).toBe(false);
    expect(
      isRenderEvent(get("/rss.xml"), res(200, { "content-type": "application/rss+xml" })),
    ).toBe(false);
    expect(isRenderEvent(get("/about"), res(200, { ...html, "x-cloudhal-mode": "preview" }))).toBe(
      false,
    );
    expect(isRenderEvent(get("/about?cloudhal-preview=t"), res(404))).toBe(false);
    for (const status of [301, 302, 308, 404, 410, 451, 500, 503])
      expect(isRenderEvent(get("/old"), res(status)), String(status)).toBe(true);
    expect(
      isRenderEvent(
        get("/media/0123456789abcdef/a.png"),
        res(200, { "content-type": "image/png" }),
      ),
    ).toBe(false);
    expect(isRenderEvent(get("/media/0123456789abcdef/a.png"), res(206))).toBe(false);
    expect(isRenderEvent(get("/media/0123456789abcdef/a.png"), res(304))).toBe(false);
    expect(isRenderEvent(get("/__cloudhal/purge"), res(405))).toBe(false);
    expect(isRenderEvent(get("/_cloudhal/p.0123abcd.js"), res(404))).toBe(false);
  });
});

describe("SiteAnalytics", () => {
  it("records a page view for a published path with the node the server resolved", async () => {
    const { a, writer } = analytics();
    const res = await a.beacon(
      beacon(view("/posts/hello-world/", { utmSource: "Newsletter", utmMedium: "Email" })),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const hello = (await store.listContentEntries(site.id)).find((e) => e.slug === "hello-world");
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]).toMatchObject({
      kind: "pageview",
      siteId: site.id,
      path: "/posts/hello-world",
      nodeId: hello?.id,
      nodeKind: "entry",
      refHost: "google.com",
      channel: "email",
      utmSource: "newsletter",
      entrance: true,
      device: "desktop",
      browser: "chrome",
    });
    // no IP, no user agent, no visitor hash (unique visitors is off by default)
    const stored = JSON.stringify(writer.events[0]);
    expect(stored).not.toContain("203.0.113.7");
    expect(stored).not.toContain("Chrome/141");
    expect(writer.events[0]).not.toHaveProperty("visitor");
  });

  it("stores nothing for forged beacons, and still answers 204", async () => {
    const { a, writer } = analytics();
    const forged = [
      // another origin
      beacon(view("/about"), { "sec-fetch-site": "cross-site" }),
      beacon(view("/about"), { "sec-fetch-site": "same-site" }),
      // no Sec-Fetch-Site and an Origin from elsewhere
      (() => {
        const r = beacon(view("/about"), { origin: "https://evil.example" });
        r.headers.delete("sec-fetch-site");
        return r;
      })(),
      // a host that is not the site's
      beacon(view("/about"), {}, "other.example"),
      // a draft path, an unknown path, a feed
      beacon(view(`/posts/${draft.slug}`)),
      beacon(view("/wp-login.php")),
      beacon(view("/category/news/rss.xml")),
      // a client-sent node id or identifier
      beacon(view("/about", { nodeId: draft.id })),
      beacon(view("/about", { clientId: "abc" })),
      // render events never come from a browser
      beacon({ schemaVersion: 1, kind: "render", path: "/about", status: 404 }),
      // bots and oversized bodies
      beacon(view("/about"), { "user-agent": GOOGLEBOT }),
      beacon(view("/about", { referrer: "x".repeat(3000) })),
    ];
    for (const r of forged) expect((await a.beacon(r)).status).toBe(204);
    expect(writer.events).toEqual([]);
    expect((await a.beacon(new Request("https://news.example/__cloudhal/e"))).status).toBe(405);
  });

  it("accepts the request's own host when allowed (workers.dev) and counts same-site referrers as internal", async () => {
    const { a, writer } = analytics({ acceptRequestHost: (h) => h.endsWith(".workers.dev") });
    await a.beacon(
      beacon(
        view("/about", { referrer: "news-site.acct.workers.dev" }),
        {},
        "news-site.acct.workers.dev",
      ),
    );
    expect(writer.events[0]).toMatchObject({
      path: "/about",
      channel: "internal",
      entrance: false,
    });
  });

  it("hashes visitors only in unique-visitors mode and never with GPC or DNT", async () => {
    await putAnalyticsSettings(sql, {
      siteId: site.id,
      rev: 0,
      patch: { enabled: true, uniqueVisitors: true },
      actorId: actor.id,
      now: new Date(clock),
    });
    const { a, writer } = analytics();
    await a.beacon(beacon(view("/about")));
    await a.beacon(beacon(view("/about"), { "sec-gpc": "1" }));
    await a.beacon(beacon(view("/about"), { dnt: "1" }));
    expect(writer.events).toHaveLength(3);
    expect(writer.events[0]).toHaveProperty("visitor", expect.stringMatching(/^[0-9a-f]{16}$/));
    expect(writer.events[1]).not.toHaveProperty("visitor");
    expect(writer.events[2]).not.toHaveProperty("visitor");
  });

  it("never hashes with a salt deleted by switching unique visitors off, also when it is switched on again", async () => {
    const settings = (rev: number, uniqueVisitors: boolean) =>
      putAnalyticsSettings(sql, {
        siteId: site.id,
        rev,
        patch: { enabled: true, uniqueVisitors },
        actorId: actor.id,
        now: new Date(clock),
      });
    await settings(0, true);
    const { a, writer } = analytics();
    const service = new AnalyticsService({
      sql,
      store: "sql",
      now: () => new Date(clock),
      purgeSite: async () => a.reset(),
    });
    const visitor = () => (writer.events.at(-1) as { visitor?: string } | undefined)?.visitor;
    await a.beacon(beacon(view("/about")));
    const before = visitor();
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    // off and on again the same day through the settings route: the salt is deleted, and the
    // route's purge resets the memo, so the same visitor gets an unlinkable hash
    await service.updateSettings({
      siteId: site.id,
      rev: 1,
      patch: { uniqueVisitors: false },
      actorId: actor.id,
    });
    await a.beacon(beacon(view("/about")));
    expect(visitor()).toBeUndefined();
    await service.updateSettings({
      siteId: site.id,
      rev: 2,
      patch: { uniqueVisitors: true },
      actorId: actor.id,
    });
    await a.beacon(beacon(view("/about")));
    const after = visitor();
    expect(after).toMatch(/^[0-9a-f]{16}$/);
    expect(after).not.toBe(before);

    // without a purge reaching this isolate, the change is seen when the settings memo expires,
    // and the salt is read again with them
    await deleteSalt(sql, new Date(clock).toISOString().slice(0, 10));
    await settings(3, true);
    clock += 60_001;
    await a.beacon(beacon(view("/about")));
    expect(visitor()).toMatch(/^[0-9a-f]{16}$/);
    expect([before, after]).not.toContain(visitor());
  });

  it("checks vitals against the site's sampling", async () => {
    const { a, writer } = analytics();
    const vitals = (sampleOneIn: number) => ({
      schemaVersion: 1,
      kind: "vitals",
      path: "/about",
      lcp: 2140.4,
      cls: 0.051,
      sampleOneIn,
    });
    await a.beacon(beacon(vitals(2)));
    await a.beacon(beacon(vitals(5)));
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]).toMatchObject({ kind: "vitals", lcp: 2140, sampleOneIn: 5 });
  });

  it("follows the site's setting: off means no tag and no writes; reset() re-reads it", async () => {
    const { a, writer } = analytics();
    expect(await a.tag()).toBe(analyticsTag(SCRIPT, 5));
    await putAnalyticsSettings(sql, {
      siteId: site.id,
      rev: 0,
      patch: { enabled: false },
      actorId: actor.id,
      now: new Date(clock),
      defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
    });
    // memoised for 60 s …
    expect(await a.tag()).toBeDefined();
    // … until a purge resets it, or the minute passes
    a.reset();
    expect(await a.tag()).toBeUndefined();
    await a.beacon(beacon(view("/about")));
    expect(writer.events).toEqual([]);

    await putAnalyticsSettings(sql, {
      siteId: site.id,
      rev: 1,
      patch: { enabled: true, vitalsOneIn: 20 },
      actorId: actor.id,
      now: new Date(clock),
    });
    clock += 60_001;
    expect(await a.tag()).toBe(analyticsTag(SCRIPT, 20));
  });

  it("is off when the deployment is off, there is no store, or the settings table is missing", async () => {
    expect(await analytics({ defaults: undefined }).a.tag()).toBeUndefined();
    expect(await analytics({ writer: undefined }).a.tag()).toBeUndefined();
    const bare = await BetterSqlite3Driver.open(":memory:");
    const { a, writer } = analytics({ sql: () => bare });
    expect(await a.tag()).toBeUndefined();
    await a.beacon(beacon(view("/about")));
    expect(writer.events).toEqual([]);
  });

  it("writes render events for errors, redirects and published pages, with crawlers and same-site referrers", async () => {
    const hello = (await store.listContentEntries(site.id)).find((e) => e.slug === "hello-world");
    const about = (await store.listPages(site.id)).find((p) => p.path === "/about");
    const { a, writer } = analytics();
    const get = (p: string, headers: Record<string, string> = {}) =>
      new Request(`https://news.example${p}`, { headers: { "user-agent": CHROME, ...headers } });
    await a.render(
      get("/missing?q=secret", { referer: "https://news.example/about" }),
      new Response(null, { status: 404 }),
      12,
    );
    await a.render(
      get("/posts/old-hello"),
      new Response(null, { status: 301, headers: { location: "/posts/hello-world?utm_source=x" } }),
      3,
    );
    await a.render(
      get("/about", { "user-agent": GOOGLEBOT }),
      new Response("<html></html>", {
        headers: { "content-type": "text/html", "x-cloudhal-mode": "published" },
      }),
      40,
    );
    // never: previews, HEAD, a feed
    await a.render(get("/about?cloudhal-preview=t"), new Response(null, { status: 404 }), 1);
    await a.render(
      new Request("https://news.example/x", { method: "HEAD" }),
      new Response(null, { status: 404 }),
      1,
    );
    const events = writer.events as AnalyticsEvent[];
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      kind: "render",
      path: "/missing",
      status: 404,
      refPath: "/about",
      renderMs: 12,
    });
    expect(events[0]).not.toHaveProperty("nodeId");
    expect(events[1]).toMatchObject({
      status: 301,
      path: "/posts/old-hello",
      redirectTo: "/posts/hello-world",
      nodeId: hello?.id,
      nodeKind: "entry",
    });
    expect(events[2]).toMatchObject({
      status: 200,
      nodeId: about?.id,
      nodeKind: "page",
      device: "bot",
      crawler: "googlebot",
    });
  });

  it("samples render events past 120 a minute per isolate", async () => {
    const { a, writer } = analytics();
    for (let i = 0; i < 150; i++)
      await a.render(
        new Request(`https://news.example/wp-login-${i}.php`),
        new Response(null, { status: 404 }),
        1,
      );
    expect(writer.events).toHaveLength(123);
    expect(writer.events.at(-1)).toMatchObject({ sampleOneIn: 10 });
  });
});

describe("Node handler (cloudhal dev)", () => {
  const backend = () => ({
    open: async () => sql,
    sql: () => sql,
    site: () => store.getSite(site.id),
    snapshot: (id: string) => SnapshotSource.open(store, id),
  });
  const client = {
    script: { path: SCRIPT, code: "/*p*/" },
    vitals: { path: "/_cloudhal/v.89abcdef.js", code: "/*v*/" },
  };
  const page = () =>
    Promise.resolve(
      new Response("<html><head></head><body>Hi</body></html>", {
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "41" },
      }),
    );

  it("answers the beacon without recording unless analytics.dev is on", async () => {
    const handler = createNodeAnalytics({
      siteId: site.id,
      backend: backend(),
      client,
      defaults: deploymentDefaults("on", undefined),
      record: false,
    });
    expect((await handler(beacon(view("/about")), page)).status).toBe(204);
    const html = await (await handler(new Request("http://localhost:4321/about"), page)).text();
    expect(html).not.toContain("<script");
    expect(
      (await handler(new Request(`http://localhost:4321${SCRIPT}`), page)).headers.get(
        "content-type",
      ),
    ).toContain("text/html");
    const rows = await sql.all("SELECT * FROM analytics_events");
    expect(rows).toEqual([]);
  });

  it("records into SQLite, injects the tag and serves the scripts when it is on", async () => {
    const handler = createNodeAnalytics({
      siteId: site.id,
      backend: backend(),
      client,
      defaults: deploymentDefaults("on", undefined),
      record: true,
    });
    const local = (p: string, init?: RequestInit) => new Request(`http://localhost:4321${p}`, init);
    const res = await handler(
      new Request("http://localhost:4321/__cloudhal/e", {
        method: "POST",
        body: JSON.stringify(view("/about", { referrer: "" })),
        headers: { "sec-fetch-site": "same-origin", "user-agent": CHROME },
      }),
      page,
      "127.0.0.1",
    );
    expect(res.status).toBe(204);
    const out = await handler(local("/about"), page);
    expect(out.headers.get("content-length")).toBeNull();
    expect(await out.text()).toBe(
      `<html><head>${analyticsTag(SCRIPT, 5)}</head><body>Hi</body></html>`,
    );
    const js = await handler(local(client.vitals.path), page);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect(await js.text()).toBe("/*v*/");
    await handler(local("/gone-page"), () => Promise.resolve(new Response(null, { status: 404 })));
    await new SqlAnalytics(sql).flush();
    await new Promise((r) => setTimeout(r, 20));
    const rows = await sql.all<{ kind: string; path: string; channel: string | null }>(
      "SELECT kind, path, channel FROM analytics_events ORDER BY id",
    );
    expect(rows).toEqual([
      { kind: "pageview", path: "/about", channel: "direct" },
      { kind: "render", path: "/gone-page", channel: null },
    ]);
  });
});
