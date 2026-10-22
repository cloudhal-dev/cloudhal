/**
 * Live addresses carry the item's locale (RFC-0033 §4, core-ts `itemUrl`): a `tr` page or article
 * lives under `/tr` (graph paths have no prefix), a locale with its own domain at that domain's
 * root. Covers the editors' "Live at" address, the rows' "View live" / "Copy link" and the
 * editor header's "View live", which shows only while the live snapshot serves the item there.
 */
import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { DropdownMenu } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryAddress, PageAddress, ViewLiveButton } from "../src/components/LiveAddress.tsx";
import { LiveLinkItems } from "../src/components/LiveRowItems.tsx";
import { on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const siteRoute = (patch: Record<string, unknown> = {}) =>
  on("GET", "/api/sites/site_1", {
    status: 200,
    body: {
      id: "site_1",
      name: "Demo",
      defaultLocale: "en",
      locales: ["en", "tr", "ar"],
      collections: { posts: { permalink: "/blog/{slug}" } },
      domains: [{ hostname: "blog.example.com", primary: true }],
      publishedSnapshotId: "snap_live",
      ...patch,
    },
  });

const page = (patch: Partial<Page> = {}): Page => ({
  schemaVersion: 1,
  id: "page_tr",
  siteId: "site_1",
  path: "/hakkinda",
  title: "Hakkında",
  locale: "tr",
  status: "published",
  sections: [],
  rev: 2,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
  ...patch,
});

const entry = (patch: Partial<ContentEntry> = {}): ContentEntry =>
  ({
    schemaVersion: 1,
    id: "entry_tr",
    siteId: "site_1",
    collection: "posts",
    slug: "merhaba",
    title: "Merhaba",
    locale: "tr",
    status: "published",
    rev: 2,
    createdAt: "2026-10-08T08:00:00Z",
    updatedAt: "2026-10-08T08:00:00Z",
    ...patch,
  }) as ContentEntry;

const liveNode = (id: string, node: object | undefined) =>
  on(
    "GET",
    `/api/sites/site_1/snapshots/snap_live/nodes/${id}`,
    node ? { status: 200, body: node } : { status: 404, body: { error: "not_found" } },
  );

describe("a localized editor address", () => {
  it("puts a tr page under /tr", async () => {
    serve(siteRoute(), liveNode("page_tr", page()));
    render(wrap(<PageAddress siteId="site_1" page={page()} />));
    await waitFor(() =>
      expect(screen.getByTestId("live-address")).toHaveAttribute("data-live", "true"),
    );
    expect(screen.getByText("https://blog.example.com/tr/hakkinda")).toBeInTheDocument();
  });

  it("puts a tr article under /tr with its collection's permalink", async () => {
    serve(siteRoute(), liveNode("entry_tr", entry()));
    render(wrap(<EntryAddress siteId="site_1" entry={entry()} />));
    await waitFor(() =>
      expect(screen.getByTestId("live-address")).toHaveAttribute("data-live", "true"),
    );
    expect(screen.getByText("https://blog.example.com/tr/blog/merhaba")).toBeInTheDocument();
  });

  it("prefixes the default locale under prefix-all and uses a locale's own domain", async () => {
    serve(
      siteRoute({ localization: { routing: "prefix-all", domains: { ar: "ar.example.com" } } }),
      liveNode("page_tr", undefined),
    );
    render(wrap(<PageAddress siteId="site_1" page={page({ locale: "en", path: "/about" })} />));
    expect(await screen.findByText("https://blog.example.com/en/about")).toBeInTheDocument();
    cleanup();
    render(wrap(<EntryAddress siteId="site_1" entry={entry({ locale: "ar" })} />));
    expect(await screen.findByText("https://ar.example.com/blog/merhaba")).toBeInTheDocument();
  });

  it("shows the localized path without a domain", async () => {
    serve(siteRoute({ domains: [] }), liveNode("page_tr", undefined));
    render(wrap(<PageAddress siteId="site_1" page={page()} />));
    expect(await screen.findByText("/tr/hakkinda")).toBeInTheDocument();
  });
});

describe("a localized row's live links", () => {
  const menu = (item: Page | ContentEntry) =>
    wrap(
      <DropdownMenu defaultOpen>
        <DropdownMenu.Trigger render={<button type="button">menu</button>} />
        <DropdownMenu.Content>
          <LiveLinkItems siteId="site_1" item={item} />
        </DropdownMenu.Content>
      </DropdownMenu>,
    );

  it.each([
    ["page", page(), "https://blog.example.com/tr/hakkinda"],
    ["article", entry(), "https://blog.example.com/tr/blog/merhaba"],
  ])("copies a tr %s's prefixed URL", async (_kind, item, url) => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    serve(siteRoute());
    render(menu(item));
    expect(await screen.findByRole("menuitem", { name: /View live/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  });
});

describe("the editor header's View live", () => {
  it("opens the live URL when the live snapshot serves the item there", async () => {
    serve(siteRoute(), liveNode("entry_tr", entry()));
    render(wrap(<ViewLiveButton siteId="site_1" item={entry()} />));
    const link = await screen.findByTestId("view-live");
    expect(link).toHaveAttribute("href", "https://blog.example.com/tr/blog/merhaba");
    expect(link).toHaveAttribute("aria-label", "View live");
  });

  it.each([
    ["not in the live snapshot", undefined],
    ["live at another address", entry({ slug: "eski" })],
    ["a draft in the live snapshot", entry({ status: "draft" })],
  ])("hides when the item is %s", async (_why, live) => {
    const fn = serve(siteRoute(), liveNode("entry_tr", live));
    render(wrap(<ViewLiveButton siteId="site_1" item={entry()} />));
    const asked = () => fn.mock.calls.some(([u]) => String(u).includes("nodes/entry_tr"));
    await waitFor(() => expect(asked()).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("view-live")).not.toBeInTheDocument();
  });
});
