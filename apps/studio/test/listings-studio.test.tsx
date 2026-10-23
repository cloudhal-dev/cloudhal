/**
 * RFC-0042 step 5 (collections stage 3 in Studio): the listing fields, expiry and structured-data
 * cards (save, errors, compatible sources only, JSON-LD preview, read-only), the collection list's
 * field columns, filters and sort (the query they build), "Create listing page", and the page
 * editor's content list conditions.
 */
import type {
  ContentEntry,
  ContentListSection,
  FieldDefinition,
  Site,
} from "@cloudhal/core-contracts";
import { PRESETS } from "@cloudhal/core-ts/structured-data";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentListQuery } from "../src/components/listings/ContentListQuery.tsx";
import { CreateListingPage } from "../src/components/listings/CreateListingPage.tsx";
import { ExpirySection } from "../src/components/listings/ExpirySection.tsx";
import { ListFieldsSection } from "../src/components/listings/ListFieldsSection.tsx";
import { StructuredDataSection } from "../src/components/listings/StructuredDataSection.tsx";
import { sectionQueryIssues } from "../src/components/page-editor/sections.ts";
import { en } from "../src/i18n/en.ts";
import { isKnownTool } from "../src/lib/activity.ts";
import { ApiRequestError } from "../src/lib/api/http.ts";
import { listingQuery, withFilter } from "../src/lib/listing-query.ts";
import { listingSearch } from "../src/lib/listing-search.ts";
import {
  listingSection,
  presetOf,
  sourceOptions,
  suggestRequired,
  withSetting,
} from "../src/lib/listings.ts";
import { ArticlesPage } from "../src/routes/ArticlesPage.tsx";
import { asRole, bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

const nav = vi.hoisted(() => ({ search: {} as Record<string, string>, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", collection: "events" }),
  useNavigate: () => nav.navigate,
  useSearch: () => nav.search,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.navigate.mockReset();
  nav.search = {};
});

const L = (label: string) => ({ en: { label } });
const DEFS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "day", type: "date", labels: L("Day"), localized: false },
  { key: "venue", type: "text", labels: L("Venue"), localized: true },
  { key: "seats", type: "number", labels: L("Seats"), localized: false },
  {
    key: "status",
    type: "select",
    labels: L("Status"),
    localized: false,
    options: [
      { value: "scheduled", labels: { en: "Scheduled" } },
      { value: "cancelled", labels: { en: "Cancelled" } },
    ],
  },
];

function siteWith(settings: Record<string, unknown> = {}): Site {
  return {
    schemaVersion: 1,
    id: "site_1",
    projectId: "proj_1",
    name: "Site",
    slug: "site",
    defaultLocale: "en",
    locales: ["en"],
    domains: [{ hostname: "example.com", primary: true }],
    pageIds: [],
    theme: { name: "blog" },
    timeZone: "Europe/Istanbul",
    collections: {
      events: {
        labels: { en: { singular: "Event", plural: "Events" } },
        fields: DEFS,
        ...settings,
      },
    },
    rev: 7,
    createdAt: "2026-10-18T10:00:00Z",
    updatedAt: "2026-10-18T10:00:00Z",
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

const PUT = "/api/sites/site_1/collections/events";
const saved = (init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as { settings: unknown };
  return {
    status: 200,
    body: { site: { ...siteWith(), rev: 8, collections: { events: body.settings } } },
  };
};

/** Opens a Kumo `Select` (by its accessible name) and picks an option. */
async function choose(combobox: HTMLElement, option: string | RegExp) {
  fireEvent.click(combobox);
  const item = await screen.findByRole("option", { name: option });
  fireEvent.pointerDown(item, { pointerType: "mouse" });
  fireEvent.click(item);
}
const optionNames = async (combobox: HTMLElement) => {
  fireEvent.click(combobox);
  await screen.findAllByRole("option");
  const names = screen.getAllByRole("option").map((o) => o.textContent ?? "");
  fireEvent.keyDown(combobox, { key: "Escape" });
  return names;
};

describe("listings (lib)", () => {
  it("turns URL filter tokens into conditions and keeps only well-formed params", () => {
    expect(
      listingSearch({ f_startsAt: "upcoming", f_Bad: "set", f_day: "nope", sort: "day:asc", x: 1 }),
    ).toEqual({
      f_startsAt: "upcoming",
      sort: "day:asc",
    });
    const q = listingQuery({
      f_startsAt: "upcoming",
      f_status: "is:cancelled",
      f_seats: "unset",
      sort: "seats:desc",
      category: "news",
    });
    expect(q.where).toEqual([
      { field: "startsAt", op: "gte", value: "now" },
      { field: "status", op: "eq", value: "cancelled" },
      { field: "seats", op: "unset" },
    ]);
    expect(q.orderBy).toEqual({ field: "seats", direction: "desc" });
    expect(q.active).toBe(true);
    expect(listingQuery({ category: "news" }).active).toBe(false);
    expect(withFilter({ category: "news", f_day: "past" }, "day", undefined)).toEqual({
      category: "news",
    });
    expect(withFilter({}, "day", "past")).toEqual({ f_day: "past" });
  });

  it("offers only the sources that fit a structured-data path", () => {
    const values = (path: string) =>
      sourceOptions(PRESETS.Event.paths[path] as never, DEFS).map((o) => o.value);
    // A required date: date fields and the entry's dates, no text field, no fixed value.
    expect(values("startDate")).toEqual([
      "none",
      "field:startsAt",
      "field:day",
      "entry:publishedAt",
      "entry:updatedAt",
    ]);
    // An optional enum: the select (single) and a fixed value.
    expect(values("eventStatus")).toEqual(["none", "field:status", "constant"]);
    // A text path with a default: the default first, text fields, entry and site text, a constant.
    expect(values("organizer.name")).toEqual([
      "none",
      "field:venue",
      "entry:title",
      "entry:summary",
      "site:name",
      "constant",
    ]);
    expect(values("name")[0]).toBe("default");
    expect(values("offers.price")).toEqual(["none", "field:seats"]);
  });

  it("builds presets, settings and listing sections", () => {
    const preset = presetOf("Event", {
      startDate: { choice: "field:startsAt", constant: "" },
      name: { choice: "default", constant: "" },
      eventStatus: { choice: "constant", constant: "scheduled" },
      "offers.priceCurrency": { choice: "constant", constant: " " },
    });
    expect(preset).toEqual({
      type: "Event",
      properties: {
        startDate: { kind: "field", field: "startsAt" },
        eventStatus: { kind: "constant", value: "scheduled" },
      },
    });
    expect(suggestRequired(preset, DEFS)).toEqual(["startsAt"]);
    expect(withSetting({ icon: "x", listFields: ["day"] }, "listFields", [] as never)).toEqual({
      icon: "x",
    });
    const settings = {
      listFields: ["seats", "day"],
      expiry: { field: "startsAt", action: "unlist" },
    } as never;
    expect(
      listingSection("sec_1", "events", { ...(settings as object), fields: DEFS } as never),
    ).toEqual({
      id: "sec_1",
      kind: "contentList",
      collection: "events",
      limit: 10,
      sort: "newest",
      where: [{ field: "day", op: "gte", value: "now" }],
      orderBy: { field: "day", direction: "asc" },
    });
    expect(listingSection("sec_1", "events", { fields: DEFS })).not.toHaveProperty("where");
  });

  it("words the new error codes, the expiry auto-check and the preview tool", () => {
    for (const code of [
      "invalid_query",
      "structured_data_invalid",
      "invalid_expiry",
      "list_field_in_use",
      "gates_unsupported",
    ] as const)
      expect(en.errors.api[code]).toBeTruthy();
    expect(en.approvals.autoCheck.expires).toMatch(/expiry/);
    expect(en.tools.preview_structured_data).toBe("Preview structured data");
    expect(isKnownTool("preview_structured_data")).toBe(true);
    const error = new ApiRequestError(422, {
      error: "invalid_query",
      message: "x",
      details: {
        issues: [
          { path: "sections/1/where/0/value", code: "invalid_query", message: "not a number" },
        ],
      },
    });
    expect(sectionQueryIssues(error, 1)).toEqual([
      { path: "where/0/value", message: "not a number" },
    ]);
    expect(sectionQueryIssues(error, 0)).toEqual([]);
  });
});

describe("Collection settings › stage 3 cards", () => {
  it("Listing fields: adds and orders fields, saves them alone", async () => {
    const fetch = serve(on("PUT", PUT, saved));
    const site = siteWith({ listFields: ["seats"], icon: "calendar" });
    render(
      wrap(
        <ListFieldsSection
          site={site}
          collection="events"
          settings={site.collections?.events ?? {}}
          readOnlyReason={undefined}
        />,
      ),
    );
    await choose(await screen.findByRole("combobox", { name: "Add a listing field" }), "Starts");
    fireEvent.click(screen.getByRole("button", { name: "Move Starts up" }));
    expect(screen.getAllByText("Sortable")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("save-list-fields"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PUT)).toMatchObject({
        rev: 7,
        settings: { icon: "calendar", listFields: ["startsAt", "seats"] },
      }),
    );
  });

  it("Listing fields: a field still used by sections names the pages", async () => {
    serve(
      on("PUT", PUT, {
        status: 409,
        body: {
          error: "list_field_in_use",
          message: "in use",
          details: { pages: [{ id: "page_up", path: "/upcoming", locale: "en" }] },
        },
      }),
    );
    const site = siteWith({ listFields: ["seats", "day"] });
    render(
      wrap(
        <ListFieldsSection
          site={site}
          collection="events"
          settings={site.collections?.events ?? {}}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove Day" }));
    fireEvent.click(screen.getByTestId("save-list-fields"));
    const box = await screen.findByTestId("list-fields-in-use");
    expect(within(box).getByRole("link", { name: "/upcoming" })).toHaveAttribute(
      "href",
      "/sites/site_1/pages/page_up",
    );
    expect(screen.getByText(en.errors.api.list_field_in_use)).toBeInTheDocument();
  });

  it("Expiry: date fields only, the action in words, grace, and how many are past it", async () => {
    const fetch = serve(
      on("PUT", PUT, saved),
      on("GET", "/api/sites/site_1/entries", {
        status: 200,
        body: [
          entry("past", { startsAt: { at: "2020-01-01T10:00:00Z", timeZone: "UTC" } }),
          entry("soon", { startsAt: { at: "2999-01-01T10:00:00Z", timeZone: "UTC" } }),
          entry("none", {}),
        ],
      }),
    );
    const site = siteWith();
    render(
      wrap(
        <ExpirySection
          site={site}
          collection="events"
          settings={site.collections?.events ?? {}}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("switch", { name: "End entries on a date" }));
    const field = await screen.findByRole("combobox", { name: /Date field/ });
    expect(await optionNames(field)).toEqual(["Starts", "Day"]);
    expect(screen.getByText(/leaves lists, content list sections, feeds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Hide the page/ }));
    fireEvent.change(screen.getByTestId("expiry-grace"), { target: { value: "60" } });
    expect(await screen.findByText("1 published entry is already past it.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("save-expiry"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PUT)?.settings).toMatchObject({
        expiry: { field: "startsAt", action: "hide", afterMinutes: 60 },
      }),
    );
  });

  it("Expiry: an older site Worker says to deploy first", async () => {
    serve(on("PUT", PUT, { status: 409, body: { error: "gates_unsupported", message: "deploy" } }));
    const site = siteWith({ expiry: { field: "day", action: "unlist" } });
    render(
      wrap(
        <ExpirySection
          site={site}
          collection="events"
          settings={site.collections?.events ?? {}}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.change(await screen.findByTestId("expiry-grace"), { target: { value: "30" } });
    fireEvent.click(screen.getByTestId("save-expiry"));
    expect(await screen.findByTestId("expiry-gates-unsupported")).toHaveTextContent(
      /Deploy the site first/,
    );
  });

  it("Structured data: maps paths with fitting sources only, saves, and shows refused issues", async () => {
    const fetch = serve(
      on("PUT", PUT, {
        status: 422,
        body: {
          error: "structured_data_invalid",
          message: "x",
          details: {
            issues: [
              {
                path: "collections/events/structuredData/properties/location.name",
                code: "required_missing",
                message: "x",
              },
            ],
          },
        },
      }),
    );
    const site = siteWith();
    render(
      wrap(
        <StructuredDataSection
          site={site}
          collection="events"
          settings={site.collections?.events ?? {}}
          readOnlyReason={undefined}
        />,
      ),
    );
    await choose(await screen.findByRole("combobox", { name: "Type" }), "Event");
    await screen.findByTestId("preset-rows");
    const start = within(
      document.querySelector('[data-path="startDate"]') as HTMLElement,
    ).getByRole("combobox");
    const names = await optionNames(start);
    expect(names).toEqual([
      "Not used",
      "Field: Starts",
      "Field: Day",
      "Entry: Published date",
      "Entry: Updated date",
    ]);
    expect(names).not.toContain("Field: Venue");
    // Live check, before saving: the required start date is not mapped yet.
    const row = document.querySelector('[data-path="startDate"]') as HTMLElement;
    expect(within(row).getByText(/Needed: choose where its value comes from/)).toBeInTheDocument();
    await choose(start, "Field: Starts");
    await waitFor(() => expect(within(row).queryByText(/Needed:/)).toBeNull());
    fireEvent.click(screen.getByTestId("save-structured-data"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PUT)?.settings.structuredData).toEqual({
        type: "Event",
        properties: { startDate: { kind: "field", field: "startsAt" } },
      }),
    );
    const location = document.querySelector('[data-path="location.name"]') as HTMLElement;
    expect(await within(location).findAllByText(/Needed: choose/)).not.toHaveLength(0);
  });

  it("Structured data: previews a chosen entry's JSON-LD and why another emits none", async () => {
    serve(
      on("GET", "/api/sites/site_1/entries", {
        status: 200,
        body: [entry("launch", {}), entry("draft", {})],
      }),
      on("GET", "/api/sites/site_1/entries/launch/structured-data", {
        status: 200,
        body: {
          preset: "Event",
          origin: "https://example.com",
          document: { "@type": "Event", name: "launch" },
          issues: [],
        },
      }),
      on("GET", "/api/sites/site_1/entries/draft/structured-data", {
        status: 200,
        body: {
          preset: "Event",
          origin: "https://example.com",
          document: null,
          issues: [
            {
              path: "collections/events/structuredData/properties/startDate",
              code: "required_value_missing",
              message: "x",
            },
          ],
        },
      }),
    );
    const site = siteWith({
      structuredData: {
        type: "Event",
        properties: { startDate: { kind: "field", field: "startsAt" } },
      },
    });
    render(
      wrap(
        <StructuredDataSection
          site={site}
          collection="events"
          settings={site.collections?.events ?? {}}
          readOnlyReason={undefined}
        />,
      ),
    );
    const preview = await screen.findByTestId("structured-data-preview");
    await waitFor(() =>
      expect(within(preview).getByRole("combobox", { name: "Entry" })).not.toHaveAttribute(
        "data-disabled",
      ),
    );
    await new Promise((r) => setTimeout(r, 50));
    await choose(within(preview).getByRole("combobox", { name: "Entry" }), /^launch/);
    await waitFor(() => expect(preview.textContent).toContain("@type"));
    expect(within(preview).getByRole("link", { name: /Rich Results Test/ })).toHaveAttribute(
      "href",
      `https://search.google.com/test/rich-results?url=${encodeURIComponent("https://example.com/events/launch")}`,
    );
    await choose(within(preview).getByRole("combobox", { name: "Entry" }), /^draft/);
    expect(
      await within(preview).findByText(/no value for a required property \(startDate\)/),
    ).toBeInTheDocument();
    expect(within(preview).getByText(/emits no structured data/)).toBeInTheDocument();
  });

  it("is read-only without site:settings", async () => {
    serve();
    const site = siteWith({ listFields: ["seats"], expiry: { field: "day", action: "unlist" } });
    const props = {
      site,
      collection: "events",
      settings: site.collections?.events ?? {},
      readOnlyReason: "Only Administrators change site settings.",
    };
    render(
      wrap(
        <>
          <ListFieldsSection {...props} />
          <ExpirySection {...props} />
          <StructuredDataSection {...props} />
        </>,
      ),
    );
    expect(await screen.findByTestId("save-list-fields")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Seats" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Add a listing field" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByTestId("save-expiry")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "End entries on a date" })).toBeDisabled();
    expect(screen.getByTestId("save-structured-data")).toBeDisabled();
  });
});

describe("Collection list › listing fields", () => {
  const routes = (site: Site) => [
    ...asRole("owner"),
    on("GET", "/api/sites/site_1", { status: 200, body: site }),
  ];

  it("shows formatted columns and filters, and a filter goes to the URL", async () => {
    const site = siteWith({ listFields: ["startsAt", "seats", "status"] });
    serve(
      ...routes(site),
      on("GET", "/api/sites/site_1/entries", {
        status: 200,
        body: [
          entry("launch", {
            startsAt: { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" },
            seats: 1200,
            status: "cancelled",
          }),
        ],
      }),
    );
    render(wrap(<ArticlesPage />));
    const row = await waitFor(() => {
      const r = document.querySelector('tr[data-entry-id="launch"]');
      expect(r).not.toBeNull();
      return r as HTMLElement;
    });
    await waitFor(() =>
      expect(row.querySelector('[data-list-cell="seats"]')).toHaveTextContent("1,200"),
    );
    expect(row.querySelector('[data-list-cell="status"]')).toHaveTextContent("Cancelled");
    expect(row.querySelector('[data-list-cell="startsAt"]')?.textContent).toMatch(
      /November 5, 2026/,
    );
    await choose(screen.getByRole("combobox", { name: "Starts" }), "Starts: upcoming");
    expect(nav.navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: { f_startsAt: "upcoming" } }),
    );
    fireEvent.click(screen.getByTestId("list-sort-seats"));
    expect(nav.navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: { sort: "seats:asc" } }),
    );
  });

  it("asks the API by field while the URL filters or sorts, one page at a time", async () => {
    nav.search = { f_startsAt: "upcoming", f_status: "is:scheduled", sort: "seats:desc" };
    const site = siteWith({ listFields: ["startsAt", "seats", "status"] });
    const fetch = serve(
      ...routes(site),
      on("GET", "/api/sites/site_1/entries", (init) => ({
        status: 200,
        body: { entries: [entry("a", {}), entry("b", {})], total: 30, nextCursor: "next1", init },
      })),
    );
    render(wrap(<ArticlesPage />));
    await waitFor(() => expect(document.querySelectorAll("tr[data-entry-id]")).toHaveLength(2));
    const urls = fetch.mock.calls.map(([u]) => decodeURIComponent(String(u)));
    const asked = urls.find((u) => u.includes("where="));
    expect(asked).toContain(
      'where=[{"field":"startsAt","op":"gte","value":"now"},{"field":"status","op":"eq","value":"scheduled"}]',
    );
    expect(asked).toContain('orderBy={"field":"seats","direction":"desc"}');
    expect(asked).toContain("limit=25");
    fireEvent.click(await screen.findByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([u]) => String(u).includes("cursor=next1"))).toBe(true),
    );
  });
});

describe("Create listing page", () => {
  it("creates a draft page at the collection's address with an upcoming content list", async () => {
    const site = siteWith({
      listFields: ["startsAt"],
      expiry: { field: "startsAt", action: "unlist" },
    });
    const fetch = serve(
      ...asRole("owner"),
      on("GET", "/api/sites/site_1/pages", { status: 200, body: [] }),
      on("POST", "/api/sites/site_1/pages", {
        status: 201,
        body: { page: { id: "page_events", path: "/events" }, site },
      }),
    );
    render(wrap(<CreateListingPage site={site} collection="events" />));
    await waitFor(() => expect(screen.getByTestId("create-listing-page")).toBeEnabled());
    fireEvent.click(screen.getByTestId("create-listing-page"));
    await waitFor(() =>
      expect(nav.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ params: { siteId: "site_1", pageId: "page_events" } }),
      ),
    );
    expect(bodyOf(fetch, "POST", "/api/sites/site_1/pages")).toMatchObject({
      path: "/events",
      title: "Events",
      locale: "en",
      status: "draft",
      sections: [
        {
          kind: "contentList",
          collection: "events",
          where: [{ field: "startsAt", op: "gte", value: "now" }],
          orderBy: { field: "startsAt", direction: "asc" },
        },
      ],
    });
  });

  it("opens the page that already lives at that address", async () => {
    serve(
      ...asRole("owner"),
      on("GET", "/api/sites/site_1/pages", {
        status: 200,
        body: [{ id: "page_old", path: "/events", locale: "en" }],
      }),
    );
    render(wrap(<CreateListingPage site={siteWith()} collection="events" />));
    expect(await screen.findByTestId("open-listing-page")).toHaveAttribute(
      "href",
      "/sites/site_1/pages/page_old",
    );
  });
});

describe("Page editor › content list conditions", () => {
  function Harness({
    initial,
    issues = [],
  }: {
    initial: ContentListSection;
    issues?: { path: string; message: string }[];
  }) {
    const [section, setSection] = useState(initial);
    return (
      <>
        <ContentListQuery siteId="site_1" section={section} onChange={setSection} issues={issues} />
        <output data-testid="section">{JSON.stringify(section)}</output>
      </>
    );
  }
  const base: ContentListSection = {
    id: "sec_1",
    kind: "contentList",
    collection: "events",
    limit: 6,
    sort: "newest",
  };
  const current = () =>
    JSON.parse(screen.getByTestId("section").textContent ?? "{}") as ContentListSection;

  it("adds conditions with the field type's operators and orders by a date", async () => {
    serve(
      on("GET", "/api/sites/site_1", {
        status: 200,
        body: siteWith({ listFields: ["startsAt", "venue"] }),
      }),
    );
    render(wrap(<Harness initial={base} />));
    fireEvent.click(await screen.findByTestId("add-condition"));
    expect(current().where).toEqual([{ field: "startsAt", op: "eq", value: "now" }]);
    const op = within(
      document.querySelector('[data-condition="startsAt"]') as HTMLElement,
    ).getByRole("combobox", { name: "Condition" });
    expect(await optionNames(op)).toEqual([
      "is",
      "is not",
      "is before",
      "is on or before",
      "is after",
      "is on or after",
      "has a value",
      "is empty",
    ]);
    await choose(op, "is on or after");
    expect(current().where).toEqual([{ field: "startsAt", op: "gte", value: "now" }]);
    await choose(screen.getByRole("combobox", { name: "Order by field" }), "Starts");
    expect(current().orderBy).toEqual({ field: "startsAt", direction: "asc" });
    await choose(screen.getByRole("combobox", { name: "Direction" }), "Latest first");
    expect(current().orderBy).toEqual({ field: "startsAt", direction: "desc" });
    fireEvent.click(screen.getByRole("button", { name: "Remove condition" }));
    expect(current()).not.toHaveProperty("where");
  });

  it("shows the save's invalid_query issues on their row, and a hint without listing fields", async () => {
    serve(
      on("GET", "/api/sites/site_1", { status: 200, body: siteWith({ listFields: ["seats"] }) }),
    );
    const section = {
      ...base,
      where: [{ field: "seats", op: "gt", value: "ten" }],
    } as ContentListSection;
    render(
      wrap(
        <Harness initial={section} issues={[{ path: "where/0/value", message: "not a number" }]} />,
      ),
    );
    expect(await screen.findByText("not a number")).toBeInTheDocument();
    cleanup();
    serve(on("GET", "/api/sites/site_1", { status: 200, body: siteWith() }));
    render(wrap(<Harness initial={base} />));
    expect(await screen.findByRole("link", { name: "Choose listing fields" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/events/settings#listing-fields",
    );
  });
});
