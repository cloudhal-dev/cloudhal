/**
 * RFC-0035: an owner publishes or unpublishes one page without scheduling it — from the editor
 * (Publish is a draft's next step), from the Pages list's row menu, and the site Publish dialog
 * says which pages it leaves out.
 */
import type { Page } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SitePublish } from "../src/components/SitePublish.tsx";
import { StatusActions } from "../src/components/StatusActions.tsx";
import { PagesPage } from "../src/routes/PagesPage.tsx";
import { asRole, bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  useParams: () => ({ siteId: "site_1" }),
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
});

const page = (patch: Partial<Page> = {}): Page => ({
  schemaVersion: 1,
  id: "page_1",
  siteId: "site_1",
  path: "/about",
  title: "About",
  locale: "en",
  status: "draft",
  sections: [],
  rev: 2,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
  ...patch,
});

const PAGES = [
  page(),
  page({ id: "page_2", path: "/tr/hakkinda", title: "Hakkında", locale: "tr" }),
  page({ id: "page_3", path: "/", title: "Home", status: "published" }),
];

const routes = [
  on("GET", "/api/sites/site_1", {
    status: 200,
    body: {
      id: "site_1",
      name: "Demo",
      locales: ["en", "tr"],
      pageIds: ["page_3", "page_1", "page_2"],
    },
  }),
  on("GET", "/api/sites/site_1/pages", { status: 200, body: PAGES }),
  on("GET", "/api/sites/site_1/snapshots", { status: 200, body: [] }),
  on("GET", "/api/sites/site_1/menus", { status: 200, body: [] }),
  (url: string, init?: RequestInit) => {
    if (init?.method !== "PUT" || !url.startsWith("/api/sites/site_1/pages/")) return undefined;
    const sent = JSON.parse(String(init.body)) as Page;
    return { status: 200, body: { ...sent, rev: sent.rev + 1 } };
  },
];

describe("StatusActions for pages (directPublish)", () => {
  it("makes Publish a draft's next step and keeps review in the menu", async () => {
    const onChange = vi.fn();
    const onPublish = vi.fn();
    render(
      wrap(
        <StatusActions status="draft" directPublish onChange={onChange} onPublish={onPublish} />,
      ),
    );
    fireEvent.click(screen.getByTestId("publish"));
    expect(onPublish).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("send-to-review")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Send to review/ }));
    expect(onChange).toHaveBeenCalledWith("review");
  });

  it("still shows Publish disabled to someone who may only draft", () => {
    render(
      wrap(
        <StatusActions
          status="draft"
          directPublish
          allowed={["draft", "review"]}
          onChange={vi.fn()}
          onPublish={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId("send-to-review")).toBeInTheDocument();
    expect(screen.queryByTestId("publish")).not.toBeInTheDocument();
  });
});

describe("Pages list row menu", { timeout: 45_000 }, () => {
  const rowOf = async (title: string) =>
    (await screen.findByText(title)).closest("tr") as HTMLElement;

  it("publishes a draft page after approval", async () => {
    const fetch = serve(...asRole("owner"), ...routes);
    render(wrap(<PagesPage />));
    const row = await rowOf("Hakkında");
    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByTestId("row-publish"));
    expect(await screen.findByText("Publish “Hakkında”?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("approve"));
    expect(await screen.findByText("Page published")).toBeInTheDocument();
    expect(bodyOf(fetch, "PUT", "/api/sites/site_1/pages/page_2")).toMatchObject({
      id: "page_2",
      rev: 2,
      status: "published",
    });
  });

  it("unpublishes a published page", async () => {
    const fetch = serve(...asRole("owner"), ...routes);
    render(wrap(<PagesPage />));
    const row = await rowOf("Home");
    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Unpublish/ }));
    expect(await screen.findByText("Page moved back to draft")).toBeInTheDocument();
    expect(bodyOf(fetch, "PUT", "/api/sites/site_1/pages/page_3")).toMatchObject({
      status: "draft",
    });
  });

  it("disables both for a role that may not change pages", async () => {
    serve(...asRole("author"), ...routes);
    render(wrap(<PagesPage />));
    const row = await rowOf("Hakkında");
    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
    expect(await screen.findByTestId("row-publish")).toHaveAttribute("data-disabled");
  });
});

describe("site Publish dialog", { timeout: 45_000 }, () => {
  it("says how many pages the publish leaves out, with a way to them", async () => {
    serve(...asRole("owner"), ...routes);
    render(wrap(<SitePublish siteId="site_1" />));
    await waitFor(() =>
      expect(document.querySelector("[data-publish-mode]")).toHaveAttribute(
        "data-publish-mode",
        "publish",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("2 pages are not published")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review pages/ }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/sites/$siteId/pages",
      params: { siteId: "site_1" },
    });
  });
});
