/**
 * RFC-0045 §5 (rollout step 6b): the fields builder's reference and repeater forms behind the
 * server's capability, sub-field operations and a stuck run's cleared finish, the delete dialog's
 * reference rules, and the publish dialog's warnings.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryDeleteDialog } from "../src/components/EntryDeleteDialog.tsx";
import { FieldsSection } from "../src/components/fields/FieldsSection.tsx";
import { requestOf } from "../src/components/fields/OperationInputs.tsx";
import { PublishWarnings } from "../src/components/fields/PublishWarnings.tsx";
import { emptyForm, formOf } from "../src/lib/field-form.ts";
import { bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const L = (label: string) => ({ en: { label } });
const VENUE: FieldDefinition = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
};
const SPEAKERS: FieldDefinition = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  fields: [{ key: "name", type: "text", labels: L("Name") }],
};
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
  localization: { fallback: "default-with-notice" },
  collections: {
    events: { fields: [VENUE, SPEAKERS] },
    places: {
      labels: { en: { singular: "Place", plural: "Places" } },
      fields: [
        {
          key: "kind",
          type: "select",
          labels: L("Kind"),
          localized: false,
          options: [{ value: "hall", labels: { en: "Hall" } }],
        },
      ],
      listFields: ["kind"],
    },
    people: { labels: { en: { singular: "Person", plural: "People" } } },
  },
  rev: 7,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as unknown as Site;

const REGISTRY = ["events", "places", "people"].map((key) => ({ key, counts: {} }));
const instance = (referenceFields: boolean) =>
  on("GET", "/api/instance", { status: 200, body: { features: { referenceFields } } });
const registry = on("GET", "/api/sites/site_1/collections", { status: 200, body: REGISTRY });
const put = (init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  return {
    status: 200,
    body: { dryRun: false, site: { ...SITE, rev: 8, collections: { events: body.settings } } },
  };
};

function Section() {
  return (
    <FieldsSection
      site={SITE}
      collection="events"
      settings={{ fields: [VENUE, SPEAKERS] }}
      readOnlyReason={undefined}
    />
  );
}

async function typeOptions() {
  fireEvent.click(await screen.findByTestId("add-field"));
  const dialog = await screen.findByTestId("field-form");
  fireEvent.click(within(dialog).getByRole("combobox", { name: "Type" }));
  return (await screen.findAllByRole("option")).map((o) => o.textContent);
}

describe("Fields builder › the capability gate", () => {
  it("offers reference and list only when the server takes them", async () => {
    serve(instance(false), registry);
    render(wrap(<Section />));
    expect(await typeOptions()).not.toContain("Reference");
    cleanup();
    serve(instance(true), registry);
    render(wrap(<Section />));
    expect(await typeOptions()).toEqual(expect.arrayContaining(["Reference", "List"]));
  });
});

describe("Fields builder › a reference", () => {
  it("edits the target collections and conditions, and saves them", async () => {
    const fetch = serve(
      instance(true),
      registry,
      on("PUT", "/api/sites/site_1/collections/events", put),
    );
    render(wrap(<Section />));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const form = await screen.findByTestId("reference-fields");
    const targets = await within(form).findByRole("group", { name: "Target collections" });
    expect(within(targets).getByRole("checkbox", { name: "Places" })).toBeChecked();
    // A saved field changes "Several" through "Change type…".
    expect(within(form).getByRole("switch", { name: "Several" })).toBeDisabled();
    fireEvent.click(within(form).getByRole("button", { name: "Add condition" }));
    expect(
      within(form).getByTestId("reference-where").querySelector("[data-condition=kind]"),
    ).not.toBeNull();
    fireEvent.click(screen.getByTestId("field-apply"));
    fireEvent.click(await screen.findByTestId("save-fields"));
    await waitFor(() =>
      expect(
        bodyOf(fetch, "PUT", "/api/sites/site_1/collections/events")?.settings.fields[0],
      ).toEqual({
        ...VENUE,
        where: [{ field: "kind", op: "eq", value: "hall" }],
      }),
    );
  });

  it("refuses a reference without a target collection", async () => {
    serve(instance(true), registry);
    render(wrap(<Section />));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const targets = await screen.findByRole("group", { name: "Target collections" });
    fireEvent.click(within(targets).getByText("Places"));
    fireEvent.click(screen.getByTestId("field-apply"));
    expect(await screen.findByText("Choose at least one collection.")).toBeInTheDocument();
  });
});

describe("Fields builder › a list (repeater)", () => {
  it("adds an item field in its own dialog, moves it, and saves the list", async () => {
    const fetch = serve(
      instance(true),
      registry,
      on("PUT", "/api/sites/site_1/collections/events", put),
    );
    render(wrap(<Section />));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Speakers" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const list = await screen.findByTestId("repeater-fields");
    fireEvent.click(within(list).getByRole("button", { name: "Add item field" }));
    const sub = await screen.findByTestId("sub-field-form");
    fireEvent.change(within(sub).getByRole("textbox", { name: "Label (English)" }), {
      target: { value: "Role" },
    });
    expect(within(sub).queryByRole("switch", { name: "A value per language" })).toBeNull();
    fireEvent.click(screen.getByTestId("sub-field-apply"));
    const rows = await within(list).findByTestId("sub-field-list");
    await waitFor(() => expect(within(rows).getByText("role")).toBeInTheDocument());
    const up = within(rows).getByRole("button", { name: "Move Role up" });
    fireEvent.click(up);
    // Role is first now: its up button is off, so focus stays on its down button.
    await waitFor(() =>
      expect(within(rows).getByRole("button", { name: "Move Role down" })).toHaveFocus(),
    );
    fireEvent.click(screen.getByTestId("field-apply"));
    fireEvent.click(await screen.findByTestId("save-fields"));
    await waitFor(() =>
      expect(
        bodyOf(fetch, "PUT", "/api/sites/site_1/collections/events")?.settings.fields[1].fields,
      ).toEqual([
        { key: "role", type: "text", labels: { en: { label: "Role" } } },
        { key: "name", type: "text", labels: L("Name") },
      ]),
    );
  });
});

describe("Field operations › sub-fields and a stuck run", () => {
  it("sends the sub-field and the new type's inputs", () => {
    const target = { kind: "rename_field" as const, def: SPEAKERS };
    const base = { type: "text" as const, form: emptyForm("text", ["en"]) };
    expect(requestOf(target, { ...base, key: "fullName", sub: "name" }, false)).toEqual({
      op: "rename_field",
      from: "speakers",
      to: "fullName",
      sub: "name",
    });
    const toRef = {
      key: "speakers",
      sub: "name",
      type: "reference" as const,
      form: { ...emptyForm("reference", ["en"]), collections: ["people"] },
    };
    expect(requestOf({ ...target, kind: "change_field_type" }, toRef, true)).toEqual({
      op: "change_field_type",
      key: "speakers",
      type: "reference",
      sub: "name",
      collections: ["people"],
      onInvalid: "clear",
    });
    const toList = {
      key: "venue",
      sub: "",
      type: "repeater" as const,
      form: formOf(SPEAKERS, ["en"]),
    };
    expect(requestOf({ kind: "change_field_type", def: VENUE }, toList, false)).toMatchObject({
      op: "change_field_type",
      type: "repeater",
      subFields: [{ key: "name", type: "text", labels: L("Name") }],
    });
  });

  it("stops on values that no longer convert, and finishes clearing them once confirmed", async () => {
    const result = (done: boolean) => ({
      operationId: "snap_1",
      dryRun: false,
      done,
      resumed: true,
      report: { op: "change_field_type", entries: 2, touched: 1, unconvertible: 0, samples: [] },
      rewritten: 0,
      skipped: [],
      unconvertible: done ? [] : [{ entryId: "entry_a", reason: "target archived" }],
    });
    const bodies: string[] = [];
    const running = {
      ...VENUE,
      migration: { id: "snap_1", fromType: "text" },
    } as unknown as FieldDefinition;
    serve(
      instance(true),
      registry,
      on("GET", "/api/sites/site_1/collections/events/fields/operations/snap_1", {
        status: 200,
        body: { state: "running", pending: 1 },
      }),
      (url, init) => {
        if (init?.method !== "POST" || !url.includes("continue=snap_1")) return undefined;
        const body = String(init.body);
        bodies.push(body);
        return { status: 200, body: result(body.includes("clear")) };
      },
    );
    render(
      wrap(
        <FieldsSection
          site={SITE}
          collection="events"
          settings={{ fields: [running, SPEAKERS] }}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    const stuck = await screen.findByTestId("field-operation-stuck");
    expect(within(stuck).getByText("1 entry no longer converts")).toBeInTheDocument();
    const primary = screen.getByTestId("field-operation-primary");
    expect(primary).toHaveTextContent("Clear and finish");
    expect(primary).toBeDisabled();
    fireEvent.click(within(stuck).getByText(/Clear this value to finish/));
    fireEvent.click(primary);
    await waitFor(() => expect(bodies.at(-1)).toBe('{"onInvalid":"clear"}'));
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });
});

const HALL = {
  schemaVersion: 1,
  id: "entry_hall0001",
  siteId: "site_1",
  collection: "places",
  slug: "main-hall",
  locale: "tr",
  status: "published",
  title: "Ana salon",
  body: { format: "markdown", value: "" },
  fields: {},
  tags: [],
  author: { kind: "human", id: "u_owner" },
  translation: { group: "entry_hallen01", method: "human" },
  rev: 2,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
} as unknown as ContentEntry;
const card = (id: string, title: string, status: string, locale = "en", collection = "events") => ({
  groupId: id,
  id,
  title,
  collection,
  status,
  locale,
});
const siteRoute = on("GET", "/api/sites/site_1", { status: 200, body: SITE });

function Delete() {
  return (
    <EntryDeleteDialog
      open
      onOpenChange={() => {}}
      siteId="site_1"
      entry={HALL}
      menuRefs={[]}
      isDeleting={false}
      onDelete={async () => {}}
    />
  );
}

const deleteButton = () => screen.getByRole("button", { name: /^Delete/ });
function confirmName() {
  fireEvent.change(screen.getByRole("textbox", { name: /Type main-hall/ }), {
    target: { value: "main-hall" },
  });
}

describe("Delete dialog › references (RFC-0045 §5)", () => {
  it("keeps Delete off while published entries show it, and says archiving doesn't help", async () => {
    serve(siteRoute, (url, init) =>
      init?.method === "DELETE" && url.includes("dryRun=1")
        ? {
            status: 409,
            body: {
              error: "entry_referenced",
              message: "referenced",
              details: {
                group: "entry_hallen01",
                total: 1,
                referrers: [
                  { id: "entry_ev1", title: "Launch", collection: "events", field: "venue" },
                ],
              },
            },
          }
        : undefined,
    );
    render(wrap(<Delete />));
    const notice = await screen.findByTestId("delete-references");
    expect(
      within(notice).getByText("Unpublish or edit this published entry first"),
    ).toBeInTheDocument();
    expect(within(notice).getByText(/Archiving it doesn't help/)).toBeInTheDocument();
    expect(within(notice).getByRole("link", { name: "Launch" })).toBeInTheDocument();
    confirmName();
    expect(deleteButton()).toBeDisabled();
  });

  it("lists drafts that will show nothing when it is the group's last entry", async () => {
    serve(
      siteRoute,
      (url, init) =>
        init?.method === "DELETE" && url.includes("dryRun=1")
          ? { status: 200, body: { dryRun: true } }
          : undefined,
      on("GET", "/api/sites/site_1/entries/entry_hall0001/references", {
        status: 200,
        body: {
          groupId: "entry_hallen01",
          referrers: [{ ...card("entry_ev2", "Draft talk", "draft"), field: "venue", shownBy: [] }],
        },
      }),
      on("GET", "/api/sites/site_1/entries/groups", {
        status: 200,
        body: {
          groups: {
            entry_hallen01: [card("entry_hall0001", "Ana salon", "published", "tr", "places")],
          },
        },
      }),
    );
    render(wrap(<Delete />));
    const notice = await screen.findByTestId("delete-references");
    expect(within(notice).getByText("1 draft names this entry")).toBeInTheDocument();
    expect(within(notice).getByText("Will show nothing for this field")).toBeInTheDocument();
    confirmName();
    await waitFor(() => expect(deleteButton()).toBeEnabled());
  });

  it("names the language that loses the card when other entries of the group stay", async () => {
    serve(
      siteRoute,
      (url, init) =>
        init?.method === "DELETE" && url.includes("dryRun=1")
          ? { status: 200, body: { dryRun: true } }
          : undefined,
      on("GET", "/api/sites/site_1/entries/entry_hall0001/references", {
        status: 200,
        body: {
          groupId: "entry_hallen01",
          referrers: [{ ...card("entry_ev1", "Launch", "published"), field: "venue", shownBy: [] }],
        },
      }),
      on("GET", "/api/sites/site_1/entries/groups", {
        status: 200,
        body: {
          groups: {
            entry_hallen01: [
              card("entry_hallen01", "Main hall", "published", "en", "places"),
              card("entry_hall0001", "Ana salon", "published", "tr", "places"),
            ],
          },
        },
      }),
    );
    render(wrap(<Delete />));
    const notice = await screen.findByTestId("delete-references");
    expect(within(notice).getByText("Turkish pages lose this card")).toBeInTheDocument();
    expect(within(notice).getByText(/show the English version instead/)).toBeInTheDocument();
  });
});

describe("Publish dialog › reference warnings", () => {
  it("lists published entries whose references will show nothing", async () => {
    serve(
      on("GET", "/api/sites/site_1/entries/reference-issues", {
        status: 200,
        body: {
          total: 1,
          issues: [
            {
              entryId: "entry_ev1",
              title: "Launch",
              collection: "events",
              locale: "en",
              path: "fields/speakers/0/name",
              groupId: "entry_gone",
              reason: "hidden",
            },
          ],
        },
      }),
    );
    render(wrap(<PublishWarnings site={SITE} open onNavigate={() => {}} />));
    const warnings = await screen.findByTestId("publish-reference-warnings");
    expect(within(warnings).getByText("1 reference will show nothing")).toBeInTheDocument();
    expect(within(warnings).getByRole("link", { name: "Launch" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/events/entry_ev1",
    );
    expect(
      within(warnings).getByText("English · Speakers: Name: the chosen entry isn't published"),
    ).toBeInTheDocument();
  });
});
