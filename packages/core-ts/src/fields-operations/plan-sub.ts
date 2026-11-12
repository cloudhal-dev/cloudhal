/**
 * RFC-0045 §7 `sub`: what an operation on one sub-field of a repeater asks of the site node. The
 * marker sits on the repeater: `{ id, sub: <key once done>, fromKey | fromType }`, or `{ id, sub }`
 * while the sub-field is being removed (phase A keeps its definition, phase C drops it, as for a
 * top-level field). Pure but for the predicates' SQL text.
 */
import type { FieldDefinition, FieldMigration } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { RESERVED_FIELD_KEYS, type RepeaterFieldDefinition } from "../fields/types.ts";
import type { Cond } from "../node-sql.ts";
import { retyped } from "./retype.ts";
import type { FieldOperation } from "./types.ts";

const KEY = /^[a-z][A-Za-z0-9]{0,39}$/;

function invalid(
  code: "invalid_fields" | "unknown_field" | "field_key_duplicate" | "field_key_reserved",
  message: string,
): never {
  throw new InvariantError(code, message, { issues: [] });
}

/** Checks a `sub` request against the repeater; throws when it can never run as written. */
export function checkSub(def: FieldDefinition, op: FieldOperation & { sub: string }): void {
  if (def.type !== "repeater")
    invalid(
      "invalid_fields",
      `sub names a repeater's sub-field; ${def.key} is a ${def.type} field`,
    );
  if (op.op === "set_field_localized")
    invalid("invalid_fields", `sub-fields share ${def.key}'s localized; change it without sub`);
  const keys = def.fields.map((s) => s.key);
  if (!keys.includes(op.sub))
    invalid(
      "unknown_field",
      `${op.sub} is not a sub-field of ${def.key}; its sub-fields are ${keys.join(", ")}`,
    );
  if (op.op === "rename_field") {
    if (!KEY.test(op.to))
      invalid("field_key_reserved", `${op.to} is not a field key (lower camelCase)`);
    if (RESERVED_FIELD_KEYS.has(op.to)) invalid("field_key_reserved", `${op.to} is reserved`);
    if (keys.includes(op.to))
      invalid("field_key_duplicate", `${op.to} is already a sub-field of ${def.key}`);
  }
  if (op.op === "remove_field" && keys.length === 1)
    invalid(
      "invalid_fields",
      `${op.sub} is ${def.key}'s only sub-field; remove ${def.key} instead`,
    );
}

/** The repeater with `from` renamed to `to` (its `itemLabel` follows). */
function renamedSub(def: RepeaterFieldDefinition, from: string, to: string): FieldDefinition {
  const fields = def.fields.map((s) => (s.key === from ? { ...s, key: to } : s));
  const label = def.itemLabel === from ? { itemLabel: to } : {};
  return { ...def, fields, ...label } as FieldDefinition;
}

/** The repeater without the sub-field `key` (an `itemLabel` naming it goes too). */
export function withoutSub(def: RepeaterFieldDefinition, key: string): FieldDefinition {
  const { itemLabel, ...rest } = def;
  const fields = def.fields.filter((s) => s.key !== key);
  const label = itemLabel !== undefined && itemLabel !== key ? { itemLabel } : {};
  return { ...rest, ...label, fields } as FieldDefinition;
}

/** The repeater the operation ends with (`op.sub` set). */
export function subTarget(
  def: FieldDefinition,
  op: FieldOperation & { sub: string },
): FieldDefinition {
  const repeater = def as RepeaterFieldDefinition;
  switch (op.op) {
    case "rename_field":
      return renamedSub(repeater, op.sub, op.to);
    case "remove_field":
      return withoutSub(repeater, op.sub);
    case "change_field_type":
      return retyped(def, op);
    case "set_field_localized":
      return def;
  }
}

/** Phase A's marker of a sub-field operation. */
export function subMarkerOf(
  id: string,
  def: FieldDefinition,
  op: FieldOperation & { sub: string },
): FieldMigration {
  const was = (def as RepeaterFieldDefinition).fields.find((s) => s.key === op.sub);
  switch (op.op) {
    case "rename_field":
      return { id, sub: op.to, fromKey: op.sub };
    case "change_field_type":
      return { id, sub: op.sub, fromType: was?.type ?? "text" };
    default:
      return { id, sub: op.sub };
  }
}

/** True when the repeater already shows the sub-field operation's end state. */
export function subApplied(
  now: FieldDefinition,
  op: FieldOperation & { sub: string },
  target: FieldDefinition,
): boolean {
  if (now.type !== "repeater" || target.type !== "repeater") return false;
  const has = (k: string) => now.fields.some((s) => s.key === k);
  if (op.op === "rename_field") return has(op.to) && !has(op.sub);
  if (op.op === "remove_field") return !has(op.sub);
  const want = target.fields.find((s) => s.key === op.sub)?.type;
  return now.fields.find((s) => s.key === op.sub)?.type === want;
}

/**
 * Entries whose items the sub-field marker still has work for: an item holding the old key (a
 * rename), the sub-value being removed, or a sub-value not stored as the new type's JSON.
 */
export function subPending(
  base: Cond,
  def: FieldDefinition,
  jsonTypes: (d: FieldDefinition) => string[],
): Cond | undefined {
  const m = def.migration;
  if (def.type !== "repeater" || m?.sub === undefined) return undefined;
  const items = `$.fields.${def.key}`;
  const holds = (key: string, extra = "", params: Cond["params"] = []): Cond => ({
    sql: `${base.sql} AND EXISTS (SELECT 1 FROM json_each(body, ?) i
            WHERE json_type(i.value, ?) IS NOT NULL${extra})`,
    params: [...base.params, items, `$.${key}`, ...params],
  });
  if (m.fromKey !== undefined) return holds(m.fromKey);
  if (m.fromType === undefined) return holds(m.sub);
  const sub = def.fields.find((s) => s.key === m.sub);
  if (!sub) return undefined;
  const types = jsonTypes({ ...sub, localized: def.localized } as unknown as FieldDefinition);
  return holds(m.sub, ` AND json_type(i.value, ?) NOT IN (${types.map(() => "?").join(", ")})`, [
    `$.${m.sub}`,
    ...types,
  ]);
}
