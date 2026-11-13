/**
 * RFC-0045 §5 (rollout step 6a): reference and repeater fields in the entry editor — the chosen
 * targets through `GET …/entries/groups`, the picker over `GET …/entries/pick`, repeater items
 * with an undo toast, item errors by path, and the "Used by" card.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryFieldCards } from "../src/components/EntryFieldCards.tsx";
import { EntryFieldsCard } from "../src/components/fields/EntryFieldsCard.tsx";
import { ApiRequestError } from "../src/lib/api/http.ts";
import { on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const L = (label: string) => ({ en: { label } });
const DEFS: FieldDefinition[] = [
  {
    key: "venue",
    type: "reference",
    labels: L("Venue"),
    localized: false,
    collections: ["places"],
  },
  {
    key: "speakers",
    type: "repeater",
    labels: L("Speakers"),
    localized: false,
    maxItems: 5,
    fields: [
      { key: "name", type: "text", labels: L("Name") },
      { key: "role", type: "text", labels: L("Role"), requiredToPublish: true },
    ],
  },
];

const SITE = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Site",
  slug: "site",
  defaultLocale: "en",
  locales: ["en", "tr"],
  domains: [],
  pageIds: [],
  theme: { name: "blog" },
  collections: {
    events: { fields: DEFS },
    places: { labels: { en: { singular: "Place", plural: "Places" } } },
  },
  rev: 1,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as unknown as Site;

const ENTRY = {
  schemaVersion: 1,
  id: "entry_event001",
  siteId: "site_1",
  collection: "events",
  slug: "launch",
  locale: "en",
  status: "draft",
  title: "Launch",
  body: { format: "markdown", value: "" },
  fields: { venue: "entry_hall0001", speakers: [{ name: "Ada", role: "Host" }] },
  tags: [],
  author: { kind: "human", id: "u_owner" },
  rev: 3,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as unknown as ContentEntry;

const card = (groupId: string, title: string, status = "published", locale = "en") => ({
  groupId,
  id: groupId,
  title,
  collection: "places",
  status,
  locale,
});

function Harness({
  entry = ENTRY,
  error,
  onFields = () => {},
}: {
  entry?: ContentEntry;
  error?: unknown;
  onFields?: (f: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(entry);
  return (
    <EntryFieldsCard
      siteId="site_1"
      site={SITE}
      entry={draft}
      onChange={(fields) => {
        setDraft({ ...draft, fields });
        onFields(fields);
      }}
      error={error}
      disabled={false}
    />
  );
}

const groups = (body: Record<string, unknown>) =>
  on("GET", "/api/sites/site_1/entries/groups", { status: 200, body: { groups: body } });

describe("Entry editor › reference fields", () => {
  it("shows the chosen target with its state, and replaces it through the picker", async () => {
    const fetch = serve(
      groups({ entry_hall0001: [card("entry_hall0001", "Main hall", "draft")] }),
      on("GET", "/api/sites/site_1/entries/pick", {
        status: 200,
        body: { entries: [card("entry_room0001", "Room B")] },
      }),
    );
    const onFields = vi.fn();
    render(wrap(<Harness onFields={onFields} />));
    const venue = await screen.findByRole("group", { name: "Venue" });
    expect(await within(venue).findByRole("link", { name: "Main hall" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/places/entry_hall0001",
    );
    expect(within(venue).getByText("Draft")).toBeInTheDocument();
    expect(within(venue).getByText("Will not show until published")).toBeInTheDocument();
    expect(within(venue).getByText("Places · English")).toBeInTheDocument();

    fireEvent.click(within(venue).getByRole("button", { name: "Change" }));
    const search = await screen.findByRole("combobox", { name: "Search entries" });
    const room = await screen.findByRole("option", { name: /Room B/ });
    expect(document.querySelector("[data-entry-picker-status]")).toHaveTextContent("1 entry found");
    const pick = fetch.mock.calls.find(([u]) => String(u).includes("/entries/pick"));
    expect(String(pick?.[0])).toContain("collections=places");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(room).toBeInTheDocument();
    expect(onFields).toHaveBeenLastCalledWith({ ...ENTRY.fields, venue: "entry_room0001" });
    // The picker's card shows at once, before the groups' query answers.
    expect(await within(venue).findByText("Room B")).toBeInTheDocument();
  });

  it("says Not found for a target with no entry left", async () => {
    serve(groups({ entry_hall0001: [] }));
    render(wrap(<Harness />));
    const venue = await screen.findByRole("group", { name: "Venue" });
    expect(await within(venue).findByText("Not found")).toBeInTheDocument();
    expect(within(venue).getByText("entry_hall0001")).toBeInTheDocument();
  });
});

describe("Entry editor › repeater fields", () => {
  it("removes an item and puts it back from the undo toast", async () => {
    serve(groups({ entry_hall0001: [card("entry_hall0001", "Main hall")] }));
    const onFields = vi.fn();
    render(wrap(<Harness onFields={onFields} />));
    const item = await screen.findByRole("group", { name: "Item 1: Ada" });
    expect(within(item).getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
    fireEvent.click(within(item).getByRole("button", { name: "Actions for item 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(onFields).toHaveBeenLastCalledWith({ venue: "entry_hall0001" });
    expect(await screen.findByText("Item 1: Ada removed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(onFields).toHaveBeenLastCalledWith({
        venue: "entry_hall0001",
        speakers: [{ name: "Ada", role: "Host" }],
      }),
    );
    expect(screen.getByRole("group", { name: "Item 1: Ada" })).toBeInTheDocument();
  });

  it("puts the API's item issues on their control, in the Studio language", async () => {
    serve(groups({ entry_hall0001: [card("entry_hall0001", "Main hall")] }));
    const error = new ApiRequestError(422, {
      error: "required_field",
      message: "needed",
      details: {
        issues: [{ path: "fields/speakers/0/role", code: "required_field", message: "needed" }],
      },
    });
    render(wrap(<Harness error={error} />));
    const item = await screen.findByRole("group", { name: "Item 1: Ada" });
    expect(
      within(item).getByText("Needed to publish. Add a value, or keep the entry as a draft."),
    ).toBeInTheDocument();
  });
});

describe("Entry editor › Used by", () => {
  it("lists referrers where some field can reference the collection", async () => {
    serve(
      on("GET", "/api/sites/site_1/entries/entry_hall0001/references", {
        status: 200,
        body: {
          groupId: "entry_hall0001",
          referrers: [
            {
              ...card("entry_event001", "Launch"),
              collection: "events",
              field: "venue",
              shownBy: [{ ...card("entry_event0tr", "Lansman", "published", "tr") }],
            },
          ],
        },
      }),
    );
    const hall = {
      ...ENTRY,
      id: "entry_hall0001",
      collection: "places",
      title: "Main hall",
      fields: {},
    } as ContentEntry;
    render(
      wrap(
        <EntryFieldCards
          siteId="site_1"
          site={SITE}
          entry={hall}
          onChange={() => {}}
          error={undefined}
          disabled={false}
        />,
      ),
    );
    const table = await screen.findByRole("table", { name: "Entries that reference this one" });
    expect(await within(table).findByRole("link", { name: "Launch" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/events/entry_event001",
    );
    expect(within(table).getByText(/· English · Venue$/)).toBeInTheDocument();
    expect(within(table).getByText("Also shown in Turkish")).toBeInTheDocument();
  });

  it("shows nothing for a collection no field can reference", () => {
    serve();
    const { container } = render(
      wrap(
        <EntryFieldCards
          siteId="site_1"
          site={{ ...SITE, collections: { places: {} } } as unknown as Site}
          entry={{ ...ENTRY, collection: "places", fields: {} } as ContentEntry}
          onChange={() => {}}
          error={undefined}
          disabled={false}
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
