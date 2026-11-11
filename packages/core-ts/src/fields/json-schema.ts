/**
 * RFC-0041 §3: the JSON Schema agents receive for a collection's `fields` (`list_collections`
 * `fieldsSchema`). Only keywords both OpenAI's and Anthropic's strict structured-output modes
 * accept: `type`, `enum`, fixed `pattern`s, `format` (`date`, `date-time`), `items`, `properties`,
 * `required` (inside the datetime object only), `additionalProperties: false`, `title` and
 * `description`. Top-level properties are not required. Numeric and length limits, which
 * Anthropic's strict mode drops, are written into each `description`; the checker enforces them.
 * Generated from definitions only, never from text an agent wrote.
 *
 * RFC-0045 §6: references are group id strings (or lists of them) and repeaters arrays of closed
 * flat objects; the root is always an object, with no `$ref` and no recursion. With
 * `{ strict: true }` the same schema in its strict profile (`json-schema-strict.ts`).
 */
import type { FieldDefinition, SubFieldDefinition } from "@cloudhal/core-contracts";
import { type EmitWords, emitReference, emitRepeater } from "../references/json-schema.ts";
import { strictFieldsSchema } from "./json-schema-strict.ts";
import { ASSET_ID_PATTERN } from "./props.ts";
import { FIELD_LIMITS, fieldHelp, fieldLabel, isKnownFieldType, optionLabel } from "./types.ts";

export type JsonType = "object" | "string" | "number" | "integer" | "boolean" | "array";

/** The subset of JSON Schema this emitter writes. */
export interface JsonSchema {
  /** A list only in the strict profile: `[T, "null"]`. */
  type: JsonType | readonly [JsonType, "null"];
  title?: string;
  description?: string;
  /** `null` only in the strict profile. */
  enum?: (string | null)[];
  pattern?: string;
  format?: "date" | "date-time";
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
}

/** The keywords `fieldsJsonSchema` may emit (tests hold it to this list). */
export const JSON_SCHEMA_KEYWORDS: readonly string[] = [
  "type",
  "title",
  "description",
  "enum",
  "pattern",
  "format",
  "items",
  "properties",
  "required",
  "additionalProperties",
];

type Words = EmitWords;

type Emit = (def: FieldDefinition, words: Words) => { schema: JsonSchema; notes: string[] };

export interface FieldsJsonSchemaOptions {
  /** The strict profile (`fieldsSchemaStrict`): every property required, optional ones nullable. */
  strict?: boolean | undefined;
  /** A collection's name for reference targets ("Places"); absent: its key. */
  collectionName?: ((key: string) => string | undefined) | undefined;
}

const EMIT: Record<FieldDefinition["type"], Emit> = {
  text: (def) => {
    const max = (def.type === "text" && def.maxLength) || FIELD_LIMITS.textLength;
    const multiline = def.type === "text" && def.multiline === true;
    return {
      schema: { type: "string" },
      notes: [
        `Plain text, at most ${max} characters.`,
        multiline ? "Line breaks allowed." : "One line.",
      ],
    };
  },
  richText: () => ({
    schema: { type: "string" },
    notes: [`Markdown (Cloudhal Markdown v1), at most ${FIELD_LIMITS.richTextLength} characters.`],
  }),
  number: (def) => {
    const n = def.type === "number" ? def : undefined;
    const notes = [n?.integer ? "A whole number." : "A number."];
    if (n?.minimum !== undefined) notes.push(`At least ${n.minimum}.`);
    if (n?.maximum !== undefined) notes.push(`At most ${n.maximum}.`);
    return { schema: { type: n?.integer ? "integer" : "number" }, notes };
  },
  boolean: () => ({ schema: { type: "boolean" }, notes: ["Absent reads as false."] }),
  date: () => ({
    schema: { type: "string", format: "date" },
    notes: ["A calendar day, YYYY-MM-DD, without a time zone."],
  }),
  datetime: () => ({
    schema: {
      type: "object",
      properties: {
        at: {
          type: "string",
          format: "date-time",
          description: "The instant in UTC, RFC 3339 ending in Z, e.g. 2026-11-05T16:30:00Z.",
        },
        timeZone: {
          type: "string",
          description: "The IANA time zone it happens in, e.g. Europe/Istanbul.",
        },
      },
      required: ["at", "timeZone"],
      additionalProperties: false,
    },
    notes: ["A date and time with its time zone."],
  }),
  url: () => ({
    // No `format: uri`: site-relative paths and #fragments are allowed and are not URIs.
    schema: { type: "string" },
    notes: [
      `A link: https:, http:, mailto: or tel:, a site path (/about) or a #fragment; at most ${FIELD_LIMITS.urlLength} characters.`,
    ],
  }),
  image: () => ({
    schema: { type: "string", pattern: ASSET_ID_PATTERN },
    notes: ["The id of an image asset of this site (asset_…)."],
  }),
  select: (def, { locale, defaultLocale }) => {
    const options = def.type === "select" ? def.options : [];
    const values = options.map((o) => o.value);
    const listed = options
      .map((o) => `${o.value} (${optionLabel(def, o.value, locale, defaultLocale)})`)
      .join(", ");
    const one: JsonSchema = { type: "string", enum: values };
    return def.type === "select" && def.multiple
      ? {
          schema: { type: "array", items: one },
          notes: [`Any of: ${listed}; each at most once.`],
        }
      : { schema: one, notes: [`One of: ${listed}.`] };
  },
  reference: (def, words) =>
    def.type === "reference"
      ? emitReference(def, words)
      : { schema: { type: "string" }, notes: [] },
  repeater: (def, words) =>
    def.type === "repeater"
      ? emitRepeater(def, words, subFieldJsonSchema)
      : { schema: { type: "array" }, notes: [] },
};

/** A repeater sub-field's schema: its type's, with its label, help and limits (no localization note). */
function subFieldJsonSchema(sub: SubFieldDefinition, words: Words): JsonSchema {
  const def = sub as unknown as FieldDefinition;
  const { schema, notes } = EMIT[sub.type](def, words);
  const help = fieldHelp(def, words.locale, words.defaultLocale);
  if (sub.type !== "boolean" && sub.requiredToPublish) notes.push("Needed to publish.");
  return {
    ...schema,
    title: fieldLabel(def, words.locale, words.defaultLocale),
    description: [help, ...notes].filter(Boolean).join(" "),
  };
}

const SHARED: Partial<Record<FieldDefinition["type"], string>> = {
  reference:
    "Set on the original only; every language version shows the targets in its own language.",
  repeater: "Set on the original only; every language version shows this list.",
};

/** One field's schema, with its label as `title` and help plus limits as `description`. */
export function fieldJsonSchema(
  def: FieldDefinition,
  locale: string,
  defaultLocale = locale,
  options: Pick<FieldsJsonSchemaOptions, "collectionName"> = {},
): JsonSchema {
  const words: Words = { locale, defaultLocale, collectionName: options.collectionName };
  const { schema, notes } = EMIT[def.type](def, words);
  const help = fieldHelp(def, locale, defaultLocale);
  if (!def.localized)
    notes.push(SHARED[def.type] ?? "Set on the original only; translations read it from there.");
  if (def.type !== "boolean" && def.requiredToPublish) notes.push("Needed to publish.");
  return {
    ...schema,
    title: fieldLabel(def, locale, defaultLocale),
    description: [help, ...notes].filter(Boolean).join(" "),
  };
}

/**
 * The schema of a collection's `fields` object, in `locale` (labels fall back to
 * `defaultLocale`, then any). Every property is optional; omit a key to leave it unset. With
 * `strict`, its strict profile. A definition of a type this version does not know is left out.
 */
export function fieldsJsonSchema(
  defs: readonly FieldDefinition[],
  locale: string,
  defaultLocale = locale,
  options: FieldsJsonSchemaOptions = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const def of defs)
    if (isKnownFieldType(def.type))
      properties[def.key] = fieldJsonSchema(def, locale, defaultLocale, options);
  const open: JsonSchema = {
    type: "object",
    description:
      "Typed custom fields of this collection. Every field is optional; leave a key out to leave it unset.",
    properties,
    additionalProperties: false,
  };
  return options.strict ? strictFieldsSchema(open) : open;
}
