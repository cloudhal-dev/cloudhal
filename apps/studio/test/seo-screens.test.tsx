import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import { ArticleEditorPage } from "../src/routes/ArticleEditorPage.tsx";
import { PageEditorPage } from "../src/routes/PageEditorPage.tsx";
import { PagesPage } from "../src/routes/PagesPage.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", entryId: "entry_1", pageId: "page_1" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

// happy-dom would load the sandboxed preview frame over the network; it is covered elsewhere.
vi.mock("../src/components/EditorPreview.tsx", () => ({ EditorPreview: () => null }));

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

const LONG_SUMMARY =
  "Cloudhal keeps every change to a site as a snapshot, so agents and people can edit freely, preview the result, publish with approval and roll back in one click whenever needed.";

const entry = (patch: Partial<ContentEntry> = {}): ContentEntry => ({
  schemaVersion: 1,
  id: "entry_1",
  siteId: "site_1",
  collection: "posts",
  slug: "hello-world",
  locale: "en",
  status: "draft",
  title: "Hello world",
  body: { format: "markdown", value: "Body text" },
  fields: {},
  tags: [],
  author: { kind: "human", id: "user_1", name: "Halil" },
  rev: 3,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
  ...patch,
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

function serve(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const sent = JSON.parse(String(init.body)) as { rev: number };
      return Response.json({ ...sent, rev: sent.rev + 1 });
    }
    const body = routes[url];
    return Response.json(body ?? { error: "not_found", message: url }, {
      status: body ? 200 : 404,
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const puts = (fn: ReturnType<typeof serve>) =>
  fn.mock.calls.filter(([, init]) => init?.method === "PUT");
const sentBody = (fn: ReturnType<typeof serve>) =>
  JSON.parse(String(puts(fn).at(-1)?.[1]?.body)) as Record<string, unknown>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const articleRoutes = (e: ContentEntry) => ({
  "/api/sites/site_1": SITE,
  "/api/sites/site_1/entries/entry_1": e,
});

describe("article editor: cover image", () => {
  it("validates the URL against the site's rule (https or a /path)", async () => {
    serve(articleRoutes(entry()));
    render(wrap(<ArticleEditorPage />));
    // The library picker comes first; an address is under "Use an image address instead" (§2u).
    expect(await screen.findByTestId("cover-choose")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cover-address-toggle"));
    const src = await screen.findByTestId("cover-src");
    fireEvent.change(src, { target: { value: "http://cdn.example.com/a.jpg" } });
    fireEvent.blur(src);
    expect(await screen.findByText(/Use https:\/\//)).toBeInTheDocument();
    fireEvent.change(src, { target: { value: "javascript:alert(1)" } });
    expect(
      screen.getByText("Enter an https:// address or a path that starts with /."),
    ).toBeInTheDocument();
    fireEvent.change(src, { target: { value: "/images/cover.jpg" } });
    expect(screen.queryByText(/Enter an https/)).not.toBeInTheDocument();
    // Site paths are previewed from the primary domain.
    const img = screen.getByTestId("cover-preview").querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/images/cover.jpg");
  });

  it("requires alt text before saving and sends the image with the draft", async () => {
    const fetch = serve(articleRoutes(entry()));
    render(wrap(<ArticleEditorPage />));
    fireEvent.click(await screen.findByTestId("cover-address-toggle"));
    fireEvent.change(await screen.findByTestId("cover-src"), {
      target: { value: " https://cdn.example.com/cover.jpg " },
    });
    fireEvent.click(screen.getByTestId("save"));
    expect(
      await screen.findByText("Describe the image. Alt text is required for a cover image."),
    ).toBeInTheDocument();
    expect(puts(fetch)).toHaveLength(0);
    fireEvent.change(screen.getByTestId("cover-alt"), {
      target: { value: "A lighthouse at dusk" },
    });
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(fetch)).toHaveLength(1));
    expect(sentBody(fetch).coverImage).toEqual({
      src: "https://cdn.example.com/cover.jpg",
      alt: "A lighthouse at dusk",
    });
  });

  it("removes the image from the draft", async () => {
    const fetch = serve(
      articleRoutes(
        entry({
          coverImage: { src: "/images/cover.jpg", alt: "Cover", width: 1200, height: 630 },
        }),
      ),
    );
    render(wrap(<ArticleEditorPage />));
    expect(await screen.findByText("1200 × 630 px")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cover-remove"));
    expect(screen.getByTestId("cover-src")).toHaveValue("");
    expect(screen.queryByTestId("cover-remove")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(fetch)).toHaveLength(1));
    expect(sentBody(fetch)).not.toHaveProperty("coverImage");
  });

  it("shows a broken-image state when the URL does not load", async () => {
    serve(
      articleRoutes(entry({ coverImage: { src: "https://cdn.example.com/gone.jpg", alt: "x" } })),
    );
    render(wrap(<ArticleEditorPage />));
    const preview = await screen.findByTestId("cover-preview");
    fireEvent.error(preview.querySelector("img") as HTMLImageElement);
    expect(await within(preview).findByText("Couldn't load this image")).toBeInTheDocument();
    // The share-image check in the preview card follows.
    expect(await screen.findByText("The cover image doesn't load.")).toBeInTheDocument();
    expect(document.querySelector('[data-check="broken"]')).not.toBeNull();
  });
});

describe("article editor: search and social preview", () => {
  it("cuts a long summary like a search result and says it is too long", async () => {
    serve(articleRoutes(entry({ summary: LONG_SUMMARY })));
    render(wrap(<ArticleEditorPage />));
    const result = await screen.findByTestId("search-result-preview");
    expect(result).toHaveTextContent("example.com › posts › hello-world");
    expect(result).toHaveTextContent("Hello world");
    const shown = (result.textContent ?? "").match(/Cloudhal keeps.*…/)?.[0] ?? "";
    expect(shown.length).toBeLessThanOrEqual(160);
    expect(shown.endsWith("…")).toBe(true);
    expect(screen.getByText(/Search results cut it after about 160/)).toBeInTheDocument();
    // The summary field counts toward the same limit.
    const counter = screen
      .getAllByTestId("character-count")
      .find((c) => c.textContent === `${LONG_SUMMARY.length} / 160`);
    expect(counter).toHaveAttribute("data-over", "true");
  });

  it("warns when the summary is missing and says the summary is the meta description", async () => {
    serve(articleRoutes(entry()));
    render(wrap(<ArticleEditorPage />));
    const result = await screen.findByTestId("search-result-preview");
    expect(result).toHaveTextContent(/No summary yet/);
    expect(screen.getByText(/The summary is used as the meta description/)).toBeInTheDocument();
    expect(screen.getByText(/Add a summary\. Without one/)).toBeInTheDocument();
    expect(document.querySelector('[data-check="missing"]')).not.toBeNull();
  });

  it("shows the social card with the cover image", async () => {
    serve(articleRoutes(entry({ coverImage: { src: "/c.jpg", alt: "Cover" } })));
    render(wrap(<ArticleEditorPage />));
    fireEvent.click(await screen.findByRole("tab", { name: "Social card" }));
    const card = screen.getByTestId("social-card-preview");
    expect(card).toHaveTextContent("example.com");
    expect(card.querySelector("img")).toHaveAttribute("src", "https://example.com/c.jpg");
  });
});

const pageRoutes = (p: Page) => ({
  "/api/sites/site_1": SITE,
  "/api/sites/site_1/pages/page_1": p,
});

describe("page editor: SEO panel", () => {
  it("edits the title, description and noindex and saves them as seo", async () => {
    const fetch = serve(pageRoutes(page()));
    render(wrap(<PageEditorPage />));
    const title = await screen.findByTestId("seo-title");
    expect(title).toHaveAttribute("placeholder", "About");
    expect(title).toHaveAttribute("maxlength", "300");
    fireEvent.change(title, { target: { value: "About Demo " } });
    fireEvent.change(screen.getByTestId("seo-description"), {
      target: { value: "Who we are and what we build." },
    });
    expect(screen.getByText("29 / 160")).toBeInTheDocument();
    const result = screen.getByTestId("search-result-preview");
    expect(result).toHaveTextContent("About Demo");
    expect(result).toHaveTextContent("example.com › about");
    expect(result).toHaveTextContent("Who we are and what we build.");

    expect(screen.queryByTestId("noindex-warning")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /Hide from search engines/ }));
    expect(await screen.findByText("This page is hidden from search engines")).toBeInTheDocument();
    expect(within(result).getByText("Hidden from search")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(fetch)).toHaveLength(1));
    expect(sentBody(fetch).seo).toEqual({
      title: "About Demo",
      description: "Who we are and what we build.",
      noindex: true,
    });
  });

  it("validates the canonical URL and blocks the save until it is absolute", async () => {
    const fetch = serve(pageRoutes(page()));
    render(wrap(<PageEditorPage />));
    fireEvent.click(await screen.findByRole("button", { name: /Advanced/ }));
    const canonical = await screen.findByTestId("seo-canonical");
    expect(
      screen.getByText(/Usually empty: the page's address on example\.com is used/),
    ).toBeInTheDocument();
    fireEvent.change(canonical, { target: { value: "/about" } });
    fireEvent.click(screen.getByTestId("save"));
    expect(
      await screen.findByText("Enter a full address that starts with https://."),
    ).toBeInTheDocument();
    expect(puts(fetch)).toHaveLength(0);
    fireEvent.change(canonical, { target: { value: "https://blog.example.org/about" } });
    expect(screen.getByTestId("search-result-preview")).toHaveTextContent(
      "blog.example.org › about",
    );
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(fetch)).toHaveLength(1));
    expect(sentBody(fetch).seo).toEqual({ canonical: "https://blog.example.org/about" });
  });

  it("clearing every field removes seo from the page", async () => {
    const fetch = serve(pageRoutes(page({ seo: { noindex: true } })));
    render(wrap(<PageEditorPage />));
    fireEvent.click(await screen.findByRole("switch", { name: /Hide from search engines/ }));
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(fetch)).toHaveLength(1));
    expect(sentBody(fetch)).not.toHaveProperty("seo");
  });

  it("speaks Turkish", async () => {
    serve(pageRoutes(page({ seo: { noindex: true } })));
    render(wrap(<PageEditorPage />, "tr"));
    expect(await screen.findByText("Arama motorları ve paylaşım")).toBeInTheDocument();
    expect(screen.getByText("Bu sayfa arama motorlarından gizli")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Arama motorlarından gizle/ })).toBeChecked();
  });
});

describe("pages list", () => {
  it("marks noindex pages with a badge", async () => {
    serve({
      "/api/sites/site_1": SITE,
      "/api/sites/site_1/pages": [
        page(),
        page({ id: "page_2", path: "/thanks", title: "Thanks", seo: { noindex: true } }),
      ],
    });
    render(wrap(<PagesPage />));
    const row = (await screen.findByText("Thanks")).closest("tr") as HTMLElement;
    expect(within(row).getByTestId("noindex-badge")).toHaveTextContent("noindex");
    const other = screen.getByText("About").closest("tr") as HTMLElement;
    expect(within(other).queryByTestId("noindex-badge")).not.toBeInTheDocument();
  });
});
