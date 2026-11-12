/**
 * RFC-0045 §7: the one rule for "is this value already in the new type?" while `change_field_type`
 * runs text ↔ reference (single or multiple, top-level or in a `sub` item). A group id is valid
 * text and id-shaped text a valid single reference, so neither "fits" nor the entry's hash can
 * say. The writers decide by the facts phase C reads, the node's `entry_refs` rows for the field
 * path (`FieldRows`): the dry run, phase B and the revert load them once per pass, a person's write
 * reads its node's. Readers without rows (`resolveFields`, the renderer) use a display rule.
 *
 * - **Text → reference**, for an id-shaped value (a string, or every element of a multiple's
 *   list). The entry's own group fails first, in every caller. In the target shape with a row for
 *   every id: kept. Written under the new type by a person's write (it differs from the stored
 *   value) and fitting: kept, and the writer's guard checks it. Otherwise it is legacy text that
 *   happens to be an id: `check` writes it as a reference (a bare string wrapped for a multiple)
 *   under the fresh guard, with its rows, when every id names a usable group; else it fails, is
 *   reported, and `clear` drops it. Any other text goes through the table (`byText`). Display: an
 *   id-shaped value naming a member group shows as a reference.
 * - **Reference → text**, per value. A string with its own row (`rows.has`) is still a reference:
 *   a group in `titles` converts to its title, any other fails (reported; `clear` removes it and
 *   its rows). A string with no row of its own is text already, an id-shaped title included. A
 *   non-string (a list, `[]` too) is never text yet and goes through the table (joined titles, no
 *   value, or a failure). Display: a group in `titles` shows its title, any other string as it is.
 * - **No maps** (`checkRequiredToPublish`, prechecks): kept as stored.
 *
 * Other conversion rows keep RFC-0041's pristine rule. Pure.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { ConvertContext } from "./conversions.ts";
import { GROUP_ID_PATTERN } from "./props.ts";
import type { FieldType } from "./types.ts";
import { valueIssues } from "./value-checks.ts";

const GROUP_ID = new RegExp(GROUP_ID_PATTERN);

/** What a value under a text ↔ reference marker is. */
export type TextReferenceOutcome =
  /** Already in the new type: left as stored. */
  | { readonly kind: "keep" }
  /** Legacy id-shaped text naming a usable group: written as a reference, guard and rows run. */
  | { readonly kind: "check" }
  /** Through the conversion table. */
  | { readonly kind: "table" }
  | { readonly kind: "fail"; readonly reason: string };

/** The node's `entry_refs` rows for the converting field path (`venue`, `speakers.host`). */
export interface FieldRows {
  /** A row names this group. */
  has(target: string): boolean;
  /** Any row is left. */
  readonly any: boolean;
}

export interface TextReferenceInput {
  readonly from: FieldType;
  readonly def: FieldDefinition;
  readonly value: unknown;
  readonly convert: Pick<ConvertContext, "entries" | "group">;
  /**
   * The rows phase C reads, for the writers that decide (the dry run, phase B, the revert, a
   * person's write). Absent: a reader's display rule.
   */
  readonly rows?: FieldRows | undefined;
  /** A person's write changed the value (its stored value differs). */
  readonly written: boolean;
}

/** True for the rows this module decides: text → reference and reference → text. */
export const isTextReference = (from: string | undefined, to: string): boolean =>
  (from === "text" && to === "reference") || (from === "reference" && to === "text");

const OWN: TextReferenceOutcome = {
  kind: "fail",
  reason: "an entry cannot reference its own translation group",
};

/** Text → reference over the ids of a value (a string, or a multiple's list). */
function toReference(input: TextReferenceInput, ids: readonly string[]): TextReferenceOutcome {
  const { def, convert, rows } = input;
  if (ids.some((id) => id === convert.group)) return OWN;
  const maps = convert.entries;
  if (def.type !== "reference" || !maps) return { kind: "keep" };
  // In the target shape and every id with its row: what phase B or an accepted write left.
  const shaped = Array.isArray(input.value) === (def.multiple === true);
  if (!rows)
    return ids.every((id) => maps.titles.has(id)) && shaped ? { kind: "keep" } : { kind: "table" };
  if (shaped && ids.every((id) => rows.has(id))) return { kind: "keep" };
  if (input.written && shaped && valueIssues(def, input.value, "v").length === 0)
    return { kind: "keep" };
  const gone = ids.find((id) => !maps.usable.has(id));
  if (gone === undefined) return { kind: "check" };
  return { kind: "fail", reason: `${gone} names no usable entry of ${def.collections.join(", ")}` };
}

/**
 * The decision for one value, or undefined when the row is not text ↔ reference. Phase C's
 * pending check reads the same rows (`plan-sub.ts`), so the two cannot disagree.
 */
export function textReferenceOutcome(input: TextReferenceInput): TextReferenceOutcome | undefined {
  const { from, def, value, convert, rows } = input;
  if (!isTextReference(from, def.type)) return undefined;
  const maps = convert.entries;
  if (def.type === "reference") {
    const ids = Array.isArray(value) ? value : [value];
    const idShaped = ids.length > 0 && ids.every((v) => typeof v === "string" && GROUP_ID.test(v));
    if (idShaped) return toReference(input, ids as string[]);
    if (!maps) return { kind: "keep" };
    if (input.written && valueIssues(def, value, "v").length === 0) return { kind: "keep" };
    return { kind: "table" };
  }
  // Reference → text, per value: a string is still a reference only with its own row; a
  // non-string (a list, `[]` included) is never text yet, so it goes through the table.
  if (!maps) return { kind: "keep" };
  if (input.written && valueIssues(def, value, "v").length === 0) return { kind: "keep" };
  if (typeof value !== "string") return { kind: "table" };
  const still = rows ? rows.has(value) : maps.titles.has(value);
  if (!still) return { kind: "keep" };
  return maps.titles.has(value)
    ? { kind: "table" }
    : { kind: "fail", reason: `${value} has no entry in this site` };
}
