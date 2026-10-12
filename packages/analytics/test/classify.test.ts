import { describe, expect, it } from "vitest";
import {
  BeaconRateLimiter,
  buildRenderEvent,
  classifyChannel,
  classifyUserAgent,
  crawlerClass,
  normaliseBeaconPath,
  normaliseHost,
  normaliseUtm,
  RenderEventSampler,
  SharedBeaconRateLimiter,
  toRequestPath,
  visitorHash,
} from "../src/index.ts";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  edgeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  operaWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

describe("user-agent classifier", () => {
  it.each([
    [UA.chromeWin, "desktop", "chrome", "windows"],
    [UA.edgeMac, "desktop", "edge", "macos"],
    [UA.safariIphone, "mobile", "safari", "ios"],
    [UA.safariIpad, "tablet", "safari", "ios"],
    [UA.firefoxLinux, "desktop", "firefox", "linux"],
    [UA.samsungAndroid, "mobile", "samsung", "android"],
    [UA.chromeAndroidTablet, "tablet", "chrome", "android"],
    [UA.operaWin, "desktop", "opera", "windows"],
    [UA.chromebook, "desktop", "chrome", "chromeos"],
  ])("%s", (ua, device, browser, os) => {
    expect(classifyUserAgent(ua)).toEqual({ device, browser, os });
  });

  it("prefers client hints for the platform and mobile flag", () => {
    expect(classifyUserAgent(UA.chromeWin, { platform: '"Android"', mobile: "?1" })).toMatchObject({
      device: "mobile",
      os: "android",
    });
  });

  it.each([
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "gptbot",
      "ai",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      "chatgpt-user",
      "ai",
    ],
    [
      "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "oai-searchbot",
      "ai",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "claudebot",
      "ai",
    ],
    ["Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "claude-user", "ai"],
    [
      "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
      "claude-searchbot",
      "ai",
    ],
    [
      "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "perplexitybot",
      "ai",
    ],
    [
      "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
      "perplexity-user",
      "ai",
    ],
    ["CCBot/2.0 (https://commoncrawl.org/faq/)", "ccbot", "ai"],
    [
      "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "bytespider",
      "ai",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
      "applebot",
      "search",
    ],
    [
      "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
      "amazonbot",
      "ai",
    ],
    [
      "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
      "meta-externalagent",
      "ai",
    ],
    [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "googlebot",
      "search",
    ],
    [
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "bingbot",
      "search",
    ],
    ["DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", "duckduckbot", "search"],
    ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "yandexbot", "search"],
  ])("knows %s", (ua, name, cls) => {
    const c = classifyUserAgent(ua);
    expect(c.device).toBe("bot");
    expect(c.crawler).toEqual({ name, class: cls });
    expect(crawlerClass(name)).toBe(cls);
  });

  it.each([
    "curl/8.7.1",
    "python-requests/2.32.3",
    "Go-http-client/2.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
    "axios/1.7.7",
    "Wget/1.21.4",
  ])("treats %s as a bot without a crawler name", (ua) => {
    const c = classifyUserAgent(ua);
    expect(c.device).toBe("bot");
    expect(c.crawler).toBeUndefined();
  });

  it("is unknown without a user agent", () => {
    expect(classifyUserAgent("")).toEqual({ device: "unknown", browser: "other", os: "other" });
    expect(classifyUserAgent(undefined).device).toBe("unknown");
  });
});

describe("channel classifier", () => {
  it.each([
    ["google.com", "search"],
    ["google.com.tr", "search"],
    ["google.co.uk", "search"],
    ["bing.com", "search"],
    ["duckduckgo.com", "search"],
    ["yandex.ru", "search"],
    ["search.brave.com", "search"],
    ["t.co", "social"],
    ["l.facebook.com", "social"],
    ["news.ycombinator.com", "social"],
    ["bsky.app", "social"],
    ["mastodon.example.org", "social"],
    ["chatgpt.com", "ai"],
    ["perplexity.ai", "ai"],
    ["claude.ai", "ai"],
    ["gemini.google.com", "ai"],
    ["mail.google.com", "email"],
    ["outlook.live.com", "email"],
    ["example.org", "referral"],
  ])("%s → %s", (host, channel) => {
    expect(classifyChannel({ refHost: host, internal: false })).toBe(channel);
  });

  it("internal and direct, and utm_medium overrides the table", () => {
    expect(classifyChannel({ internal: true, utmMedium: "email" })).toBe("internal");
    expect(classifyChannel({ internal: false })).toBe("direct");
    expect(classifyChannel({ internal: false, utmMedium: "email" })).toBe("email");
    expect(classifyChannel({ refHost: "google.com", internal: false, utmMedium: "cpc" })).toBe(
      "paid",
    );
    expect(
      classifyChannel({ refHost: "example.org", internal: false, utmMedium: "paid-social" }),
    ).toBe("paid");
    expect(classifyChannel({ refHost: "example.org", internal: false, utmMedium: "social" })).toBe(
      "social",
    );
    expect(classifyChannel({ refHost: "example.org", internal: false, utmMedium: "banner" })).toBe(
      "referral",
    );
  });
});

describe("normalisation", () => {
  it("beacon paths become published routes or nothing", () => {
    expect(normaliseBeaconPath("/Posts/Ferry-Timetables/")).toBe("/posts/ferry-timetables");
    expect(normaliseBeaconPath("/")).toBe("/");
    expect(normaliseBeaconPath("//")).toBe("/");
    expect(normaliseBeaconPath("/category/x/page/2")).toBe("/category/x/page/2");
    expect(normaliseBeaconPath("/posts/%66erry")).toBe("/posts/ferry");
    expect(normaliseBeaconPath("/posts/ferry%3Fq=1")).toBeUndefined();
    expect(normaliseBeaconPath("/posts/%E0%A4%A")).toBeUndefined();
    expect(normaliseBeaconPath("/_cloudhal/p.js")).toBeUndefined();
    expect(normaliseBeaconPath("/posts/hello world")).toBeUndefined();
    expect(normaliseBeaconPath("relative")).toBeUndefined();
  });

  it("requested paths stay percent-encoded ASCII, without query, cut to 256", () => {
    expect(toRequestPath("/wp-login.php")).toBe("/wp-login.php");
    expect(toRequestPath("/a%20b?x=1")).toBe("/a%20b");
    expect(toRequestPath(`/${"x".repeat(400)}`)).toHaveLength(256);
    expect(toRequestPath("/a b")).toBeUndefined();
  });

  it("hosts lose www., port and case; URLs and junk are dropped", () => {
    expect(normaliseHost("WWW.Example.org:8443")).toBe("example.org");
    expect(normaliseHost("https://example.org/path")).toBeUndefined();
    expect(normaliseHost("localhost")).toBeUndefined();
    expect(normaliseHost("not a host")).toBeUndefined();
    expect(normaliseHost("")).toBeUndefined();
  });

  it("UTM values fit a small alphabet or are dropped", () => {
    expect(normaliseUtm(" Spring Sale ")).toBe("spring-sale");
    expect(normaliseUtm("Newsletter")).toBe("newsletter");
    expect(normaliseUtm("jane.doe@example.org")).toBeUndefined();
    expect(normaliseUtm("x".repeat(65))).toBeUndefined();
    expect(normaliseUtm("<script>")).toBeUndefined();
  });
});

describe("render events", () => {
  const base = {
    siteId: "site_01HZX8K3Q9ST",
    now: new Date("2026-10-09T11:00:12Z"),
    hosts: ["news.example.org"],
  };

  it("records a broken internal link with its referring page", () => {
    const e = buildRenderEvent({
      ...base,
      url: "https://news.example.org/posts/ferry-timetable%C4%B1?utm_source=x",
      status: 404,
      referer: "https://news.example.org/posts/istanbul-by-sea?x=1",
      userAgent: UA.chromeWin,
      country: "tr",
      renderMs: 37.6,
    });
    expect(e).toEqual({
      schemaVersion: 1,
      kind: "render",
      siteId: base.siteId,
      timestamp: "2026-10-09T11:00:12.000Z",
      path: "/posts/ferry-timetable%C4%B1",
      status: 404,
      refPath: "/posts/istanbul-by-sea",
      country: "TR",
      device: "desktop",
      renderMs: 38,
    });
  });

  it("records redirects, external referrers, crawlers and sampling", () => {
    const e = buildRenderEvent({
      ...base,
      url: "https://news.example.org/posts/ferries",
      status: 301,
      location: "/posts/ferry-timetables?from=old",
      referer: "https://www.bsky.app/profile/x",
      userAgent: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      node: { nodeId: "entry_01HZX8K3Q9FT", nodeKind: "entry" },
      sampleOneIn: 10,
    });
    expect(e).toMatchObject({
      redirectTo: "/posts/ferry-timetables",
      refHost: "bsky.app",
      crawler: "gptbot",
      device: "bot",
      nodeId: "entry_01HZX8K3Q9FT",
      sampleOneIn: 10,
    });
    expect(
      buildRenderEvent({
        ...base,
        url: "https://news.example.org/x",
        status: 302,
        location: "javascript:alert(1)",
      }),
    ).not.toHaveProperty("redirectTo");
  });
});

describe("per-isolate limits", () => {
  it("allows 30 beacons per client and kind per minute", async () => {
    let t = 0;
    const limiter = new BeaconRateLimiter({ now: () => t });
    const results: boolean[] = [];
    for (let i = 0; i < 31; i++) results.push(await limiter.allow("203.0.113.9", "pageview"));
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(await limiter.allow("203.0.113.9", "vitals")).toBe(true);
    expect(await limiter.allow("198.51.100.1", "pageview")).toBe(true);
    t = 60_000;
    expect(await limiter.allow("203.0.113.9", "pageview")).toBe(true);
  });

  it("keys the shared Rate Limiting binding by a stable HMAC, never the IP, and fails open", async () => {
    const keys: string[] = [];
    let allow = true;
    const binding = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: allow };
      },
    };
    const secret = "a-deployment-secret-of-32-chars!";
    const a = new SharedBeaconRateLimiter(binding, { secret });
    const b = new SharedBeaconRateLimiter(binding, { secret }); // another isolate
    expect(await a.allow("203.0.113.9")).toBe(true);
    expect(await b.allow("203.0.113.9")).toBe(true);
    expect(await a.allow("198.51.100.1")).toBe(true);
    expect(keys[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys.join()).not.toContain("203");
    const other = new SharedBeaconRateLimiter(binding, {
      secret: "another-secret-of-32-characters!",
    });
    expect(await other.keyFor("203.0.113.9")).not.toBe(keys[0]);
    allow = false;
    expect(await a.allow("203.0.113.9")).toBe(false);
    // no IP, no usable secret, or a failing binding: allowed (the per-isolate limits still apply)
    expect(await a.allow("")).toBe(true);
    expect(await new SharedBeaconRateLimiter(binding, { secret: "short" }).allow("1.2.3.4")).toBe(
      true,
    );
    const errors: string[] = [];
    const failing = new SharedBeaconRateLimiter(
      { limit: () => Promise.reject(new Error("binding down")) },
      { secret, onError: (m) => errors.push(m) },
    );
    expect(await failing.allow("203.0.113.9")).toBe(true);
    expect(errors).toEqual(["analytics rate limit binding failed"]);
  });

  it("samples render floods 1 in 10, then 1 in 100", () => {
    const sampler = new RenderEventSampler({ now: () => 0 });
    const decisions = Array.from({ length: 2400 }, () => sampler.next());
    const kept = decisions.filter((d) => d.record);
    expect(decisions.slice(0, 120).every((d) => d.record && d.sampleOneIn === 1)).toBe(true);
    const weighted = kept.reduce((n, d) => n + d.sampleOneIn, 0);
    expect(kept.length).toBe(120 + 108 + 12);
    expect(weighted).toBe(120 + 1080 + 1200);
  });
});

describe("visitor hash", () => {
  it("is 16 hex characters and depends on every input", async () => {
    const salt = "a".repeat(64);
    const h = await visitorHash(salt, "site_01HZX8K3Q9ST", "203.0.113.9", UA.chromeWin);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(await visitorHash(salt, "site_01HZX8K3Q9ST", "203.0.113.9", UA.chromeWin)).toBe(h);
    expect(
      await visitorHash("b".repeat(64), "site_01HZX8K3Q9ST", "203.0.113.9", UA.chromeWin),
    ).not.toBe(h);
    expect(await visitorHash(salt, "site_01HZX8OTHER0", "203.0.113.9", UA.chromeWin)).not.toBe(h);
  });
});
