/** RFC-0041 §7: an entry's typed fields, one Kumo control per type, translations and errors. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EntryFieldsForm,
  type EntryFieldsFormLabels,
  type EntryFieldsOriginal,
} from "../src/blocks/EntryFieldsForm.tsx";
import { fallbackText, readField, writeField } from "../src/blocks/entry-fields-model.ts";
import { wallClockOf, zonedToInstant } from "../src/blocks/zoned-time.ts";

const labels: EntryFieldsFormLabels = {
  neededToPublish: "Needed to publish",
  fromOriginal: "From the original (English)",
  openOriginal: "Open the original",
  originalValue: (v) => `The original: ${v}`,
  yes: "Yes",
  no: "No",
  noValue: "No value",
  clear: "Clear",
  originalImage: "The original's image",
  date: {
    date: "Date",
    pickDate: "Pick a date",
    chooseDate: "Choose a date",
    invalidTime: "Enter a time such as 09:30",
    calendar: {
      previousMonth: "Previous month",
      nextMonth: "Next month",
      navigation: "Months",
      day: (date) => date,
    },
  },
};

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
