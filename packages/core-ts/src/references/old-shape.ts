/**
 * RFC-0045 §7: the rows a stored value keeps under a running top-level conversion from references
 * that no text ↔ reference rule reads (`convertingPath` is undefined): reference (multiple) ↔
 * repeater, reference single ↔ multiple, a repeater converting away. A value still in the old
 * shape is read through the old type, so its rows stand until phase B rewrites it.
 *
 * One rule for both sides that write rows (#215): the rebuild (`rebuildRows`) keeps these rows
 * for every stored value, and a person's write holds them for a stored value that did not
 * convert (`normalizeWrite`), so whichever touched the node last leaves the same rows. Pure.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { GROUP_ID_PATTERN } from "../fields/props.ts";
import { isRecord } from "../fields/types.ts";
import { convertingPath } from "./conversion-rows.ts";

const GROUP_ID = new RegExp(GROUP_ID_PATTERN);
const isId = (v: unknown): v is string => typeof v === "string" && GROUP_ID.test(v);

/** One old-type (field path, group id) pair. */
export interface OldShapePair {
  readonly f: string;
  readonly t: string;
}

/** Whether `def` carries a top-level marker converting from references with no row path. */
export function readsOldShape(def: FieldDefinition): boolean {
  const m = def.migration;
  if (m === undefined || m.sub !== undefined) return false;
  if (m.fromType !== "reference" && m.fromType !== "repeater") return false;
  return convertingPath(def) === undefined;
}

/**
 * The pairs `value`, stored under `key`, holds under `def`'s old type, in order, duplicates
 * included: from a reference, each id-shaped string at `key`; from a repeater, each item's
 * id-shaped sub-value at `<key>.<sub>`. Empty when `def` carries no such marker.
 */
export function oldShapePairs(def: FieldDefinition, key: string, value: unknown): OldShapePair[] {
  if (!readsOldShape(def)) return [];
  const from = def.migration?.fromType;
  const out: OldShapePair[] = [];
  for (const v of Array.isArray(value) ? value : [value]) {
    if (from === "reference" && isId(v)) out.push({ f: key, t: v });
    if (from === "repeater" && isRecord(v))
      for (const [sub, t] of Object.entries(v)) if (isId(t)) out.push({ f: `${key}.${sub}`, t });
  }
  return out;
}
