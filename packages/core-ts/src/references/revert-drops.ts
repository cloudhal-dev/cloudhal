/**
 * RFC-0045 §7, `revertFieldOperation`: a restored reference whose group has no member left in the
 * site (in a collection its field allows) is dropped from the value it would restore, and
 * reported (`FieldRevertResult.dropped`). Only values the revert changes are looked at: a value it
 * leaves as stored keeps its rows, like any write that does not touch it. A repeater item left
 * empty is dropped, and a list left empty is no value. Pure.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { isRecord, sameJson } from "../fields/types.ts";
import { holdsReferences, storedKey } from "./rows.ts";
import { referenceUses } from "./values.ts";

type Values = Readonly<Record<string, unknown>>;

/** A dropped value: the field path (`venue`, `speakers.person`) and the group it named. */
export interface DroppedReference {
  field: string;
  targetId: string;
}

/** The reference-holding definitions whose value `next` changes against `stored`. */
function changed(defs: readonly FieldDefinition[], next: Values, stored: Values) {
  return defs.filter((def) => {
    if (!holdsReferences(def) || !Object.hasOwn(next, def.key)) return false;
    const key = storedKey(def, stored);
    return !sameJson(next[def.key], key === undefined ? undefined : stored[key]);
  });
}

/** The group ids the changed values of `next` name (one read of their members per pass). */
export function changedReferenceIds(
  defs: readonly FieldDefinition[],
  next: Values,
  stored: Values,
): string[] {
  return changed(defs, next, stored).flatMap((def) =>
    referenceUses(def, next[def.key], "").map((u) => u.groupId),
  );
}

type Keep = (groupId: string, collections: readonly string[]) => boolean;

function dropIn(def: FieldDefinition, value: unknown, keep: Keep, gone: DroppedReference[]) {
  if (def.type === "reference") {
    const ok = (id: unknown) => typeof id !== "string" || keep(id, def.collections);
    const note = (id: unknown) => gone.push({ field: def.key, targetId: String(id) });
    if (!Array.isArray(value)) {
      if (ok(value)) return value;
      note(value);
      return undefined;
    }
    const kept = value.filter((id) => ok(id) || (note(id), false));
    return kept.length > 0 ? kept : undefined;
  }
  if (def.type !== "repeater" || !Array.isArray(value)) return value;
  const items: unknown[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      items.push(item);
      continue;
    }
    const next = { ...item };
    for (const sub of def.fields) {
      const id = next[sub.key];
      if (sub.type !== "reference" || typeof id !== "string" || keep(id, sub.collections)) continue;
      gone.push({ field: `${def.key}.${sub.key}`, targetId: id });
      delete next[sub.key];
    }
    if (Object.keys(next).length > 0) items.push(next);
  }
  return items.length > 0 ? items : undefined;
}

/** `next` without the changed reference values `keep` refuses, and what went. */
export function dropMissingReferences(
  defs: readonly FieldDefinition[],
  next: Values,
  stored: Values,
  keep: Keep,
): { fields: Record<string, unknown>; dropped: DroppedReference[] } {
  const fields: Record<string, unknown> = { ...next };
  const dropped: DroppedReference[] = [];
  for (const def of changed(defs, next, stored)) {
    const value = dropIn(def, fields[def.key], keep, dropped);
    if (value === undefined) delete fields[def.key];
    else fields[def.key] = value;
  }
  return { fields, dropped };
}
