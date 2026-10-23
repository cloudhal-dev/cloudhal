/**
 * RFC-0042 §4: the shared listing evaluator — operators per field type, values read by the field's
 * type, `now` as the only relative value, list fields only, missing values sorting last.
 */
import type { CollectionSettings, FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  canOrderBy,
  checkFieldQuery,
  compareByField,
  FIELD_QUERY_OPS,
  type FieldQuery,
  matchesFieldQuery,
  type ParsedFieldQuery,
  parseFieldQuery,
} from "../src/fields/query.ts";
import { type ResolvedFields, resolveFields } from "../src/fields/resolve.ts";
import { FIELD_TYPES } from "../src/fields/types.ts";

const L = { en: { label: "x" } };
const DEFS: FieldDefinition[] = [
  { key: "price", type: "number", labels: L, localized: false },
  { key: "day", type: "date", labels: L, localized: false },
  { key: "startsAt", type: "datetime", labels: L, localized: false },
  { key: "online", type: "boolean", labels: L, localized: false },
  {
    key: "status",
    type: "select",
    labels: L,
    localized: false,
    options: [
      { value: "scheduled", labels: { en: "Scheduled" } },
      { value: "cancelled", labels: { en: "Cancelled" } },
    ],
  },
  {
    key: "tags",
    type: "select",
    labels: L,
    localized: false,
    multiple: true,
    options: [
      { value: "music", labels: { en: "Music" } },
      { value: "talk", labels: { en: "Talk" } },
      { value: "food", labels: { en: "Food" } },
    ],
  },
  { key: "venue", type: "text", labels: L, localized: true },
  { key: "link", type: "url", labels: L, localized: false },
  { key: "notes", type: "richText", labels: L, localized: false },
  { key: "poster", type: "image", labels: L, localized: false },
  { key: "hidden", type: "number", labels: L, localized: false },
];
const ALL = DEFS.map((d) => d.key).filter((k) => k !== "hidden");

/** A site whose `events` collection lists `listFields` (the cap of 4 is the schema's, not ours). */
const site = (listFields: string[] = ALL, timeZone = "Europe/Istanbul") => ({
  timeZone,
  collections: { events: { fields: DEFS, listFields } as CollectionSettings },
});

const parse = (query: FieldQuery, listFields?: string[], zone?: string): ParsedFieldQuery => {
  const r = parseFieldQuery(site(listFields, zone), "events", query);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.query;
};
const resolved = (values: Record<string, unknown>): ResolvedFields =>
  resolveFields(site(), { id: "entry_01HZX8K3Q9AA", collection: "events", fields: values });
const NOW = Date.parse("2026-11-05T21:30:00Z"); // 6 November, 00:30 in Istanbul
const matches = (query: FieldQuery, values: Record<string, unknown>, now = NOW) =>
  matchesFieldQuery(resolved(values), parse(query), now);
const issues = (query: FieldQuery, listFields: string[] = ALL) =>
  checkFieldQuery(DEFS, listFields, query).map((i) => `${i.path}: ${i.message}`);

describe("the operator table (§4)", () => {
  it("covers every field type, and only number, date and datetime sort", () => {
    expect(Object.keys(FIELD_QUERY_OPS).sort()).toEqual([...FIELD_TYPES].sort());
    expect(FIELD_TYPES.filter(canOrderBy)).toEqual(["number", "date", "datetime"]);
    expect(FIELD_QUERY_OPS.boolean).toEqual(["eq"]);
    expect(FIELD_QUERY_OPS.richText).toEqual(["set", "unset"]);
  });
});

describe("checkFieldQuery: invalid_query", () => {
  it("accepts a valid query", () => {
    expect(
      issues({
        where: [
          { field: "startsAt", op: "gte", value: "now" },
          { field: "status", op: "in", values: ["scheduled"] },
          { field: "price", op: "lt", value: "-1.5" },
          { field: "poster", op: "set" },
        ],
        orderBy: { field: "day", direction: "asc" },
      }),
    ).toEqual([]);
    expect(issues({})).toEqual([]);
  });

  it("refuses fields that are unknown, unlisted or being removed", () => {
    expect(issues({ where: [{ field: "nope", op: "set" }] })).toEqual([
      'where/0/field: "nope" is not a field of this collection',
    ]);
    expect(issues({ where: [{ field: "hidden", op: "set" }] })).toEqual([
      'where/0/field: "hidden" is not one of the collection\'s list fields',
    ]);
    expect(
      checkFieldQuery(DEFS, undefined, { where: [{ field: "price", op: "set" }] }),
    ).toHaveLength(1);
    const removing = DEFS.map((d) =>
      d.key === "price" ? { ...d, migration: { id: "snap_01HZX8K3Q9AB" } } : d,
    );
    // a marker without from* means the field is being removed: readers treat it as gone
    expect(checkFieldQuery(removing, ALL, { where: [{ field: "price", op: "set" }] })).toEqual([
      expect.objectContaining({ path: "where/0/field", code: "invalid_query" }),
    ]);
  });

  it("refuses operators outside the type's set", () => {
    expect(issues({ where: [{ field: "venue", op: "lt", value: "a" }] })).toEqual([
      "where/0/op: a text field takes eq, set, unset",
    ]);
    expect(issues({ where: [{ field: "online", op: "set" }] })).toHaveLength(1);
    expect(issues({ where: [{ field: "notes", op: "eq", value: "x" }] })).toHaveLength(1);
    expect(issues({ where: [{ field: "price", op: "in", values: ["1"] }] })).toHaveLength(1);
    expect(issues({ where: [{ field: "price", op: "like" as "eq", value: "1" }] })).toHaveLength(1);
  });

  it("reads values by the field's type", () => {
    const bad = (field: string, value: string) =>
      issues({ where: [{ field, op: "eq", value }] }).length;
    expect(bad("price", "12")).toBe(0);
    expect(bad("price", "1e3")).toBe(1);
    expect(bad("price", "twelve")).toBe(1);
    expect(bad("day", "2026-11-05")).toBe(0);
    expect(bad("day", "now")).toBe(0);
    expect(bad("day", "2026-02-30")).toBe(1);
    expect(bad("day", "now+7d")).toBe(1);
    expect(bad("startsAt", "2026-11-05T19:30:00+03:00")).toBe(0);
    expect(bad("startsAt", "2026-11-05T16:30:00.5Z")).toBe(0);
    expect(bad("startsAt", "now")).toBe(0);
    expect(bad("startsAt", "2026-11-05")).toBe(1);
    expect(bad("startsAt", "2026-11-05T16:30Z")).toBe(1);
    expect(bad("startsAt", "2026-02-30T00:00:00Z")).toBe(1);
    expect(bad("online", "true")).toBe(0);
    expect(bad("online", "yes")).toBe(1);
    expect(bad("status", "scheduled")).toBe(0);
    expect(bad("status", "maybe")).toBe(1);
    expect(bad("venue", "Hall 1")).toBe(0);
  });

  it("checks value and values against the operator", () => {
    const one = (c: object) => issues({ where: [c as never] });
    expect(one({ field: "poster", op: "set", value: "x" })).toEqual([
      "where/0: set takes no value",
    ]);
    expect(one({ field: "status", op: "in", value: "scheduled" })).toHaveLength(1);
    expect(one({ field: "status", op: "in" })).toHaveLength(1);
    expect(one({ field: "status", op: "in", values: [] })).toHaveLength(1);
    expect(one({ field: "status", op: "in", values: ["scheduled", "scheduled"] })).toHaveLength(1);
    expect(one({ field: "status", op: "in", values: ["scheduled", "nope"] })).toEqual([
      "where/0/values/1: a select field compares with one of scheduled, cancelled",
    ]);
    expect(one({ field: "status", op: "eq", values: ["scheduled"] })).toHaveLength(1);
    expect(one({ field: "price", op: "eq" })).toEqual(["where/0/value: eq needs a value"]);
    expect(one({ field: "venue", op: "eq", value: "x".repeat(101) })).toHaveLength(1);
    expect(one({ field: "venue", op: "eq", value: 5 })).toHaveLength(1);
  });

  it("checks orderBy and the limits", () => {
    expect(issues({ orderBy: { field: "status", direction: "asc" } })).toEqual([
      "orderBy/field: a select field does not sort",
    ]);
    expect(issues({ orderBy: { field: "venue", direction: "asc" } })).toHaveLength(1);
    expect(issues({ orderBy: { field: "price", direction: "up" as "asc" } })).toEqual([
      "orderBy/direction: asc or desc",
    ]);
    expect(issues({ orderBy: { field: "hidden", direction: "asc" } })).toHaveLength(1);
    const five = Array.from({ length: 5 }, () => ({ field: "poster", op: "set" as const }));
    expect(issues({ where: five as never })).toEqual(["where: at most 4 conditions"]);
    expect(issues({ where: "x" as never })).toEqual(["where: a list of conditions"]);
  });

  it("parseFieldQuery reads the collection's definitions and list fields", () => {
    const r = parseFieldQuery(site(["price"]), "events", { where: [{ field: "day", op: "set" }] });
    expect(r.ok).toBe(false);
    expect(parseFieldQuery(site(), "posts", { where: [{ field: "price", op: "set" }] }).ok).toBe(
      false,
    );
    expect(parseFieldQuery({}, "events", {}).ok).toBe(true);
  });
});

describe("matchesFieldQuery", () => {
  it("number: comparisons, ne and presence", () => {
    expect(matches({ where: [{ field: "price", op: "lt", value: "10" }] }, { price: 5 })).toBe(
      true,
    );
    expect(matches({ where: [{ field: "price", op: "lt", value: "10" }] }, { price: 10 })).toBe(
      false,
    );
    expect(matches({ where: [{ field: "price", op: "lte", value: "10" }] }, { price: 10 })).toBe(
      true,
    );
    expect(matches({ where: [{ field: "price", op: "gt", value: "10" }] }, {})).toBe(false);
    expect(matches({ where: [{ field: "price", op: "gte", value: "0" }] }, { price: 0 })).toBe(
      true,
    );
    expect(matches({ where: [{ field: "price", op: "eq", value: "2.50" }] }, { price: 2.5 })).toBe(
      true,
    );
    expect(matches({ where: [{ field: "price", op: "ne", value: "2.5" }] }, { price: 2.5 })).toBe(
      false,
    );
    // ne is "not eq": entries without a value match it
    expect(matches({ where: [{ field: "price", op: "ne", value: "2.5" }] }, {})).toBe(true);
    expect(matches({ where: [{ field: "price", op: "set" }] }, { price: 0 })).toBe(true);
    expect(matches({ where: [{ field: "price", op: "unset" }] }, {})).toBe(true);
  });

  it("date: days compared as days, now is today in the site's zone", () => {
    const upcoming = { where: [{ field: "day", op: "gte", value: "now" }] } as FieldQuery;
    // 21:30 UTC on 5 November is already 6 November in Istanbul
    expect(matches(upcoming, { day: "2026-11-05" })).toBe(false);
    expect(matches(upcoming, { day: "2026-11-06" })).toBe(true);
    const utc = parse(upcoming, ALL, "UTC");
    expect(matchesFieldQuery(resolved({ day: "2026-11-05" }), utc, NOW)).toBe(true);
    expect(
      matches({ where: [{ field: "day", op: "lt", value: "2026-12-01" }] }, { day: "2026-11-30" }),
    ).toBe(true);
    expect(
      matches({ where: [{ field: "day", op: "eq", value: "now" }] }, { day: "2026-11-06" }),
    ).toBe(true);
  });

  it("datetime: compares at; now is the injected instant", () => {
    const q = { where: [{ field: "startsAt", op: "gte", value: "now" }] } as FieldQuery;
    const v = { startsAt: { at: "2026-11-05T21:30:00Z", timeZone: "UTC" } };
    expect(matches(q, v)).toBe(true);
    expect(matches(q, v, NOW + 1)).toBe(false);
    const offset = {
      where: [{ field: "startsAt", op: "eq", value: "2026-11-06T00:30:00+03:00" }],
    } as FieldQuery;
    expect(matches(offset, v)).toBe(true);
    expect(matches(q, {})).toBe(false);
  });

  it("boolean: eq only, absent reads false", () => {
    const q = (value: string) => ({ where: [{ field: "online", op: "eq", value }] }) as FieldQuery;
    expect(matches(q("true"), { online: true })).toBe(true);
    expect(matches(q("false"), { online: true })).toBe(false);
    expect(matches(q("false"), {})).toBe(true);
    expect(matches(q("true"), {})).toBe(false);
  });

  it("select: single and multiple (contains, contains any)", () => {
    const status = (op: "eq" | "ne", value: string) =>
      ({ where: [{ field: "status", op, value }] }) as FieldQuery;
    expect(matches(status("eq", "scheduled"), { status: "scheduled" })).toBe(true);
    expect(matches(status("ne", "cancelled"), { status: "scheduled" })).toBe(true);
    expect(matches(status("ne", "cancelled"), {})).toBe(true);
    const inQ = {
      where: [{ field: "status", op: "in", values: ["scheduled", "cancelled"] }],
    } as unknown as FieldQuery;
    expect(matches(inQ, { status: "cancelled" })).toBe(true);
    expect(matches(inQ, {})).toBe(false);
    const tags = (op: "eq" | "ne", value: string) =>
      ({ where: [{ field: "tags", op, value }] }) as FieldQuery;
    expect(matches(tags("eq", "talk"), { tags: ["music", "talk"] })).toBe(true);
    expect(matches(tags("eq", "food"), { tags: ["music", "talk"] })).toBe(false);
    expect(matches(tags("ne", "food"), { tags: ["music"] })).toBe(true);
    const any = { where: [{ field: "tags", op: "in", values: ["food", "talk"] }] } as FieldQuery;
    expect(matches(any, { tags: ["talk"] })).toBe(true);
    expect(matches(any, { tags: ["music"] })).toBe(false);
    expect(matches({ where: [{ field: "tags", op: "unset" }] }, { tags: [] })).toBe(true);
  });

  it("text, url, rich text and image", () => {
    expect(
      matches({ where: [{ field: "venue", op: "eq", value: "Hall" }] }, { venue: "Hall" }),
    ).toBe(true);
    expect(
      matches({ where: [{ field: "venue", op: "eq", value: "Hall" }] }, { venue: "hall" }),
    ).toBe(false);
    expect(matches({ where: [{ field: "link", op: "eq", value: "/x" }] }, { link: "/x" })).toBe(
      true,
    );
    expect(matches({ where: [{ field: "notes", op: "set" }] }, { notes: "Hi" })).toBe(true);
    expect(matches({ where: [{ field: "venue", op: "unset" }] }, { venue: "  " })).toBe(true);
    expect(
      matches({ where: [{ field: "poster", op: "set" }] }, { poster: "asset_01HZX8K3Q9PO" }),
    ).toBe(true);
  });

  it("ANDs conditions and reads a translation's non-localized values from the original", () => {
    const q = parse({
      where: [
        { field: "price", op: "lt", value: "10" },
        { field: "status", op: "eq", value: "scheduled" },
      ],
    });
    expect(matchesFieldQuery(resolved({ price: 5, status: "scheduled" }), q, NOW)).toBe(true);
    expect(matchesFieldQuery(resolved({ price: 5, status: "cancelled" }), q, NOW)).toBe(false);
    const translation = resolveFields(
      site(),
      {
        id: "entry_01HZX8K3Q9TR",
        collection: "events",
        fields: { price: 99 },
        translation: { group: "entry_01HZX8K3Q9AA", method: "human" as const },
      },
      { id: "entry_01HZX8K3Q9AA", fields: { price: 5, status: "scheduled" } },
    );
    expect(matchesFieldQuery(translation, q, NOW)).toBe(true);
    expect(matchesFieldQuery(resolved({}), parse({}), NOW)).toBe(true);
  });
});

describe("compareByField", () => {
  const sort = (query: FieldQuery, rows: Record<string, unknown>[]) => {
    const parsed = parse(query);
    return rows
      .map((values, i) => ({ i, r: resolved(values) }))
      .sort((a, b) => compareByField(a.r, b.r, parsed) || a.i - b.i)
      .map(({ i }) => i);
  };
  const rows = [{ price: 3 }, {}, { price: 1 }, { price: 2 }, { price: 1 }];

  it("orders numbers, values missing last in both directions, ties left to the caller", () => {
    expect(sort({ orderBy: { field: "price", direction: "asc" } }, rows)).toEqual([2, 4, 3, 0, 1]);
    expect(sort({ orderBy: { field: "price", direction: "desc" } }, rows)).toEqual([0, 3, 2, 4, 1]);
  });

  it("orders dates and datetimes by instant", () => {
    const days = [{ day: "2026-12-01" }, { day: "2026-01-15" }, {}];
    expect(sort({ orderBy: { field: "day", direction: "asc" } }, days)).toEqual([1, 0, 2]);
    const times = [
      { startsAt: { at: "2026-11-05T18:00:00Z", timeZone: "UTC" } },
      { startsAt: { at: "2026-11-05T17:00:00Z", timeZone: "Europe/Istanbul" } },
    ];
    expect(sort({ orderBy: { field: "startsAt", direction: "desc" } }, times)).toEqual([0, 1]);
  });

  it("is 0 without orderBy", () => {
    expect(compareByField(resolved({ price: 1 }), resolved({ price: 2 }), parse({}))).toBe(0);
  });
});
