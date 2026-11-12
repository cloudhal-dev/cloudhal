/**
 * RFC-0045 §1 and §7: a conversion into references keeps the entry within 100 reference values.
 * Over the cap the value is unconvertible, or cleared under `onInvalid: "clear"`: a field's whole
 * value, or for a `sub` marker only the converted sub-values (an item left empty goes, and an
 * emptied list is no value), never the repeater's other sub-fields. Phase B, the dry run and the
 * revert's decider all apply it. Pure.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { ValueChange } from "../fields/migration.ts";
import { isRecord } from "../fields/types.ts";
import { referenceCountIssues } from "../references/values.ts";
import type { Decision } from "./rewrite.ts";

/** `values` without the converted value of `def` (its sub-values only, for a `sub` marker). */
function withoutConverted(def: FieldDefinition, values: Record<string, unknown>) {
  const { [def.key]: value, ...rest } = values;
  const sub = def.migration?.sub;
  if (sub === undefined || !Array.isArray(value)) return rest;
  const items = value
    .map((item) => {
      if (!isRecord(item)) return item;
      const { [sub]: _converted, ...kept } = item;
      return kept;
    })
    .filter((item) => !isRecord(item) || Object.keys(item).length > 0);
  return items.length > 0 ? { ...rest, [def.key]: items } : rest;
}

/** The decision for a rewritten entry once the cap is counted. */
export function withinReferenceCap(
  defs: readonly FieldDefinition[],
  def: FieldDefinition,
  r: {
    values: Record<string, unknown>;
    change: ValueChange | undefined;
    onInvalid?: "clear" | undefined;
  },
): Decision {
  const over =
    def.migration?.fromType !== undefined ? referenceCountIssues(defs, r.values)[0] : undefined;
  if (!over) return { fields: r.values, change: r.change };
  const before = r.change?.before;
  if (r.onInvalid !== "clear")
    return { change: { kind: "unconvertible", before, after: undefined, reason: over.message } };
  return {
    fields: withoutConverted(def, r.values),
    change: { kind: "cleared", before, after: undefined, reason: over.message },
  };
}
