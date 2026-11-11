/**
 * RFC-0045 §1: the entry-level value rules of references and repeaters: at most 100 reference
 * values per entry (across fields and repeater items), and a repeater's `requiredToPublish`
 * sub-fields in every item. Pure; the store's target guard (rollout step 2) checks the targets.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { FIELD_LIMITS, type FieldIssue, isRecord, ownValue } from "../fields/types.ts";

/** "Has a value" for one sub-value: not absent, not an empty string. */
const hasSubValue = (v: unknown): boolean =>
  v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

/** One reference value where it sits: `fields/venue`, `fields/speakers/1/person`. */
export interface ReferenceUse {
  path: string;
  groupId: string;
  /** The collections the field (or sub-field) allows. */
  collections: readonly string[];
}

/** The reference values a reference or repeater value holds, in order (other types: none). */
export function referenceUses(def: FieldDefinition, value: unknown, path: string): ReferenceUse[] {
  if (def.type === "reference") {
    const { collections } = def;
    if (typeof value === "string") return [{ path, groupId: value, collections }];
    if (!Array.isArray(value)) return [];
    return value.flatMap((v, i) =>
      typeof v === "string" ? [{ path: `${path}/${i}`, groupId: v, collections }] : [],
    );
  }
  if (def.type !== "repeater" || !Array.isArray(value)) return [];
  const subs = def.fields.filter((s) => s.type === "reference");
  const out: ReferenceUse[] = [];
  value.forEach((item, i) => {
    if (!isRecord(item)) return;
    for (const sub of subs) {
      const v = ownValue(item, sub.key);
      if (typeof v === "string" && sub.type === "reference")
        out.push({ path: `${path}/${i}/${sub.key}`, groupId: v, collections: sub.collections });
    }
  });
  return out;
}

/** The group ids a reference or repeater value names, in order (other types: none). */
export function referenceValues(def: FieldDefinition, value: unknown): string[] {
  return referenceUses(def, value, "").map((u) => u.groupId);
}

/** The 100-references cap over an entry's stored values (unknown keys count nothing). */
export function referenceCountIssues(
  defs: readonly FieldDefinition[],
  values: Readonly<Record<string, unknown>>,
): FieldIssue[] {
  let n = 0;
  for (const def of defs)
    if (Object.hasOwn(values, def.key)) n += referenceValues(def, values[def.key]).length;
  if (n <= FIELD_LIMITS.referencesPerEntry) return [];
  return [
    {
      path: "fields",
      code: "too_many_references",
      message: `${n} references; an entry holds at most ${FIELD_LIMITS.referencesPerEntry} across its fields and repeater items`,
    },
  ];
}

/** A resolved repeater's `requiredToPublish` sub-fields missing in an item, at their item paths. */
export function requiredSubFieldIssues(
  def: FieldDefinition,
  value: unknown,
  path: string,
): FieldIssue[] {
  if (def.type !== "repeater" || !Array.isArray(value)) return [];
  const required = def.fields.filter((s) => s.type !== "boolean" && s.requiredToPublish === true);
  const out: FieldIssue[] = [];
  value.forEach((item, i) => {
    for (const sub of required)
      if (!isRecord(item) || !hasSubValue(ownValue(item, sub.key)))
        out.push({
          path: `${path}/${i}/${sub.key}`,
          code: "required_field",
          message: `${def.key} item ${i + 1} needs ${sub.key} before the entry goes to review or is published`,
        });
  });
  return out;
}
