import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/index.tsx";
import { ArticleEditorPage } from "../src/routes/ArticleEditorPage.tsx";
import { ArticlesPage } from "../src/routes/ArticlesPage.tsx";
import {
  CATEGORY,
  type Call,
  entry,
  ITEMS,
  JS,
  LLM,
  LOCAL,
  NEWS,
  serve,
  TAG,
  TECH,
  taxonomyRoutes,
} from "./taxonomy-fixtures.ts";

const nav = vi.hoisted(() => ({ search: {} as Record<string, string>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", entryId: "entry_1" }),
  useNavigate: () => nav.navigate,
  useSearch: () => nav.search,
}));
vi.mock("../src/components/EditorPreview.tsx", () => ({ EditorPreview: () => null }));

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Toasty>{children}</Toasty>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

const editorRoutes = (e = entry(), extra: Record<string, unknown> = {}) =>
  taxonomyRoutes({ "/api/sites/site_1/entries/entry_1": e, ...extra });
const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
const sentTerms = (calls: Call[]) => puts(calls)[0]?.body?.terms;

/** Types into a picker's input and opens its list. */
async function typeInto(picker: HTMLElement, text: string) {
  const input = within(picker).getAllByRole("combobox")[0] as HTMLElement;
  fireEvent.focus(input);
  fireEvent.input(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  return input;
}

beforeEach(() => {
  nav.search = {};
  nav.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("article editor: category picker", () => {
  it("is required to send an article to review; nothing is saved without a category", async () => {
    const calls = serve(editorRoutes());
    render(wrap(<ArticleEditorPage />));
    const picker = await screen.findByTestId("picker-category");
    expect(picker).toHaveTextContent("Needed to send it to review or publish it. Up to 3.");
    fireEvent.click(screen.getByRole("button", { name: "Send to review" }));
    expect(
      await within(picker).findByText(
        "Choose a category to send this article to review or publish it.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Choose a category first")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("lists categories as a tree, makes a single choice primary and saves terms", async () => {
    const calls = serve(editorRoutes());
    render(wrap(<ArticleEditorPage />));
    const picker = await screen.findByTestId("picker-category");
    await typeInto(picker, "");
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["News", "Local newsin News", "Technology"]);
    fireEvent.click(options[1] as HTMLElement);
    await waitFor(() => expect(within(picker).getByText("Local news")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const body = puts(calls)[0]?.body as { terms: unknown; tags: string[] };
    expect(body.terms).toEqual({ category: { ids: [LOCAL.id], primary: LOCAL.id } });
    expect(body.tags).toEqual([]);
  });

  it("asks which category is primary when there are several", async () => {
    const calls = serve(
      editorRoutes(entry({ terms: { category: { ids: [NEWS.id, TECH.id], primary: NEWS.id } } })),
    );
    render(wrap(<ArticleEditorPage />));
    const primary = await screen.findByTestId("primary-select");
    expect(primary).toHaveTextContent("News");
    // Removing the primary leaves one category, which becomes the primary.
    const picker = screen.getByTestId("picker-category");
    fireEvent.click(within(picker).getByRole("button", { name: "Remove News" }));
    await waitFor(() => expect(screen.queryByTestId("primary-select")).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(sentTerms(calls)).toEqual({
      category: { ids: [TECH.id], primary: TECH.id },
    });
  });
});

describe("article editor: tag autocomplete", () => {
  it("finds a tag by its synonym", async () => {
    serve(editorRoutes());
    render(wrap(<ArticleEditorPage />));
    await typeInto(await screen.findByTestId("picker-tag"), "JS");
    const option = await screen.findByRole("option", { name: /JavaScript/ });
    expect(option).toHaveTextContent("synonym “JS”");
    expect(screen.queryByTestId("create-tag")).not.toBeInTheDocument();
  });

  it("adds an existing tag and saves its id", async () => {
    const calls = serve(editorRoutes());
    render(wrap(<ArticleEditorPage />));
    const picker = await screen.findByTestId("picker-tag");
    await typeInto(picker, "llm");
    fireEvent.click(await screen.findByRole("option", { name: /^LLM$/ }));
    await waitFor(() => expect(picker.querySelector("[data-term-chip]")).toHaveTextContent("LLM"));
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(sentTerms(calls)).toEqual({
      tag: { ids: [LLM.id] },
    });
  });

  it("offers to create a new tag only when nothing matches, warning about near-duplicates", async () => {
    const calls = serve(editorRoutes(), (call) =>
      call.url === "/api/sites/site_1/terms"
        ? {
            status: 201,
            body: {
              term: { ...LLM, id: "term_new00001", slug: "llmz", labels: { en: { name: "llmz" } } },
              snapshot: { id: "snap_2" },
            },
          }
        : undefined,
    );
    render(wrap(<ArticleEditorPage />));
    const picker = await screen.findByTestId("picker-tag");
    await typeInto(picker, "llmz");
    const create = await screen.findByTestId("create-tag");
    expect(create).toHaveTextContent("Create “llmz”");
    expect(within(create).getByTestId("near-duplicate")).toHaveTextContent("Looks like LLM");
    fireEvent.click(create);
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url === "/api/sites/site_1/terms")).toBe(
        true,
      ),
    );
    expect(
      calls.find((c) => c.url === "/api/sites/site_1/terms" && c.method === "POST")?.body,
    ).toEqual({
      taxonomyId: TAG.id,
      slug: "llmz",
      status: "active",
      visibility: "public",
      labels: { en: { name: "llmz" } },
    });
    // An exact name never offers "create".
    await typeInto(picker, "javascript");
    await screen.findByRole("option", { name: /JavaScript/ });
    expect(screen.queryByTestId("create-tag")).not.toBeInTheDocument();
  });

  it("respects maxPerEntry", async () => {
    serve(editorRoutes(entry({ terms: { tag: { ids: [JS.id, LLM.id, "term_llms0001"] } } })));
    render(wrap(<ArticleEditorPage />));
    const picker = await screen.findByTestId("picker-tag");
    expect(picker).toHaveTextContent("At most 3. Remove one to add another.");
    expect(within(picker).getAllByRole("combobox")[0]).toBeDisabled();
    expect(picker.querySelectorAll("[data-term-chip]")).toHaveLength(3);
  });
});

describe("article editor: legacy tags on sites not migrated yet", () => {
  it("keeps editing tags and offers the migration", async () => {
    const calls = serve(
      editorRoutes(entry({ tags: ["news"] }), { "/api/sites/site_1/taxonomies": [] }),
    );
    render(wrap(<ArticleEditorPage />));
    expect(await screen.findByTestId("tags-migration-banner")).toHaveTextContent(
      "Move your tags to categories and tags",
    );
    expect(screen.queryByTestId("picker-category")).not.toBeInTheDocument();
    const input = screen.getByTestId("legacy-tags");
    fireEvent.change(input, { target: { value: "Machine Learning" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const body = puts(calls)[0]?.body as { tags: string[]; terms?: unknown };
    expect(body.tags).toEqual(["news", "machine-learning"]);
    expect(body.terms).toBeUndefined();
  });

  it("shows old tags on a migrated site as pending until the next save", async () => {
    serve(editorRoutes(entry({ tags: ["legacy-one"] })));
    render(wrap(<ArticleEditorPage />));
    expect(await screen.findByTestId("legacy-pending")).toHaveTextContent(
      "legacy-one become tags when you save.",
    );
  });
});

describe("articles list: categories, tags and facets", () => {
  const posts = [
    entry({
      id: "entry_a",
      title: "First",
      status: "published",
      terms: {
        category: { ids: [NEWS.id, TECH.id], primary: NEWS.id },
        tag: { ids: [JS.id, LLM.id, "term_llms0001"] },
      },
    }),
    entry({ id: "entry_b", title: "Second", status: "published" }),
  ];

  it("shows the primary category, two tag chips and +n, and flags a missing category", async () => {
    serve(taxonomyRoutes({ "/api/sites/site_1/entries?collection=posts": posts }));
    render(wrap(<ArticlesPage />));
    const first = await waitFor(() => {
      const row = document.querySelector('tr[data-entry-id="entry_a"]');
      expect(row).not.toBeNull();
      return row as HTMLElement;
    });
    await waitFor(() =>
      expect(within(first).getByTestId("category-cell")).toHaveTextContent("News+1"),
    );
    expect(within(first).getByTestId("tags-cell")).toHaveTextContent("JavaScriptLLM+1");
    const second = document.querySelector('tr[data-entry-id="entry_b"]') as HTMLElement;
    expect(within(second).getByTestId("category-cell")).toHaveTextContent("No category");
  });

  it("filters by category (with sub-categories) and tag through the API filter", async () => {
    nav.search = { category: "news", tag: "javascript" };
    const calls = serve(
      taxonomyRoutes({
        "/api/sites/site_1/entries?collection=posts&filter=category%3Anews%3E*%2Btag%3Ajavascript":
          [posts[0]],
        "/api/sites/site_1/entries?collection=posts": posts,
      }),
    );
    render(wrap(<ArticlesPage />));
    await waitFor(() => expect(document.querySelectorAll("tr[data-entry-id]")).toHaveLength(1));
    expect(calls.some((c) => c.url.includes("filter=category%3Anews%3E*%2Btag%3Ajavascript"))).toBe(
      true,
    );
    fireEvent.click(screen.getByTestId("clear-facets"));
    expect(nav.navigate).toHaveBeenCalledWith(expect.objectContaining({ search: {} }));
  });
});

it("fixtures: the category tree has a child", () => {
  expect(ITEMS.find((i) => i.term.id === LOCAL.id)?.term.parentId).toBe(NEWS.id);
  expect(CATEGORY.required).toBe(true);
});
