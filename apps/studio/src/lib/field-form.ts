/**
 * The fields builder's add/edit form (RFC-0041 §7): a definition as editable strings, back to the
 * contract's shape, and what is wrong with it. Pure; words come from the caller. Loads with the
 * fields UI only (`bundle-budget.ts` `LAZY_ONLY`).
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import { FIELD_LIMITS } from "@cloudhal/core-ts/fields";
import {
  type FieldType,
  fieldKeyFrom,
  type KeyProblem,
  keyProblem,
  localizedByDefault,
} from "./fields.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface OptionForm {
  value: string;
  /** Edited by hand: no longer follows the default-language label. */
  valueEdited: boolean;
  labels: Record<string, string>;
}

export interface FieldForm {
  type: FieldType;
  key: string;
  keyEdited: boolean;
  /** Label and help per site language. */
  labels: Record<string, { label: string; help: string }>;
  localized: boolean;
  requiredToPublish: boolean;
  maxLength: string;
  multiline: boolean;
  searchable: boolean;
  integer: boolean;
  minimum: string;
  maximum: string;
  options: OptionForm[];
  multiple: boolean;
}

/** The site's languages, default first. */
export const formLocales = (defaultLocale: string, locales: readonly string[]) => [
  defaultLocale,
  ...locales.filter((l) => l !== defaultLocale),
];

/** A new field of `type`: empty labels, localized as RFC-0041 §7 pre-sets it. */
export function emptyForm(type: FieldType, locales: readonly string[]): FieldForm {
  return {
    type,
    key: "",
    keyEdited: false,
    labels: Object.fromEntries(locales.map((l) => [l, { label: "", help: "" }])),
    localized: localizedByDefault(type),
    requiredToPublish: false,
    maxLength: "",
    multiline: false,
    searchable: false,
    integer: false,
    minimum: "",
    maximum: "",
    options: [],
    multiple: false,
  };
}

const num = (n: number | undefined) => (n === undefined ? "" : String(n));

/** A saved definition as the form edits it. */
export function formOf(def: FieldDefinition, locales: readonly string[]): FieldForm {
  const form = emptyForm(def.type, locales);
  for (const [l, v] of Object.entries(def.labels))
    if (v) form.labels[l] = { label: v.label, help: v.help ?? "" };
  return {
    ...form,
    key: def.key,
    keyEdited: true,
    localized: def.localized,
    requiredToPublish: def.type !== "boolean" && def.requiredToPublish === true,
    maxLength: def.type === "text" ? num(def.maxLength) : "",
    multiline: def.type === "text" && def.multiline === true,
    searchable: (def.type === "text" || def.type === "richText") && def.searchable === true,
    integer: def.type === "number" && def.integer === true,
    minimum: def.type === "number" ? num(def.minimum) : "",
    maximum: def.type === "number" ? num(def.maximum) : "",
    options:
      def.type === "select"
        ? def.options.map((o) => ({
            value: o.value,
            valueEdited: true,
            labels: Object.fromEntries(Object.entries(o.labels).map(([l, v]) => [l, v ?? ""])),
          }))
        : [],
    multiple: def.type === "select" && def.multiple === true,
  };
}

/** The label changed: the key follows it until it is edited or saved. */
export function withLabel(form: FieldForm, locale: string, label: string, isDefault: boolean) {
  const labels = {
    ...form.labels,
    [locale]: { ...(form.labels[locale] ?? { label: "", help: "" }), label },
  };
  return {
    ...form,
    labels,
    key: isDefault && !form.keyEdited ? fieldKeyFrom(label) : form.key,
  };
}

/** An option's label changed: its value follows the default language's until edited. */
export function withOptionLabel(
  form: FieldForm,
  change: { index: number; locale: string; label: string; isDefault: boolean },
): FieldForm {
  const { index: i, locale, label, isDefault } = change;
  const options = form.options.map((o, j) => {
    if (j !== i) return o;
    const value =
      isDefault && !o.valueEdited
        ? label
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ı/g, "i")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 128)
        : o.value;
    return { ...o, value, labels: { ...o.labels, [locale]: label } };
  });
  return { ...form, options };
}

export interface FormProblems {
  label?: "required";
  key?: KeyProblem;
  maxLength?: "range";
  bounds?: "order" | "number";
  options?: "required" | "value" | "duplicate" | "label";
}

const parseNum = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** What keeps the form from saving (keys checked only while the field is new). */
export function formProblems(
  form: FieldForm,
  ctx: { defaultLocale: string; taken: readonly string[]; isNew: boolean },
): FormProblems {
  const out: FormProblems = {};
  if (!form.labels[ctx.defaultLocale]?.label.trim()) out.label = "required";
  if (ctx.isNew) {
    const k = keyProblem(form.key, ctx.taken);
    if (k) out.key = k;
  }
  if (form.type === "text" && form.maxLength.trim()) {
    const n = Number(form.maxLength);
    if (!Number.isInteger(n) || n < 1 || n > FIELD_LIMITS.textLength) out.maxLength = "range";
  }
  if (form.type === "number") {
    const min = parseNum(form.minimum);
    const max = parseNum(form.maximum);
    if (
      (min !== undefined && !Number.isFinite(min)) ||
      (max !== undefined && !Number.isFinite(max))
    )
      out.bounds = "number";
    else if (min !== undefined && max !== undefined && min > max) out.bounds = "order";
  }
  if (form.type === "select") {
    const values = form.options.map((o) => o.value);
    if (form.options.length === 0) out.options = "required";
    else if (values.some((v) => !SLUG.test(v))) out.options = "value";
    else if (new Set(values).size !== values.length) out.options = "duplicate";
    else if (form.options.some((o) => !o.labels[ctx.defaultLocale]?.trim())) out.options = "label";
  }
  return out;
}

export const hasProblems = (p: FormProblems) => Object.keys(p).length > 0;

/** The form as a definition: only filled labels, limits only when set. */
export function definitionOf(form: FieldForm): FieldDefinition {
  const labels: Record<string, { label: string; help?: string }> = {};
  for (const [l, v] of Object.entries(form.labels)) {
    if (!v.label.trim()) continue;
    labels[l] = { label: v.label.trim(), ...(v.help.trim() ? { help: v.help.trim() } : {}) };
  }
  const base = { key: form.key, labels, localized: form.localized };
  const required = form.requiredToPublish ? { requiredToPublish: true } : {};
  const min = parseNum(form.minimum);
  const max = parseNum(form.maximum);
  const maxLength = parseNum(form.maxLength);
  switch (form.type) {
    case "text":
      return {
        ...base,
        type: "text",
        ...required,
        ...(maxLength !== undefined ? { maxLength } : {}),
        ...(form.multiline ? { multiline: true } : {}),
        ...(form.searchable ? { searchable: true } : {}),
      };
    case "richText":
      return {
        ...base,
        type: "richText",
        ...required,
        ...(form.searchable ? { searchable: true } : {}),
      };
    case "number":
      return {
        ...base,
        type: "number",
        ...required,
        ...(form.integer ? { integer: true } : {}),
        ...(min !== undefined ? { minimum: min } : {}),
        ...(max !== undefined ? { maximum: max } : {}),
      };
    case "boolean":
      return { ...base, type: "boolean" };
    case "select": {
      const options = form.options.map((o) => ({
        value: o.value,
        labels: Object.fromEntries(
          Object.entries(o.labels)
            .filter(([, v]) => v.trim())
            .map(([l, v]) => [l, v.trim()]),
        ),
      }));
      return {
        ...base,
        type: "select",
        ...required,
        options: options as [(typeof options)[number], ...typeof options],
        ...(form.multiple ? { multiple: true } : {}),
      } as FieldDefinition;
    }
    default:
      return { ...base, type: form.type, ...required } as FieldDefinition;
  }
}
