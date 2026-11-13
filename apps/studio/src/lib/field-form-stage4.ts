/**
 * The fields builder's reference and repeater parts (RFC-0045 §5): target collections, "Several",
 * the maximum and conditions of a reference; a repeater's sub-fields (each a `FieldForm` of a
 * sub-field type, with a stable id so per-row state never follows an index), the maximum and the
 * item label. Pure; words come from the caller. Loads with the fields UI only (`LAZY_ONLY`).
 */
import type { FieldCondition, FieldDefinition, SubFieldDefinition } from "@cloudhal/core-contracts";
import type { SubFieldType } from "@cloudhal/core-ts/fields";
import type { FieldForm } from "./field-form.ts";
import { type KeyProblem, keyProblem } from "./fields.ts";

/** The types a repeater's sub-field can have (no date and time, no repeater). */
export const SUB_TYPES: readonly SubFieldType[] = [
  "text",
  "richText",
  "number",
  "boolean",
  "date",
  "url",
  "image",
  "select",
  "reference",
];

/** At most this many target collections, conditions and sub-fields (the contract's). */
export const STAGE4_LIMITS = {
  collections: 5,
  conditions: 4,
  subFields: 10,
  maxItems: 50,
} as const;

/** One sub-field in the builder: its form, whether it is saved, and an id for its row. */
export interface SubFieldForm {
  id: string;
  /** Saved in the repeater: its key and type change through operations. */
  saved: boolean;
  form: FieldForm;
}

let next = 0;
/** A row id that never repeats in this Studio session. */
export const subId = () => `sub-${next++}`;

/** The item label's candidates: text, select and reference sub-fields. */
export const namesItems = (f: Pick<FieldForm, "type">) =>
  f.type === "text" || f.type === "select" || f.type === "reference";

export interface Stage4Problems {
  collections?: "required" | "limit";
  maxItems?: "range";
  /** A condition on a field that is no listing field of the one target collection. */
  where?: "field";
  subFields?: "required" | "limit" | "invalid";
  itemLabel?: "type";
  /** The first sub-field's problem, by its id (its row shows it). */
  sub?: { id: string; key?: KeyProblem; label?: "required"; collections?: "required" };
}

const maxItemsOk = (s: string) => {
  if (!s.trim()) return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= STAGE4_LIMITS.maxItems;
};

/** What keeps a reference or repeater form from saving. */
export function stage4Problems(
  form: FieldForm,
  defaultLocale: string,
  /** A collection's listing field keys (a reference's conditions must use them). */
  listFields?: (collection: string) => readonly string[],
): Stage4Problems {
  const out: Stage4Problems = {};
  if (form.type === "reference") {
    if (form.collections.length === 0) out.collections = "required";
    else if (form.collections.length > STAGE4_LIMITS.collections) out.collections = "limit";
    if (form.multiple && !maxItemsOk(form.maxItems)) out.maxItems = "range";
    const only = form.collections.length === 1 ? form.collections[0] : undefined;
    const fits = only && listFields ? new Set(listFields(only)) : undefined;
    if (fits && form.where.some((w) => !fits.has(w.field))) out.where = "field";
  }
  if (form.type !== "repeater") return out;
  if (!maxItemsOk(form.maxItems)) out.maxItems = "range";
  if (form.subFields.length === 0) out.subFields = "required";
  else if (form.subFields.length > STAGE4_LIMITS.subFields) out.subFields = "limit";
  for (const s of form.subFields) {
    const taken = form.subFields.filter((o) => o.id !== s.id).map((o) => o.form.key);
    const key = s.saved ? undefined : keyProblem(s.form.key, taken);
    const label = s.form.labels[defaultLocale]?.label.trim() ? undefined : ("required" as const);
    const collections =
      s.form.type === "reference" && s.form.collections.length === 0
        ? ("required" as const)
        : undefined;
    if (key || label || collections) {
      out.subFields ??= "invalid";
      out.sub = { id: s.id, ...(key ? { key } : {}), ...(label ? { label } : {}) };
      if (collections) out.sub.collections = collections;
      break;
    }
  }
  const named = form.subFields.find((s) => s.form.key === form.itemLabel);
  if (form.itemLabel && (!named || !namesItems(named.form))) out.itemLabel = "type";
  return out;
}

const parseNum = (s: string) => (s.trim() === "" ? undefined : Number(s));

/**
 * A reference definition from the form: collections, `multiple` with its maximum, and conditions
 * (only with one target collection; a condition without a value is left out).
 */
export function referenceDefinition(
  form: FieldForm,
  base: Pick<FieldDefinition, "key" | "labels" | "localized">,
): FieldDefinition {
  const maxItems = parseNum(form.maxItems);
  const where = form.collections.length === 1 ? form.where.filter(conditionReady) : [];
  return {
    ...base,
    type: "reference",
    ...(form.requiredToPublish ? { requiredToPublish: true } : {}),
    collections: form.collections as [string, ...string[]],
    ...(form.multiple ? { multiple: true } : {}),
    ...(form.multiple && maxItems !== undefined ? { maxItems } : {}),
    ...(where.length ? { where: where as [FieldCondition, ...FieldCondition[]] } : {}),
  } as FieldDefinition;
}

/** A condition is sent once it says what to compare with (or needs nothing). */
const conditionReady = (c: FieldCondition) =>
  c.op === "set" || c.op === "unset" || (c.op === "in" ? (c.values?.length ?? 0) > 0 : !!c.value);

/** A repeater definition from the form; each sub-field through `subDefinition`. */
export function repeaterDefinition(
  form: FieldForm,
  base: Pick<FieldDefinition, "key" | "labels" | "localized">,
  definitionOf: (form: FieldForm) => FieldDefinition,
): FieldDefinition {
  const maxItems = parseNum(form.maxItems);
  const fields = form.subFields.map((s) => subDefinition(definitionOf(s.form)));
  return {
    ...base,
    type: "repeater",
    ...(form.requiredToPublish ? { requiredToPublish: true } : {}),
    fields: fields as [SubFieldDefinition, ...SubFieldDefinition[]],
    ...(maxItems !== undefined ? { maxItems } : {}),
    ...(form.itemLabel ? { itemLabel: form.itemLabel } : {}),
  } as FieldDefinition;
}

/** A field definition as a sub-field: no `localized`, `searchable`, `multiple` or reference extras. */
export function subDefinition(def: FieldDefinition): SubFieldDefinition {
  const {
    localized: _l,
    migration: _m,
    ...rest
  } = def as FieldDefinition & { searchable?: boolean; multiple?: boolean };
  const out: Record<string, unknown> = { ...rest };
  for (const k of ["searchable", "multiple", "maxItems", "where"]) delete out[k];
  return out as unknown as SubFieldDefinition;
}

/** A sub-field as a field definition, so the builder's form functions read it. */
export const subAsDefinition = (sub: SubFieldDefinition): FieldDefinition =>
  ({ ...sub, localized: false }) as FieldDefinition;

/** What `formOf` adds for a reference or repeater (the repeater's sub-field forms through `formOf`). */
export function stage4FormOf(
  def: FieldDefinition,
  formOf: (def: FieldDefinition) => FieldForm,
): Pick<FieldForm, "collections" | "multiple" | "maxItems" | "where" | "subFields" | "itemLabel"> {
  const num = (n: number | undefined) => (n === undefined ? "" : String(n));
  if (def.type === "reference")
    return {
      collections: [...def.collections],
      multiple: def.multiple === true,
      maxItems: num(def.maxItems),
      where: [...(def.where ?? [])],
      subFields: [],
      itemLabel: "",
    };
  if (def.type === "repeater")
    return {
      collections: [],
      multiple: false,
      maxItems: num(def.maxItems),
      where: [],
      subFields: def.fields.map((s) => ({
        id: subId(),
        saved: true,
        form: formOf(subAsDefinition(s)),
      })),
      itemLabel: def.itemLabel ?? "",
    };
  return {
    collections: [],
    multiple: false,
    maxItems: "",
    where: [],
    subFields: [],
    itemLabel: "",
  };
}

/** The sub-field list with `id` moved one place up (`-1`) or down (`1`). */
export function moveSub(list: readonly SubFieldForm[], id: string, by: -1 | 1): SubFieldForm[] {
  const i = list.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j] as SubFieldForm, out[i] as SubFieldForm];
  return out;
}
