/** RFC-0041 §5: which typed field values a translation in the same site holds and translates. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  localizedFieldValues,
  sharedFieldIssues,
  sharedFieldKeys,
  translatableFieldValues,
} from "../src/fields/index.ts";

const label = (en: string) => ({ en: { label: en } });
const DEFS: FieldDefinition[] = [
  { key: "speaker", type: "text", labels: label("Speaker"), localized: true },
  { key: "agenda", type: "richText", labels: label("Agenda"), localized: true },
  { key: "seats", type: "number", labels: label("Seats"), localized: true },
  { key: "day", type: "date", labels: label("Day"), localized: false },
  { key: "host", type: "text", labels: label("Host"), localized: false },
];
const VALUES = { speaker: "Ada", agenda: "", seats: 120, day: "2026-11-05", host: "Hall A" };

describe("typed fields in translations", () => {
  it("keeps localized values and every value of a collection without definitions", () => {
    expect(localizedFieldValues(DEFS, VALUES)).toEqual({ speaker: "Ada", agenda: "", seats: 120 });
    expect(localizedFieldValues([], { any: 1 })).toEqual({ any: 1 });
  });

  it("translates only non-empty localized text and rich text", () => {
    expect(translatableFieldValues(DEFS, VALUES)).toEqual({ speaker: "Ada" });
    expect(sharedFieldKeys(DEFS)).toEqual(["day", "host"]);
  });

  it("refuses given values of shared fields as field_not_localized", () => {
    expect(sharedFieldIssues(DEFS, { speaker: "Ada", host: "Sala" }, "entry_1")).toEqual([
      {
        path: "fields/host",
        code: "field_not_localized",
        message: "host is not localized: set it on entry_1",
      },
    ]);
  });
});
