/**
 * Realistic demo events for `cloudhal analytics seed` (RFC-0006 §11): page views, vitals and render
 * events over the published nodes of a site, so Studio and screenshots have something to show
 * without real traffic. Deterministic for a given seed. Local only: nothing here is ever written to
 * Workers Analytics Engine.
 */
import type {
  AnalyticsBrowser,
  AnalyticsChannel,
  AnalyticsDevice,
  AnalyticsEvent,
  AnalyticsNodeKind,
  AnalyticsOs,
} from "@cloudhal/core-contracts";
import { addDays, isoInstant, startOfUtcDay } from "./model.ts";

export interface DemoNode {
  readonly nodeId: string;
  readonly nodeKind: AnalyticsNodeKind;
  /** Its published path (the `Path` pattern). */
  readonly path: string;
  readonly locale?: string;
}

export interface DemoOptions {
  readonly siteId: string;
  /** Published pages, entries and archives; the first ones get the most views. */
  readonly nodes: readonly DemoNode[];
  /** Whole UTC days before today (today is filled up to `now`). */
  readonly days: number;
  readonly now: Date;
  /** Average page views per day (default 120). */
  readonly viewsPerDay?: number;
  /** One vitals sample per this many views (default 5; 0 = none). */
  readonly vitalsOneIn?: number;
  /** Add visitor hashes (as if unique visitors were on). */
  readonly uniqueVisitors?: boolean;
  readonly seed?: number;
}

/** mulberry32: small, fast, deterministic. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, weighted: readonly (readonly [T, number])[]): T {
  const total = weighted.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [v, w] of weighted) {
    r -= w;
    if (r < 0) return v;
  }
  return (weighted.at(-1) as readonly [T, number])[0];
}

const CHANNELS: readonly (readonly [AnalyticsChannel, number])[] = [
  ["direct", 30],
  ["search", 30],
  ["social", 14],
  ["internal", 12],
  ["referral", 6],
  ["ai", 4],
  ["email", 3],
  ["paid", 1],
];

const REF_HOSTS: Partial<Record<AnalyticsChannel, readonly (readonly [string, number])[]>> = {
  search: [
    ["google.com", 70],
    ["bing.com", 12],
    ["duckduckgo.com", 10],
    ["yandex.com", 4],
    ["ecosia.org", 4],
  ],
  social: [
    ["news.ycombinator.com", 30],
    ["reddit.com", 25],
    ["bsky.app", 20],
    ["linkedin.com", 15],
    ["x.com", 10],
  ],
  referral: [
    ["dev.to", 40],
    ["github.com", 35],
    ["example.org", 25],
  ],
  ai: [
    ["chatgpt.com", 50],
    ["perplexity.ai", 25],
    ["claude.ai", 25],
  ],
  email: [["mail.google.com", 100]],
};

const COUNTRIES: readonly (readonly [string, number])[] = [
  ["US", 30],
  ["TR", 18],
  ["DE", 12],
  ["GB", 10],
  ["FR", 6],
  ["NL", 5],
  ["IN", 5],
  ["BR", 4],
  ["JP", 4],
  ["CA", 4],
  ["XX", 2],
];

const PLATFORMS: readonly (readonly [[AnalyticsDevice, AnalyticsOs, AnalyticsBrowser], number])[] =
  [
    [["desktop", "windows", "chrome"], 22],
    [["desktop", "macos", "chrome"], 12],
    [["desktop", "macos", "safari"], 8],
    [["desktop", "windows", "edge"], 6],
    [["desktop", "linux", "firefox"], 4],
    [["mobile", "ios", "safari"], 24],
    [["mobile", "android", "chrome"], 16],
    [["mobile", "android", "samsung"], 3],
    [["tablet", "ios", "safari"], 4],
    [["desktop", "chromeos", "chrome"], 1],
  ];

const CRAWLERS: readonly (readonly [string, number])[] = [
  ["googlebot", 40],
  ["bingbot", 15],
  ["gptbot", 15],
  ["claudebot", 10],
  ["perplexitybot", 8],
  ["ccbot", 6],
  ["applebot", 6],
];

const MISSING = ["/wp-login.php", "/feed.xml", "/posts/old-launch-notes", "/about-us", "/.env"];

const hex16 = (rand: () => number) =>
  Array.from({ length: 16 }, () => Math.floor(rand() * 16).toString(16)).join("");

/** Demo events in time order. Every event matches the stored contract. */
export function demoEvents(options: DemoOptions): AnalyticsEvent[] {
  const rand = prng(options.seed ?? 6);
  const nodes = options.nodes;
  if (nodes.length === 0) return [];
  const weights = nodes.map((n, i) => [n, 1 / (i + 1) ** 0.9] as const);
  const perDay = options.viewsPerDay ?? 120;
  const vitalsOneIn = options.vitalsOneIn ?? 5;
  const today = startOfUtcDay(options.now);
  const events: AnalyticsEvent[] = [];
  const S = options.siteId;
  const visitors: string[] = [];

  for (let d = Math.max(0, Math.floor(options.days)); d >= 0; d--) {
    const day = addDays(today, -d);
    const dow = day.getUTCDay();
    const weekday = dow === 0 || dow === 6 ? 0.7 : 1.1;
    // a slow upward trend so charts have a shape
    const trend = 0.75 + 0.5 * (1 - d / Math.max(1, options.days));
    const views = Math.round(perDay * weekday * trend * (0.8 + rand() * 0.4));
    const dayEnd = d === 0 ? options.now.getTime() : addDays(day, 1).getTime();
    const span = dayEnd - day.getTime();
    if (span <= 0) continue;
    visitors.length = 0;
    for (let i = 0; i < views; i++) {
      const at = new Date(day.getTime() + Math.floor(rand() * span));
      const timestamp = isoInstant(new Date(Math.floor(at.getTime() / 1000) * 1000));
      const node = pick(rand, weights);
      const channel = pick(rand, CHANNELS);
      const refs = REF_HOSTS[channel];
      const [device, os, browser] = pick(rand, PLATFORMS);
      const country = pick(rand, COUNTRIES);
      const navType = rand() < 0.08 ? "reload" : rand() < 0.06 ? "back_forward" : "navigate";
      const entrance = channel !== "internal" && navType === "navigate";
      let visitor: string | undefined;
      if (options.uniqueVisitors && rand() > 0.08) {
        // about 1.4 views per visitor and day
        if (visitors.length > 0 && rand() < 0.3)
          visitor = visitors[Math.floor(rand() * visitors.length)];
        else {
          visitor = hex16(rand);
          visitors.push(visitor);
        }
      }
      events.push({
        schemaVersion: 1,
        kind: "pageview",
        siteId: S,
        timestamp,
        path: node.path,
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        channel,
        ...(refs ? { refHost: pick(rand, refs) } : {}),
        ...(channel === "email"
          ? { utmSource: "newsletter", utmMedium: "email", utmCampaign: "weekly" }
          : channel === "paid"
            ? { utmSource: "google", utmMedium: "cpc", utmCampaign: "launch" }
            : {}),
        country,
        device,
        browser,
        os,
        ...(visitor ? { visitor } : {}),
        // the unhashed views stand for browsers sending GPC or DNT
        ...(options.uniqueVisitors && !visitor ? { privacySignal: true } : {}),
        navType,
        ...(node.locale ? { locale: node.locale } : {}),
        entrance,
      });
      if (vitalsOneIn > 0 && rand() < 1 / vitalsOneIn) {
        const slow = device === "mobile" ? 1.4 : 1;
        events.push({
          schemaVersion: 1,
          kind: "vitals",
          siteId: S,
          timestamp,
          path: node.path,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          country,
          device,
          browser,
          lcp: Math.round((900 + rand() * 2600) * slow),
          inp: Math.round((40 + rand() * 300) * slow),
          cls: Math.round(rand() * rand() * 30) / 100,
          ttfb: Math.round(80 + rand() * 600),
          fcp: Math.round((500 + rand() * 1500) * slow),
          sampleOneIn: vitalsOneIn,
        });
      }
    }
    // server-side renders: a few misses, crawlers, errors and redirect hits per day
    const renders = Math.max(1, Math.round(views / 12));
    for (let i = 0; i < renders; i++) {
      const timestamp = isoInstant(
        new Date(Math.floor((day.getTime() + rand() * span) / 1000) * 1000),
      );
      const r = rand();
      const node = pick(rand, weights);
      if (r < 0.45) {
        events.push({
          schemaVersion: 1,
          kind: "render",
          siteId: S,
          timestamp,
          path: node.path,
          status: 200,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          device: "bot",
          crawler: pick(rand, CRAWLERS),
          renderMs: Math.round(20 + rand() * 120),
        });
      } else if (r < 0.75) {
        const linked = rand() < 0.5 ? pick(rand, weights) : undefined;
        events.push({
          schemaVersion: 1,
          kind: "render",
          siteId: S,
          timestamp,
          path: MISSING[Math.floor(rand() * MISSING.length)] as string,
          status: rand() < 0.15 ? 410 : 404,
          ...(linked ? { refPath: linked.path } : {}),
          device: rand() < 0.5 ? "desktop" : "mobile",
          country: pick(rand, COUNTRIES),
        });
      } else if (node.nodeKind === "entry") {
        events.push({
          schemaVersion: 1,
          kind: "render",
          siteId: S,
          timestamp,
          path: `${node.path}-draft-title`,
          status: 301,
          redirectTo: node.path,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          device: rand() < 0.5 ? "desktop" : "mobile",
          country: pick(rand, COUNTRIES),
        });
      } else {
        events.push({
          schemaVersion: 1,
          kind: "render",
          siteId: S,
          timestamp,
          path: node.path,
          status: 200,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          device: rand() < 0.5 ? "desktop" : "mobile",
          renderMs: Math.round(15 + rand() * 90),
        });
      }
    }
  }
  return events.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
}
