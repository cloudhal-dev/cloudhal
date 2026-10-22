/** RFC-0041 §2–§3: the value checker, type by type, and its changed-only rules. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { checkPropsSchema, createBlockRegistry, type PropsSchema } from "../src/blocks.ts";
import {
  checkFieldValues,
  FIELD_LIMITS,
  fieldsPropsSchema,
  isCalendarDay,
  isKnownTimeZone,
  valueIssues,
} from "../src/fields/index.ts";
import { EVENT_FIELDS, GOOD_VALUES } from "./fields-fixture.ts";

const def = (key: string) => EVENT_FIELDS.find((d) => d.key === key) as FieldDefinition;
const check = (key: string, value: unknown) =>
  valueIssues(def(key), value, `fields/${key}`, { blocks: createBlockRegistry() });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("compiled props schema (ADR-0030 subset)", () => {
  it("is inside the subset, every property optional", () => {
    const schema = fieldsPropsSchema(EVENT_FIELDS);
    expect(checkPropsSchema(schema)).toEqual([]);
    expect(schema.required).toBeUndefined();
    expect(Object.keys(schema.properties)).toEqual(EVENT_FIELDS.map((d) => d.key));
  });

  it("maps each type to the subset and keeps labels as title/description", () => {
    const p = fieldsPropsSchema(EVENT_FIELDS).properties;
    expect(p.venue).toMatchObject({
      type: "string",
      maxLength: 20,
      title: { en: "Venue", tr: "Mekan" },
      description: { en: "Where it happens." },
    });
    expect(p.notes).toMatchObject({ type: "string", maxLength: 5000, "x-widget": "textarea" });
    expect(p.agenda).toMatchObject({ type: "string", format: "markdown" });
    expect(p.price).toMatchObject({ type: "number", minimum: 0.5, maximum: 999.5 });
    expect(p.seats).toMatchObject({ type: "integer" });
    expect(p.online).toMatchObject({ type: "boolean" });
    expect(p.startsAt).toMatchObject({ type: "object", required: ["at", "timeZone"] });
    expect(p.ticketUrl).toMatchObject({ type: "string", format: "url", maxLength: 2048 });
    expect(p.format).toMatchObject({
      type: "array",
      maxItems: 2,
      items: { enum: ["talk", "workshop"] },
    });
    // labels without `en` become a plain string (the subset's Localized needs `en`)
    expect(p.level).toMatchObject({ title: "Seviye", enum: ["beginner", "expert"] });
    expect((p.level as { "x-labels": unknown })["x-labels"]).toEqual({
      beginner: "Başlangıç",
      expert: { tr: "Uzman", en: "Expert" },
    });
  });

  it("compiles once per definitions array", () => {
    expect(fieldsPropsSchema(EVENT_FIELDS)).toBe(fieldsPropsSchema(EVENT_FIELDS));
    const copy = [...EVENT_FIELDS];
    expect(fieldsPropsSchema(copy)).not.toBe(fieldsPropsSchema(EVENT_FIELDS));
    expect(checkPropsSchema(fieldsPropsSchema([]) as PropsSchema)).toEqual([]);
  });
});

describe("values by type", () => {
  it("accepts every good value", () => {
    for (const [key, value] of Object.entries(GOOD_VALUES))
      expect(check(key, value), key).toEqual([]);
  });

  it.each([
    ["venue", 42, "text"],
    ["venue", "x".repeat(21), "at most 20 characters"],
    ["venue", "two\nlines", "one line"],
    ["venue", "tab\there", "one line"],
    ["notes", "bell\u0007", "line breaks"],
    ["notes", "x".repeat(5001), "at most 5000"],
    ["agenda", 1, "text"],
    ["agenda", "x".repeat(50_001), "at most 50000"],
    ["agenda", '::button{label="Go"}', "button"],
    ["price", "12", "a number"],
    ["price", 0.25, "at least 0.5"],
    ["price", 1000, "at most 999.5"],
    ["price", Number.NaN, "a number"],
    ["seats", 1.5, "a whole number"],
    ["online", "yes", "true or false"],
    ["deadline", "2026-02-30", "real calendar day"],
    ["deadline", "2026-2-3", "expected form"],
    ["deadline", "2026-02-28T00:00:00Z", "expected form"],
    ["startsAt", "2026-11-05T16:30:00Z", "an object"],
    ["startsAt", { at: "2026-11-05T19:30:00+03:00", timeZone: "Europe/Istanbul" }, "expected form"],
    ["startsAt", { at: "2026-11-05T16:30Z", timeZone: "Europe/Istanbul" }, "expected form"],
    ["startsAt", { at: "2026-02-30T16:30:00Z", timeZone: "Europe/Istanbul" }, "real instant"],
    ["startsAt", { at: "2026-11-05T16:30:00Z", timeZone: "Mars/Olympus_Mons" }, "IANA"],
    ["startsAt", { at: "2026-11-05T16:30:00Z" }, "required"],
    ["startsAt", { at: "2026-11-05T16:30:00Z", timeZone: "UTC", offset: 3 }, "not a prop"],
    ["ticketUrl", "javascript:alert(1)", "safe link"],
    ["ticketUrl", "data:text/html,x", "safe link"],
    ["ticketUrl", "//evil.example", "safe link"],
    ["ticketUrl", "asset:asset_01HZX8K3Q9PO", "not an asset"],
    ["ticketUrl", `https://example.com/${"x".repeat(2048)}`, "at most 2048"],
    ["poster", "asset:asset_01HZX8K3Q9PO", "expected form"],
    ["poster", "https://example.com/a.png", "expected form"],
    ["format", "talk", "a list"],
    ["format", ["talk", "workshop", "talk"], "at most 2 items"],
    ["format", ["talk", "talk"], "at most once"],
    ["format", ["talk", "panel"], "one of talk, workshop"],
    ["level", "panel", "one of beginner, expert"],
    ["level", ["beginner"], "text"],
    ["venue", null, "null is never stored"],
  ])("%s refuses %j (%s)", (key, value, words) => {
    const issues = check(key, value);
    expect(issues.length, JSON.stringify(issues)).toBeGreaterThan(0);
    expect(codes(issues).every((c) => c === "invalid_value")).toBe(true);
    expect(issues.map((i) => i.message).join(" | ")).toContain(words);
    expect(issues[0]?.path.startsWith(`fields/${key}`)).toBe(true);
  });

  it("finds repeats in a multiple select of more options than repeats", () => {
    const three: FieldDefinition = {
      key: "tags2",
      type: "select",
      labels: { en: { label: "T" } },
      localized: false,
      multiple: true,
      options: ["a", "b", "c"].map((value) => ({ value, labels: { en: value } })) as [
        { value: string; labels: { en: string } },
      ],
    };
    expect(valueIssues(three, ["a", "b", "a"], "fields/tags2")[0]?.message).toContain(
      "at most once",
    );
    expect(valueIssues(three, [], "fields/tags2")).toEqual([]);
  });

  it("allows line breaks only in multiline text, and markdown directives that check out", () => {
    expect(check("notes", "a\nb")).toEqual([]);
    expect(check("agenda", ':::callout{tone="warning"}\nCareful.\n:::')).toEqual([]);
    expect(check("agenda", '::button{label="Go" href="/go"}')).toEqual([]);
    // Rich text over the props subset's 10 000-character string ceiling is still fine.
    expect(check("agenda", "x".repeat(20_000))).toEqual([]);
  });

  it("puts datetime issues at the inner path", () => {
    expect(
      check("startsAt", { at: "2026-11-05T16:30:00Z", timeZone: "Nowhere/Land" })[0]?.path,
    ).toBe("fields/startsAt/timeZone");
  });

  it("knows calendar days and zones without Temporal", () => {
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("0000-01-01")).toBe(true);
    expect(isKnownTimeZone("Europe/Istanbul")).toBe(true);
    expect(isKnownTimeZone("UTC")).toBe(true);
    expect(isKnownTimeZone("Europe/Kiev")).toBe(true);
    expect(isKnownTimeZone("Etc/GMT+3")).toBe(true);
    expect(isKnownTimeZone("Nowhere/Land")).toBe(false);
  });
});

describe("checkFieldValues", () => {
  it("passes good values, and anything in a collection without definitions", () => {
    expect(checkFieldValues(EVENT_FIELDS, { values: GOOD_VALUES })).toEqual([]);
    expect(checkFieldValues([], { values: { anything: { nested: [1, null] } } })).toEqual([]);
  });

  it("refuses new unknown keys, naming the defined ones", () => {
    const issues = checkFieldValues(EVENT_FIELDS, { values: { venue: "Hall", colour: "red" } });
    expect(issues).toEqual([
      expect.objectContaining({ path: "fields/colour", code: "unknown_field" }),
    ]);
    expect(issues[0]?.message).toContain("venue, notes, agenda");
  });

  it("keeps unknown keys already stored, refuses changing them, allows removing them", () => {
    const previous = { venue: "Hall", legacy: "kept" };
    expect(checkFieldValues(EVENT_FIELDS, { values: previous, previous })).toEqual([]);
    expect(
      codes(checkFieldValues(EVENT_FIELDS, { values: { ...previous, legacy: "new" }, previous })),
    ).toEqual(["unknown_field"]);
    expect(checkFieldValues(EVENT_FIELDS, { values: { venue: "Hall" }, previous })).toEqual([]);
  });

  it("checks only values that changed", () => {
    // a value a later, narrower definition rejects does not block unrelated edits
    const previous = { venue: "x".repeat(30), price: 5 };
    expect(checkFieldValues(EVENT_FIELDS, { values: { ...previous, price: 6 }, previous })).toEqual(
      [],
    );
    // equal by structure (key order) counts as unchanged
    const at = { at: "2026-11-05T16:30:00Z", timeZone: "Mars/Base" };
    expect(
      checkFieldValues(EVENT_FIELDS, {
        values: { startsAt: { timeZone: at.timeZone, at: at.at } },
        previous: { startsAt: at },
      }),
    ).toEqual([]);
    // but a change is checked
    expect(
      codes(
        checkFieldValues(EVENT_FIELDS, {
          values: { ...previous, venue: "y".repeat(31) },
          previous,
        }),
      ),
    ).toEqual(["invalid_value"]);
    // and without previous every key is new
    expect(codes(checkFieldValues(EVENT_FIELDS, { values: previous }))).toEqual(["invalid_value"]);
  });

  it("refuses a translation's own copy of a non-localized value unless equal", () => {
    const original = { id: "entry_01HZX8K3Q9OR", values: { price: 10, venue: "Hall" } };
    const own = checkFieldValues(EVENT_FIELDS, { values: { price: 11 }, original });
    expect(own).toEqual([
      expect.objectContaining({ path: "fields/price", code: "field_not_localized" }),
    ]);
    expect(own[0]?.message).toContain("entry_01HZX8K3Q9OR");
    expect(checkFieldValues(EVENT_FIELDS, { values: { price: 10 }, original })).toEqual([]);
    // localized fields are the translation's own
    expect(checkFieldValues(EVENT_FIELDS, { values: { venue: "Salon" }, original })).toEqual([]);
  });

  it("caps the values at 256 KB in UTF-8, with or without definitions", () => {
    const big = { blob: "ü".repeat(FIELD_LIMITS.valuesBytes / 2) };
    expect(codes(checkFieldValues([], { values: big }))).toEqual(["too_large"]);
    const fits = { blob: "u".repeat(FIELD_LIMITS.valuesBytes - 20) };
    expect(checkFieldValues([], { values: fits })).toEqual([]);
  });

  it("checks rich text directives against the given registry (built-ins by default)", () => {
    const values = { agenda: '::button{label="Go"}' };
    expect(codes(checkFieldValues(EVENT_FIELDS, { values }))).toEqual(["invalid_value"]);
    expect(checkFieldValues(EVENT_FIELDS, { values: { agenda: "::unknown-thing{a=1}" } })).toEqual(
      [],
    );
  });
});
