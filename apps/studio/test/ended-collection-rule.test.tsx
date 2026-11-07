/**
 * RFC-0042 §3.3 in Studio (#113): "Ended (collection rule)" beside the status of a published
 * entry whose collection's expiry has passed — the pure rule (the entry's own state first, as in
 * the renderer preview, a published original only), the collection list (a translation's original
 * from the list) and the entry editor's header (the saved entry over the draft and a stale list,
 * a translation's original, Turkish).
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { TooltipProvider } from "@cloudhal/ui";
import type { QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { endedByRule, gateZone } from "../src/components/listings/ended-rule.ts";
import { ArticleEditorPage } from "../src/routes/ArticleEditorPage.tsx";
import { ArticlesPage } from "../src/routes/ArticlesPage.tsx";
import { asRole, on, serve, testQueryClient, wrap } from "./roles-fixtures.tsx";

const nav = vi.hoisted(() => ({ entryId: "entry_1", navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", collection: "events", entryId: nav.entryId }),
  useNavigate: () => nav.navigate,
  useSearch: () => ({}),
}));
// happy-dom would load the sandboxed preview frame over the network; it is covered elsewhere.
vi.mock("../src/components/EditorPreview.tsx", () => ({ EditorPreview: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.entryId = "entry_1";
  nav.navigate.mockReset();
});

const L = (label: string) => ({ en: { label } });
const DEFS: FieldDefinition[] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "day", type: "date", labels: L("Day"), localized: false },
];

function siteWith(expiry?: Record<string, unknown>, extra: Record<string, unknown> = {}): Site {
  return {
    schemaVersion: 1,
    id: "site_1",
    projectId: "proj_1",
    name: "Site",
    slug: "site",
    defaultLocale: "en",
    locales: ["en", "tr"],
    domains: [{ hostname: "example.com", primary: true }],
    pageIds: [],
    theme: { name: "blog" },
    timeZone: "Europe/Istanbul",
    collections: {
      events: {
        labels: { en: { singular: "Event", plural: "Events" } },
        fields: DEFS,
        ...(expiry ? { expiry } : {}),
      },
    },
    rev: 7,
    createdAt: "2026-10-18T10:00:00Z",
    updatedAt: "2026-10-18T10:00:00Z",
    ...extra,
  } as unknown as Site;
}

const entry = (id: string, fields: Record<string, unknown>, extra = {}): ContentEntry =>
  ({
    schemaVersion: 1,
    id,
    siteId: "site_1",
    collection: "events",
    slug: id,
    locale: "en",
    status: "published",
    title: id,
    body: { format: "markdown", value: "" },
    fields,
    tags: [],
    author: { kind: "human", id: "u_owner" },
    rev: 1,
    createdAt: "2026-10-18T10:00:00Z",
    updatedAt: "2026-10-18T10:00:00Z",
    ...extra,
  }) as unknown as ContentEntry;

const PAST = "2020-03-01T10:00:00Z";
const FUTURE = "2999-01-01T10:00:00Z";
const starts = (at: string) => ({ startsAt: { at, timeZone: "Europe/Istanbul" } });
const NOW = Date.parse("2026-10-25T09:00:00Z");
const UNLIST = { field: "startsAt", action: "unlist" };
const sameSiteTranslation = (group: string, extra = {}) => ({
  translation: {
    group,
    method: "machine",
    source: { id: group, locale: "en", rev: 1, hash: "a".repeat(64), ...extra },
  },
});

describe("endedByRule", () => {
  it("ends a published entry once its collection's date has passed, unlist or hide", () => {
    const e = entry("e", starts(PAST));
    expect(endedByRule(siteWith(UNLIST), e, undefined, NOW)).toMatchObject({
      gate: { action: "unlist", at: Date.parse(PAST) },
      fieldKey: "startsAt",
      field: { key: "startsAt" },
    });
    expect(
      endedByRule(siteWith({ field: "startsAt", action: "hide" }), e, undefined, NOW)?.gate.action,
    ).toBe("hide");
  });

  it("ends exactly at the instant (the end is exclusive) and not a millisecond before", () => {
    const at = Date.parse(PAST);
    const e = entry("e", starts(PAST));
    expect(endedByRule(siteWith(UNLIST), e, undefined, at - 1)).toBeUndefined();
    expect(endedByRule(siteWith(UNLIST), e, undefined, at)).toBeDefined();
  });

  it("gives nothing without a rule, a value, a live field or a fitting value", () => {
    expect(endedByRule(siteWith(), entry("e", starts(PAST)), undefined, NOW)).toBeUndefined();
    expect(endedByRule(siteWith(UNLIST), entry("e", {}), undefined, NOW)).toBeUndefined();
    const removing = siteWith(UNLIST);
    const settings = removing.collections?.events as { fields: FieldDefinition[] };
    settings.fields = [{ ...(DEFS[0] as FieldDefinition), migration: { id: "snap_01HZX8K3Q9MG" } }];
    expect(endedByRule(removing, entry("e", starts(PAST)), undefined, NOW)).toBeUndefined();
    const unfit = entry("e", { startsAt: "2020-03-01" });
    expect(endedByRule(siteWith(UNLIST), unfit, undefined, NOW)).toBeUndefined();
  });

  it("lets the status speak first: drafts, reviews and archived entries never show it", () => {
    for (const status of ["draft", "review", "archived"])
      expect(
        endedByRule(siteWith(UNLIST), entry("e", starts(PAST), { status }), undefined, NOW),
      ).toBeUndefined();
  });

  it("lets the entry's own availability speak first", () => {
    const site = siteWith(UNLIST);
    const own = (availability: Record<string, string>, at = PAST) =>
      endedByRule(site, entry("e", starts(at), { availability }), undefined, NOW);
    // Embargoed: the derived gate never touches `from`.
    expect(own({ from: "2999-06-01T00:00:00Z" })).toBeUndefined();
    // Its own "Hide after" closed first (2019 before 2020): the own end speaks.
    expect(own({ until: "2019-01-01T00:00:00Z" })).toBeUndefined();
    // Its own end passed, the collection's has not.
    expect(own({ until: "2019-01-01T00:00:00Z" }, FUTURE)).toBeUndefined();
    // Its own end is still ahead; the collection's has passed.
    expect(own({ until: "2999-06-01T00:00:00Z" })?.gate.action).toBe("unlist");
  });

  it("ends a date at the next midnight in the site's zone, plus the grace", () => {
    const e = entry("e", { day: "2026-11-05" });
    const later = Date.parse("2027-01-01T00:00:00Z");
    expect(
      endedByRule(siteWith({ field: "day", action: "unlist" }), e, undefined, later)?.gate.at,
    ).toBe(Date.parse("2026-11-05T21:00:00Z"));
    expect(
      endedByRule(
        siteWith({ field: "day", action: "unlist", afterMinutes: 90 }),
        e,
        undefined,
        later,
      )?.gate.at,
    ).toBe(Date.parse("2026-11-05T22:30:00Z"));
    expect(gateZone({ timeZone: "Europe/Istanbul" })).toBe("Europe/Istanbul");
    expect(gateZone({ timeZone: "Mars/Olympus" })).toBe("UTC");
    expect(gateZone({})).toBe("UTC");
  });

  it("reads a translation's non-localized date from its original, not a language edition's", () => {
    const original = entry("orig", starts(PAST));
    const tr = entry("tr_1", {}, { locale: "tr", ...sameSiteTranslation("orig") });
    expect(endedByRule(siteWith(UNLIST), tr, original, NOW)?.gate.action).toBe("unlist");
    expect(endedByRule(siteWith(UNLIST), tr, undefined, NOW)).toBeUndefined();
    const edition = entry(
      "tr_2",
      {},
      { locale: "tr", ...sameSiteTranslation("orig", { siteId: "site_2" }) },
    );
    expect(endedByRule(siteWith(UNLIST), edition, original, NOW)).toBeUndefined();
  });

  it("reads a published original only, as the site does", () => {
    const tr = entry("tr_1", {}, { locale: "tr", ...sameSiteTranslation("orig") });
    for (const status of ["draft", "review", "archived"]) {
      const original = entry("orig", starts(PAST), { status });
      expect(endedByRule(siteWith(UNLIST), tr, original, NOW)).toBeUndefined();
    }
  });
});

describe("collection list › Ended (collection rule)", () => {
  const list = (site: Site, entries: ContentEntry[]) => {
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/sites/site_1", { status: 200, body: site }),
      on("GET", "/api/sites/site_1/entries", { status: 200, body: entries }),
    );
    render(wrap(<ArticlesPage />));
    return fetch;
  };
  const row = (id: string) => document.querySelector<HTMLElement>(`tr[data-entry-id="${id}"]`);
  /** A row that is on screen now (fails rather than reading a missing row). */
  const shown = (id: string) => {
    const r = row(id);
    expect(r).not.toBeNull();
    return r as HTMLElement;
  };
  /** Waits for `id`'s badge; `null` (never `undefined`) while the table has not rendered. */
  const badgeIn = (id: string, action: "unlist" | "hide") =>
    waitFor(() => {
      const b = row(id)?.querySelector<HTMLElement>(`[data-ended-rule="${action}"]`) ?? null;
      expect(b).not.toBeNull();
      return b as HTMLElement;
    });

  it("marks a published entry past an unlist rule, with the reason in its name", async () => {
    list(siteWith(UNLIST), [
      entry("past", starts(PAST)),
      entry("later", starts(FUTURE)),
      entry("pastDraft", starts(PAST), { status: "draft" }),
    ]);
    const badge = await badgeIn("past", "unlist");
    expect(shown("past").querySelector('[data-status="published"]')).not.toBeNull();
    expect(badge).toHaveTextContent("Ended (collection rule)");
    expect(badge).toHaveTextContent("“Starts”");
    expect(badge).toHaveTextContent("(Istanbul time)");
    expect(badge).toHaveTextContent("the sitemap");
    const button = screen.getByRole("button", { name: /Ended \(collection rule\)/ });
    button.focus();
    expect(button).toHaveFocus();
    expect(shown("later").querySelector("[data-ended-rule]")).toBeNull();
    expect(shown("pastDraft").querySelector("[data-ended-rule]")).toBeNull();
  });

  it("words a hide rule as “not found”", async () => {
    list(siteWith({ field: "startsAt", action: "hide" }), [entry("past", starts(PAST))]);
    const badge = await badgeIn("past", "hide");
    expect(badge).toHaveTextContent("“not found”");
  });

  it("shows nothing when the entry's own end came first, or without a rule", async () => {
    list(siteWith({ field: "startsAt", action: "unlist" }), [
      entry("past", starts(PAST)),
      entry("ownEnd", starts(PAST), { availability: { until: "2019-01-01T00:00:00Z" } }),
    ]);
    await badgeIn("past", "unlist");
    expect(shown("ownEnd").querySelector('[data-status="published"]')).not.toBeNull();
    expect(shown("ownEnd").querySelector("[data-ended-rule]")).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    list(siteWith(), [entry("past", starts(PAST)), entry("other", { day: "2020-03-01" })]);
    // The languages column needs the site, so the site (without a rule) has loaded by then; the
    // badge's chunk loaded above, so a badge shown regardless of the rule would be here already.
    await waitFor(() =>
      expect(row("past")?.querySelector('[data-testid="languages-cell"]') ?? null).not.toBeNull(),
    );
    expect(shown("past").querySelector('[data-status="published"]')).not.toBeNull();
    expect(shown("other")).toBeInTheDocument();
    expect(document.querySelector("[data-ended-rule]")).toBeNull();
  });

  it("reads a translation's original from the list it is in, without asking for it", async () => {
    // One language, so translations are rows of their own rather than grouped.
    const fetch = list(siteWith(UNLIST, { locales: ["en"] }), [
      entry("orig", starts(PAST)),
      entry("tr_1", {}, { locale: "tr", ...sameSiteTranslation("orig") }),
      entry("archivedOrig", starts(PAST), { status: "archived" }),
      entry("tr_2", {}, { locale: "tr", ...sameSiteTranslation("archivedOrig") }),
    ]);
    await badgeIn("tr_1", "unlist");
    expect(shown("orig").querySelector('[data-ended-rule="unlist"]')).not.toBeNull();
    // The site reads published originals only, so this one's translation stays listed.
    expect(shown("tr_2").querySelector("[data-ended-rule]")).toBeNull();
    const asked = fetch.mock.calls.map(([u]) => String(u).replace(/^https?:\/\/[^/]+/, ""));
    expect(asked.filter((u) => /\/entries\/(orig|archivedOrig)(\?|$)/.test(u))).toEqual([]);
  });
});

describe("entry editor › Ended (collection rule)", () => {
  const DAY_RULE = { field: "day", action: "unlist" };
  const editor = (
    e: ContentEntry,
    {
      extra = [],
      locale,
      qc,
    }: { extra?: Parameters<typeof on>[]; locale?: "tr"; qc?: QueryClient } = {},
  ) => {
    nav.entryId = e.id;
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/sites/site_1", { status: 200, body: siteWith(DAY_RULE) }),
      on("GET", `/api/sites/site_1/entries/${e.id}`, { status: 200, body: e }),
      ...extra.map((args) => on(...args)),
    );
    render(
      wrap(
        <TooltipProvider>
          <ArticleEditorPage />
        </TooltipProvider>,
        locale,
        qc,
      ),
    );
    return fetch;
  };
  const badge = () =>
    waitFor(() => {
      const b = document.querySelector('[data-ended-rule="unlist"]');
      expect(b).not.toBeNull();
      return b as HTMLElement;
    });
  const translation = () => entry("tr_1", {}, { locale: "tr", ...sameSiteTranslation("orig_1") });

  it("shows the badge in the header for a saved entry past its date, in the site's zone", async () => {
    editor(entry("entry_1", { day: "2020-03-01" }));
    const b = await badge();
    expect(b.textContent).toMatch(/March 2, 2020 at 12:00\sAM \(Istanbul time\)/);
    expect(b).toHaveTextContent("“Day”");
  });

  it("shows nothing before the date", async () => {
    const qc = testQueryClient();
    const e = entry("entry_1", { day: "2020-03-01" });
    editor(e, { qc });
    // Shown first, so the badge's chunk and words are loaded and it is reading the saved entry.
    await badge();
    act(() => {
      qc.setQueryData(["entry", "site_1", "entry_1"], {
        ...e,
        rev: 2,
        fields: { day: "2999-01-01" },
      });
    });
    await waitFor(() => expect(document.querySelector("[data-ended-rule]")).toBeNull());
    expect(document.querySelector('[data-status="published"]')).not.toBeNull();
  });

  it("follows the saved entry, not the unsaved draft", async () => {
    editor(entry("entry_1", { day: "2020-03-01" }));
    await badge();
    const fields = await waitFor(() => {
      const card = document.getElementById("fields");
      expect(card).not.toBeNull();
      return card as HTMLElement;
    });
    // Clearing the date changes only the draft: its "Clear" goes, the saved entry still ended.
    fireEvent.click(await within(fields).findByRole("button", { name: "Clear" }));
    expect(within(fields).queryByRole("button", { name: "Clear" })).toBeNull();
    expect(document.querySelector('[data-ended-rule="unlist"]')).not.toBeNull();
  });

  it("reads a translation's date from its original", async () => {
    const original = entry("orig_1", { day: "2020-03-01" });
    const fetch = editor(translation(), {
      extra: [["GET", "/api/sites/site_1/entries/orig_1", { status: 200, body: original }]],
    });
    await badge();
    expect(
      fetch.mock.calls.some(([u]) => String(u).endsWith("/api/sites/site_1/entries/orig_1")),
    ).toBe(true);
  });

  it("reads the saved original over a list cache that a save left stale", async () => {
    const qc = testQueryClient();
    const saved = entry("orig_1", { day: "2020-03-01" }, { rev: 2 });
    // The list was cached before the original's date was changed and saved; the save invalidated
    // it (no list on screen refetches it) and wrote the saved original.
    qc.setQueryData(["entries", "site_1", "events"], [entry("orig_1", { day: "2999-01-01" })]);
    await qc.invalidateQueries({ queryKey: ["entries", "site_1"] });
    qc.setQueryData(["entry", "site_1", "orig_1"], saved);
    editor(translation(), {
      qc,
      extra: [["GET", "/api/sites/site_1/entries/orig_1", { status: 200, body: saved }]],
    });
    await badge();
  });

  it("speaks Turkish", async () => {
    editor(entry("entry_1", { day: "2020-03-01" }), { locale: "tr" });
    const b = await badge();
    expect(b).toHaveTextContent("Sona erdi (koleksiyon kuralı)");
    expect(b).toHaveTextContent("2 Mart 2020 00:00 zamanında (Istanbul saatiyle)");
  });
});
