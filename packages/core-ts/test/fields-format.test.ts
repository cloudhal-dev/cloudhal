/** RFC-0041 §9: `formatFieldValue`, a value as plain text in a reader's language. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { formatFieldValue } from "../src/fields/index.ts";
import { EVENT_FIELDS, GOOD_VALUES } from "./fields-fixture.ts";

const def = (key: string) => EVENT_FIELDS.find((d) => d.key === key) as FieldDefinition;
const en = { locale: "en", defaultLocale: "en" };
const fmt = (key: string, value: unknown = GOOD_VALUES[key], o: object = en) =>
  formatFieldValue(value, def(key), { ...en, ...o });

describe("formatFieldValue", () => {
  it("formats every type in English", () => {
    expect(fmt("venue")).toBe("Kadıköy Hall");
    expect(fmt("notes")).toBe("Line one\nLine two");
    expect(fmt("agenda")).toBe("Agenda\nTalks\nLunch");
    expect(fmt("price")).toBe("12.5");
    expect(fmt("seats", 12000)).toBe("12,000");
    expect(fmt("online")).toBe("No");
    expect(fmt("online", true)).toBe("Yes");
    expect(fmt("deadline")).toBe("February 28, 2026");
    expect(fmt("startsAt")).toMatch(/^November 5, 2026(,| at) 7:30\sPM GMT\+3$/);
    expect(fmt("ticketUrl")).toBe("https://example.com/tickets");
    expect(fmt("poster")).toBe("");
    expect(fmt("format")).toBe("Talk and Workshop");
    expect(fmt("level")).toBe("Başlangıç"); // no English label: any language
    expect(fmt("level", "expert")).toBe("Expert");
  });

  it("follows the reader's language: numbers, days, lists, option labels, boolean words", () => {
    const tr = { locale: "tr", words: { yes: "Evet", no: "Hayır" } };
    expect(fmt("price", 1234.5, tr)).toBe("1.234,5");
    expect(fmt("deadline", undefined, tr)).toBe("28 Şubat 2026");
    expect(fmt("format", undefined, tr)).toBe("Konuşma ve Workshop");
    expect(fmt("level", undefined, tr)).toBe("Başlangıç");
    expect(fmt("online", true, tr)).toBe("Evet");
  });

  it("shows an instant in its own zone, or the zone asked for", () => {
    expect(fmt("startsAt", undefined, { timeZone: "UTC" })).toMatch(/4:30\sPM UTC$/);
    expect(fmt("startsAt", { at: "2026-11-05T16:30:00Z", timeZone: "Nowhere/Else" })).toMatch(
      /4:30\sPM UTC$/,
    );
  });

  it("a date never shifts by a day, whatever the zone", () => {
    expect(fmt("deadline", "2026-01-01")).toBe("January 1, 2026");
  });

  it("gives an empty string for absent, unreadable and wrong-typed values", () => {
    expect(formatFieldValue(undefined, def("venue"), en)).toBe("");
    expect(fmt("venue", null)).toBe("");
    expect(fmt("venue", 3)).toBe("");
    expect(fmt("price", "12")).toBe("");
    expect(fmt("price", Number.NaN)).toBe("");
    expect(fmt("deadline", "2026-02-30")).toBe("");
    expect(fmt("startsAt", { at: "soon", timeZone: "UTC" })).toBe("");
    expect(fmt("online", "yes")).toBe("");
  });

  it("an unknown locale formats as English", () => {
    expect(fmt("price", 1234.5, { locale: "not a locale!" })).toBe("1,234.5");
  });
});
