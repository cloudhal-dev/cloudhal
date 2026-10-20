/**
 * Pages and Articles on a multilingual site (an internal review (2026-10) §4a):
 * one row per translation group with a chip per language, a language filter that lists one
 * language flat, and the working language new pages start in. Single-language sites are unchanged.
 */
import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import { LanguageChips, TooltipProvider } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handTranslationDraft, translationGroups } from "../src/lib/translation-groups.ts";
import {
  newNodeLocale,
  readWorkingLanguage,
  writeWorkingLanguage,
} from "../src/lib/working-language.ts";
import { PagesPage } from "../src/routes/PagesPage.tsx";
import { bodyOf, INSTANCE, meFor, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigate.mockReset();
  localStorage.clear();
});

const HASH = "a".repeat(64);
const AT = "2026-10-08T08:00:00Z";

const page = (id: string, title: string, over: Partial<Page> = {}): Page => ({
  schemaVersion: 1,
  id,
  siteId: "site_1",
  path: `/${title.toLowerCase()}`,
  title,
  locale: "en",
  status: "published",
  sections: [],
  rev: 1,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

const linked = (group: string, method: "original" | "human" | "machine", sourceRev = 1) =>
  method === "original"
    ? { group, method }
    : {
        group,
        method,
        source: { id: group, locale: "en", rev: sourceRev, hash: HASH },
        ...(method === "machine" ? { provenance: { engine: "test", at: AT } } : {}),
      };

// About: en original (published) + es machine draft. Contact: en only. Precios: es only.
// Team: es original, en human translation (outdated).
const PAGES: Page[] = [
  page("page_1", "About", { translation: linked("page_1", "original") }),
  page("page_2", "Acerca", {
    locale: "es",
    status: "draft",
    path: "/acerca",
    translation: linked("page_1", "machine"),
  }),
  page("page_3", "Contact"),
  page("page_4", "Precios", { locale: "es" }),
  page("page_5", "Equipo", { locale: "es", translation: linked("page_5", "original") }),
  page("page_6", "Team", {
    translation: {
      ...linked("page_5", "human"),
      source: { id: "page_5", locale: "es", rev: 1, hash: HASH },
    },
  }),
];

const SITES = { locales: ["en", "es"], defaultLocale: "en" };

describe("translationGroups", () => {
  it("makes one row per group, shown in the default language, with a state per site locale", () => {
    const rows = translationGroups(PAGES, SITES, new Set(["page_6"]));
    expect(rows.map((r) => [r.group, r.node.id, r.cells.map((c) => c.state)])).toEqual([
      ["page_1", "page_1", ["published", "review"]],
      ["page_3", "page_3", ["published", "missing"]],
      ["page_4", "page_4", ["missing", "published"]],
      ["page_5", "page_6", ["outdated", "published"]],
    ]);
    expect(rows[0]?.cells[1]?.node?.id).toBe("page_2");
  });

  it("falls back to the original when the default language has no version, and keeps input order", () => {
    const rows = translationGroups([PAGES[4] as Page, PAGES[1] as Page, PAGES[0] as Page], {
      locales: ["en", "es"],
      defaultLocale: "fr",
    });
    expect(rows.map((r) => r.node.id)).toEqual(["page_5", "page_1"]);
  });

  it("reads a reviewed machine translation and a draft as draft, other statuses too", () => {
    const reviewed = page("page_9", "Rev", {
      locale: "es",
      status: "review",
      translation: {
        ...linked("page_3", "machine"),
        method: "machine",
        review: { by: { kind: "human", id: "u_1" }, at: AT },
      } as never,
    });
    const rows = translationGroups([PAGES[2] as Page, reviewed], SITES);
    expect(rows[0]?.cells.map((c) => c.state)).toEqual(["published", "draft"]);
  });
});

describe("handTranslationDraft", () => {
  it("copies a page's content into a draft linked to the group, without its own records", () => {
    const source = page("page_3", "Contact", {
      seo: { title: "Contact us" },
      metadata: { note: "x" } as never,
      rev: 4,
    });
    const draft = handTranslationDraft(source, "es", HASH);
    expect(draft.kind).toBe("page");
    expect(draft.input).toEqual({
      path: "/contact",
      title: "Contact",
      locale: "es",
      status: "draft",
      sections: [],
      seo: { title: "Contact us" },
      translation: {
        group: "page_3",
        method: "human",
        layout: "linked",
        source: { id: "page_3", locale: "en", rev: 4, hash: HASH },
      },
    });
  });

  it("drops an entry's author, publishing date and schedule", () => {
    const entry = {
      schemaVersion: 1,
      id: "entry_1",
      siteId: "site_1",
      collection: "posts",
      slug: "ferries",
      locale: "en",
      status: "published",
      title: "Ferries",
      body: { format: "markdown", value: "Hi" },
      fields: {},
      tags: [],
      author: { kind: "human", id: "u_1" },
      publishedAt: AT,
      rev: 2,
      createdAt: AT,
      updatedAt: AT,
      translation: { group: "entry_1", method: "original" },
    } as ContentEntry;
    const draft = handTranslationDraft(entry, "es", HASH);
    expect(draft.kind).toBe("entry");
    expect(Object.keys(draft.input).sort()).toEqual(
      [
        "body",
        "collection",
        "fields",
        "locale",
        "slug",
        "status",
        "tags",
        "title",
        "translation",
      ].sort(),
    );
    expect(draft.input.translation?.group).toBe("entry_1");
  });
});

describe("working language", () => {
  it("is remembered per site and used for new nodes while the site has it", () => {
    expect(readWorkingLanguage("site_1")).toBeUndefined();
    writeWorkingLanguage("site_1", "es");
    expect(readWorkingLanguage("site_1")).toBe("es");
    expect(readWorkingLanguage("site_2")).toBeUndefined();
    expect(newNodeLocale(SITES, "es")).toBe("es");
    expect(newNodeLocale(SITES, "fr")).toBe("en");
    expect(newNodeLocale(SITES, undefined)).toBe("en");
  });

  it("is forgotten, not thrown, when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    vi.stubGlobal("localStorage", blocked);
    expect(() => writeWorkingLanguage("site_1", "es")).not.toThrow();
    expect(readWorkingLanguage("site_1")).toBeUndefined();
  });
});

describe("LanguageChips", () => {
  const labels = {
    group: "Languages",
    describe: (i: { locale: string; state: string }) => `${i.locale}: ${i.state}`,
    summary: "2/6",
    summaryLabel: "2 of 6 languages",
    writeByHand: "Write by hand",
  };
  const shell = (children: ReactNode) => <TooltipProvider>{children}</TooltipProvider>;

  it("collapses more than four languages into a summary with every chip in a popover", async () => {
    const items = ["en", "es", "fr", "de", "it", "nl"].map((locale, i) => ({
      locale,
      state: i < 2 ? ("published" as const) : ("missing" as const),
      ...(i < 2 ? { href: `/p/${locale}` } : {}),
    }));
    render(shell(<LanguageChips items={items} labels={labels} />));
    expect(screen.queryByRole("group", { name: "Languages" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "2 of 6 languages" }));
    const group = await screen.findByRole("group", { name: "Languages" });
    expect(within(group).getByRole("link", { name: "es: published" })).toHaveAttribute(
      "href",
      "/p/es",
    );
    // Without a way to start one, a missing language is shown but inert.
    expect(within(group).getByRole("button", { name: "nl: missing" })).toBeDisabled();
  });
});

describe("PagesPage on a multilingual site", () => {
  const site = (locales: string[]): Site => ({
    schemaVersion: 1,
    id: "site_1",
    projectId: "proj_1",
    name: "Demo",
    slug: "demo",
    defaultLocale: "en",
    locales: locales as Site["locales"],
    domains: [],
    pageIds: PAGES.map((p) => p.id),
    theme: { name: "blog" },
    rev: 1,
    createdAt: AT,
    updatedAt: AT,
  });

  function server(locales: string[], extra: Route[] = []) {
    return serve(
      ...extra,
      on("GET", "/api/me", { status: 200, body: meFor("owner") }),
      on("GET", "/api/instance", { status: 200, body: INSTANCE }),
      on("GET", "/api/sites/site_1", { status: 200, body: site(locales) }),
      on("GET", "/api/sites/site_1/pages", {
        status: 200,
        body: locales.length > 1 ? PAGES : PAGES.filter((p) => p.locale === "en"),
      }),
      on("GET", "/api/sites/site_1/translations", {
        status: 200,
        body: { items: [{ id: "page_6", stale: true, sourceMissing: false }] },
      }),
      on("GET", "/api/sites/site_1/translations/page_3", {
        status: 200,
        body: { group: "page_3", items: [{ id: "page_3", hash: HASH }] },
      }),
    );
  }

  const rowOf = (title: string) => screen.getByText(title).closest("tr") as HTMLElement;
  const chip = (row: HTMLElement, locale: string) =>
    row.querySelector(`[data-locale="${locale}"]`) as HTMLElement;

  it("groups translations into one row with a chip per language", async () => {
    server(["en", "es"]);
    render(wrap(<PagesPage />));
    await screen.findByText("About", {}, { timeout: 15_000 });
    expect(screen.getByRole("columnheader", { name: "Languages" })).toBeInTheDocument();
    expect(screen.queryByText("Acerca")).toBeNull();
    expect(screen.getByText("Precios")).toBeInTheDocument();
    const about = rowOf("About");
    expect(chip(about, "en").dataset.state).toBe("published");
    expect(chip(about, "es").dataset.state).toBe("review");
    expect(within(about).getByRole("link", { name: "Spanish: needs review" })).toHaveAttribute(
      "href",
      "/sites/site_1/pages/page_2",
    );
    await waitFor(() => expect(chip(rowOf("Team"), "en").dataset.state).toBe("outdated"));
    expect(chip(rowOf("Contact"), "es").dataset.state).toBe("missing");
  });

  it("writes a missing language by hand: a draft linked to the group", async () => {
    const fetch = server(
      ["en", "es"],
      [
        on("POST", "/api/sites/site_1/pages", {
          status: 201,
          body: { page: page("page_7", "Contact", { locale: "es", status: "draft" }), site: {} },
        }),
      ],
    );
    render(wrap(<PagesPage />));
    await screen.findByText("Contact", {}, { timeout: 15_000 });
    const missing = await within(rowOf("Contact")).findByRole("button", {
      name: "Spanish: missing",
    });
    await waitFor(() => expect(missing).toBeEnabled());
    fireEvent.click(missing);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Write by hand" }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(bodyOf(fetch, "POST", "/api/sites/site_1/pages")).toMatchObject({
      locale: "es",
      status: "draft",
      path: "/contact",
      translation: { group: "page_3", method: "human", source: { id: "page_3", hash: HASH } },
    });
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ params: { pageId: "page_7" } });
  });

  it("filters to one language flat, and new pages start in that working language", async () => {
    const fetch = server(
      ["en", "es"],
      [
        on("POST", "/api/sites/site_1/pages", {
          status: 201,
          body: { page: page("page_8", "New page", { locale: "es" }), site: {} },
        }),
      ],
    );
    render(wrap(<PagesPage />));
    await screen.findByText("About", {}, { timeout: 15_000 });
    fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
    const spanish = await screen.findByRole("option", { name: "Spanish" });
    // Base UI selects an item on pointer down, then click.
    fireEvent.pointerDown(spanish, { pointerType: "mouse" });
    fireEvent.click(spanish);
    await screen.findByText("Acerca");
    expect(screen.queryByText("About")).toBeNull();
    expect(screen.getByText("Equipo")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Languages" })).toBeNull();
    expect(readWorkingLanguage("site_1")).toBe("es");
    fireEvent.click(screen.getByRole("button", { name: "New page" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", "/api/sites/site_1/pages")).toMatchObject({ locale: "es" }),
    );
  });

  it("leaves a single-language site as it was: no chips, no filter, no translations request", async () => {
    const fetch = server(["en"]);
    render(wrap(<PagesPage />));
    await screen.findByText("About", {}, { timeout: 15_000 });
    expect(screen.queryByRole("columnheader", { name: "Languages" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Language" })).toBeNull();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/translations"))).toBe(false);
  });
});
