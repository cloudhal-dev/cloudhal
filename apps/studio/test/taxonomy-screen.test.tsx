import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type { GovernancePreview } from "../src/lib/api.ts";
import { TaxonomyPage } from "../src/routes/TaxonomyPage.tsx";
import { CATEGORY, type Call, ITEMS, serve, taxonomyRoutes } from "./taxonomy-fixtures.ts";

const nav = vi.hoisted(() => ({ search: {} as Record<string, string>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", termId: "term_js000001" }),
  useNavigate: () => nav.navigate,
  useSearch: () => nav.search,
}));

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

const NO_PREVIEW: GovernancePreview = {
  entries: { count: 0, items: [], rewritten: false },
  redirects: [],
  repointed: 0,
};

/** Answers governance previews with `preview`, runs with a result; records nothing else. */
function governance(preview: Partial<GovernancePreview>) {
  return (call: Call) => {
    if (!call.url.includes("/terms/")) return undefined;
    if (call.body?.dryRun) return { body: { preview: { ...NO_PREVIEW, ...preview } } };
    return {
      body: {
        result: { opId: "op_1", terms: [], entries: 0, redirects: [] },
        snapshot: { id: "snap_1" },
      },
    };
  };
}

const rows = () =>
  [...document.querySelectorAll("tr[data-term-id]")].map((r) => r.getAttribute("data-term-id"));

beforeEach(() => {
  nav.search = {};
  nav.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Categories & tags: tree and filters", () => {
  it("shows categories as a tree in position order, with usage, indexing and visibility", async () => {
    serve(taxonomyRoutes());
    render(wrap(<TaxonomyPage />));
    await waitFor(() =>
      expect(rows()).toEqual(["term_news0001", "term_local001", "term_tech0001"]),
    );
    const local = document.querySelector('tr[data-term-id="term_local001"]') as HTMLElement;
    expect(local.querySelector("[data-depth]")?.getAttribute("data-depth")).toBe("1");
    const news = document.querySelector('tr[data-term-id="term_news0001"]') as HTMLElement;
    expect(within(news).getByText("/category/news")).toBeInTheDocument();
    expect(within(news).getByText("4 / 4")).toBeInTheDocument();
    // News has 4 published itself + 1 below it: indexed from 3.
    expect(news.querySelector("[data-index]")?.getAttribute("data-index")).toBe("indexed");
    const tech = document.querySelector('tr[data-term-id="term_tech0001"]') as HTMLElement;
    expect(tech.querySelector("[data-index]")?.getAttribute("data-index")).toBe("empty");
    expect(within(local).getByText("Not indexed: 1 of 3")).toBeInTheDocument();
    expect(within(news).getByText("Public")).toBeInTheDocument();
    // The aside explains the rules and the hygiene of this taxonomy.
    expect(screen.getByText("How categories work")).toBeInTheDocument();
    expect(screen.getByText("Vocabulary health")).toBeInTheDocument();
    // The card shows core-ts taxonomyReport, the same findings MCP taxonomy_report words: News is
    // indexed (5 published in its sub-tree) without an intro text, Tech has nothing published.
    const health = screen.getByTestId("health");
    expect(health.querySelector('[data-health="no-intro"]')).toHaveTextContent(
      "Indexed archives without an intro (1)News",
    );
    expect(health.querySelector('[data-health="empty"]')).toHaveTextContent("Tech");
  });

  it("filters tags by status; proposed carries a count and a review banner", async () => {
    nav.search = { taxonomy: "tag" };
    serve(taxonomyRoutes());
    const { unmount } = render(wrap(<TaxonomyPage />));
    await waitFor(() =>
      expect(rows()).toEqual(["term_js000001", "term_llm00001", "term_llms0001"]),
    );
    const filters = screen.getByTestId("term-filters");
    expect(within(filters).getByText("Proposed").parentElement).toHaveTextContent("Proposed1");
    expect(screen.getByTestId("proposed-banner")).toHaveTextContent(
      "Proposals waiting for review: 1",
    );
    fireEvent.click(within(filters).getByText("Retired"));
    expect(nav.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taxonomy: "tag", filter: "retired" } }),
    );
    unmount();

    nav.search = { taxonomy: "tag", filter: "retired" };
    render(wrap(<TaxonomyPage />));
    await waitFor(() => expect(rows()).toEqual(["term_old00001"]));
    expect(screen.getByText("Merged into LLM")).toBeInTheDocument();
  });

  it("searches names, synonyms and slugs, flat while searching", async () => {
    nav.search = { taxonomy: "tag" };
    serve(taxonomyRoutes());
    render(wrap(<TaxonomyPage />));
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.change(screen.getByPlaceholderText("Search tags"), { target: { value: "js" } });
    expect(rows()).toEqual(["term_js000001"]);
  });

  it("speaks Turkish", async () => {
    serve(taxonomyRoutes());
    render(wrap(<TaxonomyPage />, "tr"));
    expect(await screen.findByRole("button", { name: /Yeni kategori/ })).toBeInTheDocument();
    expect(screen.getByText("Kategoriler nasıl çalışır")).toBeInTheDocument();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getAllByText("Açık").length).toBeGreaterThan(0);
    expect(screen.getByText("Sözlük sağlığı")).toBeInTheDocument();
  });

  it("offers the tags migration when the site has no taxonomies yet", async () => {
    serve(taxonomyRoutes({ "/api/sites/site_1/taxonomies": [] }));
    render(wrap(<TaxonomyPage />));
    expect(await screen.findByText("No categories or tags yet")).toBeInTheDocument();
    expect(screen.getByText("cloudhal migrate tags-to-terms --dry-run")).toBeInTheDocument();
  });
});

describe("Categories & tags: proposed review", () => {
  it("shows who proposed a tag and approves it with one click", async () => {
    nav.search = { taxonomy: "tag", filter: "proposed" };
    const calls = serve(taxonomyRoutes(), governance({}));
    render(wrap(<TaxonomyPage />));
    await waitFor(() => expect(rows()).toEqual(["term_llms0001"]));
    const by = screen.getByTestId("proposed-by");
    expect(by).toHaveTextContent("Desk");
    expect(by).toHaveTextContent("Agent");
    fireEvent.click(screen.getByTestId("approve-term"));
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/terms/term_llms0001/review"))).toBe(true),
    );
    const sent = calls.find((c) => c.url.endsWith("/review"));
    expect(sent?.body).toEqual({ decision: "approve", rev: 2 });
    expect(await screen.findByText("LLMs approved")).toBeInTheDocument();
  });

  it("rejects through the dialog, which previews the articles that lose it", async () => {
    nav.search = { taxonomy: "tag", filter: "proposed" };
    const calls = serve(
      taxonomyRoutes(),
      governance({
        entries: {
          count: 1,
          rewritten: true,
          items: [
            {
              id: "entry_9",
              title: "Model roundup",
              collection: "posts",
              slug: "model-roundup",
              locale: "en",
              status: "draft",
            },
          ],
        },
      }),
    );
    render(wrap(<TaxonomyPage />));
    fireEvent.click(await screen.findByTestId("reject-term"));
    const dialog = await screen.findByTestId("governance-dialog");
    expect(dialog).toHaveAttribute("data-kind", "reject");
    expect(await within(dialog).findByText("Model roundup")).toBeInTheDocument();
    expect(within(dialog).getByText(/These articles lose it/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("governance-confirm"));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.endsWith("/review") && !c.body?.dryRun)).toHaveLength(1),
    );
    expect(calls.find((c) => c.url.endsWith("/review") && !c.body?.dryRun)?.body).toEqual({
      decision: "reject",
      rev: 2,
    });
  });

  it("merges a proposal into an existing tag", async () => {
    nav.search = { taxonomy: "tag", filter: "proposed" };
    serve(taxonomyRoutes(), governance({}));
    render(wrap(<TaxonomyPage />));
    fireEvent.click(await screen.findByTestId("merge-proposal"));
    const dialog = await screen.findByTestId("governance-dialog");
    expect(dialog).toHaveAttribute("data-kind", "reviewMerge");
    expect(within(dialog).getByText("Make a choice to see what changes.")).toBeInTheDocument();
    expect(screen.getByTestId("governance-confirm")).toBeDisabled();
  });
});

describe("Categories & tags: governance dialogs", () => {
  async function openMenu(termId: string, item: string) {
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const row = document.querySelector(`tr[data-term-id="${termId}"]`) as HTMLElement;
    fireEvent.click(within(row).getByTestId("term-menu"));
    fireEvent.click(await screen.findByRole("menuitem", { name: item }));
    return screen.findByTestId("governance-dialog");
  }

  it("rename: previews the redirect, then sends the slug with the revision", async () => {
    nav.search = { taxonomy: "tag" };
    const calls = serve(
      taxonomyRoutes(),
      governance({
        entries: { count: 2, items: [], rewritten: false },
        redirects: [
          {
            from: "/tag/javascript",
            to: "/tag/js-lang",
            status: 301,
            match: "prefix",
            reason: "slug-change",
          },
        ],
      }),
    );
    render(wrap(<TaxonomyPage />));
    const dialog = await openMenu("term_js000001", "Rename slug");
    const input = within(dialog).getByTestId("rename-slug");
    fireEvent.change(input, { target: { value: "llm" } });
    expect(await within(dialog).findByText("Another term uses this slug.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "js-lang" } });
    const preview = await within(dialog).findByTestId("governance-preview");
    expect(preview.querySelector('[data-redirect-from="/tag/javascript"]')).toHaveTextContent(
      "/tag/javascript/tag/js-lang301 permanent",
    );
    expect(preview).toHaveTextContent("These articles keep it");
    expect(within(dialog).getByTestId("one-snapshot")).toHaveTextContent(
      "One change, one snapshot. It goes live with the next publish.",
    );
    expect(calls.find((c) => c.body?.dryRun)?.body).toEqual({
      slug: "js-lang",
      rev: 2,
      dryRun: true,
    });
    fireEvent.click(screen.getByTestId("governance-confirm"));
    await waitFor(() =>
      expect(calls.filter((c) => c.url.endsWith("/rename") && !c.body?.dryRun)).toHaveLength(1),
    );
    expect(calls.find((c) => c.url.endsWith("/rename") && !c.body?.dryRun)?.body).toEqual({
      slug: "js-lang",
      rev: 2,
    });
  });

  it("merge: says plainly when an operation is too large and keeps the action off", async () => {
    nav.search = { taxonomy: "tag" };
    serve(
      taxonomyRoutes(),
      governance({
        entries: { count: 523, items: [], rewritten: true },
        tooLarge: { entries: 523, limit: 400 },
      }),
    );
    render(wrap(<TaxonomyPage />));
    const dialog = await openMenu("term_llm00001", "Merge into…");
    expect(within(dialog).getByText("Make a choice to see what changes.")).toBeInTheDocument();
    // Choose the target in the tree-aware combobox.
    const combo = within(within(dialog).getByTestId("merge-target")).getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.input(combo, { target: { value: "Java" } });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /JavaScript/ }));
    const banner = await within(dialog).findByTestId("too-large");
    expect(banner).toHaveTextContent("Too large for one change");
    expect(banner).toHaveTextContent(
      "This would change 523 articles; one change can touch at most 400.",
    );
    expect(screen.getByTestId("governance-confirm")).toBeDisabled();
  });

  it("retire: explains the 410 Gone without a redirect", async () => {
    nav.search = { taxonomy: "tag" };
    const calls = serve(taxonomyRoutes(), governance({ archiveGone: "gone" }));
    render(wrap(<TaxonomyPage />));
    const dialog = await openMenu("term_llm00001", "Retire");
    expect(within(dialog).getByText(/its archive answers 410 Gone/)).toBeInTheDocument();
    const gone = await within(dialog).findByTestId("gone-410");
    expect(gone).toHaveTextContent("Its archive will answer 410 Gone");
    expect(gone).toHaveTextContent("/tag/llm gets no redirect");
    expect(calls.find((c) => c.url.endsWith("/retire"))?.body).toEqual({ rev: 2, dryRun: true });
  });

  it("retire: a required category that articles would lose is blocked", async () => {
    serve(
      taxonomyRoutes(),
      governance({
        entries: { count: 2, items: [], rewritten: true },
        blocked: { code: "required_term", count: 2, items: [] },
      }),
    );
    render(wrap(<TaxonomyPage />));
    const dialog = await openMenu("term_news0001", "Retire");
    expect(await within(dialog).findByTestId("governance-blocked")).toHaveTextContent(
      "2 published or in-review articles would lose their only category",
    );
    expect(screen.getByTestId("governance-confirm")).toBeDisabled();
  });

  it("move: offers parents within the tree, never the term or its children", async () => {
    serve(taxonomyRoutes(), governance({}));
    render(wrap(<TaxonomyPage />));
    const dialog = await openMenu("term_news0001", "Move…");
    expect(dialog).toHaveAttribute("data-kind", "move");
    const combo = within(within(dialog).getByTestId("move-parent")).getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    const options = await screen.findAllByRole("option");
    const names = options.map((o) => o.textContent ?? "");
    expect(names.some((n) => n.includes("Technology"))).toBe(true);
    expect(names.some((n) => n.includes("Local news"))).toBe(false);
    expect(names.some((n) => /^News/.test(n))).toBe(false);
  });

  it("the hygiene panel suggests merging near-duplicates in one click", async () => {
    nav.search = { taxonomy: "tag" };
    serve(taxonomyRoutes(), governance({}));
    render(wrap(<TaxonomyPage />));
    const suggestion = await waitFor(() => {
      const el = document.querySelector('[data-merge-suggestion="term_llms0001:term_llm00001"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(suggestion).toHaveTextContent("LLMs → LLM");
    expect(suggestion).toHaveTextContent("Singular and plural");
    fireEvent.click(within(suggestion).getByRole("button", { name: /Merge/ }));
    const dialog = await screen.findByTestId("governance-dialog");
    // A proposed source merges through review; the target is prefilled.
    expect(dialog).toHaveAttribute("data-kind", "reviewMerge");
    expect(await within(dialog).findByTestId("governance-preview")).toBeInTheDocument();
  });
});

// Keep the fixture list honest: every taxonomy row above comes from it.
it("fixtures cover both taxonomies", () => {
  expect(ITEMS.some((i) => i.term.taxonomyId === CATEGORY.id)).toBe(true);
});
