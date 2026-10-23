/**
 * RFC-0042 §2: the closed preset table, the save-time check and the per-entry JSON-LD builder.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CollectionSettings,
  ContentEntry,
  FieldDefinition,
  Site,
  StructuredDataPreset,
} from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import { resolveFields } from "../src/fields/resolve.ts";
import {
  absoluteHttpUrl,
  bodyText,
  checkStructuredData,
  KIND_SOURCES,
  PRESET_TYPES,
  PRESETS,
  requiredPaths,
  STRUCTURED_DATA_MAX_BYTES,
  type StructuredDataContext,
  structuredDataErrors,
  structuredDataFor,
  VOCABULARIES,
  vocabularyEntry,
  withOffset,
} from "../src/structured-data/index.ts";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../core-contracts/fixtures/valid/site",
);
const fixture = (name: string): Site =>
  JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as Site;

const L = { en: { label: "x" } };
const f = (key: string, type: FieldDefinition["type"], extra: object = {}): FieldDefinition =>
  ({ key, type, labels: L, localized: false, ...extra }) as FieldDefinition;
const EVENT_FIELDS: FieldDefinition[] = [
  f("startsAt", "datetime"),
  f("endsAt", "datetime"),
  f("day", "date"),
  f("venue", "text"),
  f("city", "text"),
  f("lines", "text", { multiline: true }),
  f("price", "number"),
  f("minutes", "number", { integer: true }),
  f("remote", "boolean"),
  f("status", "select", {
    options: [
      { value: "scheduled", labels: { en: "S" } },
      { value: "cancelled", labels: { en: "C" } },
      { value: "sold-out", labels: { en: "X" } },
    ],
  }),
  f("kinds", "select", {
    multiple: true,
    options: [
      { value: "full-time", labels: { en: "F" } },
      { value: "part-time", labels: { en: "P" } },
    ],
  }),
  f("poster", "image"),
  f("tickets", "url"),
  f("notes", "richText"),
];

const siteWith = (preset: StructuredDataPreset, fields = EVENT_FIELDS) => ({
  name: "Halls & Co",
  timeZone: "Europe/Istanbul",
  brand: { logo: { src: "/logo.png", alt: "Logo" } },
  collections: { events: { fields, structuredData: preset } as CollectionSettings },
});
const codes = (preset: StructuredDataPreset, fields?: FieldDefinition[]) =>
  checkStructuredData(siteWith(preset, fields)).map(
    (i) =>
      `${i.code}${i.warning ? "?" : ""} ${i.path.replace("collections/events/structuredData/", "")}`,
  );

const EVENT: StructuredDataPreset = {
  type: "Event",
  properties: {
    startDate: { kind: "field", field: "startsAt" },
    "location.name": { kind: "field", field: "venue" },
    "location.address.addressLocality": { kind: "field", field: "city" },
  },
};

describe("the closed table", () => {
  it("offers four types, each with required paths, and never ratings or reviews", () => {
    expect(PRESET_TYPES).toEqual(["Event", "JobPosting", "Product", "Recipe"]);
    for (const type of PRESET_TYPES) {
      expect(requiredPaths(type).paths.length, type).toBeGreaterThan(0);
      for (const path of Object.keys(PRESETS[type].paths)) {
        expect(path).toMatch(/^[a-z][A-Za-z]{0,39}(\.[a-z][A-Za-z]{0,39}){0,2}$/);
        expect(path).not.toMatch(/rating|review/i);
      }
    }
    expect(requiredPaths("Event").paths).toEqual(["name", "startDate", "location.name"]);
    expect(requiredPaths("Event").groups[0]).toHaveLength(5);
    expect(requiredPaths("JobPosting").paths).toEqual([
      "title",
      "description",
      "datePosted",
      "hiringOrganization.name",
    ]);
    expect(requiredPaths("Product").paths).toEqual(["name", "offers.price"]);
    expect(requiredPaths("Recipe").paths).toEqual(["name", "image"]);
  });

  it("defaults point at sources that fit their paths", () => {
    for (const type of PRESET_TYPES)
      for (const [path, spec] of Object.entries(PRESETS[type].paths)) {
        const d = spec.default;
        if (!d) continue;
        const sources = KIND_SOURCES[spec.kind];
        if (d.kind === "entry") expect(sources.entry, `${type} ${path}`).toContain(d.property);
        if (d.kind === "site") expect(sources.site, `${type} ${path}`).toContain(d.property);
      }
  });

  it("vocabularies match keys, emitted values and schema.org short names", () => {
    expect(vocabularyEntry("eventStatus", "cancelled")?.value).toBe(
      "https://schema.org/EventCancelled",
    );
    expect(vocabularyEntry("eventStatus", "EventCancelled")?.key).toBe("cancelled");
    expect(vocabularyEntry("employmentType", "FULL_TIME")?.key).toBe("full-time");
    expect(vocabularyEntry("availability", "maybe")).toBeUndefined();
    for (const entries of Object.values(VOCABULARIES))
      for (const e of entries) expect(e.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("checkStructuredData (save time)", () => {
  it("accepts the contract's valid fixtures", () => {
    expect(checkStructuredData(fixture("collection-stage3"))).toEqual([]);
    expect(checkStructuredData(fixture("collection-stage3-presets"))).toEqual([]);
    expect(checkStructuredData({})).toEqual([]);
  });

  it("accepts a minimal Event (name from the entry's title by default)", () => {
    expect(codes(EVENT)).toEqual([]);
  });

  it("refuses paths outside the type's table", () => {
    const p = {
      ...EVENT,
      properties: { ...EVENT.properties, aggregateRating: { kind: "constant", value: "5" } },
    };
    expect(codes(p as StructuredDataPreset)).toEqual(["unknown_path properties/aggregateRating"]);
    const proto = {
      ...EVENT,
      properties: { ...EVENT.properties, toString: { kind: "constant", value: "x" } },
    };
    expect(codes(proto as StructuredDataPreset)).toEqual(["unknown_path properties/toString"]);
  });

  it("refuses unknown fields and fields whose type does not fit", () => {
    const p = (source: object, path = "endDate") =>
      codes({
        ...EVENT,
        properties: { ...EVENT.properties, [path]: source },
      } as StructuredDataPreset);
    expect(p({ kind: "field", field: "nope" })).toEqual(["unknown_field properties/endDate/field"]);
    expect(p({ kind: "field", field: "venue" })).toEqual([
      "source_mismatch properties/endDate/field",
    ]);
    expect(p({ kind: "field", field: "day" })).toEqual([]);
    expect(p({ kind: "field", field: "venue" }, "offers.price")).toHaveLength(1);
    expect(p({ kind: "field", field: "notes" }, "description")).toEqual([]);
    expect(p({ kind: "field", field: "poster" }, "image")).toEqual([]);
    expect(p({ kind: "field", field: "tickets" }, "image")).toHaveLength(1);
  });

  it("refuses entry and site properties that do not fit", () => {
    const p = (source: object, path: string) =>
      codes({
        ...EVENT,
        properties: { ...EVENT.properties, [path]: source },
      } as StructuredDataPreset);
    expect(p({ kind: "entry", property: "publishedAt" }, "endDate")).toEqual([]);
    expect(p({ kind: "entry", property: "title" }, "endDate")).toEqual([
      "source_mismatch properties/endDate/property",
    ]);
    expect(p({ kind: "site", property: "url" }, "organizer.url")).toEqual([]);
    expect(p({ kind: "site", property: "logo" }, "organizer.url")).toHaveLength(1);
    expect(p({ kind: "entry", property: "body" }, "description")).toEqual([]);
    expect(p({ kind: "entry", property: "body" }, "location.name")).toHaveLength(1);
  });

  it("checks constants: kinds that take none, vocabularies, ISO 4217, required paths", () => {
    const p = (value: string, path: string) =>
      codes({
        ...EVENT,
        properties: { ...EVENT.properties, [path]: { kind: "constant", value } },
      } as StructuredDataPreset);
    expect(p("EUR", "offers.priceCurrency")).toEqual([]);
    expect(p("eur", "offers.priceCurrency")).toEqual([
      "currency properties/offers.priceCurrency/value",
    ]);
    expect(p("cancelled", "eventStatus")).toEqual([]);
    expect(p("EventCancelled", "eventStatus")).toEqual([]);
    expect(p("maybe", "eventStatus")).toEqual(["vocabulary properties/eventStatus/value"]);
    expect(p("12", "offers.price")).toEqual(["source_mismatch properties/offers.price/value"]);
    expect(p("https://x.test", "offers.url")).toHaveLength(1);
    expect(p("2026-11-05", "startDate")).toEqual(["source_mismatch properties/startDate/value"]);
    expect(p("Grand Hall", "location.name")).toEqual([
      "constant_required properties/location.name/value",
    ]);
    expect(p("Organised by us", "organizer.name")).toEqual([]);
  });

  it("warns about select options outside a vocabulary, refuses a multiple select on a single path", () => {
    const p = (path: string, field: string) =>
      codes({ ...EVENT, properties: { ...EVENT.properties, [path]: { kind: "field", field } } });
    // sold-out is not an event status: a warning, the save goes through
    const issues = p("eventStatus", "status");
    expect(issues).toEqual(["vocabulary? properties/eventStatus/field"]);
    expect(
      structuredDataErrors(
        checkStructuredData(
          siteWith({
            ...EVENT,
            properties: { ...EVENT.properties, eventStatus: { kind: "field", field: "status" } },
          }),
        ),
      ),
    ).toEqual([]);
    expect(p("eventStatus", "kinds")).toEqual(["source_mismatch properties/eventStatus/field"]);
  });

  it("requires every required path, and an address group from a field", () => {
    expect(
      codes({ type: "Event", properties: { startDate: { kind: "field", field: "startsAt" } } }),
    ).toEqual([
      "required_missing properties/location.name",
      "required_missing properties/location.address",
    ]);
    // a constant country alone does not place an event
    expect(
      codes({
        type: "Event",
        properties: {
          ...EVENT.properties,
          "location.address.addressLocality": { kind: "constant", value: "Istanbul" },
        },
      }),
    ).toEqual(["required_missing properties/location.address"]);
    expect(codes({ type: "Product", properties: { sku: { kind: "constant", value: "A1" } } })).toEqual([
      "required_missing properties/offers.price",
    ]);
    expect(
      codes({ type: "Recipe", properties: { keywords: { kind: "constant", value: "soup" } } }),
    ).toEqual([]);
  });

  it("JobPosting: an address, unless the job is remote with applicant locations", () => {
    expect(
      codes({ type: "JobPosting", properties: { validThrough: { kind: "field", field: "day" } } }),
    ).toEqual(["required_missing properties/jobLocation.address"]);
    expect(
      codes({
        type: "JobPosting",
        properties: {
          jobLocationType: { kind: "field", field: "remote" },
          "applicantLocationRequirements.name": { kind: "constant", value: "Türkiye" },
          employmentType: { kind: "field", field: "kinds" },
          "baseSalary.unitText": { kind: "constant", value: "MONTH" },
        },
      }),
    ).toEqual([]);
  });

  it("checks lines and steps against multiline text", () => {
    const fields = [...EVENT_FIELDS, f("single", "text")];
    const recipe = (path: string, field: string) =>
      codes({ type: "Recipe", properties: { [path]: { kind: "field", field } } }, fields);
    expect(recipe("recipeIngredient", "lines")).toEqual([]);
    expect(recipe("recipeIngredient", "single")).toEqual([
      "source_mismatch properties/recipeIngredient/field",
    ]);
    expect(recipe("recipeInstructions", "notes")).toEqual([]);
    expect(recipe("recipeInstructions", "single")).toHaveLength(1);
    expect(recipe("totalTime", "minutes")).toEqual([]);
    expect(recipe("recipeYield", "price")).toEqual([]);
  });
});

const CTX: StructuredDataContext = {
  origin: "https://halls.test",
  entryUrl: "/events/jazz-night",
  imageUrl: (img) => (img.assetId ? `/assets/${img.assetId}.webp` : img.src),
};
const ENTRY = {
  collection: "events",
  title: "Jazz Night",
  summary: "Live jazz.",
  body: { format: "markdown", value: "# Jazz\n\nLive **jazz** in the [hall](/hall)." },
  coverImage: { src: "/cover.jpg", alt: "Cover", assetId: "asset_01HZX8K3Q9CV" },
  publishedAt: "2026-10-01T09:00:00Z",
  updatedAt: "2026-10-02T09:00:00Z",
} satisfies Partial<ContentEntry>;

const build = (preset: StructuredDataPreset, values: Record<string, unknown>, entry = ENTRY) => {
  const site = siteWith(preset);
  const resolved = resolveFields(site, {
    id: "entry_01HZX8K3Q9AA",
    collection: "events",
    fields: values,
  });
  return structuredDataFor(site, resolved, entry, CTX);
};
const EVENT_VALUES = {
  startsAt: { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" },
  venue: "Grand Hall",
  city: "Istanbul",
};

describe("structuredDataFor (per entry)", () => {
  it("builds an Event with nested @types, offsets from the value's zone and defaults", () => {
    const preset: StructuredDataPreset = {
      type: "Event",
      properties: {
        ...EVENT.properties,
        endDate: { kind: "field", field: "day" },
        eventStatus: { kind: "field", field: "status" },
        "location.address.addressCountry": { kind: "constant", value: "TR" },
        "offers.price": { kind: "field", field: "price" },
        "offers.priceCurrency": { kind: "constant", value: "TRY" },
        "offers.url": { kind: "field", field: "tickets" },
        "organizer.name": { kind: "site", property: "name" },
        "organizer.url": { kind: "site", property: "url" },
        image: { kind: "field", field: "poster" },
      },
    };
    const r = build(preset, {
      ...EVENT_VALUES,
      day: "2026-11-06",
      status: "cancelled",
      price: 250,
      tickets: "/tickets",
      poster: "asset_01HZX8K3Q9PO",
    });
    expect(r.issues).toEqual([]);
    expect(r.doc).toEqual({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Jazz Night",
      startDate: "2026-11-05T19:30:00+03:00",
      location: {
        "@type": "Place",
        name: "Grand Hall",
        address: { "@type": "PostalAddress", addressLocality: "Istanbul", addressCountry: "TR" },
      },
      endDate: "2026-11-06",
      description: "Live jazz.",
      image: "https://halls.test/assets/asset_01HZX8K3Q9PO.webp",
      eventStatus: "https://schema.org/EventCancelled",
      organizer: { "@type": "Organization", name: "Halls & Co", url: "https://halls.test/" },
      offers: {
        "@type": "Offer",
        price: 250,
        priceCurrency: "TRY",
        url: "https://halls.test/tickets",
      },
    });
  });

  it("emits no document when a required value is missing, and says which", () => {
    const r = build(EVENT, { venue: "Grand Hall", city: "Istanbul" });
    expect(r.doc).toBeUndefined();
    expect(r.issues).toEqual([
      {
        path: "startDate",
        code: "required_value_missing",
        message: "Structured data: startDate missing",
      },
    ]);
    expect(build(EVENT, { ...EVENT_VALUES, city: undefined }).issues.map((i) => i.path)).toEqual([
      "location.address",
    ]);
    expect(build(EVENT, EVENT_VALUES, { ...ENTRY, title: " " }).issues.map((i) => i.path)).toEqual([
      "name",
    ]);
  });

  it("returns nothing without a preset", () => {
    const site = { name: "S", collections: { events: {} } };
    expect(structuredDataFor(site, {}, ENTRY, CTX)).toEqual({ issues: [] });
  });

  it("drops unsafe URLs, options outside the vocabulary and fields that no longer fit", () => {
    const preset: StructuredDataPreset = {
      type: "Event",
      properties: {
        ...EVENT.properties,
        "offers.url": { kind: "field", field: "tickets" },
        eventStatus: { kind: "field", field: "status" },
        endDate: { kind: "field", field: "venue" },
      },
    };
    const r = build(preset, { ...EVENT_VALUES, tickets: "mailto:x@y.test", status: "sold-out" });
    expect(r.doc).toBeDefined();
    expect(r.doc).not.toHaveProperty("offers");
    expect(r.doc).not.toHaveProperty("eventStatus");
    expect(r.doc).not.toHaveProperty("endDate");
  });

  it("builds a remote JobPosting: body as text, site defaults, salary nesting, employment types", () => {
    const preset: StructuredDataPreset = {
      type: "JobPosting",
      properties: {
        validThrough: { kind: "field", field: "day" },
        jobLocationType: { kind: "field", field: "remote" },
        "applicantLocationRequirements.name": { kind: "constant", value: "Türkiye" },
        employmentType: { kind: "field", field: "kinds" },
        "baseSalary.value": { kind: "field", field: "price" },
        "baseSalary.currency": { kind: "constant", value: "EUR" },
        "baseSalary.unitText": { kind: "constant", value: "month" },
        directApply: { kind: "field", field: "remote" },
        identifier: { kind: "field", field: "venue" },
      },
    };
    const values = {
      day: "2026-12-01",
      remote: true,
      kinds: ["full-time", "part-time"],
      price: 4000,
      venue: "J-7",
    };
    const r = build(preset, values);
    expect(r.issues).toEqual([]);
    expect(r.doc).toMatchObject({
      "@type": "JobPosting",
      title: "Jazz Night",
      description: "Jazz\nLive jazz in the hall.",
      datePosted: "2026-10-01T09:00:00Z",
      hiringOrganization: {
        "@type": "Organization",
        name: "Halls & Co",
        logo: "https://halls.test/logo.png",
      },
      validThrough: "2026-12-01",
      employmentType: ["FULL_TIME", "PART_TIME"],
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "Türkiye" },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "EUR",
        value: { "@type": "QuantitativeValue", value: 4000, unitText: "MONTH" },
      },
      directApply: true,
      identifier: { "@type": "PropertyValue", value: "J-7" },
    });
    // an on-site job needs an address
    expect(build(preset, { ...values, remote: false }).issues.map((i) => i.path)).toEqual([
      "jobLocation.address",
    ]);
  });

  it("builds a Recipe: ingredient lines, steps per paragraph, durations", () => {
    const preset: StructuredDataPreset = {
      type: "Recipe",
      properties: {
        recipeIngredient: { kind: "field", field: "lines" },
        recipeInstructions: { kind: "field", field: "notes" },
        totalTime: { kind: "field", field: "minutes" },
        prepTime: { kind: "field", field: "price" },
        recipeYield: { kind: "field", field: "minutes" },
        datePublished: { kind: "entry", property: "publishedAt" },
      },
    };
    const r = build(preset, {
      lines: "2 eggs\n\n 1 cup flour \n",
      notes: "Whisk the eggs\nuntil foamy.\n\n1. Fold in **flour**.\n2. Bake.",
      minutes: 45,
      price: 2.5,
    });
    expect(r.doc).toMatchObject({
      "@type": "Recipe",
      name: "Jazz Night",
      image: "https://halls.test/assets/asset_01HZX8K3Q9CV.webp",
      recipeIngredient: ["2 eggs", "1 cup flour"],
      recipeInstructions: [
        { "@type": "HowToStep", text: "Whisk the eggs until foamy." },
        { "@type": "HowToStep", text: "Fold in flour." },
        { "@type": "HowToStep", text: "Bake." },
      ],
      totalTime: "PT45M",
      recipeYield: "45",
      datePublished: "2026-10-01T09:00:00Z",
    });
    // a non-integer number of minutes is no duration
    expect(r.doc).not.toHaveProperty("prepTime");
    // no cover image: no Recipe
    const { coverImage: _, ...bare } = ENTRY;
    expect(build(preset, {}, bare as typeof ENTRY).issues.map((i) => i.path)).toEqual(["image"]);
  });

  it("builds a Product, and uses the entry URL source", () => {
    const preset: StructuredDataPreset = {
      type: "Product",
      properties: {
        "offers.price": { kind: "field", field: "price" },
        "offers.priceCurrency": { kind: "field", field: "venue" },
        "offers.availability": { kind: "constant", value: "in-stock" },
        "offers.priceValidUntil": { kind: "entry", property: "updatedAt" },
      },
    };
    expect(build(preset, { price: 9.99, venue: "eur" }).doc).toMatchObject({
      "@type": "Product",
      offers: {
        "@type": "Offer",
        price: 9.99,
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        priceValidUntil: "2026-10-02T09:00:00Z",
      },
    });
    expect(build(preset, { price: 0 }).doc).toMatchObject({ offers: { price: 0 } });
  });

  it("keeps a document under 32 KB: optional properties first, description last", () => {
    const long = "word ".repeat(7000).trim(); // ~35 KB
    const preset: StructuredDataPreset = {
      type: "Event",
      properties: { ...EVENT.properties, description: { kind: "field", field: "notes" } },
    };
    const r = build(preset, { ...EVENT_VALUES, notes: long });
    expect(r.doc).toBeDefined();
    // the optional image goes first, then the description; required properties stay
    expect(r.doc).not.toHaveProperty("description");
    expect(r.doc).not.toHaveProperty("image");
    expect(r.doc).toMatchObject({ name: "Jazz Night", location: { name: "Grand Hall" } });
    expect(JSON.stringify(r.doc).length).toBeLessThanOrEqual(STRUCTURED_DATA_MAX_BYTES);
  });

  it("shortens a required JobPosting description to fit, multi-byte text included", () => {
    const preset: StructuredDataPreset = {
      type: "JobPosting",
      properties: {
        "jobLocation.address.addressLocality": { kind: "field", field: "city" },
        "hiringOrganization.sameAs": { kind: "site", property: "url" },
      },
    };
    const body = { format: "markdown" as const, value: "çalışma ".repeat(6000) };
    const r = build(preset, { city: "Izmir" }, { ...ENTRY, body });
    expect(r.issues).toEqual([]);
    const size = new TextEncoder().encode(JSON.stringify(r.doc)).length;
    expect(size).toBeLessThanOrEqual(STRUCTURED_DATA_MAX_BYTES);
    expect(String(r.doc?.description).endsWith("…")).toBe(true);
    expect(r.doc?.hiringOrganization).not.toHaveProperty("sameAs");
  });

  it("refuses a document whose required properties alone exceed the cap", () => {
    const r = build(EVENT, EVENT_VALUES, { ...ENTRY, title: "x".repeat(40_000) });
    expect(r.doc).toBeUndefined();
    expect(r.issues.map((i) => i.code)).toEqual(["too_large"]);
  });
});

describe("value helpers", () => {
  it("absoluteHttpUrl keeps http(s) only", () => {
    expect(absoluteHttpUrl("/a b", "https://x.test")).toBe("https://x.test/a%20b");
    expect(absoluteHttpUrl("http://y.test/", "https://x.test")).toBe("http://y.test/");
    expect(absoluteHttpUrl("javascript:alert(1)", "https://x.test")).toBeUndefined();
    expect(absoluteHttpUrl("data:text/html,x", "https://x.test")).toBeUndefined();
    expect(absoluteHttpUrl("tel:+1", "https://x.test")).toBeUndefined();
    expect(absoluteHttpUrl("/x", "not a url")).toBeUndefined();
  });

  it("withOffset shows the instant in its zone, across DST and half-hour zones", () => {
    expect(withOffset("2026-07-01T12:00:00Z", "America/New_York")).toBe(
      "2026-07-01T08:00:00-04:00",
    );
    expect(withOffset("2026-01-01T12:00:00Z", "America/New_York")).toBe(
      "2026-01-01T07:00:00-05:00",
    );
    expect(withOffset("2026-01-01T12:00:00Z", "Asia/Kolkata")).toBe("2026-01-01T17:30:00+05:30");
    expect(withOffset("2026-01-01T12:00:00Z", "America/St_Johns")).toBe(
      "2026-01-01T08:30:00-03:30",
    );
    expect(withOffset("2026-01-01T12:00:00Z", "UTC")).toBe("2026-01-01T12:00:00+00:00");
    expect(withOffset("2026-01-01T12:00:00Z", "Nowhere/Zone")).toBe("2026-01-01T12:00:00+00:00");
    expect(withOffset("soon", "UTC")).toBeUndefined();
  });

  it("bodyText reads Markdown and HTML bodies as plain text", () => {
    expect(bodyText({ format: "markdown", value: "## Hi\n\n- **a**\n- [b](/b)" })).toBe("Hi\na\nb");
    expect(
      bodyText({
        format: "html",
        value: "<p>Tom &amp; Jerry</p><script>x()</script><p>a<br>b&nbsp;c &lt;3</p>",
      }),
    ).toBe("Tom & Jerry\na\nb c <3");
  });
});
