/**
 * RFC-0041 §8 for the collection tools: `list_collections` shows each collection's field
 * definitions and the JSON Schema of its values (in the caller's locale), and `update_collection`
 * takes the whole `fields` list for free edits (§6). Changes that could lose values are refused by
 * the store's guard (`field_change_needs_operation`) and go through the operation tools instead.
 */
import type { CollectionSettings, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { SiteSchema } from "@cloudhal/core-contracts";
import { fieldLabel, fieldsJsonSchema } from "@cloudhal/core-ts/fields";
import { type JsonSchema, quote } from "./common.ts";

const DEFS = SiteSchema.$defs as Record<string, JsonSchema>;
const VARIANTS = (DEFS.FieldDefinition as JsonSchema).oneOf as JsonSchema[];

/** A definition variant without `migration`: only field operations write the marker. */
function withoutMarker(variant: JsonSchema): JsonSchema {
  const { migration: _m, ...properties } = variant.properties as Record<string, unknown>;
  return { ...variant, properties };
}

/** `update_collection`'s `fields`: the contract's definitions, minus the operation marker. */
export const FIELD_DEFINITIONS_INPUT: JsonSchema = {
  type: "array",
  maxItems: 30,
  description:
    "The collection's typed custom fields, the whole list in form order ([] removes them all). Free edits only: add fields, reorder, change labels and help, add select options or change their labels, toggle multiline, searchable or requiredToPublish, change maxLength/minimum/maximum. Renaming a key, changing a type, localized or multiple, and dropping a key or option still in use need rename_field, change_field_type, set_field_localized or remove_field.",
  items: { $ref: "#/$defs/FieldDefinition" },
  $defs: {
    FieldDefinition: {
      ...DEFS.FieldDefinition,
      oneOf: VARIANTS.map(withoutMarker),
    },
    FieldKey: DEFS.FieldKey,
    FieldLabel: DEFS.FieldLabel,
    FieldLabels: DEFS.FieldLabels,
    FieldOption: DEFS.FieldOption,
    Slug: DEFS.Slug,
    Locale: DEFS.Locale,
  },
};

/**
 * The settings with `fields` replaced by the agent's list. A running operation's marker stays on
 * its field (agents never write it), so editing labels meanwhile is not read as touching it.
 */
export function withFields(
  current: CollectionSettings,
  next: CollectionSettings,
  fields: FieldDefinition[],
): CollectionSettings {
  const markers = new Map((current.fields ?? []).map((d) => [d.key, d.migration]));
  const { fields: _old, ...rest } = next;
  if (fields.length === 0) return rest;
  return {
    ...rest,
    fields: fields.map((d) => {
      const { migration: _m, ...def } = d;
      const marker = markers.get(d.key);
      return (marker ? { ...def, migration: marker } : def) as FieldDefinition;
    }) as NonNullable<CollectionSettings["fields"]>,
  };
}

/** JSON with sorted keys: stored definitions may list properties in another order. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}

/** One line for the approval prompt: which fields are added, changed, removed or reordered. */
export function describeFieldEdits(
  before: readonly FieldDefinition[],
  after: readonly FieldDefinition[],
  locale: string,
): string | undefined {
  const old = new Map(before.map((d) => [d.key, d]));
  const now = new Map(after.map((d) => [d.key, d]));
  const name = (d: FieldDefinition) => `"${quote(fieldLabel(d, locale, locale), 40)}" (${d.key})`;
  const parts: string[] = [];
  for (const d of after) {
    const was = old.get(d.key);
    if (!was) parts.push(`add ${name(d)}, ${d.type}${d.localized ? ", localized" : ""}`);
    else if (canonical(was) !== canonical(d)) parts.push(`change ${name(d)}`);
  }
  for (const d of before) if (!now.has(d.key)) parts.push(`remove ${name(d)}`);
  const kept = (list: readonly FieldDefinition[], other: Map<string, FieldDefinition>) =>
    list.filter((d) => other.has(d.key)).map((d) => d.key);
  if (kept(before, now).join() !== kept(after, old).join()) parts.push("reorder");
  return parts.length ? `  fields: ${parts.join("; ")}` : undefined;
}

/** What `list_collections` adds per collection that has definitions. */
export function fieldsView(
  site: Site,
  key: string,
  locale: string,
): { fields: FieldDefinition[]; fieldsSchema: JsonSchema } | Record<string, never> {
  const fields = site.collections?.[key]?.fields;
  if (!fields?.length) return {};
  return {
    fields,
    fieldsSchema: fieldsJsonSchema(fields, locale, site.defaultLocale) as unknown as JsonSchema,
  };
}
