/** RFC-0041 §7: an entry's typed fields, one Kumo control per type, translations and errors. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EntryFieldsForm,
  type EntryFieldsOriginal,
  type FieldReferenceSlot,
} from "../src/blocks/EntryFieldsForm.tsx";
import { fallbackText, readField, writeField } from "../src/blocks/entry-fields-model.ts";
import { wallClockOf, zonedToInstant } from "../src/blocks/zoned-time.ts";
import { formLabels } from "./field-labels.ts";

const labels = formLabels;

const DEFS: FieldDefinition[] = [
  {
    key: "venue",
    type: "text",
    labels: { en: { label: "Venue", help: "Where it happens" }, tr: { label: "Mekan" } },
    localized: true,
    requiredToPublish: true,
    maxLength: 80,
  },
  { key: "notes", type: "richText", labels: { en: { label: "Notes" } }, localized: true },
  { key: "seats", type: "number", labels: { en: { label: "Seats" } }, localized: false },
  { key: "free", type: "boolean", labels: { en: { label: "Free entry" } }, localized: false },
  { key: "day", type: "date", labels: { en: { label: "Day" } }, localized: false },
  { key: "startsAt", type: "datetime", labels: { en: { label: "Starts at" } }, localized: false },
  { key: "site", type: "url", labels: { en: { label: "Website" } }, localized: true },
  { key: "poster", type: "image", labels: { en: { label: "Poster" } }, localized: false },
  {
    key: "format",
    type: "select",
    labels: { en: { label: "Format" } },
    localized: false,
    options: [
      { value: "talk", labels: { en: "Talk", tr: "Konuşma" } },
      { value: "workshop", labels: { en: "Workshop" } },
    ],
  },
  {
    key: "tracks",
    type: "select",
    labels: { en: { label: "Tracks" } },
    localized: false,
    multiple: true,
    options: [
      { value: "web", labels: { en: "Web" } },
      { value: "ai", labels: { en: "AI" } },
    ],
  },
];

function Harness({
  initial = {},
  onChange = () => {},
  original,
  errors,
  locale = "en",
}: {
  initial?: Record<string, unknown>;
  onChange?: (v: Record<string, unknown>) => void;
  original?: EntryFieldsOriginal;
  errors?: Record<string, string>;
  locale?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <EntryFieldsForm
      definitions={DEFS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      locale={locale}
      defaultLocale="en"
      errors={errors}
      original={original}
      timeZone="Europe/Istanbul"
      zoneLabel={(z) => `zone:${z}`}
      labels={labels}
      renderImage={(slot) => (
        <button type="button" onClick={() => slot.onChange("asset_poster1")}>
          {`pick ${slot.label} ${slot.value ?? ""}`}
        </button>
      )}
    />
  );
}

const field = (key: string) => document.querySelector(`[data-field="${key}"]`) as HTMLElement;

afterEach(cleanup);

describe("EntryFieldsForm", () => {
  it("renders one control per type with labels, help and the required marker", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: /Venue/ })).toHaveAttribute("maxLength", "80");
    expect(within(field("venue")).getByText("Needed to publish")).toBeInTheDocument();
    expect(within(field("venue")).getByText("Where it happens")).toBeInTheDocument();
    expect(field("notes").querySelector("textarea")).not.toBeNull();
    expect(screen.getByRole("spinbutton", { name: "Seats" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Free entry" })).toBeInTheDocument();
    expect(field("day").querySelector("[data-datetime-field]")).not.toBeNull();
    expect(field("day").querySelector("[data-datetime-time]")).toBeNull();
    expect(field("startsAt").querySelector("[data-datetime-time]")).not.toBeNull();
    expect(within(field("startsAt")).getByText("zone:Europe/Istanbul")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pick Poster/ })).toBeInTheDocument();
    expect(within(field("tracks")).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("labels follow the Studio language, then the site's default", () => {
    render(<Harness locale="tr" />);
    expect(screen.getByRole("textbox", { name: /Mekan/ })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Seats" })).toBeInTheDocument();
  });

  it("writes typed values and removes emptied ones", async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ venue: "Hall A" }} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Venue/ }), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({});
    fireEvent.change(screen.getByRole("spinbutton", { name: "Seats" }), {
      target: { value: "120" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ seats: 120 });
    fireEvent.click(screen.getByRole("switch", { name: "Free entry" }));
    expect(onChange).toHaveBeenLastCalledWith({ seats: 120, free: true });
    fireEvent.click(within(field("tracks")).getByText("AI"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ seats: 120, free: true, tracks: ["ai"] }),
    );
    fireEvent.click(screen.getByRole("button", { name: /pick Poster/ }));
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ poster: "asset_poster1" });
  });

  it("enters a date and time in the site's zone as { at, timeZone }", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={{ startsAt: { at: "2026-11-05T16:30:00.000Z", timeZone: "Europe/Istanbul" } }}
        onChange={onChange}
      />,
    );
    const time = field("startsAt").querySelector("[data-datetime-time]") as HTMLInputElement;
    expect(time.value).toMatch(/19:30|7:30/);
    fireEvent.change(time, { target: { value: "20:00" } });
    fireEvent.blur(time);
    expect(onChange).toHaveBeenLastCalledWith({
      startsAt: { at: "2026-11-05T17:00:00.000Z", timeZone: "Europe/Istanbul" },
    });
    fireEvent.click(within(field("startsAt")).getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("shows each field's error", () => {
    render(<Harness errors={{ venue: "Needed to publish. Add a value." }} />);
    expect(within(field("venue")).getByText("Needed to publish. Add a value.")).toBeInTheDocument();
  });

  it("on a translation: shared fields are read-only from the original, empty localized ones show it as a placeholder", () => {
    render(
      <Harness
        initial={{ venue: "" }}
        original={{
          href: "/sites/site_1/collections/events/entry_en",
          values: { venue: "Main hall", seats: 40, format: "talk", site: "https://x.test" },
        }}
      />,
    );
    const seats = screen.getByRole("spinbutton", { name: "Seats" });
    expect(seats).toBeDisabled();
    expect((seats as HTMLInputElement).value).toBe("40");
    expect(within(field("seats")).getByText(/From the original \(English\)/)).toBeInTheDocument();
    expect(within(field("seats")).getByRole("link", { name: "Open the original" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/events/entry_en",
    );
    const venue = screen.getByRole("textbox", { name: /Venue/ });
    expect(venue).not.toBeDisabled();
    expect(venue).toHaveAttribute("placeholder", "Main hall");
    expect(screen.getByRole("textbox", { name: "Website" })).toHaveAttribute(
      "placeholder",
      "https://x.test",
    );
  });

  it("shows a reference read-only without a host picker, and a repeater as its items", () => {
    const onChange = vi.fn();
    const defs: FieldDefinition[] = [
      {
        key: "host",
        type: "reference",
        labels: { en: { label: "Host" } },
        localized: false,
        collections: ["people"],
      },
      {
        key: "agenda",
        type: "repeater",
        labels: { en: { label: "Agenda" } },
        localized: false,
        fields: [{ key: "talk", type: "text", labels: { en: { label: "Talk" } } }],
      },
    ];
    render(
      <EntryFieldsForm
        definitions={defs}
        value={{ host: "entry_01HZX8K3Q9P1", agenda: [{ talk: "Hi" }] }}
        onChange={onChange}
        locale="en"
        defaultLocale="en"
        timeZone="UTC"
        zoneLabel={(z) => z}
        labels={labels}
      />,
    );
    const host = screen.getByRole("textbox", { name: "Host" });
    expect(host).toBeDisabled();
    expect(host).toHaveValue('"entry_01HZX8K3Q9P1"');
    expect(screen.getByRole("group", { name: "Item 1: Hi" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Talk" })).toHaveValue("Hi");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("entry fields model", () => {
  const rename = {
    ...DEFS[0],
    key: "place",
    migration: { id: "snap_1", fromKey: "venue" },
  } as FieldDefinition;
  it("reads through a rename's marker and drops the old key on write", () => {
    expect(readField({ venue: "Hall" }, rename)).toBe("Hall");
    expect(writeField({ venue: "Hall", x: 1 }, rename, "Room")).toEqual({ x: 1, place: "Room" });
    expect(writeField({ place: "Room" }, rename, "")).toEqual({});
  });
  it("words an original's value in the Studio language", () => {
    const ctx = { locale: "en", defaultLocale: "en", yes: "Yes", no: "No", image: "Image" };
    const format = DEFS[8] as FieldDefinition;
    expect(fallbackText(format, "talk", { ...ctx, locale: "tr" })).toBe("Konuşma");
    expect(fallbackText(DEFS[3] as FieldDefinition, undefined, ctx)).toBe("No");
    expect(fallbackText(DEFS[4] as FieldDefinition, "2026-11-05", ctx)).toBe("Nov 5, 2026");
  });
  it("converts wall-clock times in a zone and back", () => {
    const { at } = zonedToInstant({ date: "2026-11-05", time: "19:30" }, "Europe/Istanbul");
    expect(at).toBe("2026-11-05T16:30:00.000Z");
    expect(wallClockOf(at, "Europe/Istanbul")).toEqual({ date: "2026-11-05", time: "19:30" });
  });
});

const REF_DEFS: FieldDefinition[] = [
  {
    key: "venue",
    type: "reference",
    labels: { en: { label: "Venue" } },
    localized: true,
    collections: ["places"],
  },
  {
    key: "hosts",
    type: "reference",
    labels: { en: { label: "Hosts" } },
    localized: false,
    collections: ["people"],
    multiple: true,
    maxItems: 3,
  },
  {
    key: "speakers",
    type: "repeater",
    labels: { en: { label: "Speakers" } },
    localized: false,
    itemLabel: "person",
    fields: [
      {
        key: "person",
        type: "reference",
        labels: { en: { label: "Person" } },
        collections: ["people"],
      },
      { key: "talk", type: "text", labels: { en: { label: "Talk" } }, requiredToPublish: true },
    ],
  },
];
const titles: Record<string, string> = {
  entry_ada00001: "Ada Lovelace",
  entry_hall0001: "Main hall",
};
const slots: FieldReferenceSlot[] = [];
function Form(p: {
  initial: Record<string, unknown>;
  onChange?: (v: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  original?: EntryFieldsOriginal;
  onItemRemoved?: (r: { field: string; legend: string; undo: () => void }) => void;
}) {
  const [value, setValue] = useState(p.initial);
  return (
    <EntryFieldsForm
      definitions={REF_DEFS}
      value={value}
      onChange={(next) => {
        setValue(next);
        p.onChange?.(next);
      }}
      locale="en"
      defaultLocale="en"
      errors={p.errors}
      original={p.original}
      multilingual
      timeZone="UTC"
      zoneLabel={(z) => z}
      labels={labels}
      referenceTitle={(id) => titles[id]}
      onItemRemoved={p.onItemRemoved}
      renderReference={(slot) => {
        slots.push(slot);
        return (
          <div data-slot={slot.path}>
            <span>{`${slot.label}: ${slot.value.join(",")}`}</span>
            {!slot.readOnly && (
              <button
                type="button"
                onClick={() => slot.onChange([...slot.value, "entry_ada00001"])}
              >{`pick ${slot.path}`}</button>
            )}
          </div>
        );
      }}
    />
  );
}
describe("EntryFieldsForm: references and repeaters (RFC-0045 §5)", () => {
  afterEach(() => {
    slots.length = 0;
  });

  it("gives the host one slot per reference, with its path, shape and limit", () => {
    const onChange = vi.fn();
    render(<Form initial={{ hosts: ["entry_hall0001"], speakers: [{}] }} onChange={onChange} />);
    const by = (path: string) => slots.findLast((s) => s.path === path);
    expect(by("venue")).toMatchObject({ value: [], multiple: false, max: 1 });
    expect(by("hosts")).toMatchObject({ value: ["entry_hall0001"], multiple: true, max: 3 });
    expect(by("speakers/0/person")).toMatchObject({ multiple: false, max: 1 });
    fireEvent.click(screen.getByRole("button", { name: "pick venue" }));
    expect(onChange).toHaveBeenLastCalledWith({
      venue: "entry_ada00001",
      hosts: ["entry_hall0001"],
      speakers: [{}],
    });
    fireEvent.click(screen.getByRole("button", { name: "pick hosts" }));
    expect(onChange.mock.lastCall?.[0].hosts).toEqual(["entry_hall0001", "entry_ada00001"]);
    fireEvent.click(screen.getByRole("button", { name: "pick speakers/0/person" }));
    expect(onChange.mock.lastCall?.[0].speakers).toEqual([{ person: "entry_ada00001" }]);
    // The legend names the item by its label sub-field, through the host's titles.
    expect(screen.getByRole("group", { name: "Item 1: Ada Lovelace" })).toBeInTheDocument();
  });

  it("puts each problem on its control by path", () => {
    render(
      <Form
        initial={{ speakers: [{ talk: "Hi" }, {}] }}
        errors={{
          venue: "Choose an entry from Places.",
          "speakers/1/talk": "Needed to publish.",
          "speakers/0": "An item needs a value.",
        }}
      />,
    );
    expect(within(field("venue")).getByText("Choose an entry from Places.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Venue" })).toHaveAccessibleDescription(
      "Choose an entry from Places.",
    );
    const second = screen.getByRole("group", { name: "Item 2" });
    expect(within(second).getByText("Needed to publish.")).toBeInTheDocument();
    const first = screen.getByRole("group", { name: "Item 1" });
    expect(within(first).getByText("An item needs a value.")).toBeInTheDocument();
  });

  it("on a translation: a shared list is the original's, read-only, and says so", () => {
    render(
      <Form
        initial={{}}
        original={{
          href: "/e/en",
          values: { venue: "entry_hall0001", speakers: [{ person: "entry_ada00001", talk: "Hi" }] },
        }}
      />,
    );
    const speakers = field("speakers");
    expect(within(speakers).getByText(/Not translated: this list is shared/)).toBeInTheDocument();
    expect(within(speakers).getByRole("link", { name: "Open the original" })).toBeInTheDocument();
    expect(within(speakers).getByRole("textbox", { name: /Talk/ })).toBeDisabled();
    expect(within(speakers).queryByRole("button", { name: "Add item" })).toBeNull();
    // An empty localized reference words the original's targets.
    expect(within(field("venue")).getByText("The original: Main hall")).toBeInTheDocument();
    expect(slots.findLast((s) => s.path === "venue")?.fallback).toEqual(["entry_hall0001"]);
  });

  it("hands a removed item's undo to the host", async () => {
    const onItemRemoved = vi.fn();
    render(
      <Form initial={{ speakers: [{ talk: "A" }, { talk: "B" }] }} onItemRemoved={onItemRemoved} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for item 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(onItemRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ field: "speakers", legend: "Item 1" }),
    );
  });
});

const L = (label: string) => ({ en: { label } });

describe("EntryFieldsForm during a running field operation (RFC-0045 §7)", () => {
  const base = { labels: { en: { label: "Speakers" } }, localized: false } as const;
  const render2 = (defs: FieldDefinition[], value: Record<string, unknown>, onChange = vi.fn()) =>
    render(
      <EntryFieldsForm
        definitions={defs}
        value={value}
        onChange={onChange}
        locale="en"
        defaultLocale="en"
        timeZone="UTC"
        zoneLabel={(z) => z}
        labels={labels}
      />,
    );

  it("shows a sub-field rename's old key under the new one, and writes only the new key", () => {
    const onChange = vi.fn();
    render2(
      [
        {
          ...base,
          key: "speakers",
          type: "repeater",
          migration: { id: "snap_1", sub: "talk", fromKey: "title" },
          fields: [{ key: "talk", type: "text", labels: { en: { label: "Talk" } } }],
        },
      ],
      { speakers: [{ title: "Engines" }] },
      onChange,
    );
    const talk = screen.getByRole("textbox", { name: "Talk" });
    expect(talk).toHaveValue("Engines");
    expect(screen.getByRole("group", { name: "Item 1: Engines" })).toBeInTheDocument();
    fireEvent.change(talk, { target: { value: "Engines, again" } });
    expect(onChange).toHaveBeenLastCalledWith({ speakers: [{ talk: "Engines, again" }] });
  });

  it("shows a value a type change has not converted read-only, as stored", () => {
    const onChange = vi.fn();
    render2(
      [
        {
          ...base,
          key: "speakers",
          type: "repeater",
          migration: { id: "snap_1", fromType: "reference" },
          fields: [
            { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
          ],
        },
        {
          key: "hosts",
          type: "repeater",
          labels: L("Hosts"),
          localized: false,
          migration: { id: "snap_2", sub: "who", fromType: "text" },
          fields: [{ key: "who", type: "number", labels: L("Who") }],
        },
      ],
      { speakers: "entry_hall0001", hosts: [{ who: "Ada" }] },
      onChange,
    );
    const stored = screen.getByRole("textbox", { name: "Speakers" });
    expect(stored).toBeDisabled();
    expect(stored).toHaveValue('"entry_hall0001"');
    expect(within(field("speakers")).getByText(/Being changed/)).toBeInTheDocument();
    expect(within(field("hosts")).getByRole("textbox", { name: "Who" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EntryFieldsForm read-only (RFC-0045 §5)", () => {
  it("shows every repeater item open inside a disabled fieldset", () => {
    const people = [1, 2, 3, 4].map((n) => ({ talk: `Talk ${n}` }));
    render(
      <fieldset disabled>
        <EntryFieldsForm
          definitions={[
            {
              key: "speakers",
              type: "repeater",
              labels: L("Speakers"),
              localized: true,
              fields: [{ key: "talk", type: "text", labels: L("Talk") }],
            },
          ]}
          value={{ speakers: people }}
          onChange={() => {}}
          locale="en"
          defaultLocale="en"
          timeZone="UTC"
          zoneLabel={(z) => z}
          labels={labels}
          disabled
        />
      </fieldset>,
    );
    const talks = screen.getAllByRole("textbox", { name: "Talk" });
    expect(talks.map((t) => (t as HTMLInputElement).value)).toEqual(people.map((p) => p.talk));
  });
});
