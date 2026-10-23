/**
 * RFC-0041 §7 (step 5): typed fields in Studio — the entry editor's Fields card (values saved with
 * the entry, API issues on their field, translations), the collection's fields builder (add, edit,
 * save, read-only without site:settings) and the operation dialogs (dry run, confirm, run, revert).
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryFieldsCard } from "../src/components/fields/EntryFieldsCard.tsx";
import { FieldsSection } from "../src/components/fields/FieldsSection.tsx";
import { en } from "../src/i18n/en.ts";
import { isKnownTool } from "../src/lib/activity.ts";
import { ApiRequestError } from "../src/lib/api/http.ts";
import { needsConfirmation } from "../src/lib/approvals.ts";
import { definitionOf, emptyForm, formProblems, withLabel } from "../src/lib/field-form.ts";
import {
  fieldIssues,
  fieldKeyFrom,
  issuesByField,
  keyProblem,
  moveField,
  withFields,
} from "../src/lib/fields.ts";
import { bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEFS: FieldDefinition[] = [
  {
    key: "venue",
    type: "text",
    labels: { en: { label: "Venue" } },
    localized: true,
    requiredToPublish: true,
    maxLength: 80,
  },
  { key: "seats", type: "number", labels: { en: { label: "Seats" } }, localized: false },
  {
    key: "format",
    type: "select",
    labels: { en: { label: "Format" } },
    localized: false,
    options: [
      { value: "talk", labels: { en: "Talk" } },
      { value: "workshop", labels: { en: "Workshop" } },
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
  timeZone: "Europe/Istanbul",
  collections: { events: { fields: DEFS } },
  rev: 7,
  createdAt: "2026-10-18T10:00:00Z",
  updatedAt: "2026-10-18T10:00:00Z",
} as unknown as Site;

const ENTRY = {
  schemaVersion: 1,
  id: "entry_en",
  siteId: "site_1",
  collection: "events",
  slug: "launch",
  locale: "en",
  status: "draft",
  title: "Launch",
  body: { format: "markdown", value: "" },
  fields: { venue: "Main hall", seats: 40 },
  tags: [],
  author: { kind: "human", id: "u_owner" },
  rev: 3,
  createdAt: "2026-10-18T10:00:00Z",
  updatedAt: "2026-10-18T10:00:00Z",
} as unknown as ContentEntry;

describe("fields (lib)", () => {
  it("derives keys from labels and refuses bad, reserved and taken ones", () => {
    expect(fieldKeyFrom("Starts at")).toBe("startsAt");
    expect(fieldKeyFrom("Çağrı numarası")).toBe("cagriNumarasi");
    expect(fieldKeyFrom("2 Speakers")).toBe("speakers");
    expect(keyProblem("title", [])).toBe("reserved");
    expect(keyProblem("Venue", [])).toBe("pattern");
    expect(keyProblem("venue", ["venue"])).toBe("taken");
    expect(keyProblem("startsAt", ["venue"])).toBeUndefined();
  });

  it("maps the API's issues to their field", () => {
    const error = new ApiRequestError(422, {
      error: "invalid_fields",
      message: "invalid",
      details: {
        issues: [
          { path: "fields/startsAt/at", code: "invalid_value", message: "not an instant" },
          { path: "fields/venue", code: "required_field", message: "needed" },
          { path: "fields/venue", code: "invalid_value", message: "second" },
          { path: "title", code: "x", message: "not a field" },
        ],
      },
    });
    const byField = issuesByField(fieldIssues(error));
    expect(Object.keys(byField)).toEqual(["startsAt", "venue"]);
    expect(byField.venue?.code).toBe("required_field");
    expect(fieldIssues(new Error("x"))).toEqual([]);
  });

  it("builds definitions from the form and checks it", () => {
    let form = withLabel(emptyForm("number", ["en", "tr"]), "en", "Ticket price", true);
    expect(form.key).toBe("ticketPrice");
    expect(form.localized).toBe(false);
    form = { ...form, minimum: "10", maximum: "5" };
    expect(formProblems(form, { defaultLocale: "en", taken: [], isNew: true })).toEqual({
      bounds: "order",
    });
    form = { ...form, maximum: "500", integer: true };
    expect(definitionOf(form)).toEqual({
      key: "ticketPrice",
      type: "number",
      labels: { en: { label: "Ticket price" } },
      localized: false,
      integer: true,
      minimum: 10,
      maximum: 500,
    });
    expect(emptyForm("text", ["en"]).localized).toBe(true);
    expect(moveField(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(withFields({ icon: "files", fields: [DEFS[0] as FieldDefinition] }, [])).toEqual({
      icon: "files",
    });
  });

  it("names the field tools in Studio's activity and approvals", () => {
    for (const tool of ["rename_field", "change_field_type", "set_field_localized", "remove_field"])
      expect(isKnownTool(tool)).toBe(true);
    expect(en.tools.rename_field).toBe("Rename field");
    expect(needsConfirmation("remove_field")).toBe(true);
    expect(needsConfirmation("rename_field")).toBe(false);
    expect(en.errors.api.field_change_needs_operation).toMatch(/field's menu/);
  });
});

function EditorHarness({
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

describe("Entry editor › Fields", () => {
  it("renders the collection's fields and edits values for the save", async () => {
    serve();
    const onFields = vi.fn();
    render(wrap(<EditorHarness onFields={onFields} />));
    const venue = await screen.findByRole("textbox", { name: /Venue/ });
    expect(venue).toHaveValue("Main hall");
    expect(screen.getByText("Needed to publish")).toBeInTheDocument();
    expect(screen.getByText("Up to 80 characters.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Seats" }), {
      target: { value: "120" },
    });
    expect(onFields).toHaveBeenLastCalledWith({ venue: "Main hall", seats: 120 });
  });

  it("shows the API's issues on their field, in the Studio language", async () => {
    serve();
    const error = new ApiRequestError(422, {
      error: "required_field",
      message: "fields/venue is needed",
      details: { issues: [{ path: "fields/venue", code: "required_field", message: "needed" }] },
    });
    render(wrap(<EditorHarness entry={{ ...ENTRY, fields: {} }} error={error} />));
    expect(
      await screen.findByText("Needed to publish. Add a value, or keep the entry as a draft."),
    ).toBeInTheDocument();
  });

  it("on a translation, shared fields are read-only and empty localized ones show the original", async () => {
    serve(on("GET", "/api/sites/site_1/entries/entry_en", { status: 200, body: ENTRY }));
    const translation = {
      ...ENTRY,
      id: "entry_tr",
      locale: "tr",
      fields: {},
      translation: {
        group: "entry_en",
        method: "human",
        source: { id: "entry_en", locale: "en", rev: 3, hash: "a".repeat(64) },
      },
    } as unknown as ContentEntry;
    render(wrap(<EditorHarness entry={translation} />));
    const seats = await screen.findByRole("spinbutton", { name: "Seats" });
    await waitFor(() => expect(seats).toHaveValue(40));
    expect(seats).toBeDisabled();
    expect(screen.getAllByText(/From the original \(English\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open the original" })[0]).toHaveAttribute(
      "href",
      "/sites/site_1/collections/events/entry_en",
    );
    const venue = screen.getByRole("textbox", { name: /Venue/ });
    expect(venue).toBeEnabled();
    expect(venue).toHaveAttribute("placeholder", "Main hall");
  });
});

const REPORT = {
  op: "rename_field",
  collection: "events",
  key: "venue",
  entries: 3,
  unchanged: 0,
  touched: 2,
  moved: 2,
  converted: 0,
  cleared: 0,
  removed: 0,
  unconvertible: 0,
  locales: {
    en: { touched: 1, moved: 1, converted: 0, cleared: 0, removed: 0, unconvertible: 0 },
    tr: { touched: 1, moved: 1, converted: 0, cleared: 0, removed: 0, unconvertible: 0 },
  },
  samples: [
    { entryId: "entry_en", locale: "en", kind: "moved", before: "Main hall", after: "Main hall" },
  ],
  definition: { before: DEFS[0], after: { ...DEFS[0], key: "place" } },
};

describe("Collection settings › Fields", () => {
  const put = (init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return {
      status: 200,
      body: {
        dryRun: false,
        site: { ...SITE, rev: 8, collections: { events: body.settings } },
      },
    };
  };

  it("adds a field (key from the label), reorders and saves the definitions", async () => {
    const fetch = serve(on("PUT", "/api/sites/site_1/collections/events", put));
    render(
      wrap(
        <FieldsSection
          site={SITE}
          collection="events"
          settings={{ fields: DEFS as [FieldDefinition, ...FieldDefinition[]] }}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByTestId("add-field"));
    const dialog = await screen.findByTestId("field-form");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Label (English)" }), {
      target: { value: "Starts at" },
    });
    expect(within(dialog).getByRole("textbox", { name: "Key" })).toHaveValue("startsAt");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Label (Turkish)" }), {
      target: { value: "Başlangıç" },
    });
    fireEvent.click(screen.getByTestId("field-apply"));
    expect(await screen.findByText("Not saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Seats up" }));
    fireEvent.click(screen.getByTestId("save-fields"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", "/api/sites/site_1/collections/events")).toMatchObject({
        rev: 7,
        settings: {
          fields: [
            { key: "seats" },
            { key: "venue" },
            { key: "format" },
            {
              key: "startsAt",
              type: "text",
              localized: true,
              labels: { en: { label: "Starts at" }, tr: { label: "Başlangıç" } },
            },
          ],
        },
      }),
    );
  });

  it("edits a saved field's label freely, but not its key or type", async () => {
    const fetch = serve(on("PUT", "/api/sites/site_1/collections/events", put));
    render(
      wrap(
        <FieldsSection
          site={SITE}
          collection="events"
          settings={{ fields: DEFS as [FieldDefinition, ...FieldDefinition[]] }}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const dialog = await screen.findByTestId("field-form");
    expect(within(dialog).getByRole("textbox", { name: "Key" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Label (English)" }), {
      target: { value: "Place" },
    });
    fireEvent.click(screen.getByTestId("field-apply"));
    fireEvent.click(await screen.findByTestId("save-fields"));
    await waitFor(() =>
      expect(
        bodyOf(fetch, "PUT", "/api/sites/site_1/collections/events")?.settings.fields[0],
      ).toMatchObject({ key: "venue", labels: { en: { label: "Place" } }, maxLength: 80 }),
    );
  });

  it("renames through the operation dialog: dry run report, confirm, run, revert", async () => {
    const posts: unknown[] = [];
    serve((url, init) => {
      if (
        init?.method !== "POST" ||
        !url.startsWith("/api/sites/site_1/collections/events/fields/operations")
      )
        return undefined;
      if (url.endsWith("/revert"))
        return {
          status: 200,
          body: { operationId: "snap_op", done: true, restored: 2, edited: [], skipped: [] },
        };
      const body = JSON.parse(String(init.body ?? "{}"));
      posts.push(body);
      return {
        status: 200,
        body: {
          operationId: body.dryRun ? "" : "snap_op",
          dryRun: body.dryRun === true,
          done: true,
          resumed: false,
          report: REPORT,
          rewritten: body.dryRun ? 0 : 2,
          skipped: [],
        },
      };
    });
    render(
      wrap(
        <FieldsSection
          site={SITE}
          collection="events"
          settings={{ fields: DEFS as [FieldDefinition, ...FieldDefinition[]] }}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename…" }));
    const dialog = await screen.findByTestId("field-operation");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "New key" }), {
      target: { value: "place" },
    });
    fireEvent.click(screen.getByTestId("field-operation-primary"));
    const report = await screen.findByTestId("field-operation-report");
    expect(posts[0]).toEqual({ op: "rename_field", from: "venue", to: "place", dryRun: true });
    expect(within(report).getAllByText("Entries that change").length).toBe(3);
    expect(within(report).getByText("Per language")).toBeInTheDocument();
    expect(screen.getByText(/Themes that read entry.fields.venue directly/)).toBeInTheDocument();
    expect(screen.getByTestId("field-operation-primary")).toHaveTextContent("Rename field");
    fireEvent.click(screen.getByTestId("field-operation-primary"));
    expect(await screen.findByText("2 entries changed.")).toBeInTheDocument();
    expect(posts[1]).toEqual({ op: "rename_field", from: "venue", to: "place" });
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(
      await screen.findByText("The field and 2 entries are back as they were."),
    ).toBeInTheDocument();
  });

  it("needs the opt-in before clearing values a type change cannot convert", async () => {
    serve((url, init) => {
      if (init?.method !== "POST" || !url.includes("/fields/operations")) return undefined;
      return {
        status: 200,
        body: {
          operationId: "",
          dryRun: true,
          done: true,
          resumed: false,
          report: {
            ...REPORT,
            op: "change_field_type",
            moved: 0,
            converted: 1,
            unconvertible: 1,
            samples: [],
          },
          rewritten: 0,
          skipped: [],
        },
      };
    });
    render(
      wrap(
        <FieldsSection
          site={SITE}
          collection="events"
          settings={{ fields: DEFS as [FieldDefinition, ...FieldDefinition[]] }}
          readOnlyReason={undefined}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change type…" }));
    fireEvent.click(await screen.findByTestId("field-operation-primary"));
    await screen.findByTestId("field-operation-report");
    expect(screen.getByTestId("field-operation-primary")).toBeDisabled();
    fireEvent.click(screen.getByText("Clear 1 value that can't be converted"));
    await waitFor(() => expect(screen.getByTestId("field-operation-primary")).toBeEnabled());
  });

  it("is read-only without site:settings", async () => {
    serve();
    render(
      wrap(
        <FieldsSection
          site={SITE}
          collection="events"
          settings={{ fields: DEFS as [FieldDefinition, ...FieldDefinition[]] }}
          readOnlyReason="Only Administrators change site settings."
        />,
      ),
    );
    expect(await screen.findByTestId("add-field")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actions for Venue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Seats up" })).toBeDisabled();
    expect(screen.getByTestId("save-fields")).toBeDisabled();
  });
});
