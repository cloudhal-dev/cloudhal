/**
 * RFC-0045 §6, the strict round trip's reading side (`readStrictFields`): `null` and missing keys
 * leave values as they are, `null` sub-values in repeater items are stripped, items left empty are
 * dropped and reported, and a given value replaces the whole value.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { fieldsJsonSchema, readStrictFields } from "../src/fields/index.ts";

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
    fields: [
      { key: "person", type: "reference", labels: L("Person"), collections: ["people"] },
      { key: "talk", type: "text", labels: L("Talk") },
    ],
  },
  { key: "note", type: "text", labels: L("Note"), localized: true },
];
const G = "entry_01HZX8K3Q9P1";

describe("readStrictFields", () => {
  it("leaves out null keys: nothing to set", () => {
    expect(readStrictFields(DEFS, { venue: null, speakers: null, note: null })).toEqual({
      values: {},
      droppedItems: [],
    });
  });

  it("sets only the non-null keys of a subset", () => {
    expect(readStrictFields(DEFS, { venue: G }).values).toEqual({ venue: G });
  });

  it("strips null sub-values and drops items left empty, reporting their index", () => {
    const r = readStrictFields(DEFS, {
      speakers: [
        { person: null, talk: null },
        { person: G, talk: null },
        { person: null, talk: "Hi" },
      ],
    });
    expect(r.values).toEqual({ speakers: [{ person: G }, { talk: "Hi" }] });
    expect(r.droppedItems).toEqual([{ field: "speakers", index: 0 }]);
  });

  it("keeps what it cannot read for the checker, and reserved keys as plain data", () => {
    const input = JSON.parse('{"__proto__": {"x": 1}, "speakers": [{}], "nope": 1}');
    const r = readStrictFields(DEFS, input);
    expect(Object.getPrototypeOf(r.values)).toBe(Object.prototype);
    expect(Object.hasOwn(r.values, "__proto__")).toBe(true);
    // an item that was empty as given is the checker's "no empty item", not a strict drop
    expect(r.values.speakers).toEqual([{}]);
    expect(r.droppedItems).toEqual([]);
    expect(r.values.nope).toBe(1);
  });

  it("reads exactly what the strict schema it pairs with describes", () => {
    const strict = fieldsJsonSchema(DEFS, "en", "en", { strict: true });
    expect(strict.required).toEqual(["venue", "speakers", "note"]);
    const item = strict.properties?.speakers?.items;
    expect(item?.required).toEqual(["person", "talk"]);
    expect(item?.properties?.person?.type).toEqual(["string", "null"]);
  });
});
