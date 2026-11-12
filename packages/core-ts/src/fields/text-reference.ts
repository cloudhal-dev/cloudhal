/**
 * RFC-0045 §7: the one rule for "is this value already in the new type?" while `change_field_type`
 * runs text ↔ reference (single or multiple, top-level or in a `sub` item). A group id is valid
 * text and id-shaped text a valid single reference, so whether a value "fits" cannot say. Every
 * caller asks this module: the dry run, phase B, the revert, a person's write
 * (`normalizeThroughMarkers`), `resolveFields` with and without maps, and so the renderer.
 *
 * - **Written under the new type** (a person's write that changes the value): kept when it fits;
 *   the writer's own guard checks it as newly chosen.
 * - **No maps** (readers that do not convert: `checkRequiredToPublish`, prechecks): kept as stored.
 * - **Text → reference.** A list is a converted value. An id-shaped string naming a group with a
 *   member in the target collections, in any status, is a converted value too, except while it is
 *   pristine (unchanged since the operation began): legacy text that happens to be an id, which
 *   phase B writes again (`check`) so the fresh guard and the rows run, and which is unconvertible
 *   when its group has no usable member or is the entry's own. Anything else goes through the
 *   table (`byText`).
 * - **Reference → text.** A string naming a group in `titles` converts to its title. A pristine
 *   value naming no group is unconvertible (its reference has no member left). Any other string is
 *   text already, an id-shaped title included.
 *
 * Phase C's pending check follows the rows the same way (`plan-sub.ts`). Pure.
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
  /** Pristine legacy id: kept, but written again so the target guard and the rows run. */
  | { readonly kind: "check" }
  /** Through the conversion table. */
  | { readonly kind: "table" }
  | { readonly kind: "fail"; readonly reason: string };

export interface TextReferenceInput {
  readonly from: FieldType;
  readonly def: FieldDefinition;
  readonly value: unknown;
  readonly convert: Pick<ConvertContext, "entries" | "group">;
  /** Unchanged since the operation began (phase B and the dry run know it). */
  readonly pristine: boolean;
  /** A person's write changed the value (its stored value differs). */
  readonly written: boolean;
}

/** True for the rows this module decides: text → reference and reference → text. */
export const isTextReference = (from: string | undefined, to: string): boolean =>
  (from === "text" && to === "reference") || (from === "reference" && to === "text");

/** The decision for one value, or undefined when the row is not text ↔ reference. */
export function textReferenceOutcome(input: TextReferenceInput): TextReferenceOutcome | undefined {
  const { from, def, value, convert, pristine } = input;
  if (!isTextReference(from, def.type)) return undefined;
  if (input.written)
    return valueIssues(def, value, "v").length === 0 ? { kind: "keep" } : { kind: "table" };
  const maps = convert.entries;
  if (!maps) return { kind: "keep" };
  if (def.type === "reference") {
    if (Array.isArray(value)) return { kind: "keep" };
    if (typeof value !== "string" || !GROUP_ID.test(value)) return { kind: "table" };
    if (!pristine) return maps.titles.has(value) ? { kind: "keep" } : { kind: "table" };
    if (value === convert.group)
      return { kind: "fail", reason: "an entry cannot reference its own translation group" };
    return maps.usable.has(value)
      ? { kind: "check" }
      : { kind: "fail", reason: `${value} names no usable entry of ${def.collections.join(", ")}` };
  }
  if (Array.isArray(value)) return { kind: "table" };
  if (typeof value !== "string" || maps.titles.has(value)) return { kind: "table" };
  return pristine
    ? { kind: "fail", reason: `${value} has no entry in this site` }
    : { kind: "keep" };
}
