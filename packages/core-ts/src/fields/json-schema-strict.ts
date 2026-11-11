/**
 * RFC-0045 §6: the strict profile of the fields schema (`fieldsSchemaStrict`) and what it costs a
 * provider (`strictCost`). OpenAI's strict mode needs every property required, optional ones as a
 * `null` union, so every property that the open profile leaves optional becomes `[T, "null"]` (with
 * `null` in its `enum`). At the top level `null` means "leave as it is"; inside a repeater item it
 * means "unset", since a given list replaces the whole list. Properties the open profile already
 * requires (a datetime's `at` and `timeZone`) stay as they are. Array items are never nullable.
 */
import type { JsonSchema } from "./json-schema.ts";

/** What a strict schema spends of a provider's limits (OpenAI: 5,000 properties, 10 levels, 1,000 enum values; Anthropic: 16 unions per request). */
export interface StrictCost {
  /** Property entries in every object. */
  properties: number;
  /** Nesting levels, the root counting 1 (fields → list → item → value is 4). */
  depth: number;
  /** `enum` entries, `null` included. */
  enumValues: number;
  /** Schemas whose `type` is a list (`[T, "null"]`). */
  unions: number;
}

const ROOT =
  "Typed custom fields of this collection, for strict structured output (fieldsStrict): every key is required, null leaves the stored value as it is (on create: no value), and clearFields removes a value.";
const ITEM_NULLS =
  "Every key is required: null unsets that value in this item, since a given list replaces the whole stored list.";

function nullable(schema: JsonSchema): JsonSchema {
  const t = schema.type;
  const type: JsonSchema["type"] = typeof t === "string" ? [t, "null"] : t;
  const out: JsonSchema = { ...schema, type };
  if (schema.enum) out.enum = [...schema.enum.filter((v) => v !== null), null];
  return out;
}

function strictObject(schema: JsonSchema, isItem: boolean): JsonSchema {
  const required = new Set(schema.required ?? []);
  const properties: Record<string, JsonSchema> = {};
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const strict = strictNode(child);
    properties[key] = required.has(key) ? strict : nullable(strict);
  }
  const out: JsonSchema = { ...schema, properties, required: Object.keys(properties) };
  if (isItem) out.description = out.description ? `${out.description} ${ITEM_NULLS}` : ITEM_NULLS;
  return out;
}

function strictNode(schema: JsonSchema): JsonSchema {
  if (schema.type === "object") return strictObject(schema, false);
  if (schema.type === "array" && schema.items) {
    const items = schema.items.type === "object" ? strictObject(schema.items, true) : schema.items;
    return { ...schema, items };
  }
  return schema;
}

/** The strict profile of an open-profile fields schema (`fieldsJsonSchema`'s output). */
export function strictFieldsSchema(open: JsonSchema): JsonSchema {
  return { ...strictObject(open, false), description: ROOT };
}

/** Counts `schema`'s properties, depth, enum values and unions (`list_collections` `strictCost`). */
export function strictSchemaCost(schema: JsonSchema): StrictCost {
  const cost: StrictCost = { properties: 0, depth: 0, enumValues: 0, unions: 0 };
  const walk = (s: JsonSchema, level: number): void => {
    cost.depth = Math.max(cost.depth, level);
    cost.enumValues += s.enum?.length ?? 0;
    if (typeof s.type !== "string") cost.unions += 1;
    const children = Object.values(s.properties ?? {});
    cost.properties += children.length;
    for (const c of children) walk(c, level + 1);
    if (s.items) walk(s.items, level + 1);
  };
  walk(schema, 1);
  return cost;
}
