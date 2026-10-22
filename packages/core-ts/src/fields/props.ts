/**
 * RFC-0041 §3: field definitions compiled into ADR-0030's props subset, so `validateProps` — the
 * eval-free interpreter the store, Studio and the theme generator already share — does the type
 * checks. What the subset cannot say (calendar days, zones, repeats, C0 controls, rich text over
 * the subset's 10 000-character string ceiling) is in `values.ts`.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { Localized, PropSchema, PropsSchema } from "../blocks.ts";
import { FIELD_LIMITS } from "./types.ts";

/** `YYYY-MM-DD`; whether the day exists is checked in code. */
export const DATE_PATTERN = "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$";
/** RFC 3339 in UTC (`Z`), seconds required, fraction optional. */
export const INSTANT_PATTERN =
  "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,9})?Z$";
/** The contract's `TimeZone` shape; the zone list is checked in code. */
export const TIME_ZONE_SHAPE = "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$";
/** A bare asset id, `common.schema.json#/$defs/Id` with the `asset` prefix. */
export const ASSET_ID_PATTERN = "^asset_[A-Za-z0-9]{6,32}$";

/** The subset's `Localized`: per-locale words when `en` is among them, else the first one. */
function localized(
  words: Readonly<Record<string, string | undefined>>,
  fallback: string,
): Localized {
  const entries = Object.entries(words).filter((e): e is [string, string] => e[1] !== undefined);
  if (entries.some(([l]) => l === "en")) return Object.fromEntries(entries);
  return entries[0]?.[1] ?? fallback;
}

function annotations(def: FieldDefinition): { title: Localized; description?: Localized } {
  const labels: Record<string, string> = {};
  const help: Record<string, string> = {};
  for (const [locale, l] of Object.entries(def.labels)) {
    if (!l) continue;
    labels[locale] = l.label;
    if (l.help) help[locale] = l.help;
  }
  const title = localized(labels, def.key);
  return Object.keys(help).length ? { title, description: localized(help, "") } : { title };
}

type Compile = (def: FieldDefinition) => PropSchema;

/** One compiler per type (dispatch table, RFC-0041 §2's value column). */
const COMPILE: Record<FieldDefinition["type"], Compile> = {
  text: (def) => ({
    type: "string",
    maxLength: (def.type === "text" && def.maxLength) || FIELD_LIMITS.textLength,
    ...(def.type === "text" && def.multiline ? { "x-widget": "textarea" as const } : {}),
  }),
  // No maxLength: the subset caps strings at 10 000; values.ts checks the 50 000 limit.
  richText: () => ({ type: "string", format: "markdown", "x-widget": "textarea" }),
  number: (def) => {
    const n = def.type === "number" ? def : undefined;
    return {
      type: n?.integer ? "integer" : "number",
      ...(n?.minimum !== undefined ? { minimum: n.minimum } : {}),
      ...(n?.maximum !== undefined ? { maximum: n.maximum } : {}),
    };
  },
  boolean: () => ({ type: "boolean" }),
  date: () => ({ type: "string", pattern: DATE_PATTERN }),
  datetime: () => ({
    type: "object",
    properties: {
      at: { type: "string", pattern: INSTANT_PATTERN },
      timeZone: { type: "string", maxLength: 64, pattern: TIME_ZONE_SHAPE },
    },
    required: ["at", "timeZone"],
    additionalProperties: false,
  }),
  url: () => ({ type: "string", format: "url", maxLength: FIELD_LIMITS.urlLength }),
  image: () => ({ type: "string", pattern: ASSET_ID_PATTERN }),
  select: (def) => {
    const options = def.type === "select" ? def.options : [];
    const values = options.map((o) => o.value);
    const labels = Object.fromEntries(options.map((o) => [o.value, localized(o.labels, o.value)]));
    const one = { type: "string" as const, enum: values, "x-labels": labels };
    return def.type === "select" && def.multiple
      ? { type: "array", items: one, maxItems: values.length }
      : one;
  },
};

const fieldCache = new WeakMap<FieldDefinition, PropSchema>();
const listCache = new WeakMap<readonly FieldDefinition[], PropsSchema>();

/** One field's prop schema, with its labels and help as `title`/`description`. */
export function fieldPropSchema(def: FieldDefinition): PropSchema {
  const hit = fieldCache.get(def);
  if (hit) return hit;
  const schema = { ...COMPILE[def.type](def), ...annotations(def) } as PropSchema;
  fieldCache.set(def, schema);
  return schema;
}

/**
 * The props schema of a collection's fields: every property optional (values are optional in
 * the contract; `requiredToPublish` is checked at review and publish). Cached per definitions
 * array, so a site node read once compiles once.
 */
export function fieldsPropsSchema(defs: readonly FieldDefinition[]): PropsSchema {
  const hit = listCache.get(defs);
  if (hit) return hit;
  const properties: Record<string, PropSchema> = {};
  for (const def of defs) properties[def.key] = fieldPropSchema(def);
  const schema: PropsSchema = { type: "object", properties, additionalProperties: false };
  listCache.set(defs, schema);
  return schema;
}
