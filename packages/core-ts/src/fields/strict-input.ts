/**
 * RFC-0045 §6 "The strict profile and what `null` means": how a writer reads values produced
 * against `fieldsSchemaStrict` (MCP's `fieldsStrict`), where every key is present.
 *
 * - A top-level `null`, or a key left out, means "leave as it is": on create no value, on update
 *   the stored value stays. Splitting a schema into subsets is safe for that reason.
 * - A given value replaces the whole value (a reference list, a repeater's items included).
 * - Inside a repeater item, `null` means "unset in this item": the sub-value is stripped. An item
 *   left with no sub-value is dropped and reported (`droppedItems`), so the "no empty item" rule
 *   never fires on strict output.
 *
 * Everything else (types, limits, targets) is the store's checker's. Pure and Worker-safe.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { isRecord } from "./types.ts";

/** An item of a repeater whose sub-values were all `null`, dropped from the list given. */
export interface DroppedItem {
  /** The repeater's key. */
  field: string;
  /** The item's index in the list as given. */
  index: number;
}

export interface StrictFieldsRead {
  /** The keys to set, with their values as they will be written. */
  values: Record<string, unknown>;
  droppedItems: DroppedItem[];
}

/** A repeater's items with `null` sub-values stripped and all-null items dropped. */
function stripItems(key: string, items: readonly unknown[], dropped: DroppedItem[]): unknown[] {
  const out: unknown[] = [];
  items.forEach((item, index) => {
    if (!isRecord(item)) {
      out.push(item);
      return;
    }
    const kept = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== null));
    if (Object.keys(kept).length === 0 && Object.keys(item).length > 0)
      dropped.push({ field: key, index });
    else out.push(kept);
  });
  return out;
}

/**
 * The values a strict-profile input sets: `null` keys left out, repeater items stripped of `null`
 * sub-values, and items with nothing left dropped. Keys the definitions do not know are kept as
 * given, for the checker to refuse.
 */
export function readStrictFields(
  defs: readonly FieldDefinition[],
  input: Readonly<Record<string, unknown>>,
): StrictFieldsRead {
  const repeaters = new Set(defs.filter((d) => d.type === "repeater").map((d) => d.key));
  const droppedItems: DroppedItem[] = [];
  // `fromEntries` defines own keys: a `__proto__` key stays data, for the writer to refuse.
  const values = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [
        key,
        repeaters.has(key) && Array.isArray(value) ? stripItems(key, value, droppedItems) : value,
      ]),
  );
  return { values, droppedItems };
}
