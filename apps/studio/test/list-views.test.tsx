/**
 * The Articles and Pages lists' "Views · 30 days" column (RFC-0006 §10.2): one `top/node` request
 * for the site, read per row; left out without `analytics.read` (and then never requested), when
 * analytics are off for the deployment or the site, and when the request fails.
 */
import type { Page, Site } from "@cloudhal/core-contracts";
import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type { AnalyticsFeature, AnalyticsStatus, AnalyticsTopRow, Role } from "../src/lib/api.ts";
import { listViews, viewsOf } from "../src/lib/list-views.ts";
import { ArticlesPage } from "../src/routes/ArticlesPage.tsx";
import { PagesPage } from "../src/routes/PagesPage.tsx";
import { INSTANCE, meFor, on, type Route, serve } from "./roles-fixtures.tsx";
import { entry } from "./taxonomy-fixtures.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(children: ReactNode, locale: Locale = "en") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Toasty>{children}</Toasty>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

const row = (key: string, pageviews: number): AnalyticsTopRow => ({
  key,
  pageviews,
  visits: Math.round(pageviews / 2),
});

describe("list views helpers", () => {
  it("reads a row's views; a node missing from a short answer had none", () => {
    const v = listViews([row("entry_a", 1204), row("page_1", 7)]);
    expect(v.complete).toBe(true);
    expect(viewsOf(v, "entry_a")).toBe(1204);
    expect(viewsOf(v, "page_1")).toBe(7);
    expect(viewsOf(v, "entry_b")).toBe(0);
  });

  it("does not guess for nodes missing from a full or folded answer", () => {
    const full = listViews(
      Array.from({ length: 3 }, (_, i) => row(`entry_${i}`, 10 - i)),
      3,
    );
    expect(full).toMatchObject({ complete: false, ranked: 3 });
    expect(viewsOf(full, "entry_1")).toBe(9);
    expect(viewsOf(full, "entry_x")).toBeUndefined();

    const folded = listViews([row("entry_a", 5), row("(other)", 40)]);
    expect(folded).toMatchObject({ complete: false, ranked: 1 });
    expect(viewsOf(folded, "entry_b")).toBeUndefined();
  });
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

const SITE: Site = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Demo",
  slug: "demo",
  defaultLocale: "en",
  locales: ["en"],
  domains: [{ hostname: "example.com", primary: true }],
  pageIds: ["page_1", "page_2"],
  theme: { name: "blog" },
  rev: 1,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
};

const page = (id: string, title: string): Page => ({
  schemaVersion: 1,
  id,
  siteId: "site_1",
  path: `/${title.toLowerCase()}`,
  title,
  locale: "en",
  status: "published",
  sections: [],
  rev: 1,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
});

const TOP = "/api/sites/site_1/analytics/top/node";

/** The site, its articles and pages, and analytics as `role` sees them. */
function routes(
  role: Role,
  opts: {
    feature?: AnalyticsFeature | undefined;
    siteOn?: boolean;
    top?: AnalyticsTopRow[] | "error";
  } = {},
): Route[] {
  const feature = "feature" in opts ? opts.feature : FEATURE;
  const top = opts.top ?? [row("entry_a", 1204), row("page_1", 31)];
  return [
    on("GET", "/api/me", { status: 200, body: meFor(role) }),
    on("GET", "/api/instance", {
      status: 200,
      body: {
        ...INSTANCE,
        features: { ...INSTANCE.features, ...(feature ? { analytics: feature } : {}) },
      },
    }),
    on("GET", "/api/sites/site_1", { status: 200, body: SITE }),
    on("GET", "/api/sites/site_1/entries", {
      status: 200,
      body: [
        entry({ id: "entry_a", title: "Ferries", status: "published" }),
        entry({ id: "entry_b", title: "Harbours", status: "published" }),
      ],
    }),
    on("GET", "/api/sites/site_1/pages", {
      status: 200,
      body: [page("page_1", "About"), page("page_2", "Contact")],
    }),
    on("GET", "/api/sites/site_1/analytics/status", {
      status: 200,
      body: STATUS(opts.siteOn ?? true),
    }),
    on(
      "GET",
      TOP,
      top === "error"
        ? { status: 503, body: { error: "unavailable", message: "busy" } }
        : {
            status: 200,
            body: {
              range: { from: "2026-09-13", to: "2026-10-13" },
              source: "live",
              estimated: false,
              generatedAt: "2026-10-12T10:00:00Z",
              data: { dimension: "node", rows: top },
            },
          },
    ),
  ];
}

const topCalls = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/analytics/top/node"));

const rowOf = (title: string) => screen.getByText(title).closest("tr") as HTMLElement;

/** Waits until the list and `/api/me` + `/api/instance` (+ the status, when asked) answered. */
async function listed(fetch: ReturnType<typeof serve>, title: string, status = false) {
  await screen.findByText(title, {}, { timeout: 15_000 });
  await waitFor(
    () => {
      const urls = fetch.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.endsWith("/api/me"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/api/instance"))).toBe(true);
      if (status) expect(urls.some((u) => u.endsWith("/analytics/status"))).toBe(true);
    },
    { timeout: 15_000 },
  );
}

describe("Views · 30 days column", { timeout: 45_000 }, () => {
  it("shows each article's 30-day views from one top/node request", async () => {
    const fetch = serve(...routes("author"));
    render(wrap(<ArticlesPage />));
    expect(
      await screen.findByRole("columnheader", { name: "Views · 30 days" }, { timeout: 15_000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf("Ferries")).getByText("1,204")).toBeInTheDocument(), {
      timeout: 15_000,
    });
    // Not in a short answer: no views in 30 days.
    expect(within(rowOf("Harbours")).getByTestId("views-cell")).toHaveTextContent("0");
    const calls = topCalls(fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("range=30d");
    expect(calls[0]).toContain("limit=100");
  });

  it("says a node is not among the most read when the answer is full", async () => {
    const top = Array.from({ length: 100 }, (_, i) =>
      row(`entry_${String(i).padStart(6, "0")}`, 500 - i),
    );
    serve(...routes("editor", { top: [row("entry_a", 900), ...top.slice(1)] }));
    render(wrap(<ArticlesPage />));
    await waitFor(() => expect(within(rowOf("Ferries")).getByText("900")).toBeInTheDocument(), {
      timeout: 15_000,
    });
    expect(within(rowOf("Harbours")).getByTestId("views-cell")).toHaveTextContent(
      "Not among the 100 most read in the last 30 days",
    );
  });

  it("shows the pages' views too, in Turkish", async () => {
    serve(...routes("editor", { top: [row("page_1", 1204)] }));
    render(wrap(<PagesPage />, "tr"));
    expect(
      await screen.findByRole(
        "columnheader",
        { name: "Görüntülenme · 30 gün" },
        { timeout: 15_000 },
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf("About")).getByText("1.204")).toBeInTheDocument(), {
      timeout: 15_000,
    });
    expect(within(rowOf("Contact")).getByTestId("views-cell")).toHaveTextContent("0");
  });

  it("is left out for a Contributor, without asking the analytics API", async () => {
    const fetch = serve(...routes("contributor"));
    render(wrap(<ArticlesPage />));
    await listed(fetch, "Ferries");
    expect(screen.queryByRole("columnheader", { name: "Views · 30 days" })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/analytics/"))).toBe(false);
  });

  it("is left out when the deployment records no analytics", async () => {
    const fetch = serve(...routes("owner", { feature: undefined }));
    render(wrap(<ArticlesPage />));
    await listed(fetch, "Ferries");
    expect(screen.queryByRole("columnheader", { name: "Views · 30 days" })).not.toBeInTheDocument();
    expect(topCalls(fetch)).toEqual([]);
  });

  it("is left out when analytics are off for the site", async () => {
    const fetch = serve(...routes("owner", { siteOn: false }));
    render(wrap(<ArticlesPage />));
    await listed(fetch, "Ferries", true);
    await waitFor(() => expect(screen.queryByText("Ferries")).toBeInTheDocument());
    expect(screen.queryByRole("columnheader", { name: "Views · 30 days" })).not.toBeInTheDocument();
    expect(topCalls(fetch)).toEqual([]);
  });

  it("is left out when the views cannot be read", async () => {
    const fetch = serve(...routes("owner", { top: "error" }));
    render(wrap(<ArticlesPage />));
    await listed(fetch, "Ferries", true);
    await waitFor(() => expect(topCalls(fetch)).toHaveLength(1), { timeout: 15_000 });
    await waitFor(
      () =>
        expect(
          screen.queryByRole("columnheader", { name: "Views · 30 days" }),
        ).not.toBeInTheDocument(),
      { timeout: 15_000 },
    );
    expect(screen.getByText("Ferries")).toBeInTheDocument();
  });
});
