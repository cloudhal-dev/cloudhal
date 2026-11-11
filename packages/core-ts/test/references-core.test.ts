/**
 * RFC-0045 rollout step 1: the pure core of reference and repeater fields — the gate, the
 * definition rules, values, `resolveFields`, the agents' JSON Schema (open and strict),
 * `pickMember` and `referenceIssues`. Store, renderer and tool behaviour come in later steps.
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { validateProps } from "../src/blocks.ts";
import {
  checkFieldDefinitions,
  checkFieldValues,
  checkRequiredToPublish,
  FIELD_LIMITS,
  fieldPropSchema,
  fieldRefusalCode,
  fieldsJsonSchema,
  JSON_SCHEMA_KEYWORDS,
  type JsonSchema,
  pickMember,
  referenceIssues,
  resolveFields,
  strictSchemaCost,
  unsupportedFieldTypeIssues,
  valueIssues,
} from "../src/fields/index.ts";

const L = (label: string) => ({ en: { label } });
const G1 = "entry_01HZX8K3Q9P1";
const G2 = "entry_01HZX8K3Q9P2";

const VENUE = {
  key: "venue",
  type: "reference",
  labels: L("Venue"),
  localized: false,
  collections: ["places"],
} as const satisfies FieldDefinition;
const PARTNERS = {
  key: "partners",
  type: "reference",
  labels: L("Partners"),
  localized: true,
  collections: ["places", "people"],
  multiple: true,
  maxItems: 3,
} as const satisfies FieldDefinition;
const SPEAKERS = {
  key: "speakers",
  type: "repeater",
  labels: L("Speakers"),
  localized: false,
  maxItems: 4,
  fields: [
    {
      key: "person",
      type: "reference",
      labels: L("Person"),
      requiredToPublish: true,
      collections: ["people"],
    },
    {
      key: "role",
      type: "select",
      labels: L("Role"),
      options: [
        { value: "host", labels: { en: "Host" } },
        { value: "speaker", labels: { en: "Speaker" } },
        { value: "panelist", labels: { en: "Panelist" } },
      ],
    },
    { key: "talk", type: "text", labels: L("Talk"), maxLength: 200 },
    { key: "abstract", type: "richText", labels: L("Abstract") },
    { key: "day", type: "date", labels: L("Day") },
    { key: "slides", type: "url", labels: L("Slides") },
  ],
} as const satisfies FieldDefinition;
const STARTS = {
  key: "startsAt",
  type: "datetime",
  labels: L("Starts"),
  localized: false,
} as const satisfies FieldDefinition;

type Collections = NonNullable<Site["collections"]>;
const siteWith = (events: FieldDefinition[], more: Collections = {}) => ({
  defaultLocale: "en",
  collections: {
    events: { fields: events },
    places: { labels: { en: { singular: "Place", plural: "Places" } } },
    people: {
      fields: [
        {
          key: "team",
          type: "select",
          labels: L("Team"),
          localized: false,
          options: [{ value: "core", labels: { en: "Core" } }],
        },
      ],
      listFields: ["team"],
    },
    ...more,
  } as unknown as Collections,
});
const codes = (issues: readonly { code: string }[]) => issues.map((i) => i.code);
const ENABLED = { referenceTypes: true };

describe("the gate (fields_unsupported)", () => {
  it("refuses both types, and markers naming them, without a capability", () => {
    const site = siteWith([VENUE, SPEAKERS]);
    const issues = checkFieldDefinitions(site);
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      ["collections/events/fields/0/type", "fields_unsupported"],
      ["collections/events/fields/1/type", "fields_unsupported"],
    ]);
    expect(fieldRefusalCode(issues)).toBe("fields_unsupported");
    const marker = (migration: object) =>
      ({
        ...STARTS,
        type: "text",
        migration: { id: "snap_01HZX8K3Q9MG", ...migration },
      }) as FieldDefinition;
    expect(
      codes(unsupportedFieldTypeIssues(siteWith([marker({ fromType: "reference" })]))),
    ).toEqual(["fields_unsupported"]);
    expect(codes(unsupportedFieldTypeIssues(siteWith([marker({ sub: "talk" })])))).toEqual([
      "fields_unsupported",
    ]);
    expect(unsupportedFieldTypeIssues(siteWith([marker({ fromType: "date" })]))).toEqual([]);
  });

  it("wins the refusal code over other definition problems", () => {
    const issues = checkFieldDefinitions(siteWith([VENUE, { ...STARTS, key: "title" }]));
    expect(codes(issues)).toEqual(["fields_unsupported", "field_key_reserved"]);
    expect(fieldRefusalCode(issues)).toBe("fields_unsupported");
  });

  it("changes nothing for sites without the new types", () => {
    expect(checkFieldDefinitions(siteWith([STARTS]))).toEqual([]);
    expect(checkFieldDefinitions(siteWith([STARTS]), undefined, ENABLED)).toEqual([]);
  });
});

describe("definition rules (with the capability)", () => {
  const check = (events: FieldDefinition[], more?: Collections, inUse?: string[]) =>
    checkFieldDefinitions(siteWith(events, more), undefined, { ...ENABLED, inUse });

  it("accepts declared, inferred and built-in target collections only", () => {
    expect(check([VENUE, PARTNERS, SPEAKERS])).toEqual([]);
    expect(check([{ ...VENUE, collections: ["posts"] }])).toEqual([]);
    const venue = { ...VENUE, collections: ["halls"] } as FieldDefinition;
    expect(check([venue]).map((i) => [i.path, i.code])).toEqual([
      ["collections/events/fields/0/collections/0", "reference_target_unknown"],
    ]);
    expect(check([venue], {}, ["halls"])).toEqual([]);
    const sub = { ...SPEAKERS, fields: [{ ...SPEAKERS.fields[0], collections: ["crew"] }] };
    expect(check([sub as unknown as FieldDefinition]).map((i) => i.path)).toEqual([
      "collections/events/fields/0/fields/0/collections/0",
    ]);
  });

  it("checks where: one target, its list fields, no now", () => {
    const where = (w: object, collections = ["people"]) =>
      check([{ ...VENUE, collections, where: [w] } as unknown as FieldDefinition]);
    expect(where({ field: "team", op: "eq", value: "core" })).toEqual([]);
    expect(codes(where({ field: "team", op: "eq", value: "core" }, ["people", "places"]))).toEqual([
      "invalid_query",
    ]);
    expect(where({ field: "nope", op: "eq", value: "x" })[0]?.path).toBe(
      "collections/events/fields/0/where/0/field",
    );
    expect(codes(where({ field: "team", op: "eq", value: "now" }))).toContain("invalid_query");
  });

  it("refuses maxItems without multiple, bad sub-fields and a bad itemLabel", () => {
    expect(codes(check([{ ...VENUE, maxItems: 3 } as FieldDefinition]))).toEqual(["field_bounds"]);
    const subs = (fields: object[], extra: object = {}) =>
      check([{ ...SPEAKERS, fields, ...extra } as unknown as FieldDefinition]);
    const talk = SPEAKERS.fields[2];
    expect(codes(subs([talk, talk]))).toEqual(["field_key_duplicate"]);
    expect(codes(subs([{ ...talk, key: "title" }]))).toEqual(["field_key_reserved"]);
    expect(
      codes(subs([{ key: "n", type: "number", labels: L("N"), minimum: 2, maximum: 1 }])),
    ).toEqual(["field_bounds"]);
    const role = SPEAKERS.fields[1];
    expect(codes(subs([{ ...role, options: [role.options[0], role.options[0]] }]))).toEqual([
      "field_option_duplicate",
    ]);
    expect(subs([talk], { itemLabel: "talk" })).toEqual([]);
    expect(codes(subs([talk, SPEAKERS.fields[4]], { itemLabel: "day" }))).toEqual([
      "unknown_field",
    ]);
  });

  it("counts sub-fields toward the leaf and site caps", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      key: `s${i}`,
      type: "text",
      labels: L("S"),
    }));
    const repeaters = Array.from(
      { length: 10 },
      (_, i) => ({ ...SPEAKERS, key: `r${i}`, fields: ten }) as unknown as FieldDefinition,
    );
    // 10 fields + 100 sub-fields = 110 leaves
    expect(codes(check(repeaters))).toEqual(["too_many_fields"]);
    const nine = repeaters.slice(0, 9);
    expect(check(nine)).toEqual([]); // 99 leaves
    const sites: Collections = {};
    for (const c of ["a", "b"])
      sites[c] = { fields: nine as [FieldDefinition, ...FieldDefinition[]] };
    // 3 collections × 99 > 200
    expect(codes(check(nine, sites)).at(-1)).toBe("too_many_fields");
  });
});

describe("values", () => {
  it("compiles references and repeaters into the props subset", () => {
    expect(fieldPropSchema(VENUE)).toMatchObject({
      type: "string",
      pattern: "^entry_[A-Za-z0-9]{6,32}$",
    });
    expect(fieldPropSchema(PARTNERS)).toMatchObject({ type: "array", maxItems: 3 });
    const repeater = fieldPropSchema(SPEAKERS);
    expect(repeater).toMatchObject({ type: "array", maxItems: 4, items: { type: "object" } });
    expect(Object.keys((repeater as { items: { properties: object } }).items.properties)).toEqual(
      SPEAKERS.fields.map((s) => s.key),
    );
    expect(
      validateProps(
        { type: "object", properties: { v: repeater }, additionalProperties: false },
        {
          v: [{ person: G1, role: "host" }],
        },
      ),
    ).toEqual([]);
  });

  it("checks reference values", () => {
    expect(valueIssues(VENUE, G1, "fields/venue")).toEqual([]);
    expect(valueIssues(VENUE, "asset_01HZX8K3Q9P1", "fields/venue")).toHaveLength(1);
    expect(valueIssues(VENUE, [G1], "fields/venue")).toHaveLength(1);
    expect(valueIssues(PARTNERS, [G1, G2], "fields/partners")).toEqual([]);
    expect(valueIssues(PARTNERS, [G1, G1], "fields/partners")[0]?.message).toBe(
      "each entry at most once",
    );
    expect(valueIssues(PARTNERS, [G1, G2, G1, G2], "fields/partners")[0]?.message).toContain(
      "at most 3",
    );
  });

  it("checks every repeater item against its sub-fields", () => {
    const at = (v: unknown) => valueIssues(SPEAKERS, v, "fields/speakers").map((i) => i.path);
    expect(at([{ person: G1, talk: "Hi", day: "2026-11-11", slides: "/s" }])).toEqual([]);
    expect(at([{}])).toEqual(["fields/speakers/0"]);
    expect(at([{ nope: 1 }])).toEqual(["fields/speakers/0/nope"]);
    expect(at([{ talk: "a\u0007b" }])).toEqual(["fields/speakers/0/talk"]);
    expect(at([{ day: "2026-02-30" }])).toEqual(["fields/speakers/0/day"]);
    expect(at([{ slides: "asset:asset_01HZX8K3Q9P1" }])).toEqual(["fields/speakers/0/slides"]);
    expect(at([{ role: "chair" }])).toEqual(["fields/speakers/0/role"]);
    expect(at([{ person: null }])).toEqual(["fields/speakers/0/person"]);
    expect(at(Array.from({ length: 5 }, () => ({ talk: "x" })))).toEqual(["fields/speakers"]);
    // Rich text in an item has rich text's 50 000 limit, not the subset's 10 000.
    expect(at([{ abstract: "a".repeat(20_000) }])).toEqual([]);
    expect(at([{ abstract: "a".repeat(50_001) }])).toEqual(["fields/speakers/0/abstract"]);
  });

  it("caps references per entry across fields and items", () => {
    const many = {
      key: "many",
      type: "reference",
      labels: L("M"),
      localized: true,
      collections: ["places"],
      multiple: true,
      maxItems: 50,
    } as const satisfies FieldDefinition;
    const more = { ...many, key: "more" };
    const big = { ...SPEAKERS, maxItems: 50, fields: [SPEAKERS.fields[0]] } as FieldDefinition;
    const ids = (n: number, p: string) =>
      Array.from({ length: n }, (_, i) => `entry_${p}${String(i).padStart(6, "0")}`);
    const values = { many: ids(50, "a"), more: ids(50, "b"), speakers: [{ person: G1 }] };
    expect(codes(checkFieldValues([many, more, big], { values }))).toEqual(["too_many_references"]);
    expect(
      checkFieldValues([many, more, big], { values: { many: values.many, more: values.more } }),
    ).toEqual([]);
    expect(FIELD_LIMITS.referencesPerEntry).toBe(100);
  });

  it("needs required sub-fields in every item to publish", () => {
    const site = siteWith([SPEAKERS]);
    const entry = (status: "draft" | "published") =>
      ({
        id: "entry_01HZX8K3Q9E1",
        collection: "events",
        status,
        fields: { speakers: [{ person: G1 }, { talk: "x" }] },
      }) as const;
    expect(checkRequiredToPublish(site, entry("draft"))).toEqual([]);
    expect(checkRequiredToPublish(site, entry("published")).map((i) => i.path)).toEqual([
      "fields/speakers/1/person",
    ]);
  });
});

describe("resolveFields", () => {
  it("resolves group ids and items, and skips types it does not know", () => {
    const future = {
      key: "geo",
      type: "geopoint",
      labels: L("Geo"),
      localized: true,
    } as unknown as FieldDefinition;
    const site = siteWith([VENUE, SPEAKERS, future]);
    const items = [{ person: G2, role: "host" }];
    const r = resolveFields(site, {
      id: "entry_01HZX8K3Q9E1",
      collection: "events",
      fields: { venue: G1, speakers: items, geo: { lat: 1 } },
    });
    expect(Object.keys(r)).toEqual(["venue", "speakers"]);
    expect([r.venue?.value, r.speakers?.value]).toEqual([G1, items]);
    const bad = resolveFields(site, {
      id: "entry_01HZX8K3Q9E1",
      collection: "events",
      fields: { speakers: [{}] },
    });
    expect(bad.speakers).toMatchObject({
      value: undefined,
      issue: { code: "field_value_unreadable" },
    });
  });
});

/** Every `[path, keyword]` of a schema. */
function keywords(s: JsonSchema, at = ""): [string, string][] {
  const out: [string, string][] = Object.keys(s).map((k) => [at, k]);
  for (const [k, c] of Object.entries(s.properties ?? {})) out.push(...keywords(c, `${at}/${k}`));
  if (s.items) out.push(...keywords(s.items, `${at}/items`));
  return out;
}

describe("fieldsJsonSchema", () => {
  const ROLE = SPEAKERS.fields[1];
  const EXAMPLE: FieldDefinition[] = [
    STARTS,
    VENUE,
    { ...SPEAKERS, maxItems: 20, fields: [SPEAKERS.fields[0], ROLE, SPEAKERS.fields[2]] },
  ];
  const name = (key: string) => ({ places: "Places", people: "People" })[key];
  const open = fieldsJsonSchema(EXAMPLE, "en", "en", { collectionName: name });
  const strict = fieldsJsonSchema(EXAMPLE, "en", "en", { collectionName: name, strict: true });

  it("emits references as group id strings and repeaters as closed item lists", () => {
    const p = open.properties ?? {};
    expect(p.venue).toMatchObject({ type: "string", pattern: "^entry_[A-Za-z0-9]{6,32}$" });
    expect(p.venue?.description).toContain(
      "An entry in Places (places) of this site, by the groupId",
    );
    expect(p.venue?.description).toContain("every language version shows the targets");
    expect(p.speakers).toMatchObject({
      type: "array",
      items: { type: "object", additionalProperties: false },
    });
    expect(p.speakers?.description).toContain("at most 20 items");
    expect(p.speakers?.items?.properties?.person?.description).toContain("People (people)");
    expect(p.speakers?.items?.properties?.person?.description).toContain("Needed to publish.");
    expect(p.speakers?.items?.required).toBeUndefined();
    const partners = fieldsJsonSchema([PARTNERS], "en").properties?.partners;
    expect(partners).toMatchObject({ type: "array", items: { type: "string" } });
    expect(partners?.description).toContain("at most 3 entries in places or people");
  });

  it("keeps to the strict-mode keywords, a root object, no $ref and depth 4", () => {
    for (const s of [open, strict]) {
      for (const [, k] of keywords(s)) expect(JSON_SCHEMA_KEYWORDS).toContain(k);
      expect(s.type).toBe("object");
      expect(JSON.stringify(s)).not.toMatch(/\$ref|\$defs|oneOf|anyOf/);
      expect(strictSchemaCost(s).depth).toBe(4);
    }
  });

  it("makes every property required and nullable in the strict profile", () => {
    const p = strict.properties ?? {};
    expect(strict.required).toEqual(["startsAt", "venue", "speakers"]);
    expect([p.startsAt?.type, p.venue?.type, p.speakers?.type]).toEqual([
      ["object", "null"],
      ["string", "null"],
      ["array", "null"],
    ]);
    // a datetime's own parts stay required and not nullable
    expect(p.startsAt?.required).toEqual(["at", "timeZone"]);
    expect(p.startsAt?.properties?.at?.type).toBe("string");
    const item = p.speakers?.items;
    expect(item?.required).toEqual(["person", "role", "talk"]);
    expect(item?.properties?.role?.enum).toEqual(["host", "speaker", "panelist", null]);
    expect(item?.description).toContain("null unsets that value in this item");
    expect(strict.description).toContain("null leaves the stored value as it is");
  });

  it("counts the RFC's example: 8 properties, depth 4, 4 enum values, 6 unions", () => {
    expect(strictSchemaCost(strict)).toEqual({ properties: 8, depth: 4, enumValues: 4, unions: 6 });
    expect(strictSchemaCost(open)).toEqual({ properties: 8, depth: 4, enumValues: 3, unions: 0 });
  });
});

type Node = Pick<ContentEntry, "id" | "collection" | "locale"> & {
  translation?: { group: string };
};

describe("pickMember", () => {
  const venueEn: Node = { id: G1, collection: "places", locale: "en" };
  const venueTr: Node = {
    id: "entry_01HZX8K3Q9T1",
    collection: "places",
    locale: "tr",
    translation: { group: G1 },
  };
  const relinked: Node = {
    id: G2,
    collection: "places",
    locale: "de",
    translation: { group: "entry_01HZX8K3Q9ZZ" },
  };
  const opts = { defaultLocale: "en", collections: ["places"] };

  it("takes the page's locale, then the default locale under default-with-notice", () => {
    expect(pickMember(G1, [venueEn, venueTr], { ...opts, locale: "tr" })?.member).toBe(venueTr);
    expect(pickMember(G1, [venueEn], { ...opts, locale: "tr" })).toBeUndefined();
    expect(
      pickMember(G1, [venueEn], { ...opts, locale: "tr", fallback: "default-with-notice" }),
    ).toEqual({
      member: venueEn,
      fromFallbackLocale: true,
    });
  });

  it("counts members by COALESCE(translation.group, id) in allowed collections only", () => {
    expect(pickMember(G1, [venueTr], { ...opts, locale: "tr" })?.member).toBe(venueTr);
    // a relinked node is no longer a member of its own id's group
    expect(pickMember(G2, [relinked], { ...opts, locale: "de" })).toBeUndefined();
    expect(
      pickMember(G1, [venueEn], { ...opts, collections: ["halls"], locale: "en" }),
    ).toBeUndefined();
  });
});

describe("referenceIssues", () => {
  const site = { ...siteWith([VENUE, SPEAKERS]), localization: { fallback: "none" } } as const;
  const entry = (id: string, extra: Partial<ContentEntry>): ContentEntry =>
    ({
      schemaVersion: 1,
      id,
      siteId: "site_01HZX8K3Q9T1",
      collection: "events",
      slug: id.slice(-4).toLowerCase(),
      locale: "en",
      status: "published",
      title: id,
      body: { format: "markdown", markdown: "" },
      rev: 1,
      createdAt: "2026-11-11T09:00:00Z",
      updatedAt: "2026-11-11T09:00:00Z",
      ...extra,
    }) as ContentEntry;
  const place = entry(G1, { collection: "places" });
  const NOW = Date.parse("2026-11-11T10:00:00Z");

  it("is empty for a site without reference definitions", () => {
    expect(referenceIssues({ site: siteWith([STARTS]), entries: [place] }, NOW)).toEqual([]);
  });

  it("names missing, hidden and locale-less targets of shown entries", () => {
    const person = entry(G2, { collection: "people", status: "draft" });
    const event = entry("entry_01HZX8K3Q9E1", {
      fields: { venue: G1, speakers: [{ person: G2 }, { person: "entry_01HZX8K3Q9NO" }] },
    });
    const turkish = entry("entry_01HZX8K3Q9E2", {
      locale: "tr",
      fields: {},
      translation: {
        group: event.id,
        method: "human",
        source: { id: event.id, locale: "en", rev: 1, hash: "h".repeat(64) },
      },
    });
    const draft = entry("entry_01HZX8K3Q9E3", {
      status: "draft",
      fields: { venue: "entry_01HZX8K3Q9NO" },
    });
    const issues = referenceIssues({ site, entries: [place, person, event, turkish, draft] }, NOW);
    expect(issues.map((i) => [i.entryId.slice(-2), i.path, i.reason])).toEqual([
      ["E1", "fields/speakers/0/person", "hidden"],
      ["E1", "fields/speakers/1/person", "missing"],
      // the Turkish version inherits the shared values and resolves them in Turkish
      ["E2", "fields/venue", "locale"],
      ["E2", "fields/speakers/0/person", "hidden"],
      ["E2", "fields/speakers/1/person", "missing"],
    ]);
    const fallback = { ...site, localization: { fallback: "default-with-notice" as const } };
    expect(
      referenceIssues({ site: fallback, entries: [place, event, turkish] }, NOW).some(
        (i) => i.path === "fields/venue",
      ),
    ).toBe(false);
  });
});
