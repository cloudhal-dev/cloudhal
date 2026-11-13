/** RFC-0041 §5: which typed field values a translation in the same site holds and translates. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  localizedFieldValues,
  sharedFieldIssues,
  sharedFieldKeys,
  translatableFieldValues,
  translatedItemValues,
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

describe("repeater paths (RFC-0045)", () => {
  const G = "entry_01HZX8K3Q9P1";
  const AGENDA: FieldDefinition[] = [
    {
      key: "agenda",
      type: "repeater",
      labels: label("Agenda"),
      localized: true,
      fields: [
        { key: "topic", type: "text", labels: label("Topic") },
        { key: "notes", type: "richText", labels: label("Notes") },
        { key: "host", type: "reference", labels: label("Host"), collections: ["people"] },
      ],
    },
    {
      key: "shared",
      type: "repeater",
      labels: label("Shared"),
      localized: false,
      fields: [{ key: "line", type: "text", labels: label("Line") }],
    },
  ];
  const SOURCE = {
    agenda: [{ topic: "Opening", host: G }, { host: G }, { topic: "", notes: "**Close**" }],
    shared: [{ line: "Keep" }],
  };

  it("lists a localized repeater's text by item path, never a shared one's", () => {
    expect(translatableFieldValues(AGENDA, SOURCE)).toEqual({
      "agenda/0/topic": "Opening",
      "agenda/2/notes": "**Close**",
    });
  });

  it("folds translated paths into a copy of the source's list", () => {
    const r = translatedItemValues(AGENDA, SOURCE, {
      "agenda/0/topic": "Açılış",
      "agenda/2/notes": "**Kapanış**",
    });
    expect(r.issues).toEqual([]);
    expect(r.values).toEqual({
      agenda: [{ topic: "Açılış", host: G }, { host: G }, { topic: "", notes: "**Kapanış**" }],
    });
    // the source is not touched
    expect(SOURCE.agenda[0]).toEqual({ topic: "Opening", host: G });
  });

  it("refuses paths that name no translatable item value, and shared ones as not localized", () => {
    const r = translatedItemValues(AGENDA, SOURCE, {
      "agenda/0/host": "x",
      "agenda/7/topic": "x",
      "agenda/x/topic": "x",
      "agenda/0/topic/extra": "x",
      "nope/0/topic": "x",
    });
    expect(r.issues.map((i) => i.path)).toEqual([
      "fields/agenda/0/host",
      "fields/agenda/7/topic",
      "fields/agenda/x/topic",
      "fields/agenda/0/topic/extra",
      "fields/nope/0/topic",
    ]);
    expect(sharedFieldIssues(AGENDA, { "shared/0/line": "x" }, "entry_1")).toEqual([
      {
        path: "fields/shared/0/line",
        code: "field_not_localized",
        message: "shared is not localized: set it on entry_1",
      },
    ]);
  });

  it("scans a long path in linear time", () => {
    const long = `agenda/${"9".repeat(100_000)}/topic`;
    const started = performance.now();
    expect(translatedItemValues(AGENDA, SOURCE, { [long]: "x" }).issues).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
