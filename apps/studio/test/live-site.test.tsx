/**
 * Links to the live site: the origin and URL helpers, the top bar's "View site" and its disabled
 * states, the toasts after a site publish ("View site", "Copy link"), the notice after marking an
 * item Published, and an editor's "Live at" / "Will be at" address.
 */
import type { Page } from "@cloudhal/core-contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageAddress } from "../src/components/LiveAddress.tsx";
import { ViewSiteButton } from "../src/components/LiveLinks.tsx";
import { SitePublish } from "../src/components/SitePublish.tsx";
import { SitePublishOpener } from "../src/components/sitePublishOpener.ts";
import { useMarkedPublishedNotice, useSiteOrigin } from "../src/components/useLiveSite.ts";
import { liveUrl, originHost, servesAt, siteOrigin } from "../src/lib/live-site.ts";
import { PagesPage } from "../src/routes/PagesPage.tsx";
import { asRole, on, serve, wrap } from "./roles-fixtures.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  useParams: () => ({ siteId: "site_1" }),
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DOMAINS = [
  { hostname: "alias.example.com", primary: false },
  { hostname: "blog.example.com", primary: true },
];

const siteRoute = (patch: Record<string, unknown> = {}) =>
  on("GET", "/api/sites/site_1", {
    status: 200,
    body: {
      id: "site_1",
      name: "Demo",
      defaultLocale: "en",
      locales: ["en"],
      domains: DOMAINS,
      publishedSnapshotId: "snap_live",
      ...patch,
    },
  });

describe("live-site helpers", () => {
  it("builds the origin from the primary domain", () => {
    expect(siteOrigin(DOMAINS)).toBe("https://blog.example.com");
    expect(siteOrigin([{ hostname: "only.example.com", primary: false }])).toBe(
      "https://only.example.com",
    );
    expect(siteOrigin([])).toBeUndefined();
    expect(siteOrigin(undefined)).toBeUndefined();
  });

  it("joins an origin and a path", () => {
    expect(liveUrl("https://a.example", "/blog/hello")).toBe("https://a.example/blog/hello");
    expect(liveUrl("https://a.example", "/")).toBe("https://a.example/");
    expect(liveUrl("https://a.example", "about")).toBe("https://a.example/about");
    expect(liveUrl(undefined, "/about")).toBeUndefined();
    expect(originHost("https://a.example")).toBe("a.example");
  });

  it("calls an address live only when the live snapshot serves it published, right there", () => {
    type Node = { status: string; path: string };
    const at = (n: Node) => n.path;
    expect(servesAt({ status: "published", path: "/a" }, at, "/a")).toBe(true);
    expect(servesAt({ status: "draft", path: "/a" }, at, "/a")).toBe(false);
    expect(servesAt({ status: "published", path: "/old" }, at, "/a")).toBe(false);
    expect(servesAt<Node>(undefined, at, "/a")).toBe(false);
  });
});

describe("useSiteOrigin", () => {
  it("reads the site query", async () => {
    serve(siteRoute());
    const { result } = renderHook(() => useSiteOrigin("site_1"), {
      wrapper: ({ children }) => wrap(children),
    });
    await waitFor(() => expect(result.current).toBe("https://blog.example.com"));
  });
});

describe("View site (top bar)", () => {
  it("opens the primary domain in a new tab once the site is live", async () => {
    serve(siteRoute());
    render(wrap(<ViewSiteButton siteId="site_1" />));
    await waitFor(() =>
      expect(screen.getByTestId("view-site")).toHaveAttribute("href", "https://blog.example.com/"),
    );
    const link = screen.getByTestId("view-site");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName("View site");
  });

  it("is disabled, saying so, without a domain", async () => {
    serve(siteRoute({ domains: [] }));
    render(wrap(<ViewSiteButton siteId="site_1" />));
    // The reason is the tooltip on the disabled button's wrapper.
    await waitFor(() =>
      expect(screen.getByTestId("view-site")).toHaveAttribute(
        "data-reason",
        "Add a domain in Settings",
      ),
    );
    const button = screen.getByTestId("view-site");
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute("data-base-ui-tooltip-trigger");
  });

  it("is disabled before the first publish", async () => {
    serve(siteRoute({ publishedSnapshotId: undefined }));
    render(wrap(<ViewSiteButton siteId="site_1" />));
    // The reason is the tooltip on the disabled button's wrapper.
    await waitFor(() =>
      expect(screen.getByTestId("view-site")).toHaveAttribute("data-reason", "Not published yet"),
    );
    const button = screen.getByTestId("view-site");
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute("data-base-ui-tooltip-trigger");
  });
});

describe("toasts after a site publish", { timeout: 30_000 }, () => {
  const publishRoutes = [
    on("GET", "/api/sites/site_1/snapshots", { status: 200, body: [] }),
    on("GET", "/api/sites/site_1/pages", { status: 200, body: [] }),
    on("POST", "/api/sites/site_1/snapshots", {
      status: 200,
      body: { snapshot: { id: "snap_2" }, site: { id: "site_1" } },
    }),
  ];
  const publish = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    fireEvent.click(await screen.findByTestId("approve"));
  };

  it("offers View site and Copy link, and Copy link copies the address", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    serve(...asRole("owner"), siteRoute(), ...publishRoutes);
    render(wrap(<SitePublish siteId="site_1" />));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await publish();
    const view = await screen.findByRole("button", { name: "View site" });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://blog.example.com/"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    // An action closes its toast.
    await waitFor(() => expect(view).not.toBeInTheDocument());
  });

  it("stays plain without a domain", async () => {
    serve(...asRole("owner"), siteRoute({ domains: [] }), ...publishRoutes);
    render(wrap(<SitePublish siteId="site_1" />));
    await publish();
    expect(await screen.findByText("Snapshot published")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View site" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });
});

describe("marked published notice", () => {
  const Trigger = () => {
    const notice = useMarkedPublishedNotice();
    return (
      <button type="button" onClick={() => notice({ id: "page_1", rev: 3 })}>
        mark
      </button>
    );
  };

  it("offers Publish site to people who may publish, opening the site's confirmation", async () => {
    serve(...asRole("editor"), siteRoute());
    const openPublish = vi.fn();
    render(
      wrap(
        <SitePublishOpener.Provider value={openPublish}>
          <Trigger />
        </SitePublishOpener.Provider>,
      ),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // The gate reads /api/me first.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    fireEvent.click(screen.getByRole("button", { name: "mark" }));
    expect(await screen.findByText("Marked published")).toBeInTheDocument();
    expect(
      screen.getByText("It goes live the next time the site is published."),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Publish site" }));
    expect(openPublish).toHaveBeenCalledOnce();
  });

  it("shows no action to someone who may not publish", async () => {
    serve(...asRole("contributor"), siteRoute());
    render(
      wrap(
        <SitePublishOpener.Provider value={vi.fn()}>
          <Trigger />
        </SitePublishOpener.Provider>,
      ),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    fireEvent.click(screen.getByRole("button", { name: "mark" }));
    expect(await screen.findByText("Marked published")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish site" })).not.toBeInTheDocument();
  });
});

describe("an editor's address", () => {
  const page = (patch: Partial<Page> = {}): Page => ({
    schemaVersion: 1,
    id: "page_1",
    siteId: "site_1",
    path: "/about",
    title: "About",
    locale: "en",
    status: "published",
    sections: [],
    rev: 4,
    createdAt: "2026-10-08T08:00:00Z",
    updatedAt: "2026-10-08T08:00:00Z",
    ...patch,
  });
  const liveNode = (node: Page | undefined) =>
    on(
      "GET",
      "/api/sites/site_1/snapshots/snap_live/nodes/page_1",
      node ? { status: 200, body: node } : { status: 404, body: { error: "not_found" } },
    );

  it("says Live at, with the full URL, when the live snapshot serves the page there", async () => {
    serve(siteRoute(), liveNode(page({ rev: 3 })));
    render(wrap(<PageAddress siteId="site_1" page={page()} />));
    await waitFor(() =>
      expect(screen.getByTestId("live-address")).toHaveAttribute("data-live", "true"),
    );
    expect(screen.getByText("Live at")).toBeInTheDocument();
    expect(screen.getByText("https://blog.example.com/about")).toBeInTheDocument();
  });

  it("says Will be at for a new address or a page the live site does not have", async () => {
    serve(siteRoute(), liveNode(page({ path: "/old-about" })));
    render(wrap(<PageAddress siteId="site_1" page={page()} />));
    expect(await screen.findByText("https://blog.example.com/about")).toBeInTheDocument();
    expect(screen.getByText("Will be at")).toBeInTheDocument();
  });

  it("shows only the path without a domain", async () => {
    serve(siteRoute({ domains: [] }), liveNode(undefined));
    render(wrap(<PageAddress siteId="site_1" page={page()} />));
    expect(await screen.findByText("/about")).toBeInTheDocument();
    expect(screen.getByText("Will be at")).toBeInTheDocument();
    expect(screen.queryByText(/https:/)).not.toBeInTheDocument();
  });
});

describe("Pages list row menu", { timeout: 30_000 }, () => {
  const rows: Page[] = [
    {
      schemaVersion: 1,
      id: "page_3",
      siteId: "site_1",
      path: "/",
      title: "Home",
      locale: "en",
      status: "published",
      sections: [],
      rev: 2,
      createdAt: "2026-10-08T08:00:00Z",
      updatedAt: "2026-10-08T08:00:00Z",
    },
    {
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
    },
  ];
  const listRoutes = [
    on("GET", "/api/sites/site_1/pages", { status: 200, body: rows }),
    on("GET", "/api/sites/site_1/snapshots", { status: 200, body: [] }),
    on("GET", "/api/sites/site_1/menus", { status: 200, body: [] }),
  ];
  const openMenu = async (title: string) => {
    const row = (await screen.findByText(title)).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "More actions" }));
  };

  it("offers View live and Copy link for a published page", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    serve(...asRole("owner"), siteRoute(), ...listRoutes);
    render(wrap(<PagesPage />));
    await openMenu("Home");
    expect(await screen.findByRole("menuitem", { name: /View live/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy link/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://blog.example.com/"));
  });

  it("leaves them out for a draft", async () => {
    serve(...asRole("owner"), siteRoute(), ...listRoutes);
    render(wrap(<PagesPage />));
    await openMenu("About");
    expect(await screen.findByTestId("row-publish")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /View live/ })).not.toBeInTheDocument();
  });
});
