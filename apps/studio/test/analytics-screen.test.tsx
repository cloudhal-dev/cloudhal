/**
 * The Analytics screen (RFC-0006 §10.1): the dashboard with data, and every state — gated, not
 * running, off, can't read yet, no visits, errors, the Free-plan warning. ECharts does not run in
 * happy-dom, so the two chart blocks are stubbed with their text alternatives.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsFeature, AnalyticsStatus, Role } from "../src/lib/api.ts";
import { AnalyticsPage } from "../src/routes/AnalyticsPage.tsx";
import { INSTANCE, meFor, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

const router = vi.hoisted(() => ({
  search: {} as Record<string, string>,
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useSearch: () => router.search,
  useNavigate: () => router.navigate,
}));
vi.mock("@cloudhal/ui/charts", () => ({
  AnalyticsTimeseries: (props: {
    labels: { description: string };
    series: { id: string; points: unknown[] }[];
  }) => (
    <div data-testid="timeseries" data-series={props.series.map((s) => s.id).join(",")}>
      {props.labels.description}
    </div>
  ),
  CountryMap: (props: {
    rows: { country: string; value: number }[];
    empty: React.ReactNode;
    labels: { map: string };
  }) =>
    props.rows.length === 0 ? (
      props.empty
    ) : (
      <div data-testid="country-map" data-label={props.labels.map}>
        {props.rows.map((r) => `${r.country}:${r.value}`).join(" ")}
      </div>
    ),
}));

const FEATURE: AnalyticsFeature = {
  enabled: true,
  store: "sql",
  reader: "sql",
  liveDays: 92,
  budget: null,
  rollups: "scheduled",
  defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
};

const SETTINGS: AnalyticsStatus["settings"] = {
  siteId: "site_1",
  enabled: true,
  uniqueVisitors: false,
  vitalsOneIn: 5,
  rollupRetentionDays: null,
  planHint: null,
  rev: 0,
  stored: false,
};

function statusWith(over: Partial<AnalyticsStatus> = {}): AnalyticsStatus {
  return {
    siteId: "site_1",
    feature: FEATURE,
    settings: SETTINGS,
    lastRollup: { day: "2026-10-11", finishedAt: "2026-10-12T01:00:00Z", source: "sql" },
    budget: null,
    quota: { day: "2026-10-11", pageviews: 120, beacons: 140, requests: 260 },
    ...over,
  };
}

const envelope = <T,>(data: T, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    range: { from: "2026-09-13", to: "2026-10-13" },
    source: "rollups",
    estimated: false,
    generatedAt: "2026-10-12T09:00:00Z",
    data,
    ...extra,
  },
});

const A = "/api/sites/site_1/analytics";
const node = (id: string, kind: "entry" | "page", title: string, path: string) => ({
  nodeId: id,
  kind,
  exists: true,
  title,
  path,
  status: "published",
});

function topReply(url: string) {
  const dimension = url.split("?")[0]?.split("/").at(-1);
  switch (dimension) {
    case "node":
      return envelope({
        dimension,
        rows: [
          {
            key: "entry_AAAAAA01",
            pageviews: 800,
            visits: 600,
            node: node("entry_AAAAAA01", "entry", "Ferry timetables", "/posts/ferries"),
          },
          {
            key: "page_AAAAAA02",
            pageviews: 200,
            visits: 150,
            node: { ...node("page_AAAAAA02", "page", "Old", "/old"), exists: false, title: null },
          },
        ],
      });
    case "channel":
      return envelope({
        dimension,
        rows: [
          { key: "search", pageviews: 500, visits: 400 },
          { key: "ai", pageviews: 90, visits: 80 },
        ],
      });
    case "country":
      return envelope({ dimension, rows: [{ key: "DE", pageviews: 700, visits: 500 }] });
    default:
      return envelope({ dimension, rows: [{ key: "desktop", pageviews: 600, visits: 400 }] });
  }
}

/** A deployment with data; `over` replaces single endpoints. */
function analyticsServer(
  role: Role = "owner",
  opts: {
    status?: { status: number; body?: unknown };
    summary?: (url: string) => { status: number; body?: unknown };
    feature?: AnalyticsFeature;
  } = {},
): Route[] {
  return [
    on("GET", "/api/me", { status: 200, body: meFor(role) }),
    on("GET", "/api/instance", {
      status: 200,
      body: { ...INSTANCE, features: { ...INSTANCE.features, analytics: opts.feature ?? FEATURE } },
    }),
    on("GET", "/api/sites/site_1", {
      status: 200,
      body: {
        id: "site_1",
        name: "Newsroom",
        slug: "newsroom",
        defaultLocale: "en",
        locales: ["en"],
        pageIds: [],
        domains: [{ hostname: "news.example", primary: true }],
      },
    }),
    on("GET", `${A}/status`, opts.status ?? { status: 200, body: statusWith() }),
    (url) =>
      url.startsWith(`${A}/summary`)
        ? (opts.summary?.(url) ??
          envelope({
            pageviews: 12400,
            visits: 8900,
            visitors: null,
            viewsPerVisit: 1.39,
            renders: 1240,
            cacheHitRatio: 0.9,
            signals: 620,
            privacySignalShare: 0.05,
            previous: { pageviews: 11000, visits: 8800, visitors: null, range: {} },
          }))
        : undefined,
    (url) =>
      url.startsWith(`${A}/series`)
        ? envelope({
            interval: "day",
            points: [
              { t: "2026-10-10T00:00:00Z", pageviews: 400, visits: 300 },
              { t: "2026-10-11T00:00:00Z", pageviews: 420, visits: 310 },
            ],
          })
        : undefined,
    (url) => (url.startsWith(`${A}/top/`) ? topReply(url) : undefined),
    (url) =>
      url.startsWith(`${A}/vitals`)
        ? envelope({
            metrics: [
              { metric: "lcp", p75: 2100, samples: 50, good: 40, needsImprovement: 8, poor: 2 },
              { metric: "inp", p75: 650, samples: 50, good: 10, needsImprovement: 10, poor: 30 },
              { metric: "cls", p75: 0.05, samples: 50, good: 45, needsImprovement: 5, poor: 0 },
            ],
          })
        : undefined,
    (url) =>
      url.startsWith(`${A}/renders/errors`)
        ? envelope({
            report: "errors",
            rows: [
              {
                path: "/<script>alert(1)</script>",
                status: 404,
                refPath: null,
                hits: 7,
                lastSeen: "2026-10-12T08:00:00Z",
              },
            ],
          })
        : undefined,
    (url) =>
      url.startsWith(`${A}/renders/crawlers`)
        ? envelope({ report: "crawlers", rows: [{ crawler: "GPTBot", class: "ai", hits: 31 }] })
        : undefined,
  ];
}

beforeEach(() => {
  router.search = {};
  router.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const analyticsCalls = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.filter(([u]) => String(u).includes("/analytics/"));

describe("AnalyticsPage", () => {
  it("shows the figures, the cards and their rows with the deltas", async () => {
    const fetch = serve(...analyticsServer());
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByText("12,400")).toBeInTheDocument();
    expect(screen.getByText("8,900")).toBeInTheDocument();
    expect(screen.getByText("1.39")).toBeInTheDocument();
    // 12,400 vs 11,000: up 13 %, worded for the tooltip and screen readers.
    expect(screen.getByText("+13% vs the previous period")).toBeInTheDocument();
    // No unique-visitors tile while the mode is off and the period has none.
    expect(document.querySelector('[data-stat-tile="Unique visitors"]')).toBeNull();
    // Compare is on by default: the previous period is drawn too.
    await waitFor(() =>
      expect(screen.getByTestId("timeseries")).toHaveAttribute(
        "data-series",
        "pageviews,visits,previous",
      ),
    );
    const article = await screen.findByRole("link", { name: "Ferry timetables" });
    expect(article).toHaveAttribute("href", "/sites/site_1/articles/entry_AAAAAA01");
    expect(screen.getAllByText("No longer exists").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("AI assistants")).length).toBeGreaterThan(0);
    expect(await screen.findByTestId("country-map")).toHaveTextContent("DE:700");
    // A requested path is visitor-controlled: plain text, never a link.
    const path = await screen.findByText("/<script>alert(1)</script>");
    expect(path.closest("a")).toBeNull();
    expect(await screen.findByText("GPTBot")).toBeInTheDocument();
    const vitals = await screen.findByTestId("analytics-vitals");
    expect(within(vitals).getAllByText("Good")).toHaveLength(2);
    expect(within(vitals).getByText("Poor")).toBeInTheDocument();
    expect(within(vitals).getByText("p75 2.1 sec · 80% good")).toBeInTheDocument();
    expect(screen.getByText("Cookie-less")).toBeInTheDocument();
    // the estimated cache-hit ratio, labelled as an estimate
    const about = screen.getByTestId("analytics-about");
    expect(within(about).getByText("Cache hits (estimated)")).toBeInTheDocument();
    expect(within(about).getByText("about 90%")).toBeInTheDocument();
    const csv = screen.getByRole("link", { name: /Export CSV/ });
    expect(csv.getAttribute("href")).toBe(`${A}/export?range=30d`);
    // The default range is sent by name, so the server's clock decides the days.
    expect(
      analyticsCalls(fetch).some(([u]) => String(u).includes("summary?range=30d&compare=previous")),
    ).toBe(true);
  });

  it("keeps the range and compare in the URL", async () => {
    serve(...analyticsServer());
    render(wrap(<AnalyticsPage />));
    fireEvent.click(await screen.findByRole("tab", { name: "7 days" }));
    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/sites/$siteId/analytics", replace: true }),
    );
    const call = router.navigate.mock.calls.at(-1)?.[0] as { search: (p: object) => object };
    expect(call.search({ filter: "channel:search" })).toEqual({
      filter: "channel:search",
      range: "7d",
      from: undefined,
      to: undefined,
    });
  });

  it("explains instead of asking when the person may not read analytics", async () => {
    const fetch = serve(...analyticsServer("contributor"));
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByTestId("analytics-gated")).toHaveTextContent(
      "Only Authors and above see analytics.",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(analyticsCalls(fetch)).toHaveLength(0);
    expect(screen.queryByRole("tab", { name: "7 days" })).toBeNull();
  });

  it("says analytics is not running when the server has none", async () => {
    serve(...analyticsServer("owner", { status: { status: 404, body: { error: "not_found" } } }));
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByText("Analytics is not running")).toBeInTheDocument();
    expect(screen.getByText("cloudhal deploy")).toBeInTheDocument();
  });

  it("offers to turn analytics on for a site that is off and has no visits", async () => {
    serve(
      ...analyticsServer("owner", {
        status: { status: 200, body: statusWith({ settings: { ...SETTINGS, enabled: false } }) },
        summary: () => envelope({ pageviews: 0, visits: 0, visitors: null, viewsPerVisit: null }),
      }),
    );
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByText("Analytics is off for this site")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn on in settings" }));
    expect(router.navigate).toHaveBeenCalledWith({
      to: "/sites/$siteId/settings",
      params: { siteId: "site_1" },
      hash: "analytics",
    });
  });

  it("disables Turn on, with the reason, for people who may not change settings", async () => {
    serve(
      ...analyticsServer("editor", {
        status: { status: 200, body: statusWith({ settings: { ...SETTINGS, enabled: false } }) },
        summary: () => envelope({ pageviews: 0, visits: 0, visitors: null, viewsPerVisit: null }),
      }),
    );
    render(wrap(<AnalyticsPage />));
    const button = await screen.findByRole("button", { name: "Turn on in settings" });
    expect(button).toBeDisabled();
    // Kumo moves a disabled button’s title into a Tooltip on its wrapper (DESIGN.md §2s).
    expect(button.parentElement).toHaveAttribute("data-base-ui-tooltip-trigger");
  });

  it("explains the can't-read-yet state (A1)", async () => {
    const feature = { ...FEATURE, store: "wae" as const, reader: "none" as const };
    serve(
      ...analyticsServer("owner", {
        feature,
        status: { status: 200, body: statusWith({ feature }) },
        summary: () => envelope({ pageviews: 0, visits: 0, visitors: null, viewsPerVisit: null }),
      }),
    );
    render(wrap(<AnalyticsPage />));
    await waitFor(() =>
      expect(screen.getAllByText("Studio can't read visits yet")).toHaveLength(2),
    );
  });

  it("tells a site with no visits ever apart from a quiet period", async () => {
    serve(
      ...analyticsServer("owner", {
        summary: () => envelope({ pageviews: 0, visits: 0, visitors: null, viewsPerVisit: null }),
      }),
    );
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByText("No visits yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the site/ })).toHaveAttribute(
      "href",
      "https://news.example",
    );
    cleanup();

    serve(
      ...analyticsServer("owner", {
        summary: (url) =>
          url.includes("range=12m")
            ? envelope({ pageviews: 50, visits: 40, visitors: null, viewsPerVisit: 1.25 })
            : envelope({ pageviews: 0, visits: 0, visitors: null, viewsPerVisit: null }),
      }),
    );
    router.search = { range: "today" };
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByText("No visits in this period")).toBeInTheDocument();
  });

  it("shows Cloudflare being busy with Try again", async () => {
    serve(
      ...analyticsServer("owner", {
        summary: () => ({
          status: 503,
          body: { error: "analytics_unavailable", message: "busy", details: { retryable: true } },
        }),
      }),
    );
    render(wrap(<AnalyticsPage />));
    const banner = await screen.findByTestId("analytics-error", {}, { timeout: 8000 });
    expect(banner).toHaveTextContent("Cloudflare's analytics service is busy");
    expect(within(banner).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the share of page views with GPC or DNT next to unique visitors", async () => {
    serve(...analyticsServer());
    render(wrap(<AnalyticsPage />));
    await screen.findByText("12,400");
    // unique visitors off: no hash is formed for anyone, so the share is not shown
    expect(screen.queryByText("Privacy signals")).toBeNull();
    cleanup();
    const unique = statusWith({ settings: { ...SETTINGS, uniqueVisitors: true } });
    serve(...analyticsServer("owner", { status: { status: 200, body: unique } }));
    render(wrap(<AnalyticsPage />));
    const about = await screen.findByTestId("analytics-about");
    expect(await within(about).findByText("Privacy signals")).toBeInTheDocument();
    expect(within(about).getByText("5% of page views")).toBeInTheDocument();
  });

  it("warns about the Workers Free limit unless the plan is marked paid", async () => {
    const busy = statusWith({
      quota: { day: "2026-10-11", pageviews: 40000, beacons: 42000, requests: 82000 },
    });
    serve(...analyticsServer("owner", { status: { status: 200, body: busy } }));
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByTestId("analytics-quota-banner")).toHaveTextContent(
      "82,000 of 100,000 a day",
    );
    cleanup();
    serve(
      ...analyticsServer("owner", {
        status: { status: 200, body: { ...busy, settings: { ...SETTINGS, planHint: "paid" } } },
      }),
    );
    render(wrap(<AnalyticsPage />));
    await screen.findByText("12,400");
    expect(screen.queryByTestId("analytics-quota-banner")).toBeNull();
  });

  it("names a filter and clears it", async () => {
    router.search = { filter: "country:DE" };
    const fetch = serve(...analyticsServer());
    render(wrap(<AnalyticsPage />));
    expect(await screen.findByText("Showing Germany only")).toBeInTheDocument();
    await waitFor(() =>
      expect(analyticsCalls(fetch).some(([u]) => String(u).includes("filter=country%3ADE"))).toBe(
        true,
      ),
    );
    // Site-wide reports do not take a filter: they are left out while one is set.
    expect(screen.queryByText("Errors and redirects")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all traffic" }));
    expect(router.navigate).toHaveBeenCalled();
  });

  it("speaks Turkish", async () => {
    serve(...analyticsServer());
    render(wrap(<AnalyticsPage />, "tr"));
    expect(await screen.findByText("12.400")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trafik" })).toBeInTheDocument();
    expect((await screen.findAllByText("Yapay zekâ asistanları")).length).toBeGreaterThan(0);
  });
});
