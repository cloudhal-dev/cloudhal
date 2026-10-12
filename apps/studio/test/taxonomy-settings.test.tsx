import type { Taxonomy } from "@cloudhal/core-contracts";
import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import {
  archiveChange,
  draftOf,
  newTaxonomyDraft,
  taxonomyFromDraft,
  validateTaxonomy,
} from "../src/lib/taxonomy-settings.ts";
import { TaxonomyPage } from "../src/routes/TaxonomyPage.tsx";
import {
  CATEGORY,
  type Call,
  entry,
  redirect,
  serve,
  TAG,
  taxonomyRoutes,
} from "./taxonomy-fixtures.ts";

const nav = vi.hoisted(() => ({ search: {} as Record<string, string>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
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

beforeEach(() => {
  nav.search = {};
  nav.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const context = {
  defaultLocale: "en",
  taxonomies: [CATEGORY, TAG],
  pages: [{ path: "/" }, { path: "/about" }],
  collections: ["posts"],
  terms: [],
};

describe("taxonomy settings: validation mirrors core-ts", () => {
  it("refuses reserved, taken and malformed keys, and needs labels in the default locale", () => {
    const draft = { ...newTaxonomyDraft("en"), key: "status" };
    expect(validateTaxonomy(draft, context).key).toBe("reserved");
    expect(validateTaxonomy({ ...draft, key: "tag" }, context).key).toBe("taken");
    expect(validateTaxonomy({ ...draft, key: "My Series" }, context).key).toBe("invalid");
    const e = validateTaxonomy({ ...draft, key: "series" }, context);
    expect(e.key).toBeUndefined();
    expect(e.labels?.en).toEqual({ singular: "required", plural: "required" });
    // another locale is optional, but both names or none
    const tr = validateTaxonomy(
      {
        ...draft,
        key: "series",
        labels: {
          en: { singular: "Series", plural: "Series" },
          tr: { singular: "Seri", plural: "" },
        },
      },
      context,
    );
    expect(tr.labels).toEqual({ tr: { plural: "pair" } });
  });

  it("checks the archive address against the invariants (13)", () => {
    const ok = {
      ...newTaxonomyDraft("en"),
      key: "series",
      labels: { en: { singular: "Series", plural: "Series" } },
    };
    expect(validateTaxonomy(ok, context)).toEqual({});
    const path = (basePath: string, archiveEnabled = true) =>
      validateTaxonomy({ ...ok, basePath, archiveEnabled }, context);
    expect(path("/").basePath).toBe("root");
    expect(path("/Series").basePath).toBe("invalid");
    expect(path("/tag/series")).toMatchObject({ basePath: "taxonomy", basePathConflict: "tag" });
    expect(path("/about")).toMatchObject({ basePath: "page", basePathConflict: "/about" });
    // a page only blocks an enabled archive; a collection prefix always does
    expect(path("/about", false).basePath).toBeUndefined();
    expect(path("/posts")).toMatchObject({ basePath: "collection", basePathConflict: "/posts" });
    expect(validateTaxonomy({ ...ok, maxPerEntry: "51" }, context).maxPerEntry).toBe(true);
    expect(validateTaxonomy({ ...ok, minEntriesToIndex: "-1" }, context).minEntriesToIndex).toBe(
      true,
    );
    expect(validateTaxonomy({ ...ok, collections: [] }, context).collections).toBe(true);
  });

  it("knows what an edit cannot do while terms disagree", () => {
    const e = validateTaxonomy(
      { ...draftOf(CATEGORY), hierarchical: false, allowNewTerms: "none" },
      {
        ...context,
        selfId: CATEGORY.id,
        terms: [{ status: "active", parentId: "term_news0001" }, { status: "proposed" }],
      },
    );
    expect(e).toMatchObject({ hierarchical: 1, allowNewTerms: 1 });
  });

  it("builds the contract shape and previews what moving the archive does", () => {
    const series = taxonomyFromDraft({
      ...newTaxonomyDraft("en"),
      key: "series",
      labels: { en: { singular: " Series ", plural: "Series" }, tr: { singular: "", plural: "" } },
      maxPerEntry: "1",
      collections: ["posts"],
      archiveEnabled: false,
    });
    expect(series).toEqual({
      key: "series",
      labels: { en: { singular: "Series", plural: "Series" } },
      hierarchical: false,
      allowNewTerms: "propose",
      required: false,
      maxPerEntry: 1,
      collections: ["posts"],
      archive: { enabled: false, basePath: "/series" },
      // no feed without archives
      feed: false,
      minEntriesToIndex: 3,
    });
    const moved = archiveChange(CATEGORY, { ...draftOf(CATEGORY), basePath: "/topics" }, [
      redirect({ to: "/category/news" }),
      redirect({ to: "/elsewhere" }),
    ]);
    expect(moved).toEqual({ redirect: { from: "/category", to: "/topics" }, follow: 1 });
    expect(archiveChange(CATEGORY, { ...draftOf(CATEGORY), archiveEnabled: false }, [])).toEqual({
      follow: 0,
      disabled: "/category",
    });
  });
});

const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST" || c.method === "PUT");

describe("taxonomy settings: the dialog", () => {
  it("creates a custom taxonomy with one request and opens its tab", async () => {
    const created: Taxonomy = {
      ...TAG,
      id: "tax_series0001",
      key: "series",
      labels: { en: { singular: "Series", plural: "Series" } },
      archive: { enabled: true, basePath: "/series" },
    };
    const calls = serve(taxonomyRoutes({ "/api/sites/site_1/entries": [entry()] }), (call) =>
      call.url === "/api/sites/site_1/taxonomies" && call.method === "POST"
        ? { status: 201, body: { taxonomy: created, snapshot: { id: "snap_1" } } }
        : undefined,
    );
    render(wrap(<TaxonomyPage />));
    fireEvent.click(await screen.findByTestId("new-taxonomy"));
    const dialog = await screen.findByTestId("taxonomy-settings");
    expect(dialog).toHaveAttribute("data-mode", "create");
    // a reserved word is refused while typing, before anything is sent
    fireEvent.change(screen.getByTestId("taxonomy-key"), { target: { value: "status" } });
    expect(await screen.findByText(/is reserved by the filter language/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("taxonomy-key"), { target: { value: "series" } });
    fireEvent.click(screen.getByTestId("taxonomy-submit"));
    expect(await screen.findAllByText("Enter a name in the site's default language.")).toHaveLength(
      2,
    );
    expect(posts(calls)).toHaveLength(0);
    fireEvent.change(screen.getByTestId("label-singular-en"), { target: { value: "Series" } });
    fireEvent.change(screen.getByTestId("label-plural-en"), { target: { value: "Series" } });
    // agents are told plainly what each choice lets them do
    const newTerms = within(dialog).getByTestId("taxonomy-new-terms");
    expect(newTerms).toHaveTextContent("It stays private (no archive, not shown on articles)");
    fireEvent.click(within(newTerms).getByText("People only"));
    // the address follows the key until edited; examples show where archives live
    expect(screen.getByTestId("taxonomy-base-path")).toHaveAttribute("placeholder", "/series");
    expect(dialog).toHaveTextContent("Archives live at addresses like /series/summer-2026.");
    fireEvent.click(screen.getByTestId("taxonomy-submit"));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({
      url: "/api/sites/site_1/taxonomies",
      method: "POST",
      body: {
        key: "series",
        labels: { en: { singular: "Series", plural: "Series" } },
        allowNewTerms: "none",
        archive: { enabled: true, basePath: "/series" },
        feed: true,
        minEntriesToIndex: 3,
      },
    });
    await waitFor(() =>
      expect(nav.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ search: { taxonomy: "series" } }),
      ),
    );
  });

  it("edits settings with the key fixed, and previews the redirect a moved archive leaves", async () => {
    const calls = serve(
      taxonomyRoutes({
        "/api/sites/site_1/redirects": [redirect({ to: "/category/news" })],
        "/api/sites/site_1/pages": [{ id: "page_about", path: "/about" }],
      }),
      (call) =>
        call.method === "PUT"
          ? { body: { taxonomy: { ...CATEGORY, ...call.body, rev: 1 }, snapshot: { id: "s" } } }
          : undefined,
    );
    render(wrap(<TaxonomyPage />));
    fireEvent.click(await screen.findByTestId("rules-edit"));
    const dialog = await screen.findByTestId("taxonomy-settings");
    expect(dialog).toHaveAttribute("data-mode", "edit");
    expect(screen.getByText("Category settings")).toBeInTheDocument();
    expect(screen.getByTestId("taxonomy-key")).toBeDisabled();
    expect(screen.getByTestId("taxonomy-submit")).toBeDisabled();

    const path = screen.getByTestId("taxonomy-base-path");
    fireEvent.change(path, { target: { value: "/topics" } });
    const move = await screen.findByTestId("archive-move");
    expect(move).toHaveTextContent("/category/topics301 permanent");
    expect(move).toHaveTextContent(
      "1 existing redirects to the old address now point to the new one.",
    );
    fireEvent.change(path, { target: { value: "/about" } });
    expect(
      await screen.findByText("The page /about lives there. Choose another address."),
    ).toBeInTheDocument();
    fireEvent.change(path, { target: { value: "/topics" } });

    // switching archives off warns that addresses answer 404 and disables the feed
    fireEvent.click(screen.getByTestId("taxonomy-archive"));
    expect(await screen.findByTestId("archive-off")).toHaveTextContent(
      "Archive pages will answer 404",
    );
    fireEvent.click(screen.getByTestId("taxonomy-archive"));

    fireEvent.change(screen.getByTestId("taxonomy-min-entries"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("taxonomy-submit"));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({
      url: `/api/sites/site_1/taxonomies/${CATEGORY.id}`,
      method: "PUT",
      body: {
        id: CATEGORY.id,
        key: "category",
        rev: 0,
        archive: { enabled: true, basePath: "/topics" },
        minEntriesToIndex: 5,
        maxPerEntry: 3,
      },
    });
  });

  it("speaks Turkish", async () => {
    serve(taxonomyRoutes());
    render(wrap(<TaxonomyPage />, "tr"));
    fireEvent.click(await screen.findByTestId("new-taxonomy"));
    const dialog = await screen.findByTestId("taxonomy-settings");
    expect(screen.getByText("Yeni sınıflandırma", { selector: "h2" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Yalnızca insanlar");
    expect(dialog).toHaveTextContent("Agent'lar önerir");
    expect(dialog).toHaveTextContent("Herkese açık arşiv sayfaları");
  });
});
