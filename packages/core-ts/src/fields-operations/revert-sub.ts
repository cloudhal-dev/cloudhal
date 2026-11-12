/**
 * RFC-0045 §7 `sub`: the revert's first step for a sub-field operation. It starts from the
 * repeater as it is now and puts back only the named sub-field, so sub-fields added since stay:
 * a removed sub-field is inserted at its old index; a renamed or retyped one is replaced by its
 * earlier definition, under the inverse marker. A sub-field of the same key that differs from the
 * earlier one is refused (`field_key_in_use`). Pure.
 */
import type { FieldDefinition, FieldMigration } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import { type RepeaterFieldDefinition, sameJson } from "../fields/types.ts";
import type { FieldOperation } from "./types.ts";

type SubOp = FieldOperation & { sub: string };

/** The earlier sub-field and its index in the earlier repeater. */
function earlierSub(earlier: FieldDefinition, key: string) {
  const fields = earlier.type === "repeater" ? earlier.fields : [];
  const index = fields.findIndex((s) => s.key === key);
  return { sub: fields[index], index };
}

/** True when a sub-field removal is undone: the repeater holds the earlier sub-field again. */
export function subRestored(now: FieldDefinition, earlier: FieldDefinition, key: string): boolean {
  const was = earlierSub(earlier, key).sub;
  return now.type === "repeater" && now.fields.some((s) => s.key === key && sameJson(s, was));
}

/** The current repeater with the operation's sub-field put back as it was. */
export function restoredSubDefinition(
  now: FieldDefinition,
  earlier: FieldDefinition,
  op: SubOp,
  marker: FieldMigration | undefined,
): FieldDefinition {
  const { sub: was, index } = earlierSub(earlier, op.sub);
  if (now.type !== "repeater" || !was) return earlier;
  const repeater = now as RepeaterFieldDefinition;
  const fields = [...repeater.fields];
  let itemLabel = repeater.itemLabel;
  if (op.op === "remove_field") {
    const held = fields.find((s) => s.key === op.sub);
    if (held && !sameJson(held, was))
      throw new InvariantError(
        "field_key_in_use",
        `${now.key} has another sub-field ${op.sub} now; rename or remove it before the revert`,
        { issues: [] },
      );
    if (!held) fields.splice(Math.min(index, fields.length), 0, was);
    const label = earlier.type === "repeater" ? earlier.itemLabel : undefined;
    if (itemLabel === undefined && label === op.sub) itemLabel = op.sub;
  } else {
    const key = op.op === "rename_field" ? op.to : op.sub;
    const at = fields.findIndex((s) => s.key === key);
    if (at >= 0) fields[at] = was;
    else fields.splice(Math.min(index, fields.length), 0, was);
    if (itemLabel === key) itemLabel = op.sub;
  }
  const { itemLabel: _l, migration: _m, ...rest } = repeater;
  return {
    ...rest,
    fields,
    ...(itemLabel === undefined ? {} : { itemLabel }),
    ...(marker ? { migration: marker } : {}),
  } as FieldDefinition;
}
