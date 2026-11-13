import type { FieldDefinition, Site, SubFieldDefinition } from "@cloudhal/core-contracts";
import {
  canConvert,
  FIELD_TYPES,
  fieldLabel,
  REFERENCE_FIELD_TYPES,
} from "@cloudhal/core-ts/fields";
import { Input, Select } from "@cloudhal/ui";
import type { TFunction } from "../../i18n/index.tsx";
import type { FieldOperationRequest } from "../../lib/api.ts";
import {
  definitionOf,
  emptyForm,
  type FieldForm,
  formOf,
  formProblems,
  hasProblems,
} from "../../lib/field-form.ts";
import { SUB_TYPES, subAsDefinition, subDefinition } from "../../lib/field-form-stage4.ts";
import type { FieldType } from "../../lib/fields.ts";
import { TypeFields } from "./FieldDialog.tsx";

type FT = TFunction<"fields">;
export type OperationKind = FieldOperationRequest["op"];
const WHOLE = "__field";

/** What an operation dialog was opened for: a field and an operation, or a run to pick up. */
export interface OperationTarget {
  kind: OperationKind;
  def: FieldDefinition;
  /** An operation already started (a closed dialog, another tab, an agent's approved call). */
  resume?: { operationId: string; reverting: boolean } | undefined;
}

/**
 * The types a field (or, with `sub`, a repeater's sub-field) can change to (RFC-0041 §6's table,
 * RFC-0045 §7's rows); a select or a reference can also flip `multiple`. Reference and repeater
 * targets only where the server takes them.
 */
export function targetTypes(from: FieldType, opts: { referenceTypes: boolean; sub?: boolean }) {
  const pool: readonly FieldType[] = opts.sub
    ? SUB_TYPES
    : opts.referenceTypes
      ? [...FIELD_TYPES, ...REFERENCE_FIELD_TYPES]
      : FIELD_TYPES;
  return pool.filter((to) =>
    to === from ? !opts.sub && (to === "select" || to === "reference") : canConvert(from, to),
  );
}

/** The dialog's inputs: a new key, the sub-field it applies to, and the target type's form. */
export interface Inputs {
  key: string;
  /** A repeater's sub-field key, or "" for the field itself. */
  sub: string;
  type: FieldType;
  /** The target type's settings (options, collections, sub-fields), as the builder edits them. */
  form: FieldForm;
}

/** The sub-field an operation applies to, as a definition. */
export function subOf(def: FieldDefinition, sub: string): SubFieldDefinition | undefined {
  return def.type === "repeater" ? def.fields.find((s) => s.key === sub) : undefined;
}

/** Fresh inputs for `target` (and a sub-field), its first target type pre-chosen. */
export function freshInputs(
  target: OperationTarget,
  sub: string,
  ctx: { locales: readonly string[]; referenceTypes: boolean },
): Inputs {
  const subDef = subOf(target.def, sub);
  const from = (subDef?.type ?? target.def.type) as FieldType;
  const type =
    targetTypes(from, { referenceTypes: ctx.referenceTypes, sub: subDef !== undefined })[0] ?? from;
  return {
    key: subDef?.key ?? target.def.key,
    sub,
    type,
    form: targetForm(target, sub, type, ctx),
  };
}

/** The target type's form: the field's own settings when it keeps its type, else empty. */
function targetForm(
  target: OperationTarget,
  sub: string,
  type: FieldType,
  ctx: { locales: readonly string[] },
): FieldForm {
  const subDef = subOf(target.def, sub);
  const own = subDef ? subAsDefinition(subDef) : target.def;
  if (own.type === type) return formOf(own, ctx.locales);
  return emptyForm(type, ctx.locales);
}

/** The request the inputs ask for (`clear`: drop values that can't be converted). */
export function requestOf(
  target: OperationTarget,
  inputs: Inputs,
  clear: boolean,
): FieldOperationRequest {
  const { def } = target;
  const sub = inputs.sub ? { sub: inputs.sub } : {};
  switch (target.kind) {
    case "rename_field":
      return { op: "rename_field", from: def.key, to: inputs.key, ...sub };
    case "set_field_localized":
      return { op: "set_field_localized", key: def.key, localized: !def.localized };
    case "remove_field":
      return { op: "remove_field", key: def.key, ...sub };
    default: {
      const to = definitionOf({ ...inputs.form, type: inputs.type, key: def.key });
      return {
        op: "change_field_type",
        key: def.key,
        type: inputs.type,
        ...sub,
        ...targetInputs(to, inputs.sub !== ""),
        ...(clear ? { onInvalid: "clear" as const } : {}),
      };
    }
  }
}

/** What a type change sends for its target: options, collections and "Several", or sub-fields. */
function targetInputs(to: FieldDefinition, sub: boolean) {
  if (to.type === "select")
    return { options: to.options, ...(sub ? {} : { multiple: to.multiple === true }) };
  if (to.type === "reference")
    return {
      collections: [...to.collections],
      ...(sub ? {} : { multiple: to.multiple === true }),
      ...(!sub && to.maxItems !== undefined ? { maxItems: to.maxItems } : {}),
    };
  if (to.type === "repeater")
    return {
      subFields: to.fields.map((f) => subDefinition(subAsDefinition(f))),
      ...(to.maxItems !== undefined ? { maxItems: to.maxItems } : {}),
      ...(to.itemLabel ? { itemLabel: to.itemLabel } : {}),
    };
  return {};
}

/** True when the target type's settings can't be sent yet (no collections, no sub-fields). */
export function targetBlocked(inputs: Inputs, defaultLocale: string): boolean {
  if (inputs.type !== "reference" && inputs.type !== "repeater" && inputs.type !== "select")
    return false;
  const problems = formProblems(
    { ...inputs.form, type: inputs.type, labels: { [defaultLocale]: { label: "-", help: "" } } },
    { defaultLocale, taken: [], isNew: false },
  );
  const { label: _l, key: _k, ...rest } = problems;
  return hasProblems(rest);
}

/**
 * The inputs of rename and type change (localization and removal have none but the sub-field):
 * for a repeater, which sub-field the change applies to; then the new key, or the new type with
 * the target type's settings — options, target collections and "Several", or the sub-fields of a
 * new list — drawn with the builder's own parts.
 */
export function OperationInputs(props: {
  t: FT;
  target: OperationTarget;
  inputs: Inputs;
  setInputs: (next: Inputs) => void;
  keyError: string | undefined;
  locales: readonly string[];
  defaultLocale: string;
  uiLocale: string;
  disabled: boolean;
  site: Site;
  referenceTypes: boolean;
}) {
  const { t, target, inputs, setInputs } = props;
  const ctx = { locales: props.locales, referenceTypes: props.referenceTypes };
  const repeater = target.def.type === "repeater" && target.kind !== "set_field_localized";
  const subDef = subOf(target.def, inputs.sub);
  const from = (subDef?.type ?? target.def.type) as FieldType;
  return (
    <div className="grid gap-5">
      {repeater && (
        <Select
          className="w-full"
          label={t("fields.operation.appliesTo")}
          value={inputs.sub || WHOLE}
          disabled={props.disabled}
          onValueChange={(v) =>
            setInputs(freshInputs(target, v === WHOLE ? "" : (v as string), ctx))
          }
          items={{
            [WHOLE]: t("fields.operation.wholeField"),
            ...(target.def.type === "repeater"
              ? Object.fromEntries(
                  target.def.fields.map((s) => [
                    s.key,
                    fieldLabel(s, props.uiLocale, props.defaultLocale),
                  ]),
                )
              : {}),
          }}
          data-testid="field-operation-sub"
        />
      )}
      {target.kind === "rename_field" && (
        <Input
          className="w-full font-mono"
          label={t("fields.operation.newKey")}
          description={t("fields.dialog.keyHint")}
          value={inputs.key}
          onValueChange={(key) => setInputs({ ...inputs, key })}
          error={props.keyError}
          maxLength={40}
          disabled={props.disabled}
        />
      )}
      {target.kind === "change_field_type" && (
        <>
          <Select
            className="w-full"
            label={t("fields.operation.newType")}
            value={inputs.type}
            disabled={props.disabled}
            onValueChange={(v) => {
              const type = v as FieldType;
              setInputs({ ...inputs, type, form: targetForm(target, inputs.sub, type, ctx) });
            }}
            items={Object.fromEntries(
              targetTypes(from, { ...ctx, sub: subDef !== undefined }).map((ty) => [
                ty,
                t(`fields.types.${ty}`),
              ]),
            )}
            data-testid="field-new-type"
          />
          {(inputs.type === "select" ||
            inputs.type === "reference" ||
            inputs.type === "repeater") && (
            <TypeFields
              t={t}
              form={{ ...inputs.form, type: inputs.type }}
              set={(form) => setInputs({ ...inputs, form })}
              locales={props.locales}
              defaultLocale={props.defaultLocale}
              uiLocale={props.uiLocale}
              isNew
              problems={{}}
              site={props.site}
              referenceTypes={props.referenceTypes}
              sub={subDef !== undefined}
              operation
            />
          )}
        </>
      )}
    </div>
  );
}
