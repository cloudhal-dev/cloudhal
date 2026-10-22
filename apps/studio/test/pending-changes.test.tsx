/**
 * The badge beside Publish: the count of changes a publish would carry, its pluralised summary
 * (tooltip and the Publish button's accessible name), "Not published" for a site that never went
 * live, nothing when everything is live, and a refetch after any write to the site.
 */
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingText } from "../src/components/PendingChanges.tsx";
import { SitePublish } from "../src/components/SitePublish.tsx";
import { I18nProvider, useT } from "../src/i18n/index.tsx";
import { type PendingChanges, request } from "../src/lib/api.ts";
import { asRole, on, serve, wrap } from "./roles-fixtures.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pending = (patch: Partial<PendingChanges> = {}): PendingChanges => ({
  live: true,
  liveSnapshotId: "snap_live",
  counts: { added: 1, changed: 2, removed: 0, total: 3 },
  byKind: { contentEntry: 2, page: 1 },
  ...patch,
});

const site = on("GET", "/api/sites/site_1", {
  status: 200,
  body: { id: "site_1", name: "Demo", publishedSnapshotId: "snap_live" },
});

describe("pendingText", () => {
  const tFor = (locale: "en" | "tr" | "ru") =>
    renderHook(() => useT(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      ),
    }).result.current;

  it("pluralises the total and each kind", () => {
    const t = tFor("en");
    expect(pendingText(t, pending())).toBe("3 changes aren't live yet · 2 articles and 1 page");
    expect(
      pendingText(
        t,
        pending({
          counts: { added: 0, changed: 1, removed: 0, total: 1 },
          byKind: { contentEntry: 1 },
        }),
      ),
    ).toBe("1 change isn't live yet · 1 article");
    expect(
      pendingText(
        t,
        pending({
          counts: { added: 0, changed: 2, removed: 1, total: 3 },
          byKind: { site: 1, menu: 2 },
        }),
      ),
    ).toBe("3 changes aren't live yet · site settings and 2 menus");
  });

  it("says what the first publish takes when the site was never published", () => {
    const t = tFor("en");
    const first = pending({
      live: false,
      liveSnapshotId: undefined,
      counts: { added: 5, changed: 0, removed: 0, total: 5 },
      byKind: { site: 1, page: 2, contentEntry: 2 },
    });
    expect(pendingText(t, first)).toBe(
      "Not published yet. The first publish puts site settings, 2 pages, and 2 articles live.",
    );
  });
});

describe("PendingBadge beside Publish", { timeout: 30_000 }, () => {
  it("shows the count and puts the summary in the Publish button's name", async () => {
    serve(
      ...asRole("owner"),
      site,
      on("GET", "/api/sites/site_1/pending", { status: 200, body: pending() }),
    );
    render(wrap(<SitePublish siteId="site_1" />));
    expect(await screen.findByText("3 changes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Publish. 3 changes aren't live yet · 2 articles and 1 page",
      }),
    ).toBeInTheDocument();
  });

  it("says Not published for a site that never went live", async () => {
    serve(
      ...asRole("owner"),
      site,
      on("GET", "/api/sites/site_1/pending", {
        status: 200,
        body: pending({
          live: false,
          liveSnapshotId: undefined,
          counts: { added: 4, changed: 0, removed: 0, total: 4 },
          byKind: { site: 1, page: 3 },
        }),
      }),
    );
    render(wrap(<SitePublish siteId="site_1" />));
    expect(await screen.findByText("Not published")).toBeInTheDocument();
    expect(screen.queryByText(/changes$/)).not.toBeInTheDocument();
  });

  it("shows nothing when everything is live", async () => {
    const fetch = serve(
      ...asRole("owner"),
      site,
      on("GET", "/api/sites/site_1/pending", {
        status: 200,
        body: pending({ counts: { added: 0, changed: 0, removed: 0, total: 0 }, byKind: {} }),
      }),
    );
    render(wrap(<SitePublish siteId="site_1" />));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([u]) => String(u).endsWith("/pending"))).toBe(true),
    );
    expect(await screen.findByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByText("Not published")).not.toBeInTheDocument();
    expect(screen.queryByText(/changes?$/)).not.toBeInTheDocument();
  });

  it("refetches after a save to this site, not after previews or other sites", async () => {
    let total = 0;
    const calls = { pending: 0 };
    serve(
      ...asRole("owner"),
      site,
      on("GET", "/api/sites/site_1/pending", () => {
        calls.pending++;
        return {
          status: 200,
          body: pending({
            counts: { added: 0, changed: total, removed: 0, total },
            byKind: total ? { contentEntry: total } : {},
          }),
        };
      }),
      on("PUT", "/api/sites/site_1/entries/entry_1", { status: 200, body: {} }),
      on("POST", "/api/sites/site_1/entries/entry_1/preview", { status: 200, body: {} }),
      on("PUT", "/api/sites/site_2/entries/entry_9", { status: 200, body: {} }),
    );
    render(wrap(<SitePublish siteId="site_1" />));
    await waitFor(() => expect(calls.pending).toBe(1));
    expect(screen.queryByText(/changes?$/)).not.toBeInTheDocument();

    await request("/api/sites/site_1/entries/entry_1/preview", { method: "POST" });
    await request("/api/sites/site_2/entries/entry_9", { method: "PUT" });
    total = 1;
    await request("/api/sites/site_1/entries/entry_1", { method: "PUT" });
    expect(await screen.findByText("1 change")).toBeInTheDocument();
    expect(calls.pending).toBe(2);
  });
});
