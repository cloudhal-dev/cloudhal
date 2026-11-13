/**
 * RFC-0041 §3, §8 and RFC-0045 §6: typed custom field values over MCP. `create_entry` and
 * `update_entry` check them in `precheck` with the store's own write plan, run as a dry run
 * (`NodeWriteOptions.dryRun`): values of changed keys, unknown keys, a translation's copy of a
 * non-localized value, `requiredToPublish` for review and published, image and `asset:`
 * references, and RFC-0045's reference targets (a group of this site in an allowed collection,
 * not the entry's own, `where`), repeater items and the 100-references cap. So a call that the
 * store would refuse never reaches a person. `update_entry` takes `fields` as a merge patch (`null`
 * removes a key); `fieldsStrict` and `clearFields` are read in `entry-fields-input.ts`, the
 * approval prompt's wording is `field-prompts.ts`.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import type { Creatable } from "@cloudhal/core-ts";
import { isReservedKey } from "@cloudhal/core-ts/names";
import { type JsonSchema, type ToolContext, ToolError, toToolError } from "./common.ts";

type Values = Record<string, unknown>;

/** `create_entry`'s `fields`: a static schema cannot vary by site, so it points to list_collections. */
export const FIELDS_INPUT: JsonSchema = {
  type: "object",
  description:
    "Typed custom fields of the collection: read its fieldsSchema from list_collections first (keys, types, allowed values, limits). A collection without field definitions takes any JSON here.",
};

/** `update_entry`'s `fields`: a merge patch. */
export const FIELDS_PATCH: JsonSchema = {
  type: "object",
  description:
    "Typed custom fields to change, as a merge patch: given keys are set, null removes a key, others stay. The collection's fieldsSchema (list_collections) lists the keys and allowed values.",
};

/**
 * The stored `fields` with `patch` applied: `null` removes a key. A reserved key (`__proto__`,
 * `constructor`, `prototype`) is refused, also for collections without field definitions: JSON
 * input can carry `__proto__` as an own key, and assigning it would swap the object's prototype.
 */
export function mergeFields(current: Values | undefined, patch: Values): Values {
  const next: Values = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (isReservedKey(key)) throw new ToolError("invalid", `fields: "${key}" is a reserved key`);
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/**
 * The store's plan-time checks of a write, without writing (`dryRun`): throws what the write
 * would, as tool errors (`invalid_fields`, `unknown_field`, `unknown_entry`, `required_field`,
 * `required_term`, …, every issue at its path), else returns the entry as the store would write
 * it (canonical reference ids, values through the markers). `update` is the stored entry with
 * the call's changes.
 */
export async function checkEntryWrite(
  ctx: ToolContext,
  write: { update: ContentEntry } | { create: Creatable<ContentEntry> },
): Promise<ContentEntry> {
  try {
    if ("update" in write)
      return await ctx.store.updateContentEntry(write.update, { dryRun: true });
    return await ctx.store.createContentEntry(write.create, { dryRun: true });
  } catch (e) {
    throw toToolError(e);
  }
}
