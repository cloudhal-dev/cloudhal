/**
 * The editors' "Readers" card and the overview's "Last 7 days" card (RFC-0006 §10.1–§10.2,
 * DESIGN.md §2v): left out when analytics are off, the reason for Contributors without calling
 * the API, "can't read yet" without a reader, never published, no readers, and the numbers.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewAnalyticsCard, ReadersCard } from "../src/components/Readers.tsx";
import type {
  AnalyticsFeature,
  AnalyticsNodeStats,
  AnalyticsStatus,
  Role,
} from "../src/lib/api.ts";
import {
  analyticsAvailability,
  analyticsHref,
  channelRows,
  everPublished,
  readersQuery,
} from "../src/lib/readers.ts";
import { INSTANCE, meFor, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FEATURE: AnalyticsFeature = {
  enabled: true,
  store: "sql",
  reader: "sql",
  liveDays: 92,
  budget: null,
  rollups: "on-read",
  defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
};

const STATUS = (enabled = true): AnalyticsStatus => ({
  siteId: "site_1",
  feature: FEATURE,
  settings: {
    siteId: "site_1",
    enabled,
    uniqueVisitors: false,
    vitalsOneIn: 5,
    rollupRetentionDays: null,
    planHint: null,
    rev: 0,
    stored: false,
  },
  lastRollup: null,
  budget: null,
  quota: null,
});

const envelope = <T,>(data: T, partial = false) => ({
  range: { from: "2026-09-13", to: "2026-10-13" },
  source: "live",
  estimated: false,
  ...(partial ? { partial } : {}),
  generatedAt: "2026-10-12T10:00:00Z",
  data,
});

const STATS = (pageviews = 1204, redirectHits = 42): AnalyticsNodeStats => ({
  node: {
    nodeId: "entry_1",
    kind: "entry",
    exists: true,
    title: "Ferries",
    path: "/posts/ferries",
    status: "published",
  },
  summary: {
    pageviews,
    visits: Math.round(pageviews * 0.7),
    visitors: null,
    viewsPerVisit: 1.4,
    previous: { pageviews: 1000, visits: 700, visitors: null, range: { from: "", to: "" } },
  },
  series: {
    interval: "day",
    points: [
      { t: "2026-10-10T00:00:00Z", pageviews: 40, visits: 30 },
      { t: "2026-10-11T00:00:00Z", pageviews: 55, visits: 41 },
    ],
  },
  channels: [
    { key: "search", pageviews: 600, visits: 500 },
    { key: "social", pageviews: 300, visits: 200 },
    { key: "direct", pageviews: 200, visits: 150 },
    { key: "email", pageviews: 50, visits: 40 },
  ],
  referrers: [],
  countries: [],
  devices: [],
  vitals: { metrics: [] },
  oldPaths: [],
  redirectHits,
});

/** `/api/me` and `/api/instance` (with `features.analytics`) for a person in `role`. */
const as = (role: Role, feature: AnalyticsFeature | undefined = FEATURE): Route[] => [
  on("GET", "/api/me", { status: 200, body: meFor(role) }),
  on("GET", "/api/instance", {
    status: 200,
    body: {
      ...INSTANCE,
      features: { ...INSTANCE.features, ...(feature ? { analytics: feature } : {}) },
    },
  }),
];
const status = (enabled = true) =>
  on("GET", "/api/sites/site_1/analytics/status", { status: 200, body: STATUS(enabled) });
const nodeStats = (stats: AnalyticsNodeStats, partial = false) =>
  on("GET", "/api/sites/site_1/analytics/nodes/entry_1", {
    status: 200,
    body: envelope(stats, partial),
  });

const PUBLISHED = {
  id: "entry_1",
  status: "published",
  publishedAt: "2026-03-01T09:00:00Z",
  createdAt: "2026-02-20T09:00:00Z",
};
const DRAFT = { id: "entry_1", status: "draft", createdAt: "2026-02-20T09:00:00Z" };

const analyticsCalls = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/analytics/"));

/** Lets the queries settle: `/api/me` and `/api/instance` answer before the card decides. */
const settled = (fetch: ReturnType<typeof serve>) =>
  waitFor(() => {
    const urls = fetch.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.endsWith("/api/me"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/api/instance"))).toBe(true);
  });

describe("readers helpers", () => {
  const NOW = new Date("2026-10-12T15:00:00Z");
  it("asks for 7 and 30 days with a comparison, all time from the first publish", () => {
    expect(readersQuery("7d", undefined, NOW)).toEqual({ query: { range: "7d" }, compare: true });
    expect(readersQuery("30d", undefined, NOW)).toEqual({ query: { range: "30d" }, compare: true });
    expect(readersQuery("all", "2026-03-01T09:00:00Z", NOW)).toEqual({
      query: { from: "2026-03-01", to: "2026-10-13" },
      compare: false,
    });
  });
  it("cuts all time to the two years the API answers", () => {
    const { query } = readersQuery("all", "2019-01-01T00:00:00Z", NOW);
    expect(query).toEqual({ from: "2024-10-12", to: "2026-10-13" });
    expect(readersQuery("all", "not a date", NOW).query.from).toBe("2024-10-12");
  });
  it("reads the deployment's analytics: off, can't read yet, on", () => {
    expect(analyticsAvailability(undefined)).toBe("off");
    expect(analyticsAvailability({ ...FEATURE, enabled: false })).toBe("off");
    expect(analyticsAvailability({ ...FEATURE, store: "none" })).toBe("off");
    expect(analyticsAvailability({ ...FEATURE, store: "wae", reader: "none" })).toBe("unreadable");
    expect(analyticsAvailability(FEATURE)).toBe("on");
  });
  it("knows a node that was never published", () => {
    expect(everPublished({ status: "draft" })).toBe(false);
    expect(everPublished({ status: "draft", publishedAt: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(everPublished({ status: "published" })).toBe(true);
    expect(everPublished({ status: "archived" })).toBe(true);
  });
  it("ranks channels by visits and names them", () => {
    expect(
      channelRows(
        [
          { key: "direct", pageviews: 9, visits: 9 },
          { key: "search", pageviews: 5, visits: 20 },
          { key: "(other)", pageviews: 1, visits: 1 },
          { key: "future", pageviews: 1, visits: 2 },
          { key: "email", pageviews: 0, visits: 0 },
        ],
        (c) => c.toUpperCase(),
      ),
    ).toEqual([
      { id: "search", label: "SEARCH", value: 20 },
      { id: "direct", label: "DIRECT", value: 9 },
      { id: "future", label: "future", value: 2 },
    ]);
  });
  it("links to the Analytics screen filtered to the node", () => {
    expect(analyticsHref("site_1", "entry_1")).toBe("/sites/site_1/analytics?filter=node:entry_1");
    expect(analyticsHref("site_1")).toBe("/sites/site_1/analytics");
  });
});

describe("Readers card", { timeout: 45_000 }, () => {
  it("shows an article's readers, old addresses and the filtered link", async () => {
    const fetch = serve(...as("author"), status(), nodeStats(STATS()));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    expect(await screen.findByText("1,204")).toBeInTheDocument();
    expect(screen.getByText("Readers")).toBeInTheDocument();
    expect(
      screen.getByText("Old addresses still bring readers: 42 in the last 30 days"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(3);
    expect(screen.getByText("Search engines")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in analytics" })).toHaveAttribute(
      "href",
      "/sites/site_1/analytics?filter=node:entry_1",
    );
    const first = analyticsCalls(fetch).find((u) => u.includes("/nodes/entry_1"));
    expect(first).toContain("range=30d");
    expect(first).toContain("compare=previous");

    fireEvent.click(screen.getByRole("tab", { name: "All time" }));
    await waitFor(() =>
      expect(
        analyticsCalls(fetch).some(
          (u) => u.includes("/nodes/entry_1") && u.includes("from=2026-03-01"),
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("Old addresses still bring readers: 42 in all"),
    ).toBeInTheDocument();
  });

  it("says when part of the range could not be read", async () => {
    serve(...as("editor"), status(), nodeStats(STATS(), true));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    expect(await screen.findByText(/numbers may be low/)).toBeInTheDocument();
  });

  it("has its own state when nobody read it yet", async () => {
    serve(...as("author"), status(), nodeStats(STATS(0, 0)));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    expect(await screen.findByText("No readers yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open in analytics" })).not.toBeInTheDocument();
  });

  it("waits for the first publish without asking the API", async () => {
    const fetch = serve(...as("author"), status(), nodeStats(STATS()));
    render(wrap(<ReadersCard siteId="site_1" node={DRAFT} kind="page" />));
    expect(await screen.findByText("Stats start when this page is published")).toBeInTheDocument();
    expect(analyticsCalls(fetch).some((u) => u.includes("/nodes/"))).toBe(false);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("tells a Contributor why and never calls the analytics API", async () => {
    const fetch = serve(...as("contributor"), status(), nodeStats(STATS()));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    expect(await screen.findByText("Analytics aren't part of your role")).toBeInTheDocument();
    expect(screen.getByText("Only Authors and above see analytics.")).toBeInTheDocument();
    expect(analyticsCalls(fetch)).toEqual([]);
  });

  it("is quiet when visits are recorded but cannot be read yet", async () => {
    const fetch = serve(
      ...as("author", { ...FEATURE, store: "wae", reader: "none" }),
      status(),
      nodeStats(STATS()),
    );
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    expect(await screen.findByText("Can't read visits yet")).toBeInTheDocument();
    expect(analyticsCalls(fetch)).toEqual([]);
  });

  it("is left out when the deployment does not record analytics", async () => {
    const fetch = serve(...as("owner", undefined), status(), nodeStats(STATS()));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    await settled(fetch);
    expect(screen.queryByTestId("readers-card")).not.toBeInTheDocument();
    expect(analyticsCalls(fetch)).toEqual([]);
  });

  it("is left out when analytics are off for this site", async () => {
    const fetch = serve(...as("owner"), status(false), nodeStats(STATS()));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />));
    await waitFor(() =>
      expect(analyticsCalls(fetch).some((u) => u.endsWith("/analytics/status"))).toBe(true),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("readers-card")).not.toBeInTheDocument();
  });

  it("speaks Turkish", async () => {
    serve(...as("author"), status(), nodeStats(STATS()));
    render(wrap(<ReadersCard siteId="site_1" node={PUBLISHED} kind="article" />, "tr"));
    expect(await screen.findByText("1.204")).toBeInTheDocument();
    expect(screen.getByText("Okurlar")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tümü" })).toBeInTheDocument();
    expect(
      screen.getByText("Eski adresler hâlâ okur getiriyor: son 30 gün içinde 42"),
    ).toBeInTheDocument();
  });
});

describe("Overview analytics card", { timeout: 45_000 }, () => {
  const overview = (pageviews: number): Route[] => [
    on("GET", "/api/sites/site_1/analytics/summary", {
      status: 200,
      body: envelope({
        pageviews,
        visits: 900,
        visitors: null,
        viewsPerVisit: 1.3,
        previous: { pageviews: 1000, visits: 900, visitors: null, range: { from: "", to: "" } },
      }),
    }),
    on("GET", "/api/sites/site_1/analytics/series", {
      status: 200,
      body: envelope({
        interval: "day",
        points: [{ t: "2026-10-11T00:00:00Z", pageviews: 9, visits: 7 }],
      }),
    }),
    on("GET", "/api/sites/site_1/analytics/top/node", {
      status: 200,
      body: envelope({
        dimension: "node",
        rows: [
          { key: "entry_1", pageviews: 400, visits: 300, node: STATS().node },
          {
            key: "page_9",
            pageviews: 100,
            visits: 80,
            node: {
              nodeId: "page_9",
              kind: null,
              exists: false,
              title: null,
              path: null,
              status: null,
            },
          },
        ],
      }),
    }),
  ];

  it("shows the last 7 days with the most read content", async () => {
    const fetch = serve(...as("editor"), status(), ...overview(1200));
    render(wrap(<OverviewAnalyticsCard siteId="site_1" />));
    expect(await screen.findByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Ferries")).toBeInTheDocument();
    expect(screen.getByText("No longer exists")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View analytics" })).toHaveAttribute(
      "href",
      "/sites/site_1/analytics",
    );
    const summary = analyticsCalls(fetch).find((u) => u.includes("/summary"));
    expect(summary).toContain("range=7d");
    expect(summary).toContain("compare=previous");
  });

  it("has an empty state before the first visit", async () => {
    serve(...as("editor"), status(), ...overview(0));
    render(wrap(<OverviewAnalyticsCard siteId="site_1" />));
    expect(await screen.findByText("No visits yet")).toBeInTheDocument();
  });

  it("tells a Contributor why without calling the API, and is left out when off", async () => {
    const fetch = serve(...as("contributor"), status(), ...overview(1200));
    render(wrap(<OverviewAnalyticsCard siteId="site_1" />));
    expect(await screen.findByText("Analytics aren't part of your role")).toBeInTheDocument();
    expect(analyticsCalls(fetch)).toEqual([]);
    cleanup();

    const off = serve(...as("owner", { ...FEATURE, enabled: false }), status(), ...overview(1200));
    render(wrap(<OverviewAnalyticsCard siteId="site_1" />));
    await settled(off);
    expect(screen.queryByTestId("analytics-overview")).not.toBeInTheDocument();
    expect(analyticsCalls(off)).toEqual([]);
  });
});
