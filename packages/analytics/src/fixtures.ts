/**
 * Conformance fixtures (RFC-0006 §7.2, invariant A10): one small set of events over two UTC days
 * with hand-computed answers for every query of the model. Every store — the in-memory reference,
 * SQLite, D1 and the WAE compiler (through a SQLite-backed fake of the Analytics SQL API) — must
 * return exactly these answers. Also used by `cloudhal analytics seed`-style demos.
 */
import type { AnalyticsEvent } from "@cloudhal/core-contracts";
import type { AnalyticsData, AnalyticsQuery } from "./model.ts";

export const FIXTURE_SITE = "site_01HZX8K3Q9ST";
export const FIXTURE_OTHER_SITE = "site_01HZX8OTHER0";
export const NODE_A = "entry_01HZXAAAAAA1";
export const NODE_B = "entry_01HZXBBBBBB1";
export const NODE_HOME = "page_01HZXHOME001";
export const NODE_TERM = "term_01HZXTERM001";

const S = FIXTURE_SITE;
const D1 = "2026-10-07";
const D2 = "2026-10-08";

type PV = Extract<AnalyticsEvent, { kind: "pageview" }>;

function pv(
  ts: string,
  nodeId: string,
  path: string,
  nodeKind: PV["nodeKind"],
  rest: Partial<PV> & Pick<PV, "channel" | "entrance" | "device" | "browser" | "os">,
): PV {
  return {
    schemaVersion: 1,
    kind: "pageview",
    siteId: S,
    timestamp: ts,
    path,
    nodeId,
    nodeKind,
    navType: "navigate",
    ...rest,
  };
}

export const FIXTURE_EVENTS: readonly AnalyticsEvent[] = [
  // ── page views, day 1
  pv(`${D1}T08:00:00Z`, NODE_A, "/posts/a", "entry", {
    refHost: "news.ycombinator.com",
    channel: "social",
    entrance: true,
    country: "TR",
    device: "mobile",
    browser: "safari",
    os: "ios",
    visitor: "00000000000000a1",
    locale: "en",
  }),
  pv(`${D1}T08:30:00Z`, NODE_A, "/posts/a", "entry", {
    channel: "internal",
    entrance: false,
    country: "TR",
    device: "mobile",
    browser: "safari",
    os: "ios",
    visitor: "00000000000000a1",
  }),
  pv(`${D1}T09:15:00Z`, NODE_B, "/posts/b", "entry", {
    refHost: "google.com",
    channel: "search",
    entrance: true,
    country: "DE",
    device: "desktop",
    browser: "chrome",
    os: "windows",
    visitor: "00000000000000b2",
  }),
  pv(`${D1}T09:45:00Z`, NODE_HOME, "/", "page", {
    channel: "direct",
    entrance: true,
    country: "US",
    device: "desktop",
    browser: "firefox",
    os: "linux",
  }),
  pv(`${D1}T10:00:00Z`, NODE_A, "/posts/a", "entry", {
    refHost: "chatgpt.com",
    channel: "ai",
    entrance: true,
    country: "US",
    device: "desktop",
    browser: "edge",
    os: "macos",
    visitor: "00000000000000c3",
    navType: "prerender",
  }),
  pv(`${D1}T23:59:59Z`, NODE_TERM, "/category/x", "archive", {
    channel: "email",
    entrance: true,
    utmSource: "newsletter",
    utmMedium: "email",
    utmCampaign: "weekly",
    country: "DE",
    device: "desktop",
    browser: "chrome",
    os: "windows",
    visitor: "00000000000000b2",
  }),
  // ── page views, day 2
  pv(`${D2}T00:00:00Z`, NODE_A, "/posts/a", "entry", {
    channel: "direct",
    entrance: true,
    country: "TR",
    device: "mobile",
    browser: "chrome",
    os: "android",
    visitor: "00000000000000a1",
  }),
  pv(`${D2}T00:10:00Z`, NODE_A, "/posts/a", "entry", {
    channel: "direct",
    entrance: false,
    country: "TR",
    device: "mobile",
    browser: "chrome",
    os: "android",
    visitor: "00000000000000a1",
    navType: "reload",
  }),
  pv(`${D2}T12:00:00Z`, NODE_B, "/posts/b", "entry", {
    refHost: "news.ycombinator.com",
    channel: "social",
    entrance: true,
    country: "GB",
    device: "tablet",
    browser: "safari",
    os: "ios",
    visitor: "00000000000000d4",
  }),
  pv(`${D2}T12:30:00Z`, NODE_HOME, "/", "page", {
    channel: "internal",
    entrance: false,
    country: "GB",
    device: "tablet",
    browser: "safari",
    os: "ios",
    visitor: "00000000000000d4",
  }),
  // ── never counted: another site, and the exclusive end of the range
  {
    ...pv(`${D1}T10:00:00Z`, NODE_A, "/posts/a", "entry", {
      channel: "direct",
      entrance: true,
      device: "desktop",
      browser: "chrome",
      os: "windows",
    }),
    siteId: FIXTURE_OTHER_SITE,
  },
  pv("2026-10-09T00:00:00Z", NODE_A, "/posts/a", "entry", {
    channel: "direct",
    entrance: true,
    device: "desktop",
    browser: "chrome",
    os: "windows",
  }),
  // ── vitals
  {
    schemaVersion: 1,
    kind: "vitals",
    siteId: S,
    timestamp: `${D1}T08:01:00Z`,
    path: "/posts/a",
    nodeId: NODE_A,
    nodeKind: "entry",
    country: "TR",
    device: "mobile",
    browser: "safari",
    lcp: 2000,
    inp: 100,
    cls: 0.05,
    ttfb: 500,
    fcp: 1000,
    sampleOneIn: 5,
  },
  {
    schemaVersion: 1,
    kind: "vitals",
    siteId: S,
    timestamp: `${D1}T09:16:00Z`,
    path: "/posts/b",
    nodeId: NODE_B,
    nodeKind: "entry",
    device: "desktop",
    browser: "chrome",
    lcp: 3000,
    inp: 300,
    cls: 0.2,
    ttfb: 900,
    fcp: 2000,
    sampleOneIn: 5,
  },
  {
    schemaVersion: 1,
    kind: "vitals",
    siteId: S,
    timestamp: `${D2}T00:01:00Z`,
    path: "/posts/a",
    nodeId: NODE_A,
    nodeKind: "entry",
    device: "mobile",
    lcp: 5000,
    cls: 0.3,
    ttfb: 2000,
    fcp: 3500,
    sampleOneIn: 5,
  },
  {
    schemaVersion: 1,
    kind: "vitals",
    siteId: S,
    timestamp: `${D2}T12:01:00Z`,
    path: "/posts/b",
    nodeId: NODE_B,
    nodeKind: "entry",
    device: "tablet",
    lcp: 1500,
    inp: 600,
    sampleOneIn: 1,
  },
  // ── renders
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D1}T11:00:00Z`,
    path: "/posts/ferry-x",
    status: 404,
    refPath: "/posts/a",
    device: "desktop",
    renderMs: 38,
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D1}T12:00:00Z`,
    path: "/posts/ferry-x",
    status: 404,
    refPath: "/posts/a",
    device: "mobile",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T01:00:00Z`,
    path: "/posts/ferry-x",
    status: 404,
    device: "desktop",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T04:00:00Z`,
    path: "/wp-login.php",
    status: 404,
    device: "unknown",
    sampleOneIn: 20,
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D1}T13:00:00Z`,
    path: "/posts/old",
    status: 301,
    nodeId: NODE_A,
    nodeKind: "entry",
    redirectTo: "/posts/a",
    refHost: "bsky.app",
    device: "mobile",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T13:00:00Z`,
    path: "/posts/old",
    status: 301,
    nodeId: NODE_A,
    nodeKind: "entry",
    redirectTo: "/posts/a",
    device: "desktop",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T14:00:00Z`,
    path: "/old-feed",
    status: 308,
    redirectTo: "https://example.org/feed",
    device: "desktop",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D1}T03:00:00Z`,
    path: "/posts/a",
    status: 200,
    nodeId: NODE_A,
    nodeKind: "entry",
    device: "bot",
    crawler: "gptbot",
    renderMs: 61,
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T03:00:00Z`,
    path: "/posts/b",
    status: 200,
    nodeId: NODE_B,
    nodeKind: "entry",
    device: "bot",
    crawler: "googlebot",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T03:30:00Z`,
    path: "/posts/a",
    status: 200,
    nodeId: NODE_A,
    nodeKind: "entry",
    device: "bot",
    crawler: "gptbot",
  },
  {
    schemaVersion: 1,
    kind: "render",
    siteId: S,
    timestamp: `${D2}T05:00:00Z`,
    path: "/posts/b",
    status: 500,
    nodeId: NODE_B,
    nodeKind: "entry",
    device: "desktop",
  },
];

const FULL = { from: D1, to: "2026-10-09" };

export interface ConformanceCase<Q extends AnalyticsQuery = AnalyticsQuery> {
  readonly name: string;
  readonly query: Q;
  readonly expected: AnalyticsData<Q>;
}

function c<Q extends AnalyticsQuery>(
  name: string,
  query: Q,
  expected: AnalyticsData<Q>,
): ConformanceCase {
  return { name, query, expected } as unknown as ConformanceCase;
}

const vm = (
  metric: "lcp" | "inp" | "cls" | "ttfb" | "fcp",
  p75: number | null,
  samples: number,
  good: number,
  poor: number,
) => ({ metric, p75, samples, good, needsImprovement: samples - good - poor, poor });

/** Every query of the model, with its answer over `FIXTURE_EVENTS`. */
export const CONFORMANCE_CASES: readonly ConformanceCase[] = [
  c(
    "summary",
    { kind: "summary", siteId: S, range: FULL },
    { pageviews: 10, visits: 7, visitors: 5 },
  ),
  c(
    "summary-day1",
    { kind: "summary", siteId: S, range: { from: D1, to: D2 } },
    { pageviews: 6, visits: 5, visitors: 3 },
  ),
  c(
    "summary-no-visitors",
    { kind: "summary", siteId: S, range: { from: `${D1}T09:40:00Z`, to: `${D1}T09:50:00Z` } },
    { pageviews: 1, visits: 1, visitors: null },
  ),
  c(
    "summary-node",
    { kind: "summary", siteId: S, range: FULL, filter: { node: NODE_A } },
    { pageviews: 5, visits: 3, visitors: 3 },
  ),
  c(
    "summary-channel",
    { kind: "summary", siteId: S, range: FULL, filter: { channel: "social" } },
    { pageviews: 2, visits: 2, visitors: 2 },
  ),
  c(
    "summary-country",
    { kind: "summary", siteId: S, range: FULL, filter: { country: "DE" } },
    { pageviews: 2, visits: 2, visitors: 1 },
  ),
  c(
    "summary-device",
    { kind: "summary", siteId: S, range: FULL, filter: { device: "desktop" } },
    { pageviews: 4, visits: 4, visitors: 2 },
  ),
  c(
    "summary-empty-site",
    { kind: "summary", siteId: "site_01HZXNOTHING", range: FULL },
    { pageviews: 0, visits: 0, visitors: null },
  ),
  c(
    "series-day",
    { kind: "series", siteId: S, range: FULL, interval: "day" },
    {
      interval: "day",
      points: [
        { t: `${D1}T00:00:00Z`, pageviews: 6, visits: 5 },
        { t: `${D2}T00:00:00Z`, pageviews: 4, visits: 2 },
      ],
    },
  ),
  c(
    "series-hour",
    {
      kind: "series",
      siteId: S,
      range: { from: `${D1}T08:00:00Z`, to: `${D1}T11:00:00Z` },
      interval: "hour",
    },
    {
      interval: "hour",
      points: [
        { t: `${D1}T08:00:00Z`, pageviews: 2, visits: 1 },
        { t: `${D1}T09:00:00Z`, pageviews: 2, visits: 2 },
        { t: `${D1}T10:00:00Z`, pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "series-day-node",
    { kind: "series", siteId: S, range: FULL, interval: "day", filter: { node: NODE_A } },
    {
      interval: "day",
      points: [
        { t: `${D1}T00:00:00Z`, pageviews: 3, visits: 2 },
        { t: `${D2}T00:00:00Z`, pageviews: 2, visits: 1 },
      ],
    },
  ),
  c(
    "top-node",
    { kind: "top", siteId: S, range: FULL, dimension: "node", limit: 10 },
    {
      dimension: "node",
      rows: [
        { key: NODE_A, pageviews: 5, visits: 3 },
        { key: NODE_B, pageviews: 2, visits: 2 },
        { key: NODE_HOME, pageviews: 2, visits: 1 },
        { key: NODE_TERM, pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "top-node-limit",
    { kind: "top", siteId: S, range: FULL, dimension: "node", limit: 2 },
    {
      dimension: "node",
      rows: [
        { key: NODE_A, pageviews: 5, visits: 3 },
        { key: NODE_B, pageviews: 2, visits: 2 },
      ],
    },
  ),
  c(
    "top-refHost",
    { kind: "top", siteId: S, range: FULL, dimension: "refHost", limit: 10 },
    {
      dimension: "refHost",
      rows: [
        { key: "news.ycombinator.com", pageviews: 2, visits: 2 },
        { key: "chatgpt.com", pageviews: 1, visits: 1 },
        { key: "google.com", pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "top-refHost-node",
    {
      kind: "top",
      siteId: S,
      range: FULL,
      dimension: "refHost",
      limit: 10,
      filter: { node: NODE_A },
    },
    {
      dimension: "refHost",
      rows: [
        { key: "chatgpt.com", pageviews: 1, visits: 1 },
        { key: "news.ycombinator.com", pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "top-channel",
    { kind: "top", siteId: S, range: FULL, dimension: "channel", limit: 10 },
    {
      dimension: "channel",
      rows: [
        { key: "direct", pageviews: 3, visits: 2 },
        { key: "internal", pageviews: 2, visits: 0 },
        { key: "social", pageviews: 2, visits: 2 },
        { key: "ai", pageviews: 1, visits: 1 },
        { key: "email", pageviews: 1, visits: 1 },
        { key: "search", pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "top-utmSource",
    { kind: "top", siteId: S, range: FULL, dimension: "utmSource", limit: 10 },
    { dimension: "utmSource", rows: [{ key: "newsletter", pageviews: 1, visits: 1 }] },
  ),
  c(
    "top-utmMedium",
    { kind: "top", siteId: S, range: FULL, dimension: "utmMedium", limit: 10 },
    { dimension: "utmMedium", rows: [{ key: "email", pageviews: 1, visits: 1 }] },
  ),
  c(
    "top-utmCampaign",
    { kind: "top", siteId: S, range: FULL, dimension: "utmCampaign", limit: 10 },
    { dimension: "utmCampaign", rows: [{ key: "weekly", pageviews: 1, visits: 1 }] },
  ),
  c(
    "top-country",
    { kind: "top", siteId: S, range: FULL, dimension: "country", limit: 10 },
    {
      dimension: "country",
      rows: [
        { key: "TR", pageviews: 4, visits: 2 },
        { key: "DE", pageviews: 2, visits: 2 },
        { key: "GB", pageviews: 2, visits: 1 },
        { key: "US", pageviews: 2, visits: 2 },
      ],
    },
  ),
  c(
    "top-device",
    { kind: "top", siteId: S, range: FULL, dimension: "device", limit: 10 },
    {
      dimension: "device",
      rows: [
        { key: "desktop", pageviews: 4, visits: 4 },
        { key: "mobile", pageviews: 4, visits: 2 },
        { key: "tablet", pageviews: 2, visits: 1 },
      ],
    },
  ),
  c(
    "top-browser",
    { kind: "top", siteId: S, range: FULL, dimension: "browser", limit: 10 },
    {
      dimension: "browser",
      rows: [
        { key: "chrome", pageviews: 4, visits: 3 },
        { key: "safari", pageviews: 4, visits: 2 },
        { key: "edge", pageviews: 1, visits: 1 },
        { key: "firefox", pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "top-os",
    { kind: "top", siteId: S, range: FULL, dimension: "os", limit: 10 },
    {
      dimension: "os",
      rows: [
        { key: "ios", pageviews: 4, visits: 2 },
        { key: "android", pageviews: 2, visits: 1 },
        { key: "windows", pageviews: 2, visits: 2 },
        { key: "linux", pageviews: 1, visits: 1 },
        { key: "macos", pageviews: 1, visits: 1 },
      ],
    },
  ),
  c(
    "vitals",
    { kind: "vitals", siteId: S, range: FULL },
    {
      metrics: [
        vm("lcp", 5000, 16, 6, 5),
        vm("inp", 300, 11, 5, 1),
        vm("cls", 0.3, 15, 5, 5),
        vm("ttfb", 2000, 15, 5, 5),
        vm("fcp", 3500, 15, 5, 5),
      ],
    },
  ),
  c(
    "vitals-node",
    { kind: "vitals", siteId: S, range: FULL, filter: { node: NODE_B } },
    {
      metrics: [
        vm("lcp", 3000, 6, 1, 0),
        vm("inp", 300, 6, 0, 1),
        vm("cls", 0.2, 5, 0, 0),
        vm("ttfb", 900, 5, 0, 0),
        vm("fcp", 2000, 5, 0, 0),
      ],
    },
  ),
  c(
    "vitals-device-empty",
    { kind: "vitals", siteId: S, range: FULL, filter: { device: "bot" } },
    {
      metrics: [
        vm("lcp", null, 0, 0, 0),
        vm("inp", null, 0, 0, 0),
        vm("cls", null, 0, 0, 0),
        vm("ttfb", null, 0, 0, 0),
        vm("fcp", null, 0, 0, 0),
      ],
    },
  ),
  c(
    "renders-errors",
    { kind: "renders", siteId: S, range: FULL, statuses: "errors", limit: 10 },
    {
      report: "errors",
      rows: [
        {
          path: "/wp-login.php",
          status: 404,
          refPath: null,
          hits: 20,
          lastSeen: `${D2}T04:00:00Z`,
        },
        {
          path: "/posts/ferry-x",
          status: 404,
          refPath: "/posts/a",
          hits: 2,
          lastSeen: `${D1}T12:00:00Z`,
        },
        { path: "/posts/b", status: 500, refPath: null, hits: 1, lastSeen: `${D2}T05:00:00Z` },
        {
          path: "/posts/ferry-x",
          status: 404,
          refPath: null,
          hits: 1,
          lastSeen: `${D2}T01:00:00Z`,
        },
      ],
    },
  ),
  c(
    "renders-redirects",
    { kind: "renders", siteId: S, range: FULL, statuses: "redirects", limit: 10 },
    {
      report: "redirects",
      rows: [
        { path: "/posts/old", status: 301, redirectTo: "/posts/a", nodeId: NODE_A, hits: 2 },
        {
          path: "/old-feed",
          status: 308,
          redirectTo: "https://example.org/feed",
          nodeId: null,
          hits: 1,
        },
      ],
    },
  ),
  c(
    "renders-crawlers",
    { kind: "renders", siteId: S, range: FULL, statuses: "crawlers", limit: 10 },
    {
      report: "crawlers",
      rows: [
        { crawler: "gptbot", class: "ai", hits: 2 },
        { crawler: "googlebot", class: "search", hits: 1 },
      ],
    },
  ),
];

/** Queries the model must refuse with `invalid_query`. */
export const INVALID_QUERIES: readonly { name: string; query: unknown }[] = [
  {
    name: "range-too-long",
    query: { kind: "summary", siteId: S, range: { from: "2026-01-01", to: "2026-10-01" } },
  },
  { name: "range-reversed", query: { kind: "summary", siteId: S, range: { from: D2, to: D1 } } },
  {
    name: "range-not-iso",
    query: { kind: "summary", siteId: S, range: { from: "yesterday", to: D2 } },
  },
  { name: "bad-site", query: { kind: "summary", siteId: "site'; DROP TABLE x;--", range: FULL } },
  {
    name: "hourly-too-long",
    query: { kind: "series", siteId: S, range: { from: "2026-09-01", to: D2 }, interval: "hour" },
  },
  {
    name: "vitals-channel",
    query: { kind: "vitals", siteId: S, range: FULL, filter: { channel: "social" } },
  },
  {
    name: "limit-zero",
    query: { kind: "top", siteId: S, range: FULL, dimension: "node", limit: 0 },
  },
  {
    name: "unknown-dimension",
    query: { kind: "top", siteId: S, range: FULL, dimension: "city", limit: 5 },
  },
  {
    name: "filter-free-text",
    query: { kind: "summary", siteId: S, range: FULL, filter: { country: "Turkey" } },
  },
  {
    name: "filter-unknown",
    query: { kind: "summary", siteId: S, range: FULL, filter: { path: "/x" } },
  },
  {
    name: "bad-report",
    query: { kind: "renders", siteId: S, range: FULL, statuses: "all", limit: 5 },
  },
];
