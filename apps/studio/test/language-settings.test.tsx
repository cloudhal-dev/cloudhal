/**
 * Site settings › Languages and Glossary (RFC-0033 §8): the site's languages and how readers reach
 * them, saved on the Site with its rev; the glossary saved as one node, rev included.
 */
import type { Site } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlossarySettingsSection } from "../src/components/GlossarySettings.tsx";
import { LanguageSettingsSection } from "../src/components/LanguageSettings.tsx";
import { asRole, bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SITE = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Site",
  slug: "site",
  defaultLocale: "en",
  locales: ["en", "es"],
  domains: [],
  pageIds: [],
  theme: { name: "blog" },
  rev: 4,
  createdAt: "2026-10-18T10:00:00Z",
  updatedAt: "2026-10-18T10:00:00Z",
} as unknown as Site;

describe("Language settings", () => {
  it("adds and removes languages, asks for review of pages, and saves the site with its rev", async () => {
    const [me] = asRole("owner");
    const fetch = serve(
      me as Route,
      on("GET", "/api/sites/site_1", { status: 200, body: SITE }),
      on("PUT", "/api/sites/site_1", (init) => ({
        status: 200,
        body: JSON.parse(String(init?.body)),
      })),
    );
    vi.stubGlobal("fetch", fetch);
    render(wrap(<LanguageSettingsSection siteId="site_1" />));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("English")).toBeInTheDocument();
    expect(within(table).getByText("Default")).toBeInTheDocument();
    // The default language cannot be removed; Spanish can.
    expect(screen.queryByRole("button", { name: "Remove English" })).toBeNull();
    // Languages are picked from a searchable list: by name in the Studio language, in itself or by tag.
    const add = screen.getByRole("combobox", { name: "Add a language" });
    fireEvent.focus(add);
    fireEvent.input(add, { target: { value: "Arab" } });
    fireEvent.keyDown(add, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Arabic · العربية · ar" }));
    await waitFor(() => expect(within(table).getByText("Arabic")).toBeInTheDocument());
    // Languages the site already has are not offered; a valid tag outside the list can be used.
    fireEvent.input(add, { target: { value: "Spanish" } });
    fireEvent.keyDown(add, { key: "ArrowDown" });
    expect(screen.queryByRole("option", { name: /· es$/ })).toBeNull();
    fireEvent.input(add, { target: { value: "gsw" } });
    fireEvent.keyDown(add, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Use the tag gsw" })).toBeInTheDocument();
    fireEvent.keyDown(add, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Remove Spanish" }));
    const pages = screen.getByRole("checkbox", { name: "Pages" });
    // A labelled Kumo checkbox: people click its label.
    fireEvent.click(screen.getByText("Pages"));
    await waitFor(() => expect(pages).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", "/api/sites/site_1")).toMatchObject({
        rev: 4,
        locales: ["en", "ar"],
        localization: { review: { required: ["pages"] } },
      }),
    );
  });
});

describe("Glossary settings", () => {
  it("explains a language here versus an edition, and starts an edition of this site", async () => {
    const [me] = asRole("owner");
    vi.stubGlobal(
      "fetch",
      serve(
        me as Route,
        on("GET", "/api/sites/site_1", { status: 200, body: SITE }),
        on("GET", "/api/sites", { status: 200, body: [SITE] }),
        on("GET", "/api/projects", { status: 200, body: { items: [] } }),
      ),
    );
    render(wrap(<LanguageSettingsSection siteId="site_1" />));
    const guide = await screen.findByTestId("edition-guide");
    expect(within(guide).getByText("Start a language edition")).toBeInTheDocument();
    fireEvent.click(within(guide).getByRole("button", { name: "Create a language edition…" }));
    const dialog = await screen.findByTestId("new-site");
    await waitFor(() =>
      expect(within(dialog).getByRole("combobox", { name: "Start from" })).toHaveTextContent(
        "A copy of Site (language edition)",
      ),
    );
  });

  it("adds a term never translated and an approved word, and saves with the glossary's rev", async () => {
    const [me] = asRole("owner");
    const PATH = "/api/sites/site_1/glossary";
    const fetch = serve(
      me as Route,
      on("GET", "/api/sites/site_1", { status: 200, body: SITE }),
      on("GET", PATH, {
        status: 200,
        body: { id: "gloss_1", siteId: "site_1", entries: [{ term: "byline" }], rev: 2 },
      }),
      on("PUT", PATH, (init) => ({
        status: 200,
        body: { ...JSON.parse(String(init?.body)), rev: 3 },
      })),
    );
    vi.stubGlobal("fetch", fetch);
    render(wrap(<GlossarySettingsSection siteId="site_1" />));
    const spanish = await screen.findByRole("textbox", { name: "In Spanish" });
    fireEvent.change(spanish, { target: { value: "firma" } });
    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    const terms = screen.getAllByRole("textbox", { name: "Term" });
    fireEvent.change(terms[1] as HTMLElement, { target: { value: "Cloudhal" } });
    const never = screen.getAllByRole("checkbox", { name: "Never translate" });
    fireEvent.click(never[1] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PATH)).toEqual({
        id: "gloss_1",
        rev: 2,
        entries: [
          { term: "byline", translations: { es: { text: "firma" } } },
          { term: "Cloudhal", doNotTranslate: true },
        ],
      }),
    );
  });
});
