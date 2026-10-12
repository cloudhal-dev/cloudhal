/**
 * The "possible bot traffic" conformance suite (RFC-0006 §5.5): `assessBotTraffic` over every store
 * must give the same, hand-checked signal for four sites that share one quiet week (one organic page
 * view an hour) and differ in their busiest hour:
 *
 * - `likely`: 260 forged-looking views — direct entrances, one browser, one page (all four reasons);
 * - `watch`: 260 referred views from one browser over four pages (spike + one browser);
 * - `viral`: 260 views of one post from a social site in mixed browsers (organic: `none`);
 * - `small`: 150 direct views of one page from one browser — below the minimum volume (`none`).
 *
 * Runs on `MemoryAnalytics`, `SqlAnalytics` (SQLite, D1) and `WaeReader` over the fake Analytics SQL
 * API, so the statements the check sends are the ones the dialect rules allow.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assessBotTraffic, type BotTrafficSignal } from "./bots.ts";
import { MemoryAnalytics } from "./memory.ts";
import type { AnalyticsReader } from "./model.ts";
import type { ConformanceFactory } from "./testing.ts";

export const BOT_SITE_LIKELY = "site_01HZXBOTLIKE1";
export const BOT_SITE_WATCH = "site_01HZXBOTWATCH";
export const BOT_SITE_VIRAL = "site_01HZXBOTVIRAL";
export const BOT_SITE_SMALL = "site_01HZXBOTSMALL";
export const BOT_NOW = new Date("2026-10-12T12:30:00Z");
/** The "7 days" preset at `BOT_NOW`. */
export const BOT_RANGE = { from: "2026-10-06", to: "2026-10-13" } as const;
/** The busiest hour of every site. */
export const BOT_PEAK = "2026-10-11T03:00:00Z";

const NODES = [
  "entry_01HZXBOTPAGE1",
  "entry_01HZXBOTPAGE2",
  "entry_01HZXBOTPAGE3",
  "page_01HZXBOTHOME",
];
const BROWSERS = ["chrome", "safari", "firefox", "edge"] as const;
const OS = { chrome: "windows", safari: "ios", firefox: "linux", edge: "macos" } as const;

type PV = Extract<AnalyticsEvent, { kind: "pageview" }>;

function view(
  siteId: string,
  ts: string,
  i: number,
  over: Partial<PV> & Pick<PV, "channel" | "entrance">,
): PV {
  const browser = over.browser ?? BROWSERS[i % BROWSERS.length] ?? "chrome";
  const node = over.nodeId ?? NODES[i % NODES.length] ?? "entry_01HZXBOTPAGE1";
  return {
    schemaVersion: 1,
    kind: "pageview",
    siteId,
    timestamp: ts,
    path: node.startsWith("page_") ? "/" : `/posts/${node.slice(-5).toLowerCase()}`,
    nodeId: node,
    nodeKind: node.startsWith("page_") ? "page" : "entry",
    device: browser === "safari" ? "mobile" : "desktop",
    browser,
    os: OS[browser as keyof typeof OS] ?? "windows",
    navType: "navigate",
    country: "DE",
    ...over,
  };
}

/** One organic view an hour, 2026-10-05T13:00Z – 2026-10-12T12:00Z (the window at `BOT_NOW`). */
function quietWeek(siteId: string): PV[] {
  const out: PV[] = [];
  const start = Date.parse("2026-10-05T13:10:00Z");
  for (let h = 0; h < 168; h++)
    out.push(
      view(siteId, new Date(start + h * 3_600_000).toISOString(), h, {
        refHost: "google.com",
        channel: "search",
        entrance: true,
      }),
    );
  return out;
}

function burst(
  siteId: string,
  n: number,
  over: (i: number) => Partial<PV> & Pick<PV, "channel" | "entrance">,
): PV[] {
  const start = Date.parse(BOT_PEAK);
  return Array.from({ length: n }, (_, i) =>
    view(siteId, new Date(start + 60_000 + i * 10_000).toISOString(), i, over(i)),
  );
}

export const BOT_FIXTURE_EVENTS: readonly AnalyticsEvent[] = [
  ...quietWeek(BOT_SITE_LIKELY),
  ...burst(BOT_SITE_LIKELY, 260, () => ({
    channel: "direct",
    entrance: true,
    browser: "chrome",
    nodeId: "entry_01HZXBOTPAGE1",
  })),
  ...quietWeek(BOT_SITE_WATCH),
  ...burst(BOT_SITE_WATCH, 260, () => ({
    refHost: "example.org",
    channel: "referral",
    entrance: true,
    browser: "chrome",
  })),
  ...quietWeek(BOT_SITE_VIRAL),
  ...burst(BOT_SITE_VIRAL, 260, (i) => ({
    refHost: "news.ycombinator.com",
    channel: "social",
    entrance: i % 5 !== 0,
    nodeId: "entry_01HZXBOTPAGE2",
  })),
  ...quietWeek(BOT_SITE_SMALL),
  ...burst(BOT_SITE_SMALL, 150, () => ({
    channel: "direct",
    entrance: true,
    browser: "chrome",
    nodeId: "entry_01HZXBOTPAGE1",
  })),
];

const WINDOW = { from: "2026-10-05T13:00:00Z", to: "2026-10-12T13:00:00Z" };

export const BOT_CASES: readonly { name: string; siteId: string; expected: BotTrafficSignal }[] = [
  {
    name: "likely: direct, one browser, one page",
    siteId: BOT_SITE_LIKELY,
    expected: {
      level: "likely",
      // the burst plus that hour's organic view (hour 134 of the quiet week: Firefox, page 3, search)
      hour: BOT_PEAK,
      pageviews: 261,
      baseline: 1,
      window: WINDOW,
      reasons: [
        {
          code: "hourly_spike",
          detail: `261 page views in the hour from ${BOT_PEAK}, 261 times the median hour of the last 7 days (1)`,
          value: 261,
          threshold: 10,
        },
        {
          code: "direct_entrances",
          detail: "100% of the hour's 261 entrances came without a referrer",
          value: 0.996,
          threshold: 0.8,
        },
        {
          code: "single_browser",
          detail: "100% of the hour's page views came from one browser family (chrome)",
          value: 0.996,
          threshold: 0.95,
          key: "chrome",
        },
        {
          code: "single_page",
          detail: "100% of the hour's page views were of one page (entry_01HZXBOTPAGE1)",
          value: 0.996,
          threshold: 0.9,
          key: "entry_01HZXBOTPAGE1",
        },
      ],
    },
  },
  {
    name: "watch: referred, one browser, many pages",
    siteId: BOT_SITE_WATCH,
    expected: {
      level: "watch",
      hour: BOT_PEAK,
      pageviews: 261,
      baseline: 1,
      window: WINDOW,
      reasons: [
        {
          code: "hourly_spike",
          detail: `261 page views in the hour from ${BOT_PEAK}, 261 times the median hour of the last 7 days (1)`,
          value: 261,
          threshold: 10,
        },
        {
          code: "single_browser",
          detail: "100% of the hour's page views came from one browser family (chrome)",
          value: 0.996,
          threshold: 0.95,
          key: "chrome",
        },
      ],
    },
  },
  {
    name: "none: a viral post (referred, mixed browsers, one page)",
    siteId: BOT_SITE_VIRAL,
    expected: {
      level: "none",
      reasons: [],
      hour: BOT_PEAK,
      pageviews: 261,
      baseline: 1,
      window: WINDOW,
    },
  },
  {
    name: "none: below the minimum volume",
    siteId: BOT_SITE_SMALL,
    expected: {
      level: "none",
      reasons: [],
      hour: BOT_PEAK,
      pageviews: 151,
      baseline: 1,
      window: WINDOW,
    },
  },
];

export function describeBotTrafficConformance(label: string, factory: ConformanceFactory): void {
  describe(`bot traffic conformance: ${label}`, { timeout: 120_000 }, () => {
    let reader: AnalyticsReader;
    let close: (() => Promise<void>) | undefined;
    const reference = new MemoryAnalytics();
    for (const e of BOT_FIXTURE_EVENTS) reference.write(e);

    beforeAll(async () => {
      const s = await factory.create();
      reader = s.reader;
      close = s.close;
      await s.load(BOT_FIXTURE_EVENTS);
    });

    afterAll(async () => {
      await close?.();
      await factory.dispose?.();
    });

    for (const kase of BOT_CASES) {
      it(`${kase.name} matches the reference signal`, async () => {
        const input = { siteId: kase.siteId, range: BOT_RANGE, now: BOT_NOW };
        const { signal } = await assessBotTraffic(reader, input);
        expect(signal).toEqual(kase.expected);
        expect(signal).toEqual((await assessBotTraffic(reference, input)).signal);
      });
    }
  });
}
