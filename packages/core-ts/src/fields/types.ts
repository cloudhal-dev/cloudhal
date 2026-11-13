/**
 * RFC-0041 / ADR-0043: shared names of typed custom fields — the issue shape, the limits, the
 * reserved keys and small helpers. Worker-safe, no imports beyond contract types.
 */
import type { FieldDefinition, Site, SubFieldDefinition } from "@cloudhal/core-contracts";

export type FieldType = FieldDefinition["type"];
export type SubFieldType = SubFieldDefinition["type"];
export type SelectFieldDefinition = Extract<FieldDefinition, { type: "select" }>;
export type ReferenceFieldDefinition = Extract<FieldDefinition, { type: "reference" }>;
export type RepeaterFieldDefinition = Extract<FieldDefinition, { type: "repeater" }>;
/** RFC-0045: the two stage-4 types, accepted only with the store's capability (`fields_unsupported`). */
export type ReferenceFieldType = "reference" | "repeater";
/** The types every writer accepts today (`FIELD_TYPES`). */
export type EnabledFieldType = Exclude<FieldType, ReferenceFieldType>;
/** What field code reads of a site: its collection settings. */
export interface SiteFields {
  collections?: Site["collections"] | undefined;
  /** Conversions during a type change (`date → datetime`); `UTC` when absent. */
  timeZone?: string | undefined;
  /** Conversions during a type change (`text → select` labels); `en` when absent. */
  defaultLocale?: string | undefined;
}

/**
 * The nine types every writer accepts, in the contract's order. The stage-4 types
 * (`REFERENCE_FIELD_TYPES`) are offered beside them only where the store has the capability
 * (Studio's `features.referenceFields`, MCP's tool inputs): rollout step 7 enabled them there.
 */
export const FIELD_TYPES: readonly EnabledFieldType[] = [
  "text",
  "richText",
  "number",
  "boolean",
  "date",
  "datetime",
  "url",
  "image",
  "select",
];

/** RFC-0045: `reference` and `repeater`, gated by the store's capability (`fields_unsupported`). */
export const REFERENCE_FIELD_TYPES: readonly ReferenceFieldType[] = ["reference", "repeater"];

/** Every type of the contract, in its order (`FIELD_TYPES` then `REFERENCE_FIELD_TYPES`). */
export const ALL_FIELD_TYPES: readonly FieldType[] = [...FIELD_TYPES, ...REFERENCE_FIELD_TYPES];

const KNOWN_TYPES: ReadonlySet<string> = new Set(ALL_FIELD_TYPES);

/** True for a type of this contract version; a newer writer's type is not (RFC-0045 §4). */
export const isKnownFieldType = (type: string): type is FieldType => KNOWN_TYPES.has(type);

/** True for `reference` and `repeater`. */
export const isReferenceFieldType = (type: string): type is ReferenceFieldType =>
  type === "reference" || type === "repeater";

/** RFC-0041 §2, §4 and Security: every limit in one place. */
export const FIELD_LIMITS = {
  /** Per collection (also in the schema's `maxItems`). */
  fieldsPerCollection: 30,
  /** Per site, across collections. */
  fieldsPerSite: 200,
  /** `JSON.stringify(site.collections)` in UTF-8 bytes. */
  collectionsBytes: 256 * 1024,
  /** `JSON.stringify(entry.fields)` in UTF-8 bytes. */
  valuesBytes: 256 * 1024,
  /** A text field's `maxLength` when absent, and its ceiling. */
  textLength: 5000,
  richTextLength: 50_000,
  urlLength: 2048,
  selectOptions: 50,
  /** RFC-0045: a multiple reference's or a repeater's `maxItems` when absent. */
  listItems: 20,
  /** RFC-0045: fields plus repeater sub-fields per collection. */
  leavesPerCollection: 100,
  /** RFC-0045: reference values per entry, across fields and repeater items. */
  referencesPerEntry: 100,
} as const;

/**
 * RFC-0041 §1: keys a field may not take. Every `ContentEntry` property (themes merge fields into
 * an entry view, so `title` would shadow the real one), the view's own names, and JavaScript
 * prototype names. `__proto__` cannot match the key pattern.
 */
export const RESERVED_FIELD_KEYS: ReadonlySet<string> = new Set([
  "id",
  "siteId",
  "collection",
  "slug",
  "locale",
  "status",
  "title",
  "summary",
  "body",
  "fields",
  "tags",
  "terms",
  "author",
  "coverImage",
  "publishedAt",
  "availability",
  "rev",
  "createdAt",
  "updatedAt",
  "translation",
  "metadata",
  "corrections",
  "url",
  "path",
  "href",
  "entry",
  "site",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "toLocaleString",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

export type FieldIssueCode =
  /** A value does not fit its definition. */
  | "invalid_value"
  /** A new key without a definition in a collection that has definitions. */
  | "unknown_field"
  /** A translation holds its own copy of a non-localized value. */
  | "field_not_localized"
  /** An entry in review or published lacks a `requiredToPublish` value. */
  | "required_field"
  /** `entry.fields` or `site.collections` over its byte cap. */
  | "too_large"
  /** Definitions: a reserved key. */
  | "field_key_reserved"
  /** Definitions: a key used twice in one collection. */
  | "field_key_duplicate"
  /** Definitions: a select option value used twice. */
  | "field_option_duplicate"
  /** Definitions: `minimum` above `maximum`. */
  | "field_bounds"
  /** Definitions: more fields than a collection or a site may have. */
  | "too_many_fields"
  /** Definitions: a change that could lose or reinterpret values (§6). */
  | "field_change_needs_operation"
  /** Reading: a value that no longer fits its definition resolves to `undefined`. */
  | "field_value_unreadable"
  /** RFC-0045: a reference or repeater definition this server does not accept yet. */
  | "fields_unsupported"
  /** RFC-0045: a reference's `collections` names a collection the site does not have. */
  | "reference_target_unknown"
  /** RFC-0045: a reference's `where` does not fit its target collection's list fields. */
  | "invalid_query"
  /** RFC-0045: more than 100 reference values in one entry. */
  | "too_many_references"
  /**
   * RFC-0045 §2.1: a reference to a group without a usable member of this site in one of the
   * field's collections (missing, foreign, archived, or only in other collections).
   */
  | "unknown_entry"
  /** RFC-0045 §3: translated repeater items need a list of the source's length. */
  | "translation_shape_mismatch"
  /** RFC-0045 §2.8: a new reference or repeater field over a key entries already hold. */
  | "field_key_in_use";

/** One problem, at a slash path (`fields/startsAt/at`, `collections/events/fields/2/key`). */
export interface FieldIssue {
  path: string;
  code: FieldIssueCode;
  message: string;
}

/** A collection's definitions (empty when it has none). */
export function fieldDefinitions(site: SiteFields, collection: string): readonly FieldDefinition[] {
  return site.collections?.[collection]?.fields ?? [];
}

/**
 * The top-level key a running `rename_field` still reads values from. A sub-field rename (RFC-0045
 * `migration.sub`) keeps the repeater's key, so its `fromKey` names a sub-field: none here.
 */
export const renamedFrom = (def: Pick<FieldDefinition, "migration">): string | undefined =>
  def.migration?.sub === undefined ? def.migration?.fromKey : undefined;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `record[key]` when it is the record's own property; never a prototype member (`isPrototypeOf`). */
export const ownValue = (record: Readonly<Record<string, unknown>>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Structural equality of JSON values (key order ignored). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameJson(x, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

const encoder = new TextEncoder();
/** UTF-8 bytes of a value's compact JSON. */
export const jsonBytes = (value: unknown): number =>
  encoder.encode(JSON.stringify(value) ?? "").length;

/** A label in `locale`, then `defaultLocale`, then any, else the key. */
export function fieldLabel(
  def: Pick<FieldDefinition, "key" | "labels">,
  locale: string,
  defaultLocale: string,
): string {
  const labels = def.labels;
  return (
    labels[locale]?.label ??
    labels[defaultLocale]?.label ??
    Object.values(labels).find((l) => l !== undefined)?.label ??
    def.key
  );
}

/** A field's help text in `locale`, then `defaultLocale` (no fallback to other locales). */
export function fieldHelp(
  def: Pick<FieldDefinition, "labels">,
  locale: string,
  defaultLocale: string,
): string | undefined {
  return def.labels[locale]?.help ?? def.labels[defaultLocale]?.help;
}

/** An option's words in `locale`, then `defaultLocale`, then any, else its value. */
export function optionLabel(
  def: FieldDefinition | SubFieldDefinition,
  value: string,
  locale: string,
  defaultLocale: string,
): string {
  if (def.type !== "select") return value;
  const option = def.options.find((o) => o.value === value);
  if (!option) return value;
  const labels = option.labels;
  return (
    labels[locale] ??
    labels[defaultLocale] ??
    Object.values(labels).find((l) => l !== undefined) ??
    value
  );
}
