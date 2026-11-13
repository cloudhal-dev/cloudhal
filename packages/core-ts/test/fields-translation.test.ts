/** RFC-0041 §5: which typed field values a translation in the same site holds and translates. */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  localizedFieldValues,
  sharedFieldIssues,
  sharedFieldKeys,
  translatableFieldValues,
  translatedItemValues,
  translationSourceValues,
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
    const r = translatedItemValues(
      AGENDA,
      { source: SOURCE },
      {
        "agenda/0/topic": "Açılış",
        "agenda/2/notes": "**Kapanış**",
      },
    );
    expect(r.issues).toEqual([]);
    expect(r.values).toEqual({
      agenda: [{ topic: "Açılış", host: G }, { host: G }, { topic: "", notes: "**Kapanış**" }],
    });
    // the source is not touched
    expect(SOURCE.agenda[0]).toEqual({ topic: "Opening", host: G });
  });

  it("refuses paths that name no translatable item value, and shared ones as not localized", () => {
    const r = translatedItemValues(
      AGENDA,
      { source: SOURCE },
      {
        "agenda/0/host": "x",
        "agenda/7/topic": "x",
        "agenda/x/topic": "x",
        "agenda/0/topic/extra": "x",
        "nope/0/topic": "x",
      },
    );
    expect(r.issues.map((i) => i.path)).toEqual([
      "fields/agenda/0/host",
      "fields/agenda/7/topic",
      "fields/agenda/x/topic",
      "fields/agenda/0/topic/extra",
    ]);
    // A key whose first part names no repeater is a plain key, as before item paths existed.
    expect(r.values["nope/0/topic"]).toBe("x");
    expect(translatedItemValues([], { source: {} }, { "og/image": "x" })).toEqual({
      values: { "og/image": "x" },
      issues: [],
    });
    expect(sharedFieldIssues([], { "og/image": "x" }, "entry_1")).toEqual([]);
    expect(sharedFieldIssues(AGENDA, { "shared/0/line": "x" }, "entry_1")).toEqual([
      {
        path: "fields/shared/0/line",
        code: "field_not_localized",
        message: "shared is not localized: set it on entry_1",
      },
    ]);
  });

  it("refuses item paths once the translation holds its own list: send it whole", () => {
    const H = "entry_01HZX8K3Q9H2";
    const existing = {
      agenda: [{ topic: "Açılış", host: H }, { topic: "Ara", host: G }, { notes: "Son" }],
    };
    const r = translatedItemValues(
      AGENDA,
      { source: SOURCE, existing },
      { "agenda/2/notes": "**Kapanış**" },
    );
    expect(r.issues.map((i) => [i.path, i.code])).toEqual([
      ["fields/agenda", "translation_shape_mismatch"],
    ]);
    expect(r.issues[0]?.message).toContain("send the whole list");
    expect(r.values).toEqual({});
    // The whole list, in the source's order, is the way to re-translate.
    const whole = [{ topic: "Açılış", host: H }, { host: G }, { notes: "**Kapanış**" }];
    expect(translatedItemValues(AGENDA, { source: SOURCE, existing }, { agenda: whole })).toEqual({
      values: { agenda: whole },
      issues: [],
    });
  });

  it("refuses a whole list of another length than the source's (translation_shape_mismatch)", () => {
    const given = translatedItemValues(
      AGENDA,
      { source: SOURCE },
      { agenda: [{ topic: "a" }], "agenda/0/topic": "x" },
    );
    expect(given.issues.map((i) => i.code)).toEqual(["translation_shape_mismatch"]);
    expect(given.values.agenda).toEqual([{ topic: "a" }]);
  });

  it("a whole list sent alone is the translation's own: stored as sent, whatever its length", () => {
    const alone = translatedItemValues(AGENDA, { source: SOURCE }, { agenda: [{ topic: "a" }] });
    expect(alone).toEqual({ values: { agenda: [{ topic: "a" }] }, issues: [] });
  });

  it("hands over the source's whole list once the translation holds its own (#218)", () => {
    // no translation yet, or one without its own list: item paths, as before
    for (const existing of [undefined, {}, { agenda: "not a list" }])
      expect(translationSourceValues(AGENDA, SOURCE, existing)).toEqual({
        fields: translatableFieldValues(AGENDA, SOURCE),
        whole: [],
      });
    // its own list: the source's list, in its order, with every sub-value, and no item paths
    const own = translationSourceValues(AGENDA, { ...SOURCE, title: "x" }, { agenda: [] });
    expect(own).toEqual({ fields: { agenda: SOURCE.agenda }, whole: ["agenda"] });
    // what it hands over, translated and sent back whole, is accepted
    const back = (own.fields.agenda as Record<string, unknown>[]).map((i) => ({ ...i }));
    expect(
      translatedItemValues(AGENDA, { source: SOURCE, existing: { agenda: [] } }, { agenda: back })
        .issues,
    ).toEqual([]);
    // a shared repeater, or a source without the list, is never handed over
    expect(translationSourceValues(AGENDA, { shared: SOURCE.shared }, SOURCE)).toEqual({
      fields: {},
      whole: [],
    });
  });

  it("scans a long path in linear time", () => {
    const long = `agenda/${"9".repeat(100_000)}/topic`;
    const started = performance.now();
    expect(translatedItemValues(AGENDA, { source: SOURCE }, { [long]: "x" }).issues).toHaveLength(
      1,
    );
    expect(performance.now() - started).toBeLessThan(200);
  });
});
