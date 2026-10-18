/**
 * RFC-0033 §8: the editors' translations card — each language by name with its status and how it
 * was made, out-of-date versions flagged, links to the other versions, and a person's review of a
 * machine translation (waiting for unsaved edits).
 */
import type { Page } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationsCard } from "../src/components/Translations.tsx";
import type { TranslationRow } from "../src/lib/api.ts";
import { bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (over: Partial<TranslationRow>): TranslationRow => ({
  id: "page_1",
  kind: "page",
  siteId: "site_1",
  locale: "en",
  status: "published",
  rev: 3,
  stale: false,
  sourceMissing: false,
  reviewed: false,
  title: "About",
  path: "/about",
  ...over,
});

const acerca = {
  id: "page_2",
  siteId: "site_1",
  locale: "es",
  title: "Acerca",
  path: "/acerca",
  status: "draft",
  sections: [],
  rev: 1,
  translation: {
    group: "page_1",
    method: "machine",
    source: { id: "page_1", locale: "en", rev: 3, hash: "a".repeat(64) },
    provenance: { engine: "model", at: "2026-10-18T10:00:00Z" },
  },
} as unknown as Page;

const GROUP = {
  group: "page_1",
  items: [
    row({ method: "original" }),
    row({
      id: "page_2",
      locale: "es",
      status: "draft",
      method: "machine",
      stale: true,
      title: "Acerca",
      path: "/acerca",
      rev: 1,
    }),
  ],
};

describe("TranslationsCard", () => {
  it("lists each language by name, flags what is out of date, links to the other versions", async () => {
    serve(on("GET", "/api/sites/site_1/translations/page_2", { status: 200, body: GROUP }));
    render(wrap(<TranslationsCard siteId="site_1" node={acerca} dirty={false} />));
    const english = (await screen.findByText("English")).closest(
      "[data-translation]",
    ) as HTMLElement;
    expect(within(english).getByText("Original")).toBeTruthy();
    expect(within(english).getByRole("link", { name: "About" }).getAttribute("href")).toBe(
      "/sites/site_1/pages/page_1",
    );
    const spanish = screen.getByText("Spanish").closest("[data-translation]") as HTMLElement;
    expect(within(spanish).getByText("This version")).toBeTruthy();
    expect(within(spanish).getByText("Machine translation")).toBeTruthy();
    expect(within(spanish).getByText("Out of date")).toBeTruthy();
  });

  it("reviews a machine translation after confirming, and waits for unsaved edits", async () => {
    const fetch = serve(
      on("GET", "/api/sites/site_1/translations/page_2", { status: 200, body: GROUP }),
      on("POST", "/api/sites/site_1/translations/page_2/review", {
        status: 200,
        body: { ...acerca, rev: 2 },
      }),
    );
    render(wrap(<TranslationsCard siteId="site_1" node={acerca} dirty={true} />));
    const button = await screen.findByRole("button", { name: "Mark as reviewed" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Save your changes before you review.")).toBeTruthy();
    cleanup();
    render(wrap(<TranslationsCard siteId="site_1" node={acerca} dirty={false} />));
    fireEvent.click(await screen.findByRole("button", { name: "Mark as reviewed" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as reviewed" }));
    await vi.waitFor(() =>
      expect(bodyOf(fetch, "POST", "/api/sites/site_1/translations/page_2/review")).toEqual({
        rev: 1,
      }),
    );
  });

  it("says when the page exists in one language only", async () => {
    serve(
      on("GET", "/api/sites/site_1/translations/page_1", {
        status: 200,
        body: { group: "page_1", items: [row({})] },
      }),
    );
    const about = { ...acerca, id: "page_1", locale: "en", translation: undefined } as Page;
    render(wrap(<TranslationsCard siteId="site_1" node={about} dirty={false} />));
    expect(await screen.findByText("Only in English")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as reviewed" })).toBeNull();
  });
});
