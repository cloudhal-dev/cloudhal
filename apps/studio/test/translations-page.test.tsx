/**
 * Site › Translations (RFC-0033 §8): every page and article by language, the work queue first —
 * missing versions, out-of-date ones and machine translations waiting for review.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationRow } from "../src/lib/api.ts";
import { coverageRows } from "../src/lib/coverage.ts";
import { TranslationsPage } from "../src/routes/TranslationsPage.tsx";
import { asRole, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1" }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const member = (over: Partial<TranslationRow>): TranslationRow => ({
  id: "page_1",
  group: "page_1",
  kind: "page",
  siteId: "site_1",
  locale: "en",
  status: "published",
  method: "original",
  rev: 1,
  stale: false,
  sourceMissing: false,
  reviewed: false,
  title: "About",
  path: "/about",
  ...over,
});

const node = (id: string, title: string, locale = "en", translation?: object) => ({
  id,
  siteId: "site_1",
  title,
  locale,
  status: "published",
  path: `/${id}`,
  rev: 1,
  sections: [],
  ...(translation ? { translation } : {}),
});

const PAGES = [
  node("page_1", "About", "en", { group: "page_1", method: "original" }),
  node("page_2", "Acerca", "es", { group: "page_1", method: "machine" }),
  node("page_3", "Contact"),
];
const TRANSLATIONS = [
  member({}),
  member({ id: "page_2", locale: "es", method: "machine", title: "Acerca", stale: true }),
];

describe("coverageRows", () => {
  it("groups versions by work, adds untranslated originals, and says what needs work", () => {
    const rows = coverageRows({
      uiLocale: "en",
      locales: ["en", "es"],
      nodes: PAGES as never,
      translations: TRANSLATIONS,
    });
    expect(rows.map((r) => [r.title, r.cells.es?.id ?? null, r.needsWork])).toEqual([
      ["About", "page_2", true],
      ["Contact", null, true],
    ]);
    const done = coverageRows({
      uiLocale: "en",
      locales: ["en", "es"],
      nodes: PAGES.slice(0, 2) as never,
      translations: [
        member({}),
        member({ id: "page_2", locale: "es", method: "machine-reviewed" }),
      ],
    });
    expect(done[0]?.needsWork).toBe(false);
  });
});

describe("TranslationsPage", () => {
  function server(locales: string[]) {
    const [me] = asRole("owner");
    return serve(
      me as Route,
      on("GET", "/api/sites/site_1", {
        status: 200,
        body: { id: "site_1", defaultLocale: "en", locales, domains: [], theme: { name: "blog" } },
      }),
      on("GET", "/api/sites/site_1/pages", { status: 200, body: PAGES }),
      on("GET", "/api/sites/site_1/entries", { status: 200, body: [] }),
      on("GET", "/api/sites/site_1/translations", { status: 200, body: { items: TRANSLATIONS } }),
    );
  }

  it("lists every work by language with what each version needs", async () => {
    vi.stubGlobal("fetch", server(["en", "es"]));
    render(wrap(<TranslationsPage />));
    const about = (await screen.findByText("About")).closest("tr") as HTMLElement;
    const es = about.querySelector('[data-locale="es"]') as HTMLElement;
    expect(within(es).getByText("Out of date")).toBeInTheDocument();
    expect(within(es).getByText("To review")).toBeInTheDocument();
    expect(within(es).getByRole("link", { name: "Acerca" }).getAttribute("href")).toBe(
      "/sites/site_1/pages/page_2",
    );
    const contact = (screen.getByText("Contact").closest("tr") as HTMLElement).querySelector(
      '[data-locale="es"]',
    ) as HTMLElement;
    expect(within(contact).getByText("Missing")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search by title" }), {
      target: { value: "cont" },
    });
    expect(screen.queryByText("About")).toBeNull();
  });

  it("points a one-language site to its language settings", async () => {
    vi.stubGlobal("fetch", server(["en"]));
    render(wrap(<TranslationsPage />));
    expect(await screen.findByText("This site has one language")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open language settings" }).getAttribute("href")).toBe(
      "/sites/site_1/settings#languages",
    );
  });
});
