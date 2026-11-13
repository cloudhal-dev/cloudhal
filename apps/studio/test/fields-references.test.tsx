/**
 * RFC-0045 §5 (rollout step 6a): reference and repeater fields in the entry editor — the chosen
 * targets through `GET …/entries/groups`, the picker over `GET …/entries/pick`, repeater items
 * with an undo toast, item errors by path, and the "Used by" card.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { Button } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryUsedByCard } from "../src/components/EntryFieldCards.tsx";
import { EntryFieldsCard } from "../src/components/fields/EntryFieldsCard.tsx";
import { ApiRequestError } from "../src/lib/api/http.ts";
import { withoutEmptyItems } from "../src/lib/empty-items.ts";
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

/** The editor's own way of holding the draft: functional updates, title and fields together. */
function EditorHarness({
  entry,
  onDraft,
}: {
  entry: ContentEntry;
  onDraft: (d: ContentEntry) => void;
}) {
  const [draft, setDraft] = useState<ContentEntry | undefined>(entry);
  const [shown, setShown] = useState(entry.id);
  if (shown !== entry.id) {
    setShown(entry.id);
    setDraft(entry);
  }
  if (draft) onDraft(draft);
  if (!draft) return null;
  return (
    <>
      <Button onClick={() => setDraft((d) => d && { ...d, title: "Renamed" })}>Retitle</Button>
      <EntryFieldsCard
        siteId="site_1"
        site={SITE}
        entry={draft}
        onChange={(fields) => setDraft((d) => d && { ...d, fields })}
        error={undefined}
        disabled={false}
      />
    </>
  );
}

describe("Entry editor › item issues after empty items are left out", () => {
  it("maps the server's item index back onto the draft", async () => {
    serve(groups({ entry_hall0001: [card("entry_hall0001", "Main hall")] }));
    const entry = {
      ...ENTRY,
      fields: { speakers: [{ name: "Ada", role: "Host" }, {}, { name: "Grace" }] },
    } as unknown as ContentEntry;
    // What was sent was [Ada, Grace]: the server names Grace as item 1.
    const error = new ApiRequestError(422, {
      error: "required_field",
      message: "needed",
      details: {
        issues: [{ path: "fields/speakers/1/role", code: "required_field", message: "needed" }],
      },
    });
    render(wrap(<Harness entry={entry} error={error} />));
    const grace = await screen.findByRole("group", { name: "Item 3: Grace" });
    expect(
      within(grace).getByText("Needed to publish. Add a value, or keep the entry as a draft."),
    ).toBeInTheDocument();
    const empty = screen.getByRole("group", { name: "Item 2" });
    expect(empty).not.toHaveAttribute("aria-invalid");
  });
});

describe("Entry editor › repeater undo (review fixes)", () => {
  it("keeps every edit made after the removal", async () => {
    serve(groups({ entry_hall0001: [card("entry_hall0001", "Main hall")] }));
    const onDraft = vi.fn();
    render(wrap(<EditorHarness entry={ENTRY} onDraft={onDraft} />));
    const item = await screen.findByRole("group", { name: "Item 1: Ada" });
    fireEvent.click(within(item).getByRole("button", { name: "Actions for item 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Retitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(onDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: "Renamed",
          fields: { venue: "entry_hall0001", speakers: [{ name: "Ada", role: "Host" }] },
        }),
      ),
    );
  });

  it("an undo from another entry changes nothing, and its toast closes", async () => {
    serve(groups({ entry_hall0001: [card("entry_hall0001", "Main hall")] }));
    const onDraft = vi.fn();
    const other = { ...ENTRY, id: "entry_event002", title: "Other", fields: {} } as ContentEntry;
    const { rerender } = render(wrap(<EditorHarness entry={ENTRY} onDraft={onDraft} />));
    const item = await screen.findByRole("group", { name: "Item 1: Ada" });
    fireEvent.click(within(item).getByRole("button", { name: "Actions for item 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await screen.findByRole("button", { name: "Undo" });
    rerender(wrap(<EditorHarness entry={other} onDraft={onDraft} />));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).toBeNull());
    expect(onDraft).toHaveBeenLastCalledWith(other);
  });
});

describe("Entry editor › reference fields when the targets can't be read", () => {
  it("says so with a retry, instead of loading forever", async () => {
    let fail = true;
    serve(
      on("GET", "/api/sites/site_1/entries/groups", () =>
        fail
          ? { status: 500, body: { error: "internal", message: "boom" } }
          : {
              status: 200,
              body: { groups: { entry_hall0001: [card("entry_hall0001", "Main hall")] } },
            },
      ),
    );
    render(wrap(<Harness />));
    const venue = await screen.findByRole("group", { name: "Venue" });
    expect(
      await within(venue).findByText(
        "The chosen entries couldn't be loaded.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(venue).getByRole("button", { name: "Try again" }));
    expect(await within(venue).findByRole("link", { name: "Main hall" })).toBeInTheDocument();
  });

  it("never sends a value that is no group id; it shows as Not found", async () => {
    const fetch = serve(groups({ entry_hall0001: [card("entry_hall0001", "Main hall")] }));
    render(
      wrap(
        <Harness entry={{ ...ENTRY, fields: { venue: "Main hall, Istanbul" } } as ContentEntry} />,
      ),
    );
    const venue = await screen.findByRole("group", { name: "Venue" });
    expect(await within(venue).findByText("Not found")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/entries/groups"))).toBe(false);
  });
});

describe("Saving drops empty repeater items (RFC-0045 §1)", () => {
  it("keeps items with a value and drops a list left empty", () => {
    const entry = {
      ...ENTRY,
      fields: { speakers: [{}, { name: "Ada" }, {}], venue: "entry_hall0001", other: [{}] },
    } as unknown as ContentEntry;
    expect(withoutEmptyItems(entry, SITE).fields).toEqual({
      speakers: [{ name: "Ada" }],
      venue: "entry_hall0001",
      other: [{}],
    });
    const empty = { ...ENTRY, fields: { speakers: [{}] } } as unknown as ContentEntry;
    expect(withoutEmptyItems(empty, SITE).fields).toEqual({});
    expect(withoutEmptyItems(ENTRY, SITE)).toBe(ENTRY);
  });
});

const siteRoute = (site: Site) => on("GET", "/api/sites/site_1", { status: 200, body: site });
const referrer = (id: string, title: string) => ({
  ...card(id, title),
  collection: "events",
  field: "venue",
  shownBy: [] as unknown[],
});

describe("Entry editor › Used by", () => {
  it("lists referrers where some field can reference the collection, and pages", async () => {
    const fetch = serve(siteRoute(SITE), (url) => {
      if (!url.startsWith("/api/sites/site_1/entries/entry_hall0001/references")) return undefined;
      const second = url.includes("offset=20");
      return {
        status: 200,
        body: second
          ? { groupId: "entry_hall0001", referrers: [referrer("entry_event021", "Encore")] }
          : {
              groupId: "entry_hall0001",
              next: 20,
              referrers: [
                {
                  ...referrer("entry_event001", "Launch"),
                  shownBy: [card("entry_event0tr", "Lansman", "published", "tr")],
                },
              ],
            },
      };
    });
    const hall = {
      ...ENTRY,
      id: "entry_hall0001",
      collection: "places",
      title: "Main hall",
      fields: {},
    } as ContentEntry;
    render(wrap(<EntryUsedByCard siteId="site_1" entry={hall} />));
    const table = await screen.findByRole("table", { name: "Entries that reference this one" });
    expect(await within(table).findByRole("link", { name: "Launch" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/events/entry_event001",
    );
    expect(within(table).getByText(/· English · Venue$/)).toBeInTheDocument();
    expect(within(table).getByText("Also shown in Turkish")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await within(table).findByRole("link", { name: "Encore" })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("offset=20"))).toBe(true);
  });

  it("shows nothing for a collection no field can reference", async () => {
    const fetch = serve(siteRoute({ ...SITE, collections: { places: {} } } as unknown as Site));
    const { container } = render(
      wrap(
        <EntryUsedByCard
          siteId="site_1"
          entry={{ ...ENTRY, collection: "places", fields: {} } as ContentEntry}
        />,
      ),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
