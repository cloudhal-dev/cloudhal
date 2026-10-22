/**
 * RFC-0041 / ADR-0043: shared names of typed custom fields — the issue shape, the limits, the
 * reserved keys and small helpers. Worker-safe, no imports beyond contract types.
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";

export type FieldType = FieldDefinition["type"];
export type SelectFieldDefinition = Extract<FieldDefinition, { type: "select" }>;
/** What field code reads of a site: its collection settings. */
export interface SiteFields {
  collections?: Site["collections"] | undefined;
}

/** The nine closed types, in the contract's order. */
export const FIELD_TYPES: readonly FieldType[] = [
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
  | "field_value_unreadable";

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

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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
export function fieldLabel(def: FieldDefinition, locale: string, defaultLocale: string): string {
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
  def: FieldDefinition,
  locale: string,
  defaultLocale: string,
): string | undefined {
  return def.labels[locale]?.help ?? def.labels[defaultLocale]?.help;
}

/** An option's words in `locale`, then `defaultLocale`, then any, else its value. */
export function optionLabel(
  def: FieldDefinition,
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
