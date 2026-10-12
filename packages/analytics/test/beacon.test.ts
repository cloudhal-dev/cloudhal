/** The beacon handler (RFC-0006 §5.2) and invariants A1–A4 with hostile beacons. */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  type BeaconContext,
  type EffectiveAnalyticsSettings,
  handleBeacon,
  MemoryAnalytics,
  processBeacon,
  type ResolvedNode,
} from "../src/index.ts";

const SITE = "site_01HZX8K3Q9ST";
const HOST = "news.example.org";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const ROUTES: Record<string, ResolvedNode> = {
  "/": { nodeId: "page_01HZX8K3Q9HM", nodeKind: "page", locale: "en" },
  "/posts/ferry-timetables": { nodeId: "entry_01HZX8K3Q9FT", nodeKind: "entry", locale: "en" },
  "/category/transport": { nodeId: "term_01HZX8K3Q9TR", nodeKind: "archive" },
  "/category/transport/page/2": { nodeId: "term_01HZX8K3Q9TR", nodeKind: "archive" },
};

function settings(over: Partial<EffectiveAnalyticsSettings> = {}): EffectiveAnalyticsSettings {
  return {
    siteId: SITE,
    enabled: true,
    uniqueVisitors: false,
    vitalsOneIn: 5,
    rollupRetentionDays: null,
    planHint: null,
    rev: 1,
    stored: true,
    ...over,
  };
}

function setup(over: Partial<BeaconContext> = {}, s = settings()) {
  const store = new MemoryAnalytics();
  const salts: string[] = [];
  const ctx: BeaconContext = {
    siteId: SITE,
    settings: () => s,
    hosts: [HOST, "newsroom.example.workers.dev"],
    resolvePath: (p) => ROUTES[p],
    writer: store,
    salt: async (day) => {
      salts.push(day);
      return "5".repeat(64);
    },
    country: "TR",
    clientIp: "203.0.113.9",
    now: () => new Date("2026-10-09T08:14:03Z"),
    ...over,
  };
  return { store, ctx, salts };
}

function beacon(
  body: unknown,
  headers: Record<string, string> = {},
  init: { method?: string; host?: string } = {},
): Request {
  const h: Record<string, string> = {
    "content-type": "text/plain;charset=UTF-8",
    "sec-fetch-site": "same-origin",
    "user-agent": CHROME,
    "cf-connecting-ip": "203.0.113.9",
    ...headers,
  };
  for (const [k, v] of Object.entries(h)) if (v === "") delete h[k];
  return new Request(`https://${init.host ?? HOST}/__cloudhal/e`, {
    method: init.method ?? "POST",
    headers: h,
    ...(init.method === "GET"
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

const view = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  kind: "pageview",
  path: "/posts/ferry-timetables",
  referrer: "news.ycombinator.com",
  navType: "navigate",
  ...extra,
});

describe("POST /__cloudhal/e", () => {
  it("writes one enriched page view and answers 204 no-store", async () => {
    const { store, ctx } = setup();
    const res = await handleBeacon(beacon(view()), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(store.events).toEqual([
      {
        schemaVersion: 1,
        kind: "pageview",
        siteId: SITE,
        timestamp: "2026-10-09T08:14:03.000Z",
        path: "/posts/ferry-timetables",
        nodeId: "entry_01HZX8K3Q9FT",
        nodeKind: "entry",
        refHost: "news.ycombinator.com",
        channel: "social",
        country: "TR",
        device: "desktop",
        browser: "chrome",
        os: "windows",
        navType: "navigate",
        locale: "en",
        entrance: true,
      },
    ]);
  });

  it("answers 405 to other methods and 204 to every refused beacon", async () => {
    const { ctx } = setup();
    expect((await handleBeacon(beacon(null, {}, { method: "GET" }), ctx)).status).toBe(405);
    const res = await handleBeacon(beacon({ nope: true }), ctx);
    expect(res.status).toBe(204);
  });

  it("resolves routes on the server: case, trailing slash, archives, page 2, home", async () => {
    const { store, ctx } = setup();
    for (const path of ["/Posts/Ferry-Timetables/", "/category/transport/page/2", "/"])
      expect((await processBeacon(beacon(view({ path })), ctx)).ok).toBe(true);
    expect(store.events.map((e) => [e.path, (e as { nodeId: string }).nodeId])).toEqual([
      ["/posts/ferry-timetables", "entry_01HZX8K3Q9FT"],
      ["/category/transport/page/2", "term_01HZX8K3Q9TR"],
      ["/", "page_01HZX8K3Q9HM"],
    ]);
  });

  it.each([
    ["an unknown path", view({ path: "/wp-admin" }), "unknown-path"],
    ["a draft (unpublished) path", view({ path: "/posts/draft-story" }), "unknown-path"],
    ["a slug-changed old path (it redirects)", view({ path: "/posts/ferries" }), "unknown-path"],
    [
      "a preview token in the path",
      view({ path: "/posts/ferry-timetables?preview=abc" }),
      "invalid-beacon",
    ],
    ["a client node id", view({ nodeId: "entry_01HZX8K3Q9XX" }), "invalid-beacon"],
    ["a client identifier", view({ clientId: "abc" }), "invalid-beacon"],
    ["an IP address", view({ ip: "203.0.113.9" }), "invalid-beacon"],
    ["a user agent", view({ userAgent: CHROME }), "invalid-beacon"],
    [
      "a render event",
      { schemaVersion: 1, kind: "render", path: "/", status: 404 },
      "invalid-beacon",
    ],
    ["broken JSON", "{", "invalid-json"],
  ])("stores nothing for %s", async (_, body, reason) => {
    const { store, ctx } = setup();
    expect(await processBeacon(beacon(body), ctx)).toEqual({ ok: false, reason });
    expect(store.events).toEqual([]);
  });

  it("refuses cross-site and foreign-host beacons", async () => {
    const { store, ctx } = setup();
    const cases: [Request, string][] = [
      [beacon(view(), { "sec-fetch-site": "cross-site" }), "cross-site"],
      [beacon(view(), { "sec-fetch-site": "same-site" }), "cross-site"],
      [beacon(view(), { "sec-fetch-site": "", origin: "https://evil.example" }), "cross-site"],
      [beacon(view(), { "sec-fetch-site": "" }), "no-origin"],
      [beacon(view(), {}, { host: "evil.example" }), "foreign-host"],
    ];
    for (const [req, reason] of cases)
      expect(await processBeacon(req, ctx)).toEqual({ ok: false, reason });
    expect(store.events).toEqual([]);
    // older browsers: Origin (or Referer) of the same host is enough
    expect(
      (
        await processBeacon(
          beacon(view(), { "sec-fetch-site": "", origin: `https://${HOST}` }),
          ctx,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await processBeacon(
          beacon(view(), {
            "sec-fetch-site": "",
            referer: `https://${HOST}/posts/ferry-timetables`,
          }),
          ctx,
        )
      ).ok,
    ).toBe(true);
  });

  it("caps the body at 2 KB", async () => {
    const { ctx } = setup();
    const big = JSON.stringify(view({ referrer: "x".repeat(3000) }));
    expect(await processBeacon(beacon(big), ctx)).toEqual({ ok: false, reason: "too-large" });
    expect(await processBeacon(beacon(view(), { "content-length": "5000" }), ctx)).toMatchObject({
      ok: false,
    });
  });

  it("drops bots, scripts and requests without a user agent", async () => {
    const { store, ctx } = setup();
    for (const ua of [
      "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "curl/8.7.1",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/129.0.0.0 Safari/537.36",
      `${CHROME} ${"x".repeat(600)}`,
    ])
      expect((await processBeacon(beacon(view(), { "user-agent": ua }), ctx)).ok).toBe(false);
    expect(await processBeacon(beacon(view(), { "user-agent": "" }), ctx)).toEqual({
      ok: false,
      reason: "no-user-agent",
    });
    expect(store.events).toEqual([]);
  });

  it("fails closed when analytics is off or the settings cannot be read", async () => {
    const off = setup({}, settings({ enabled: false }));
    expect(await processBeacon(beacon(view()), off.ctx)).toEqual({ ok: false, reason: "off" });
    const broken = setup({
      settings: () => {
        throw new Error("no such table: analytics_settings");
      },
    });
    expect(await processBeacon(beacon(view()), broken.ctx)).toEqual({ ok: false, reason: "off" });
  });

  it("drops beacons over the rate limit", async () => {
    const { ctx } = setup({
      rateLimit: (ip, kind) => !(ip === "203.0.113.9" && kind === "pageview"),
    });
    expect(await processBeacon(beacon(view()), ctx)).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("classifies referrers: internal views are no visit, UTM normalised, URLs never stored", async () => {
    const { store, ctx } = setup();
    await processBeacon(beacon(view({ referrer: `www.${HOST}` })), ctx);
    await processBeacon(
      beacon(
        view({
          referrer: "",
          utmSource: " Weekly Newsletter ",
          utmMedium: "Email",
          utmCampaign: "jane.doe@example.org",
        }),
      ),
      ctx,
    );
    await processBeacon(beacon(view({ referrer: "https://evil.example/path?q=secret" })), ctx);
    await processBeacon(beacon(view({ referrer: "chatgpt.com", navType: "reload" })), ctx);
    const [internal, campaign, url, reload] = store.events as Extract<
      AnalyticsEvent,
      { kind: "pageview" }
    >[];
    expect(internal).toMatchObject({ channel: "internal", entrance: false });
    expect(internal).not.toHaveProperty("refHost");
    expect(campaign).toMatchObject({
      channel: "email",
      utmSource: "weekly-newsletter",
      utmMedium: "email",
      entrance: true,
    });
    expect(campaign).not.toHaveProperty("utmCampaign");
    expect(url).toMatchObject({ channel: "direct" });
    expect(url).not.toHaveProperty("refHost");
    expect(reload).toMatchObject({ channel: "ai", refHost: "chatgpt.com", entrance: false });
    expect(JSON.stringify(store.events)).not.toMatch(/203\.0\.113|Mozilla|secret|jane/);
  });

  it("takes the client address from the caller only, never from a request header", async () => {
    const seen: string[] = [];
    const rateLimit = (ip: string) => {
      seen.push(ip);
      return true;
    };
    const spoof = { "cf-connecting-ip": "192.0.2.66", "x-forwarded-for": "192.0.2.67" };
    // the caller's address wins over a client-sent CF-Connecting-IP
    const trusted = setup(
      { rateLimit, clientIp: "198.51.100.1" },
      settings({ uniqueVisitors: true }),
    );
    expect((await processBeacon(beacon(view(), spoof), trusted.ctx)).ok).toBe(true);
    // without one, the header is still ignored: no limit key and no visitor hash
    const none = setup({ rateLimit }, settings({ uniqueVisitors: true }));
    const { clientIp: _ip, ...withoutIp } = none.ctx;
    expect((await processBeacon(beacon(view(), spoof), withoutIp)).ok).toBe(true);
    expect(seen).toEqual(["198.51.100.1", ""]);
    expect(trusted.store.events[0]).toHaveProperty("visitor");
    expect(none.store.events[0]).not.toHaveProperty("visitor");
    // the hash follows the trusted address, not the header
    const other = setup({ clientIp: "198.51.100.1" }, settings({ uniqueVisitors: true }));
    await processBeacon(beacon(view(), { "cf-connecting-ip": "192.0.2.99" }), other.ctx);
    expect((other.store.events[0] as { visitor?: string }).visitor).toBe(
      (trusted.store.events[0] as { visitor?: string }).visitor,
    );
  });

  it("hashes visitors only in unique-visitors mode and never with GPC or DNT", async () => {
    const on = setup({}, settings({ uniqueVisitors: true }));
    await processBeacon(beacon(view()), on.ctx);
    await processBeacon(beacon(view(), { "sec-gpc": "1" }), on.ctx);
    await processBeacon(beacon(view(), { dnt: "1" }), on.ctx);
    const [hashed, gpc, dnt] = on.store.events as Extract<AnalyticsEvent, { kind: "pageview" }>[];
    expect(hashed?.visitor).toMatch(/^[0-9a-f]{16}$/);
    expect(gpc).not.toHaveProperty("visitor");
    expect(dnt).not.toHaveProperty("visitor");
    expect(on.salts).toEqual(["2026-10-09"]);
    // the signal itself is kept as a flag per view (Studio shows the share), nothing else
    expect(hashed).not.toHaveProperty("privacySignal");
    expect(gpc?.privacySignal).toBe(true);
    expect(dnt?.privacySignal).toBe(true);

    const off = setup();
    await processBeacon(beacon(view()), off.ctx);
    expect(off.store.events[0]).not.toHaveProperty("visitor");
    expect(off.salts).toEqual([]);
    // also without unique visitors, and never for a signal other than "1"
    await processBeacon(beacon(view(), { "sec-gpc": "1" }), off.ctx);
    await processBeacon(beacon(view(), { dnt: "0" }), off.ctx);
    expect(off.store.events.map((e) => (e as { privacySignal?: boolean }).privacySignal)).toEqual([
      undefined,
      true,
      undefined,
    ]);
  });

  it("records vitals only at the site's sampling, rounded, with at least one metric", async () => {
    const { store, ctx } = setup();
    const vitals = (extra: Record<string, unknown>) => ({
      schemaVersion: 1,
      kind: "vitals",
      path: "/posts/ferry-timetables",
      sampleOneIn: 5,
      ...extra,
    });
    expect(
      await processBeacon(beacon(vitals({ lcp: 2140.4, cls: 0.04213, inp: 95.5 })), ctx),
    ).toMatchObject({ ok: true });
    expect(store.events[0]).toMatchObject({
      kind: "vitals",
      lcp: 2140,
      inp: 96,
      cls: 0.0421,
      sampleOneIn: 5,
    });
    expect(await processBeacon(beacon(vitals({ lcp: 1, sampleOneIn: 1 })), ctx)).toEqual({
      ok: false,
      reason: "vitals-sampling",
    });
    expect(await processBeacon(beacon(vitals({})), ctx)).toEqual({
      ok: false,
      reason: "no-metrics",
    });
    const off = setup({}, settings({ vitalsOneIn: 0 }));
    expect(await processBeacon(beacon(vitals({ lcp: 1 })), off.ctx)).toEqual({
      ok: false,
      reason: "vitals-off",
    });
  });

  it("never fails the response when the writer throws", async () => {
    const errors: string[] = [];
    const { ctx } = setup({
      writer: {
        write() {
          throw new Error("quota");
        },
      },
      onError: (m) => errors.push(m),
    });
    const res = await handleBeacon(beacon(view()), ctx);
    expect(res.status).toBe(204);
    expect(errors).toEqual(["analytics write failed"]);
  });
});
