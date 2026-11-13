/**
 * RFC-0045 §6 for `create_entry` and `update_entry`: the three ways a call gives typed field
 * values, read into one merge patch (`null` removes a key) before the store's checker sees it.
 *
 * - `fields`: the open profile, as before (on update a merge patch: `null` removes a key).
 * - `fieldsStrict`: the strict profile (`fieldsSchemaStrict`), excluding `fields`. `null` or a
 *   missing key leaves the value as it is; `null` sub-values in repeater items are stripped and
 *   all-null items dropped (`droppedItems`), by core-ts's `readStrictFields`.
 * - `clearFields`: keys to remove, with either input; on update only. Setting and clearing one key
 *   is refused (`invalid`), and a key the collection does not define (nor, without definitions,
 *   hold) is `unknown_field`.
 *
 * A given reference or repeater value replaces the whole value in every profile.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { SiteSchema } from "@cloudhal/core-contracts";
import {
  type DroppedItem,
  type FieldIssue,
  readStrictFields,
  refuseFieldIssues,
} from "@cloudhal/core-ts/fields";
import { type JsonSchema, ToolError } from "./common.ts";

type Values = Record<string, unknown>;

const KEY = (SiteSchema.$defs as Record<string, JsonSchema>).FieldKey as JsonSchema;

/** `fieldsStrict`: a static schema cannot vary by collection, so it points to list_collections. */
export const FIELDS_STRICT_INPUT: JsonSchema = {
  type: "object",
  description:
    "Instead of fields, for strict structured output: an object following the collection's fieldsSchemaStrict (list_collections), or any subset of its keys. null, or a key left out, leaves the value as it is (on create: no value); a given value replaces the whole value; inside a repeater item null unsets that sub-value, and an item left empty is dropped (reported in droppedItems). Remove values with clearFields.",
};

/** `clearFields`. */
export const CLEAR_FIELDS_INPUT: JsonSchema = {
  type: "array",
  description:
    "Keys of typed custom fields to remove, with fields or fieldsStrict; a key may not also be set in the same call",
  items: KEY,
  uniqueItems: true,
  maxItems: 100,
};

/** `droppedItems` in the answer. */
export const DROPPED_ITEMS_OUTPUT: JsonSchema = {
  type: "array",
  description: "Repeater items of fieldsStrict whose sub-values were all null: not stored",
  items: {
    type: "object",
    properties: { field: { type: "string" }, index: { type: "integer" } },
    required: ["field", "index"],
  },
};

export interface FieldsInput {
  /** The merge patch to apply (`null` removes a key); undefined when the call gives no fields. */
  patch: Values | undefined;
  droppedItems: DroppedItem[];
}

const record = (v: unknown): Values | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Values) : undefined;

/** Refuses keys that are neither defined nor (in a collection without definitions) stored. */
function unknownKeys(
  keys: readonly string[],
  at: (key: string, i: number) => string,
  known: (key: string) => boolean,
): void {
  const issues: FieldIssue[] = [];
  keys.forEach((key, i) => {
    if (!known(key))
      issues.push({
        path: at(key, i),
        code: "unknown_field",
        message: `${key} is not a field of this collection (list_collections → fields)`,
      });
  });
  refuseFieldIssues(issues);
}

/**
 * The call's field values as one merge patch. `defs` are the collection's definitions and
 * `stored` the stored values (absent on create, where `clearFields` is refused).
 */
export function fieldsInputOf(
  a: Record<string, unknown>,
  defs: readonly FieldDefinition[],
  stored: Values | undefined,
  mode: "create" | "update",
): FieldsInput {
  const open = record(a.fields);
  const strict = record(a.fieldsStrict);
  const clear = Array.isArray(a.clearFields) ? (a.clearFields as string[]) : [];
  if (a.fields !== undefined && a.fieldsStrict !== undefined)
    throw new ToolError("invalid", "give fields or fieldsStrict, not both");
  if (mode === "create" && a.clearFields !== undefined)
    throw new ToolError("invalid", "clearFields: a new entry has nothing to clear");
  const defined = new Set(defs.map((d) => d.key));
  const known = (key: string) =>
    defs.length > 0 ? defined.has(key) : Object.hasOwn(stored ?? {}, key);
  unknownKeys(clear, (_k, i) => `clearFields/${i}`, known);
  if (strict && defs.length > 0)
    unknownKeys(
      Object.keys(strict),
      (k) => `fieldsStrict/${k}`,
      (k) => defined.has(k),
    );
  const read = strict ? readStrictFields(defs, strict) : { values: open, droppedItems: [] };
  const set = read.values ?? {};
  const both = clear.filter((k) => Object.hasOwn(set, k) && set[k] !== null);
  if (both.length > 0)
    throw new ToolError("invalid", `set or clear, not both: ${both.join(", ")}`, {
      fields: both,
    });
  if (!read.values && clear.length === 0) return { patch: undefined, droppedItems: [] };
  const cleared = Object.fromEntries(clear.map((k) => [k, null]));
  return { patch: { ...set, ...cleared }, droppedItems: read.droppedItems };
}
