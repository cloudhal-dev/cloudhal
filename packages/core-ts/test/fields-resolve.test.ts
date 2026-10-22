/** RFC-0041 §3, §5: resolved values, `requiredToPublish`, and the JSON Schema agents receive. */
import type { ContentEntry, FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  checkRequiredToPublish,
  fieldsJsonSchema,
  JSON_SCHEMA_KEYWORDS,
  type JsonSchema,
  resolveFields,
} from "../src/fields/index.ts";
import { EVENT_FIELDS, GOOD_VALUES, site } from "./fields-fixture.ts";

const ORIGINAL_ID = "entry_01HZX8K3Q9OR";
const original = { id: ORIGINAL_ID, fields: { ...GOOD_VALUES } };
type Entry = Pick<ContentEntry, "id" | "collection" | "fields" | "status"> & {
  translation?: ContentEntry["translation"];
};
const entry = (fields: Record<string, unknown>, extra: Partial<Entry> = {}): Entry => ({
  id: "entry_01HZX8K3Q9TR",
  collection: "events",
  status: "draft",
  fields,
  ...extra,
});
const translation = (fields: Record<string, unknown>, extra: Partial<Entry> = {}) =>
  entry(fields, {
    translation: {
      group: ORIGINAL_ID,
      method: "machine",
      source: { id: ORIGINAL_ID, locale: "en", rev: 3, hash: "h".repeat(64) },
    },
    ...extra,
  });
const values = (r: ReturnType<typeof resolveFields>) =>
  Object.fromEntries(Object.entries(r).map(([k, f]) => [k, f.value]));

describe("resolveFields", () => {
  it("returns every defined field in order; {} for a collection without fields", () => {
    const r = resolveFields(site(), entry(GOOD_VALUES));
    expect(Object.keys(r)).toEqual(EVENT_FIELDS.map((d) => d.key));
    expect(values(r)).toEqual(GOOD_VALUES);
    expect(Object.values(r).every((f) => !f.fromOriginal && !f.issue)).toBe(true);
    expect(resolveFields(site(), { ...entry({ x: 1 }), collection: "posts" })).toEqual({});
    expect(resolveFields(site(), entry({})).venue).toEqual({
      def: EVENT_FIELDS[0],
      value: undefined,
      fromOriginal: false,
    });
  });

  it("a translation: own localized values, original's when missing, non-localized from the original", () => {
    const r = resolveFields(site(), translation({ venue: "Salon", price: 99 }), original);
    expect(r.venue).toMatchObject({ value: "Salon", fromOriginal: false });
    expect(r.agenda).toMatchObject({ value: GOOD_VALUES.agenda, fromOriginal: true });
    // a stale own copy of a non-localized value is ignored
    expect(r.price).toMatchObject({ value: 12.5, fromOriginal: true });
    expect(r.startsAt).toMatchObject({ value: GOOD_VALUES.startsAt, fromOriginal: true });
  });

  it("missing everywhere stays undefined, not fromOriginal", () => {
    const r = resolveFields(site(), translation({}), { id: ORIGINAL_ID, fields: {} });
    expect(r.ticketUrl).toEqual(expect.objectContaining({ value: undefined, fromOriginal: false }));
  });

  it("the original reads its own values; a wrong or missing original is not used", () => {
    const self = entry(
      { price: 1 },
      { id: ORIGINAL_ID, translation: { group: ORIGINAL_ID, method: "original" } },
    );
    expect(resolveFields(site(), self, original).price?.value).toBe(1);
    expect(
      resolveFields(site(), translation({ price: 2 }), {
        id: "entry_01HZX8K3Q9XX",
        fields: { price: 3 },
      }).price?.value,
    ).toBe(2);
    expect(resolveFields(site(), translation({ price: 2 })).price?.value).toBe(2);
  });

  it("a language edition (original in another site) owns its values", () => {
    const edition = translation({ price: 7 });
    if (edition.translation?.source) edition.translation.source.siteId = "site_01HZX8K3Q9OT";
    const r = resolveFields(site(), edition, original);
    expect(r.price).toMatchObject({ value: 7, fromOriginal: false });
    expect(r.agenda).toMatchObject({ value: undefined, fromOriginal: false });
  });

  it("a value that no longer fits resolves to undefined with an issue, never a throw", () => {
    const r = resolveFields(
      site(),
      entry({ venue: "x".repeat(50), deadline: "2026-02-30", level: 3 }),
    );
    expect(r.venue).toMatchObject({
      value: undefined,
      issue: { code: "field_value_unreadable", path: "fields/venue" },
    });
    expect(r.deadline?.issue?.message).toContain("calendar day");
    expect(r.level?.value).toBeUndefined();
  });

  it("reads through a migration marker: fromKey fallback, and unconverted values flagged", () => {
    const renamed: FieldDefinition = {
      key: "speaker",
      type: "text",
      labels: { en: { label: "Speaker" } },
      localized: true,
      migration: { id: "snap_01HZX8K3Q9MG", fromKey: "presenter" },
    };
    const s = site([renamed]);
    expect(resolveFields(s, entry({ presenter: "Ada" })).speaker?.value).toBe("Ada");
    expect(resolveFields(s, entry({ presenter: "Ada", speaker: "Grace" })).speaker?.value).toBe(
      "Grace",
    );
    const retyped: FieldDefinition = {
      key: "seats",
      type: "number",
      labels: { en: { label: "Seats" } },
      localized: false,
      migration: { id: "snap_01HZX8K3Q9MG", fromType: "text" },
    };
    const r = resolveFields(site([retyped]), entry({ seats: "120" }));
    expect(r.seats?.value).toBeUndefined();
    expect(r.seats?.issue?.message).toContain("still a text value");
    expect(resolveFields(site([retyped]), entry({ seats: 120 })).seats?.value).toBe(120);
  });
});

describe("checkRequiredToPublish", () => {
  it("drafts and archived entries pass", () => {
    expect(checkRequiredToPublish(site(), entry({}))).toEqual([]);
    expect(checkRequiredToPublish(site(), entry({}, { status: "archived" }))).toEqual([]);
  });

  it("review and published need every required field; empty strings and lists count as missing", () => {
    const issues = checkRequiredToPublish(site(), entry({ venue: "  " }, { status: "review" }));
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      ["fields/venue", "required_field"],
      ["fields/startsAt", "required_field"],
      ["fields/level", "required_field"],
    ]);
    expect(checkRequiredToPublish(site(), entry(GOOD_VALUES, { status: "published" }))).toEqual([]);
  });

  it("a value that no longer fits counts as missing", () => {
    const fields = { ...GOOD_VALUES, level: "gone" };
    expect(
      checkRequiredToPublish(site(), entry(fields, { status: "published" })).map((i) => i.path),
    ).toEqual(["fields/level"]);
  });

  it("a translation reads non-localized required values from its original", () => {
    const t = translation({ venue: "Salon" }, { status: "published" });
    expect(checkRequiredToPublish(site(), t, original)).toEqual([]);
    // localized required values fall back to the original's too
    expect(checkRequiredToPublish(site(), translation({}, { status: "review" }), original)).toEqual(
      [],
    );
    expect(checkRequiredToPublish(site(), t).map((i) => i.path)).toEqual([
      "fields/startsAt",
      "fields/level",
    ]);
  });

  it("an empty multiple select is missing", () => {
    const multi: FieldDefinition = {
      key: "format",
      type: "select",
      labels: { en: { label: "Format" } },
      localized: false,
      multiple: true,
      requiredToPublish: true,
      options: [{ value: "talk", labels: { en: "Talk" } }],
    };
    expect(
      checkRequiredToPublish(site([multi]), entry({ format: [] }, { status: "review" })),
    ).toHaveLength(1);
    expect(
      checkRequiredToPublish(site([multi]), entry({ format: ["talk"] }, { status: "review" })),
    ).toEqual([]);
  });
});

/** Every keyword in the tree, with where it sits. */
function keywords(schema: JsonSchema, at = ""): [string, string][] {
  const out: [string, string][] = Object.keys(schema).map((k) => [at, k]);
  for (const [k, child] of Object.entries(schema.properties ?? {}))
    out.push(...keywords(child, `${at}/${k}`));
  if (schema.items) out.push(...keywords(schema.items, `${at}/items`));
  return out;
}

describe("fieldsJsonSchema (strict structured output)", () => {
  const schema = fieldsJsonSchema(EVENT_FIELDS, "tr", "en");

  it("matches the golden file", async () => {
    await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot(
      "golden/fields-json-schema.snap",
    );
  });

  it("uses only keywords both OpenAI and Anthropic strict modes accept", () => {
    const used = new Set(keywords(schema).map(([, k]) => k));
    for (const k of used) expect(JSON_SCHEMA_KEYWORDS).toContain(k);
    for (const banned of [
      "minimum",
      "maximum",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "uniqueItems",
      "default",
      "$ref",
      "oneOf",
      "anyOf",
      "const",
    ])
      expect(used.has(banned), banned).toBe(false);
  });

  it("closes every object, requires nothing at the top, and only date formats", () => {
    const walk = (s: JsonSchema, top: boolean): void => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        if (top) expect(s.required).toBeUndefined();
        else expect(s.required).toEqual(Object.keys(s.properties ?? {}));
      }
      if (s.format) expect(["date", "date-time", "uri"]).toContain(s.format);
      for (const c of Object.values(s.properties ?? {})) walk(c, false);
      if (s.items) walk(s.items, false);
    };
    walk(schema, true);
    // the top object's children are fields; nested objects are datetime values only
    expect(schema.required).toBeUndefined();
  });

  it("writes limits, labels, help and localization into words", () => {
    const p = schema.properties ?? {};
    expect(p.venue?.title).toBe("Mekan");
    expect(p.venue?.description).toContain("at most 20 characters");
    expect(p.venue?.description).toContain("Needed to publish.");
    expect(p.price?.title).toBe("Price");
    expect(p.price?.description).toMatch(
      /In euros\..*At least 0\.5\. At most 999\.5\..*original only/,
    );
    expect(p.seats?.type).toBe("integer");
    expect(p.level?.title).toBe("Seviye");
    expect(p.level?.description).toContain("beginner (Başlangıç), expert (Uzman)");
    expect(p.format).toMatchObject({
      type: "array",
      items: { type: "string", enum: ["talk", "workshop"] },
    });
    expect(p.poster?.pattern).toBe("^asset_[A-Za-z0-9]{6,32}$");
    expect(p.deadline?.format).toBe("date");
    expect(p.startsAt?.properties?.at?.format).toBe("date-time");
    expect(fieldsJsonSchema([], "en")).toMatchObject({ type: "object", properties: {} });
  });
});
