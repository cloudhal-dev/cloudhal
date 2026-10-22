/** RFC-0041 §1, §4, §6: definition rules beyond the schema, the caps and the plain-edit guard. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type FieldDefinition, isValid, type Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  checkFieldDefinitions,
  FIELD_LIMITS,
  FIELD_TYPES,
  fieldDefinitionChanges,
  fieldDefinitions,
  RESERVED_FIELD_KEYS,
} from "../src/fields/index.ts";
import { EVENT_FIELDS, site } from "./fields-fixture.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, "../../core-contracts/fixtures/valid/site");
const text = (key: string, extra: Partial<FieldDefinition> = {}) =>
  ({
    key,
    type: "text",
    labels: { en: { label: key } },
    localized: true,
    ...extra,
  }) as FieldDefinition;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const withFields = (fields: FieldDefinition[]) => site(fields);

describe("checkFieldDefinitions", () => {
  it("accepts the shared fixture and every valid contract fixture", async () => {
    expect(checkFieldDefinitions(site())).toEqual([]);
    for (const name of await readdir(FIXTURES)) {
      const data = JSON.parse(await readFile(path.join(FIXTURES, name), "utf8")) as Site;
      expect(isValid("site", data), name).toBe(true);
      expect(checkFieldDefinitions(data), name).toEqual([]);
    }
  });

  it("refuses every reserved key: entry properties, view names, prototype names", () => {
    for (const key of [
      "title",
      "coverImage",
      "corrections",
      "url",
      "href",
      "site",
      "constructor",
      "toString",
      "hasOwnProperty",
    ]) {
      const issues = checkFieldDefinitions(withFields([text(key)]));
      expect(issues, key).toEqual([
        expect.objectContaining({
          path: "collections/events/fields/0/key",
          code: "field_key_reserved",
        }),
      ]);
    }
    expect(RESERVED_FIELD_KEYS.size).toBe(32);
  });

  it("reserves every ContentEntry property of the contract", async () => {
    const schema = JSON.parse(
      await readFile(
        path.resolve(here, "../../core-contracts/schemas/content-entry.schema.json"),
        "utf8",
      ),
    ) as { properties: Record<string, unknown> };
    const camel = Object.keys(schema.properties).filter((k) => /^[a-z][A-Za-z0-9]*$/.test(k));
    for (const key of camel)
      if (key !== "schemaVersion") expect(RESERVED_FIELD_KEYS.has(key), key).toBe(true);
  });

  it("refuses duplicate keys and option values", () => {
    expect(codes(checkFieldDefinitions(withFields([text("venue"), text("venue")])))).toEqual([
      "field_key_duplicate",
    ]);
    const select: FieldDefinition = {
      key: "format",
      type: "select",
      labels: { en: { label: "Format" } },
      localized: false,
      options: [
        { value: "talk", labels: { en: "Talk" } },
        { value: "talk", labels: { en: "Talk again" } },
      ],
    };
    expect(checkFieldDefinitions(withFields([select]))).toEqual([
      expect.objectContaining({
        path: "collections/events/fields/0/options/1/value",
        code: "field_option_duplicate",
      }),
    ]);
  });

  it("refuses minimum above maximum, allows equal bounds", () => {
    const num = (minimum: number, maximum: number): FieldDefinition => ({
      key: "price",
      type: "number",
      labels: { en: { label: "Price" } },
      localized: false,
      minimum,
      maximum,
    });
    expect(codes(checkFieldDefinitions(withFields([num(5.5, 1.5)])))).toEqual(["field_bounds"]);
    expect(checkFieldDefinitions(withFields([num(2.5, 2.5)]))).toEqual([]);
  });

  it("caps fields per collection and per site", () => {
    const many = (n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => text(`${prefix}${i}`));
    expect(codes(checkFieldDefinitions(withFields(many(31, "f"))))).toEqual(["too_many_fields"]);
    const collections = Object.fromEntries(
      Array.from({ length: 7 }, (_, c) => [`c${c}`, { fields: many(29, "f") }]),
    ) as Site["collections"];
    const issues = checkFieldDefinitions({ collections });
    expect(issues).toEqual([
      expect.objectContaining({ path: "collections", code: "too_many_fields" }),
    ]);
    expect(issues[0]?.message).toContain("203");
    const fits = Object.fromEntries(
      Array.from({ length: 4 }, (_, c) => [`c${c}`, { fields: many(30, "f") }]),
    ) as Site["collections"];
    expect(checkFieldDefinitions({ collections: fits })).toEqual([]);
  });

  it("caps the collections setting at 256 KB", () => {
    const labels = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `l${i}`,
        { label: "x".repeat(100), help: "y".repeat(300) },
      ]),
    );
    const heavy = (key: string) => ({ ...text(key), labels }) as FieldDefinition;
    const collections = Object.fromEntries(
      Array.from({ length: 7 }, (_, c) => [
        `c${c}`,
        { fields: Array.from({ length: 28 }, (_, i) => heavy(`f${i}`)) },
      ]),
    ) as Site["collections"];
    expect(codes(checkFieldDefinitions({ collections }))).toEqual(["too_large"]);
    expect(FIELD_LIMITS.collectionsBytes).toBe(262_144);
  });

  it("reads a collection's definitions", () => {
    expect(fieldDefinitions(site(), "events")).toBe(EVENT_FIELDS);
    expect(fieldDefinitions(site(), "posts")).toEqual([]);
    expect(fieldDefinitions({}, "events")).toEqual([]);
    expect(FIELD_TYPES).toHaveLength(9);
  });
});

describe("the plain-edit guard (§6)", () => {
  const before = withFields([
    text("venue"),
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
  ]);
  const fields = (b: typeof before) => b.collections?.events?.fields ?? [];

  it("lets free edits through: add, reorder, labels, options added, toggles, bounds", () => {
    const [venue, format] = fields(before) as [
      FieldDefinition,
      FieldDefinition & { type: "select" },
    ];
    const after = withFields([
      {
        ...format,
        labels: { en: { label: "Kind" } },
        options: [...format.options, { value: "panel", labels: { en: "Panel" } }],
      },
      {
        ...venue,
        maxLength: 10,
        multiline: true,
        searchable: true,
        requiredToPublish: true,
      } as FieldDefinition,
      text("room"),
    ]);
    expect(checkFieldDefinitions(after, before)).toEqual([]);
    expect(fieldDefinitionChanges(before, after)).toEqual([]);
  });

  it("refuses type, localization, multiple and migration-marker changes", () => {
    const [venue, format] = fields(before) as [
      FieldDefinition,
      FieldDefinition & { type: "select" },
    ];
    const after = withFields([
      { ...venue, type: "richText", localized: false } as FieldDefinition,
      { ...format, multiple: true, migration: { id: "snap_01HZX8K3Q9MG" } },
    ]);
    const issues = checkFieldDefinitions(after, before);
    expect(codes(issues)).toEqual(Array(4).fill("field_change_needs_operation"));
    expect(issues.map((i) => i.message).join(" ")).toMatch(
      /change_field_type.*set_field_localized/,
    );
    expect(fieldDefinitionChanges(before, after).map((c) => c.change)).toEqual([
      "type",
      "localized",
      "migration",
      "multiple",
    ]);
  });

  it("lists removals and removed options for the store to count, never as a rename", () => {
    const [, format] = fields(before) as [FieldDefinition, FieldDefinition & { type: "select" }];
    const after = withFields([text("place"), { ...format, options: [format.options[0] as never] }]);
    expect(checkFieldDefinitions(after, before)).toEqual([]);
    expect(fieldDefinitionChanges(before, after)).toEqual([
      { collection: "events", key: "venue", change: "removed" },
      { collection: "events", key: "format", change: "optionsRemoved", options: ["workshop"] },
    ]);
    expect(fieldDefinitionChanges(before, { collections: {} })).toEqual([
      { collection: "events", key: "venue", change: "removed" },
      { collection: "events", key: "format", change: "removed" },
    ]);
  });

  it("treats a marker on a new field as an operation's", () => {
    const after = withFields([
      ...fields(before),
      text("speaker", { migration: { id: "snap_01HZX8K3Q9MG", fromKey: "venue" } }),
    ]);
    expect(codes(checkFieldDefinitions(after, before))).toEqual(["field_change_needs_operation"]);
  });
});
