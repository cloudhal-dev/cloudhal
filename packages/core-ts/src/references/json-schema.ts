/**
 * RFC-0045 §6: the open-profile JSON Schema of reference and repeater fields, for
 * `fieldsJsonSchema`. A reference is a group id string (or a list of them); a repeater an array of
 * closed flat objects. No `$ref`, no recursion, depth at most 4; limits go into `description`.
 */
import type { FieldDefinition, SubFieldDefinition } from "@cloudhal/core-contracts";
import type { JsonSchema } from "../fields/json-schema.ts";
import { GROUP_ID_PATTERN } from "../fields/props.ts";
import { FIELD_LIMITS } from "../fields/types.ts";

export interface EmitWords {
  locale: string;
  defaultLocale: string;
  /** A collection's name for agents, e.g. "Places"; absent: the key alone. */
  collectionName?: ((key: string) => string | undefined) | undefined;
}

export interface Emitted {
  schema: JsonSchema;
  notes: string[];
}

/** One sub-field's schema with its title and description (the caller emits the scalar types). */
export type EmitSub = (sub: SubFieldDefinition, words: EmitWords) => JsonSchema;

/** "Places (places) or People (people)". */
function targets(collections: readonly string[], words: EmitWords): string {
  const named = collections.map((key) => {
    const name = words.collectionName?.(key);
    return name && name !== key ? `${name} (${key})` : key;
  });
  return named.length > 1
    ? `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}`
    : (named[0] ?? "");
}

const ONE = (): JsonSchema => ({ type: "string", pattern: GROUP_ID_PATTERN });

/** A reference: a group id, or with `multiple` a list of them. */
export function emitReference(
  def: Pick<
    Extract<FieldDefinition, { type: "reference" }>,
    "collections" | "multiple" | "maxItems"
  >,
  words: EmitWords,
): Emitted {
  const where = `An entry in ${targets(def.collections, words)} of this site, by the groupId list_entries returns (an entry's own id is replaced by its group's).`;
  if (!def.multiple) return { schema: ONE(), notes: [where] };
  const max = def.maxItems ?? FIELD_LIMITS.listItems;
  return {
    schema: { type: "array", items: ONE() },
    notes: [
      `An ordered list of at most ${max} entries in ${targets(def.collections, words)} of this site, by groupId, each at most once.`,
    ],
  };
}

/** A repeater: an ordered list of closed flat objects, one property per sub-field. */
export function emitRepeater(
  def: Extract<FieldDefinition, { type: "repeater" }>,
  words: EmitWords,
  emitSub: EmitSub,
): Emitted {
  const properties: Record<string, JsonSchema> = {};
  for (const sub of def.fields) properties[sub.key] = emitSub(sub, words);
  const max = def.maxItems ?? FIELD_LIMITS.listItems;
  return {
    schema: { type: "array", items: { type: "object", properties, additionalProperties: false } },
    notes: [`An ordered list of at most ${max} items; an item holds at least one value.`],
  };
}
