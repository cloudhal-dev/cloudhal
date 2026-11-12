/**
 * RFC-0041 §6 and RFC-0045 §7: the definition `change_field_type` ends with, and the request
 * checks the new types need. A field keeps its shared properties (key, labels, `localized`,
 * `requiredToPublish`) and takes the new type's from the request: `options` and `multiple` for a
 * select, `collections`, `multiple` and `maxItems` for a reference, `subFields`, `maxItems` and
 * `itemLabel` for a repeater. With `sub`, one sub-field of a repeater changes type. Pure; the dry
 * run then runs `checkFieldDefinitions` on the site the operation leaves.
 */
import type { FieldDefinition, SubFieldDefinition } from "@cloudhal/core-contracts";
import { InvariantError } from "../errors.ts";
import type { RepeaterFieldDefinition } from "../fields/types.ts";
import type { FieldOperation } from "./types.ts";

type Retype = Extract<FieldOperation, { op: "change_field_type" }>;

const COMMON = ["key", "type", "labels", "localized", "requiredToPublish"] as const;

function invalid(path: string, message: string): never {
  throw new InvariantError("invalid_fields", message, {
    issues: [{ path, code: "invalid_value", message }],
  });
}

/** The reference collections a definition (or its one reference sub-field) holds, if any. */
function referenceCollections(def: FieldDefinition): readonly string[] | undefined {
  if (def.type === "reference") return def.collections;
  if (def.type !== "repeater") return undefined;
  const subs = def.fields.filter((s) => s.type === "reference");
  return subs.length > 0
    ? subs.flatMap((s) => (s.type === "reference" ? s.collections : []))
    : undefined;
}

/** A select's options: the request's, else the field's own. */
function optionsOf(op: Retype, was: { type: string; options?: unknown }) {
  const options =
    op.options ?? (was.type === "select" ? (was.options as Retype["options"]) : undefined);
  if (!options?.length) invalid("options", "a select needs its options");
  return options;
}

/** The new type's own properties of a top-level field. */
function ownProperties(def: FieldDefinition, op: Retype): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (op.type === "select") {
    out.options = optionsOf(op, def);
    if (op.multiple ?? (def.type === "select" ? def.multiple : undefined)) out.multiple = true;
  }
  if (op.type === "reference") {
    const collections = op.collections ?? referenceCollections(def);
    if (!collections?.length) invalid("collections", "a reference needs its target collections");
    out.collections = [...new Set(collections)];
    // From a repeater it stays a list; a reference keeps its own unless the request says.
    const multiple =
      op.multiple ?? (def.type === "reference" ? def.multiple : def.type === "repeater");
    if (multiple) out.multiple = true;
    const maxItems = op.maxItems ?? ("maxItems" in def ? def.maxItems : undefined);
    if (multiple && maxItems !== undefined) out.maxItems = maxItems;
    if (def.type === "reference" && def.where) out.where = def.where;
  }
  if (op.type === "repeater") {
    if (!op.subFields?.length) invalid("subFields", "a repeater needs its sub-fields");
    out.fields = op.subFields;
    const maxItems = op.maxItems ?? ("maxItems" in def ? def.maxItems : undefined);
    if (maxItems !== undefined) out.maxItems = maxItems;
    if (op.itemLabel !== undefined) out.itemLabel = op.itemLabel;
  }
  // RFC-0045 §7: a repeater's items join by line breaks.
  if (op.type === "text" && def.type === "repeater") out.multiline = true;
  return out;
}

/** The sub-field `op.sub` with its new type (sub-fields have no `multiple`, `maxItems` or items). */
function retypedSub(sub: SubFieldDefinition, op: Retype): SubFieldDefinition {
  const out: Record<string, unknown> = { key: sub.key, type: op.type, labels: sub.labels };
  if ("requiredToPublish" in sub && sub.requiredToPublish !== undefined && op.type !== "boolean")
    out.requiredToPublish = sub.requiredToPublish;
  if (op.type === "select") out.options = optionsOf(op, sub);
  if (op.type === "reference") {
    const collections = op.collections ?? (sub.type === "reference" ? sub.collections : undefined);
    if (!collections?.length) invalid("collections", "a reference needs its target collections");
    out.collections = [...new Set(collections)];
  }
  return out as unknown as SubFieldDefinition;
}

/** The definition `change_field_type` ends with: the shared properties plus the new type's. */
export function retyped(def: FieldDefinition, op: Retype): FieldDefinition {
  if (op.sub !== undefined) {
    const repeater = def as RepeaterFieldDefinition;
    const fields = repeater.fields.map((s) => (s.key === op.sub ? retypedSub(s, op) : s));
    return { ...repeater, fields } as FieldDefinition;
  }
  const base: Record<string, unknown> = {};
  const was = def as unknown as Record<string, unknown>;
  for (const k of COMMON) if (was[k] !== undefined) base[k] = was[k];
  base.type = op.type;
  if (op.type === "boolean") delete base.requiredToPublish;
  const searchable = "searchable" in def ? def.searchable : undefined;
  if ((op.type === "text" || op.type === "richText") && searchable !== undefined)
    base.searchable = searchable;
  return { ...base, ...ownProperties(def, op) } as unknown as FieldDefinition;
}

/** The inputs only some targets take: refused elsewhere, so a request means what it says. */
const TAKES: Record<
  "multiple" | "collections" | "maxItems" | "subFields" | "itemLabel",
  readonly string[]
> = {
  multiple: ["select", "reference"],
  collections: ["reference"],
  maxItems: ["reference", "repeater"],
  subFields: ["repeater"],
  itemLabel: ["repeater"],
};

/** The value type a definition (or a sub-field) holds, for the same-type rule. */
const isList = (def: { type: string; multiple?: boolean | undefined }) => def.multiple === true;

/**
 * RFC-0045 §7: the request checks of a type change (beyond `checkFieldDefinitions` on the result):
 * inputs the target takes, a same-type change that reshapes (select, reference single ↔
 * multiple), a repeater source with one sub-field, and id-carrying conversions only widening the
 * target collections, so phase B never writes a carried id where the field no longer allows it.
 */
export function checkRetype(def: FieldDefinition, op: Retype): void {
  const sub =
    op.sub === undefined
      ? undefined
      : (def as RepeaterFieldDefinition).fields.find((s) => s.key === op.sub);
  const from: { type: string; multiple?: boolean | undefined } = sub ?? def;
  for (const [input, types] of Object.entries(TAKES))
    if (
      op[input as keyof typeof TAKES] !== undefined &&
      (!types.includes(op.type) || (sub !== undefined && input !== "collections"))
    )
      invalid(
        input,
        `${input} does not apply to ${sub ? "a sub-field's" : `a ${op.type}`} type change`,
      );
  if (from.type === op.type) {
    const reshapes =
      (op.type === "select" && sub === undefined) ||
      (op.type === "reference" &&
        sub === undefined &&
        (op.multiple ?? isList(from)) !== isList(from));
    if (!reshapes)
      throw new InvariantError(
        "invalid_fields",
        `${op.sub ?? def.key} already is a ${op.type} field`,
      );
  }
  if (
    sub === undefined &&
    def.type === "repeater" &&
    (op.type === "text" || op.type === "reference")
  ) {
    const [only, ...more] = def.fields;
    const fits =
      op.type === "text"
        ? only?.type === "text" || only?.type === "richText"
        : only?.type === "reference";
    if (!only || more.length > 0 || !fits)
      invalid(
        "type",
        `only a repeater with one ${op.type === "text" ? "text or rich-text" : "reference"} sub-field converts to ${op.type}`,
      );
  }
  const carried = sub
    ? sub.type === "reference"
      ? sub.collections
      : undefined
    : referenceCollections(def);
  const target = retyped(def, op);
  const after = referenceCollections(target);
  if (carried && after && from.type !== "text" && !carried.every((c) => after.includes(c)))
    invalid(
      "collections",
      `a type change keeps every collection ${op.sub ?? def.key} allows (${carried.join(", ")})`,
    );
}
