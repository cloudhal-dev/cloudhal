/**
 * RFC-0042 §2: the closed preset table. Which paths each JSON-LD type accepts, which are required
 * by Google (R), the default source of an unmapped path, which value sources fit each path, and the
 * vocabularies of enum-valued properties. The contract bounds the shape; this table gives it
 * meaning, so a change in Google's documentation is a change here, not in the schema.
 *
 * Sources (checked 2026-10-23): Google Search Central's Event, JobPosting, Product snippet and
 * Recipe pages. `aggregateRating` and `review` are deliberately absent (self-serving review markup
 * is against Google's policy, and Cloudhal stores no reviews).
 */
import type {
  EntryValueProperty,
  SiteValueProperty,
  StructuredDataPreset,
  StructuredDataSource,
} from "@cloudhal/core-contracts";
import type { FieldType } from "../fields/types.ts";

export type PresetType = StructuredDataPreset["type"];

/** What a path's value is; decides the sources that fit and the conversion. */
export type ValueKind =
  /** Short plain text. */
  | "text"
  /** Plain text that may be long (descriptions). */
  | "longText"
  /** A finite number (prices, salaries). */
  | "number"
  /** A date (`YYYY-MM-DD`) or an instant with its offset. */
  | "date"
  /** An absolute http(s) URL. */
  | "url"
  /** An absolute URL of an image. */
  | "image"
  /** An ISO 4217 code. */
  | "currency"
  /** A value of the path's vocabulary. */
  | "enum"
  | "boolean"
  /** An integer number of minutes → `PT{n}M`. */
  | "duration"
  /** A multiline text field → one string per line. */
  | "lines"
  /** Rich text or multiline text → one `HowToStep` per paragraph. */
  | "steps";

export interface PathSpec {
  readonly kind: ValueKind;
  /** Google-required. */
  readonly required?: true;
  /** "At least one of" a group (an address) is required. */
  readonly group?: string;
  /** The source used when the path is unmapped. */
  readonly default?: StructuredDataSource;
  /** Enum paths: the vocabulary's name. */
  readonly vocabulary?: VocabularyName;
  /** Field types beyond the kind's own (e.g. `recipeYield` from a number). */
  readonly alsoFields?: readonly FieldType[];
  /** Where the value goes when it differs from the path (`baseSalary.value` → its QuantitativeValue). */
  readonly target?: string;
  /** A `multiple` select gives a list (Google accepts several `employmentType`s). */
  readonly many?: true;
}

export interface PresetSpec {
  readonly paths: Readonly<Record<string, PathSpec>>;
  /** `@type` of each nested object, by its path. */
  readonly types: Readonly<Record<string, string>>;
}

/** What each kind accepts: field types, entry and site properties, and whether constants fit. */
export interface KindSources {
  readonly fields: readonly FieldType[];
  readonly entry: readonly EntryValueProperty[];
  readonly site: readonly SiteValueProperty[];
  readonly constant: boolean;
}

export const KIND_SOURCES: Readonly<Record<ValueKind, KindSources>> = {
  text: { fields: ["text"], entry: ["title", "summary"], site: ["name"], constant: true },
  longText: {
    fields: ["text", "richText"],
    entry: ["title", "summary", "body"],
    site: ["name"],
    constant: true,
  },
  number: { fields: ["number"], entry: [], site: [], constant: false },
  date: {
    fields: ["date", "datetime"],
    entry: ["publishedAt", "updatedAt"],
    site: [],
    constant: false,
  },
  url: { fields: ["url"], entry: ["url"], site: ["url"], constant: false },
  image: { fields: ["image"], entry: ["coverImage"], site: ["logo"], constant: false },
  currency: { fields: ["text"], entry: [], site: [], constant: true },
  enum: { fields: ["select"], entry: [], site: [], constant: true },
  boolean: { fields: ["boolean"], entry: [], site: [], constant: false },
  duration: { fields: ["number"], entry: [], site: [], constant: false },
  lines: { fields: ["text"], entry: [], site: [], constant: false },
  steps: { fields: ["richText", "text"], entry: [], site: [], constant: false },
};

/** One vocabulary entry: the option value (a slug, as select options are) and what it emits. */
export interface VocabularyEntry {
  readonly key: string;
  readonly value: string;
}

const SCHEMA = "https://schema.org/";
const schemaOrg = (pairs: Record<string, string>): VocabularyEntry[] =>
  Object.entries(pairs).map(([key, v]) => ({ key, value: `${SCHEMA}${v}` }));
const tokens = (pairs: Record<string, string>): VocabularyEntry[] =>
  Object.entries(pairs).map(([key, value]) => ({ key, value }));

export const VOCABULARIES = {
  eventStatus: schemaOrg({
    scheduled: "EventScheduled",
    cancelled: "EventCancelled",
    postponed: "EventPostponed",
    rescheduled: "EventRescheduled",
    "moved-online": "EventMovedOnline",
  }),
  eventAttendanceMode: schemaOrg({
    offline: "OfflineEventAttendanceMode",
    online: "OnlineEventAttendanceMode",
    mixed: "MixedEventAttendanceMode",
  }),
  availability: schemaOrg({
    "in-stock": "InStock",
    "out-of-stock": "OutOfStock",
    "sold-out": "SoldOut",
    "pre-order": "PreOrder",
    "pre-sale": "PreSale",
    "back-order": "BackOrder",
    "limited-availability": "LimitedAvailability",
    "online-only": "OnlineOnly",
    "in-store-only": "InStoreOnly",
    discontinued: "Discontinued",
  }),
  employmentType: tokens({
    "full-time": "FULL_TIME",
    "part-time": "PART_TIME",
    contractor: "CONTRACTOR",
    temporary: "TEMPORARY",
    intern: "INTERN",
    volunteer: "VOLUNTEER",
    "per-diem": "PER_DIEM",
    other: "OTHER",
  }),
  salaryUnit: tokens({ hour: "HOUR", day: "DAY", week: "WEEK", month: "MONTH", year: "YEAR" }),
  /** A `boolean` field also fits: `true` → `TELECOMMUTE`. */
  jobLocationType: tokens({ telecommute: "TELECOMMUTE" }),
} as const satisfies Record<string, readonly VocabularyEntry[]>;

export type VocabularyName = keyof typeof VOCABULARIES;

/**
 * The entry for a select option or a constant: its key, the emitted value, or (for schema.org
 * URLs) the value's last segment (`cancelled`, `https://schema.org/EventCancelled` or
 * `EventCancelled`).
 */
export function vocabularyEntry(name: VocabularyName, raw: string): VocabularyEntry | undefined {
  return VOCABULARIES[name].find(
    (e) => e.key === raw || e.value === raw || e.value === `${SCHEMA}${raw}`,
  );
}

const entry = (property: EntryValueProperty): StructuredDataSource => ({ kind: "entry", property });
const site = (property: SiteValueProperty): StructuredDataSource => ({ kind: "site", property });

const ADDRESS = [
  "streetAddress",
  "addressLocality",
  "postalCode",
  "addressRegion",
  "addressCountry",
] as const;
const address = (prefix: string, group: string): Record<string, PathSpec> =>
  Object.fromEntries(ADDRESS.map((p) => [`${prefix}.${p}`, { kind: "text", group }]));

const EVENT: PresetSpec = {
  paths: {
    name: { kind: "text", required: true, default: entry("title") },
    startDate: { kind: "date", required: true },
    "location.name": { kind: "text", required: true },
    ...address("location.address", "location.address"),
    endDate: { kind: "date" },
    description: { kind: "longText", default: entry("summary") },
    image: { kind: "image", default: entry("coverImage") },
    eventStatus: { kind: "enum", vocabulary: "eventStatus" },
    eventAttendanceMode: { kind: "enum", vocabulary: "eventAttendanceMode" },
    "organizer.name": { kind: "text" },
    "organizer.url": { kind: "url" },
    "offers.price": { kind: "number" },
    "offers.priceCurrency": { kind: "currency" },
    "offers.url": { kind: "url" },
    "offers.availability": { kind: "enum", vocabulary: "availability" },
    "offers.validFrom": { kind: "date" },
    "performer.name": { kind: "text" },
    previousStartDate: { kind: "date" },
  },
  types: {
    location: "Place",
    "location.address": "PostalAddress",
    organizer: "Organization",
    offers: "Offer",
    performer: "PerformingGroup",
  },
};

const JOB_POSTING: PresetSpec = {
  paths: {
    title: { kind: "text", required: true, default: entry("title") },
    description: { kind: "longText", required: true, default: entry("body") },
    datePosted: { kind: "date", required: true, default: entry("publishedAt") },
    "hiringOrganization.name": { kind: "text", required: true, default: site("name") },
    ...address("jobLocation.address", "jobLocation.address"),
    validThrough: { kind: "date" },
    employmentType: { kind: "enum", vocabulary: "employmentType", many: true },
    "hiringOrganization.sameAs": { kind: "url" },
    "hiringOrganization.logo": { kind: "image", default: site("logo") },
    jobLocationType: { kind: "enum", vocabulary: "jobLocationType", alsoFields: ["boolean"] },
    "applicantLocationRequirements.name": { kind: "text" },
    "baseSalary.value": { kind: "number", target: "baseSalary.value.value" },
    "baseSalary.currency": { kind: "currency" },
    "baseSalary.unitText": {
      kind: "enum",
      vocabulary: "salaryUnit",
      target: "baseSalary.value.unitText",
    },
    directApply: { kind: "boolean" },
    identifier: { kind: "text", target: "identifier.value" },
  },
  types: {
    hiringOrganization: "Organization",
    jobLocation: "Place",
    "jobLocation.address": "PostalAddress",
    applicantLocationRequirements: "Country",
    baseSalary: "MonetaryAmount",
    "baseSalary.value": "QuantitativeValue",
    identifier: "PropertyValue",
  },
};

const PRODUCT: PresetSpec = {
  paths: {
    name: { kind: "text", required: true, default: entry("title") },
    "offers.price": { kind: "number", required: true },
    "offers.priceCurrency": { kind: "currency" },
    "offers.availability": { kind: "enum", vocabulary: "availability" },
    "offers.priceValidUntil": { kind: "date" },
    image: { kind: "image", default: entry("coverImage") },
    description: { kind: "longText", default: entry("summary") },
    sku: { kind: "text" },
    "brand.name": { kind: "text" },
    gtin: { kind: "text" },
  },
  types: { offers: "Offer", brand: "Brand" },
};

const RECIPE: PresetSpec = {
  paths: {
    name: { kind: "text", required: true, default: entry("title") },
    image: { kind: "image", required: true, default: entry("coverImage") },
    description: { kind: "longText" },
    recipeIngredient: { kind: "lines" },
    recipeInstructions: { kind: "steps" },
    prepTime: { kind: "duration" },
    cookTime: { kind: "duration" },
    totalTime: { kind: "duration" },
    recipeYield: { kind: "text", alsoFields: ["number"] },
    recipeCategory: { kind: "text" },
    recipeCuisine: { kind: "text" },
    keywords: { kind: "text" },
    "nutrition.calories": { kind: "text" },
    datePublished: { kind: "date" },
  },
  types: { nutrition: "NutritionInformation" },
};

/** The closed table, one spec per offered type. */
export const PRESETS: Readonly<Record<PresetType, PresetSpec>> = {
  Event: EVENT,
  JobPosting: JOB_POSTING,
  Product: PRODUCT,
  Recipe: RECIPE,
};

/** The offered types, in the contract's order. */
export const PRESET_TYPES: readonly PresetType[] = ["Event", "JobPosting", "Product", "Recipe"];

/** Required paths of a type, then its "at least one of" groups. */
export function requiredPaths(type: PresetType): { paths: string[]; groups: string[][] } {
  const groups = new Map<string, string[]>();
  const paths: string[] = [];
  for (const [path, spec] of Object.entries(PRESETS[type].paths)) {
    if (spec.required) paths.push(path);
    if (spec.group) groups.set(spec.group, [...(groups.get(spec.group) ?? []), path]);
  }
  return { paths, groups: [...groups.values()] };
}

/**
 * JobPosting: the address group is required unless the job is remote, i.e. `jobLocationType` and
 * `applicantLocationRequirements.name` are both mapped (Google's remote-job rule).
 */
export const REMOTE_JOB_PATHS = ["jobLocationType", "applicantLocationRequirements.name"] as const;

/** RFC-0042 §2: the serialized cap of one document. */
export const STRUCTURED_DATA_MAX_BYTES = 32 * 1024;
