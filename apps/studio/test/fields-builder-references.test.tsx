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
import {
  OperationInputs,
  requestOf,
  targetProblems,
} from "../src/components/fields/OperationInputs.tsx";
import { PublishWarnings } from "../src/components/fields/PublishWarnings.tsx";
import { ApiRequestError } from "../src/lib/api/http.ts";
import { emptyForm, formOf } from "../src/lib/field-form.ts";
import { stage4Problems } from "../src/lib/field-form-stage4.ts";
import { bodyOf, on, serve, testQueryClient, wrap } from "./roles-fixtures.tsx";

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
    expect(within(notice).getByText("Unpublish or edit this entry first")).toBeInTheDocument();
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
    const notice = await screen.findByTestId("delete-references-locale");
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

// ── Review round 1 (PR #220) ──────────────────────────────────────────────────────────────────

const okCheck = (url: string, init?: RequestInit) =>
  init?.method === "DELETE" && url.includes("dryRun=1")
    ? { status: 200, body: { dryRun: true } }
    : undefined;
const referrersRoute = (referrers: unknown[]) =>
  on("GET", "/api/sites/site_1/entries/entry_hall0001/references", {
    status: 200,
    body: { groupId: "entry_hallen01", referrers },
  });
const groupsRoute = (members: unknown[]) =>
  on("GET", "/api/sites/site_1/entries/groups", {
    status: 200,
    body: { groups: { entry_hallen01: members } },
  });

describe("Review round 1 › the delete dialog", () => {
  it("does not read the editor's cached groups as its own (another shape, its own key)", async () => {
    serve(siteRoute, okCheck, referrersRoute([]), groupsRoute([]));
    const qc = testQueryClient();
    // What the editor's reference fields cache for the same group (`useGroupCards`).
    qc.setQueryData(["entry-groups", "site_1", "entry_hallen01"], {
      entry_hallen01: [card("entry_hallen01", "Main hall", "published", "en", "places")],
    });
    render(wrap(<Delete />, "en", qc));
    confirmName();
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    expect(qc.getQueryData(["entry-groups", "site_1", "entry_hallen01"])).toEqual({
      entry_hallen01: [expect.objectContaining({ id: "entry_hallen01" })],
    });
  });

  it("names a draft holder's published version as what keeps the entry", async () => {
    serve(
      siteRoute,
      (url, init) =>
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
      referrersRoute([
        {
          ...card("entry_ev1", "Launch", "draft"),
          field: "venue",
          shownBy: [card("entry_ev1tr", "Lansman", "published", "tr")],
        },
      ]),
    );
    render(wrap(<Delete />));
    const notice = await screen.findByTestId("delete-references");
    expect(
      await within(notice).findByText("Shown by its published version in Turkish"),
    ).toBeInTheDocument();
    expect(within(notice).getByText("Draft")).toBeInTheDocument();
    expect(within(notice).getByText("Unpublish or edit this entry first")).toBeInTheDocument();
  });

  it("counts only entries the referring fields allow as left", async () => {
    serve(
      siteRoute,
      okCheck,
      referrersRoute([
        { ...card("entry_ev2", "Draft talk", "draft"), field: "venue", shownBy: [] },
      ]),
      // The other language version sits in a collection `venue` doesn't allow.
      groupsRoute([
        card("entry_hallen01", "Main hall", "published", "en", "people"),
        card("entry_hall0001", "Ana salon", "published", "tr", "places"),
      ]),
    );
    render(wrap(<Delete />));
    const notice = await screen.findByTestId("delete-references");
    expect(notice).toHaveAttribute("data-drafts");
    expect(within(notice).getByText("Will show nothing for this field")).toBeInTheDocument();
  });

  it("shows the real delete's refusal in the dialog: its referrers, Delete off", async () => {
    serve(siteRoute, okCheck, referrersRoute([]), groupsRoute([]));
    const onDelete = vi.fn(async () => {
      throw new ApiRequestError(409, {
        error: "entry_referenced",
        message: "referenced",
        details: {
          group: "entry_hallen01",
          total: 1,
          referrers: [
            { id: "entry_ev9", title: "Late launch", collection: "events", field: "venue" },
          ],
        },
      });
    });
    render(
      wrap(
        <EntryDeleteDialog
          open
          onOpenChange={() => {}}
          siteId="site_1"
          entry={HALL}
          menuRefs={[]}
          isDeleting={false}
          onDelete={onDelete}
        />,
      ),
    );
    confirmName();
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    fireEvent.click(deleteButton());
    const notice = await screen.findByTestId("delete-references");
    expect(notice).toHaveAttribute("data-blocked");
    expect(await within(notice).findByRole("link", { name: "Late launch" })).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });
});

describe("Review round 1 › the builder and operations", () => {
  it("retypes a select whose labels are only in another language", () => {
    const def = {
      key: "kind",
      type: "select",
      labels: L("Kind"),
      localized: false,
      options: [{ value: "hall", labels: { tr: "Salon" } }],
    } as FieldDefinition;
    const inputs = {
      key: "kind",
      sub: "",
      type: "select" as const,
      form: formOf(def, ["en", "tr"]),
    };
    expect(targetProblems(inputs, "en")).toEqual({});
    expect(targetProblems({ ...inputs, form: { ...inputs.form, options: [] } }, "en")).toEqual({
      options: "required",
    });
  });

  it("drops conditions that don't fit a new target, and flags any left", async () => {
    serve(instance(true), registry);
    render(wrap(<Section />));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const form = await screen.findByTestId("reference-fields");
    fireEvent.click(within(form).getByRole("button", { name: "Add condition" }));
    const where = within(form).getByTestId("reference-where");
    expect(where.querySelector("[data-condition=kind]")).not.toBeNull();
    const targets = within(form).getByRole("group", { name: "Target collections" });
    fireEvent.click(within(targets).getByText("Places"));
    fireEvent.click(within(targets).getByText("People"));
    await waitFor(() => expect(where.querySelector("[data-condition]")).toBeNull());
    expect(
      stage4Problems(
        {
          ...emptyForm("reference", ["en"]),
          collections: ["people"],
          where: [{ field: "kind", op: "set" }],
        },
        "en",
        () => [],
      ),
    ).toEqual({ where: "field" });
  });

  it("keeps an unsaved item field's key editable, and the item name follows its new key", async () => {
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
    let sub = await screen.findByTestId("sub-field-form");
    fireEvent.change(within(sub).getByRole("textbox", { name: "Label (English)" }), {
      target: { value: "Role" },
    });
    fireEvent.click(screen.getByTestId("sub-field-apply"));
    await waitFor(() => expect(screen.queryByTestId("sub-field-form")).toBeNull());
    fireEvent.click(within(list).getByRole("combobox", { name: "Item name" }));
    const option = await screen.findByRole("option", { name: "Role" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(within(list).getByRole("combobox", { name: "Item name" })).toHaveTextContent("Role"),
    );
    fireEvent.click(within(list).getByRole("button", { name: "Actions for Role" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    sub = await screen.findByTestId("sub-field-form");
    const key = within(sub).getByRole("textbox", { name: "Key" });
    expect(key).toBeEnabled();
    fireEvent.change(key, { target: { value: "part" } });
    fireEvent.click(screen.getByTestId("sub-field-apply"));
    fireEvent.click(screen.getByTestId("field-apply"));
    fireEvent.click(await screen.findByTestId("save-fields"));
    await waitFor(() =>
      expect(
        bodyOf(fetch, "PUT", "/api/sites/site_1/collections/events")?.settings.fields[1],
      ).toMatchObject({
        itemLabel: "part",
        fields: [{ key: "name" }, { key: "part" }],
      }),
    );
  });

  it('keeps "Add condition" focusable at the limit (aria-disabled, not disabled)', async () => {
    serve(instance(true), registry);
    render(wrap(<Section />));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const form = await screen.findByTestId("reference-fields");
    const add = within(form).getByRole("button", { name: "Add condition" });
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    expect(
      within(form).getByTestId("reference-where").querySelectorAll("[data-condition]"),
    ).toHaveLength(4);
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).toBeEnabled();
  });
});

describe("Review round 1 › publish warnings count references", () => {
  it("says how many more references, not entries", async () => {
    const issue = (n: number) => ({
      entryId: `entry_ev${n}`,
      title: `Event ${n}`,
      collection: "events",
      locale: "en",
      path: "fields/venue",
      groupId: "entry_gone",
      reason: "missing",
    });
    serve(
      on("GET", "/api/sites/site_1/entries/reference-issues", {
        status: 200,
        body: { total: 7, issues: [1, 2, 3, 4, 5, 6, 7].map(issue) },
      }),
    );
    render(wrap(<PublishWarnings site={SITE} open onNavigate={() => {}} />));
    expect(await screen.findByText("And 2 more references.")).toBeInTheDocument();
  });
});

// ── Review round 2 (PR #220) ──────────────────────────────────────────────────────────────────

describe("Review round 2", () => {
  it("asks the store again when the dialog reopens after a refusal", async () => {
    serve(siteRoute, okCheck, referrersRoute([]), groupsRoute([]));
    const refuse = vi.fn(async () => {
      throw new ApiRequestError(409, {
        error: "entry_referenced",
        message: "referenced",
        details: { group: "entry_hallen01", total: 1, referrers: [] },
      });
    });
    const dialog = (open: boolean) => (
      <EntryDeleteDialog
        open={open}
        onOpenChange={() => {}}
        siteId="site_1"
        entry={HALL}
        menuRefs={[]}
        isDeleting={false}
        onDelete={refuse}
      />
    );
    const qc = testQueryClient();
    const { rerender } = render(wrap(dialog(true), "en", qc));
    confirmName();
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    fireEvent.click(deleteButton());
    await waitFor(() => expect(deleteButton()).toBeDisabled());
    rerender(wrap(dialog(false), "en", qc));
    rerender(wrap(dialog(true), "en", qc));
    confirmName();
    await waitFor(() => expect(deleteButton()).toBeEnabled());
  });

  it("keeps a reference's conditions when a second target is ticked and unticked", async () => {
    serve(instance(true), registry);
    render(wrap(<Section />));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Venue" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit…" }));
    const form = await screen.findByTestId("reference-fields");
    fireEvent.click(within(form).getByRole("button", { name: "Add condition" }));
    const targets = within(form).getByRole("group", { name: "Target collections" });
    fireEvent.click(within(targets).getByText("People"));
    fireEvent.click(within(targets).getByText("People"));
    await waitFor(() =>
      expect(within(form).getByRole("checkbox", { name: "People" })).not.toBeChecked(),
    );
    expect(
      within(form).getByTestId("reference-where").querySelector("[data-condition=kind]"),
    ).not.toBeNull();
  });

  it("locks the target's settings while the operation can't take input", () => {
    const def = {
      key: "kind",
      type: "text",
      labels: L("Kind"),
      localized: false,
    } as FieldDefinition;
    const inputs = {
      key: "kind",
      sub: "",
      type: "select" as const,
      form: {
        ...emptyForm("select", ["en"]),
        options: [{ value: "a", valueEdited: true, labels: { en: "A" } }],
      },
    };
    render(
      wrap(
        <OperationInputs
          t={((k: string) => k) as never}
          target={{ kind: "change_field_type", def }}
          inputs={inputs}
          setInputs={() => {}}
          keyError={undefined}
          locales={["en"]}
          defaultLocale="en"
          uiLocale="en"
          disabled
          site={SITE}
          referenceTypes
        />,
      ),
    );
    const options = screen.getByTestId("field-options");
    expect(options.closest("fieldset")).toBeDisabled();
  });

  it("decides per referring field: one loses the card, another shows nothing", async () => {
    serve(
      siteRoute,
      okCheck,
      referrersRoute([
        { ...card("entry_ev1", "Launch", "draft"), field: "venue", shownBy: [] },
        { ...card("entry_ev2", "Sponsor night", "draft"), field: "sponsor", shownBy: [] },
      ]),
      groupsRoute([
        card("entry_hallen01", "Main hall", "published", "en", "places"),
        card("entry_hall0001", "Ana salon", "published", "tr", "places"),
      ]),
    );
    render(wrap(<Delete />));
    expect(await screen.findByTestId("delete-references-locale")).toBeInTheDocument();
    const drafts = await screen.findByTestId("delete-references");
    expect(within(drafts).getByRole("link", { name: "Sponsor night" })).toBeInTheDocument();
    expect(within(drafts).queryByRole("link", { name: "Launch" })).toBeNull();
  });

  it("counts every blocking reference the store counted, and says more remain", async () => {
    serve(
      siteRoute,
      (url, init) =>
        init?.method === "DELETE" && url.includes("dryRun=1")
          ? {
              status: 409,
              body: {
                error: "entry_referenced",
                message: "referenced",
                details: {
                  group: "entry_hallen01",
                  total: 150,
                  referrers: [
                    { id: "entry_ev1", title: "Launch", collection: "events", field: "venue" },
                  ],
                },
              },
            }
          : undefined,
      on("GET", "/api/sites/site_1/entries/entry_hall0001/references", {
        status: 200,
        body: {
          groupId: "entry_hallen01",
          next: 100,
          referrers: [{ ...card("entry_ev1", "Launch", "published"), field: "venue", shownBy: [] }],
        },
      }),
    );
    render(wrap(<Delete />));
    const notice = await screen.findByTestId("delete-references");
    await waitFor(() =>
      expect(
        within(notice).getByText("Unpublish or edit these 150 entries first"),
      ).toBeInTheDocument(),
    );
    expect(within(notice).getByText("And 149 more references.")).toBeInTheDocument();
  });
});
