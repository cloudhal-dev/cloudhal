/**
 * RFC-0041 §3: the JSON Schema agents receive for a collection's `fields` (`list_collections`
 * `fieldsSchema`). Only keywords both OpenAI's and Anthropic's strict structured-output modes
 * accept: `type`, `enum`, fixed `pattern`s, `format` (`date`, `date-time`), `items`, `properties`,
 * `required` (inside the datetime object only), `additionalProperties: false`, `title` and
 * `description`. Top-level properties are not required. Numeric and length limits, which
 * Anthropic's strict mode drops, are written into each `description`; the checker enforces them.
 * Generated from definitions only, never from text an agent wrote.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { ASSET_ID_PATTERN } from "./props.ts";
import { FIELD_LIMITS, fieldHelp, fieldLabel, optionLabel } from "./types.ts";

/** The subset of JSON Schema this emitter writes. */
export interface JsonSchema {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  title?: string;
  description?: string;
  enum?: string[];
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

interface Words {
  locale: string;
  defaultLocale: string;
}

type Emit = (def: FieldDefinition, words: Words) => { schema: JsonSchema; notes: string[] };

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
};

/** One field's schema, with its label as `title` and help plus limits as `description`. */
export function fieldJsonSchema(
  def: FieldDefinition,
  locale: string,
  defaultLocale = locale,
): JsonSchema {
  const words = { locale, defaultLocale };
  const { schema, notes } = EMIT[def.type](def, words);
  const help = fieldHelp(def, locale, defaultLocale);
  if (!def.localized) notes.push("Set on the original only; translations read it from there.");
  if (def.type !== "boolean" && def.requiredToPublish) notes.push("Needed to publish.");
  return {
    ...schema,
    title: fieldLabel(def, locale, defaultLocale),
    description: [help, ...notes].filter(Boolean).join(" "),
  };
}

/**
 * The schema of a collection's `fields` object, in `locale` (labels fall back to
 * `defaultLocale`, then any). Every property is optional; omit a key to leave it unset.
 */
export function fieldsJsonSchema(
  defs: readonly FieldDefinition[],
  locale: string,
  defaultLocale = locale,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const def of defs) properties[def.key] = fieldJsonSchema(def, locale, defaultLocale);
  return {
    type: "object",
    description:
      "Typed custom fields of this collection. Every field is optional; leave a key out to leave it unset.",
    properties,
    additionalProperties: false,
  };
}
