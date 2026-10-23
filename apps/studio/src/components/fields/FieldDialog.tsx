import type { FieldDefinition } from "@cloudhal/core-contracts";
import { FIELD_LIMITS, FIELD_TYPES } from "@cloudhal/core-ts/fields";
import { Button, Input, InsetPanel, LayerDialog, Select, Text } from "@cloudhal/ui";
import { Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { type TFunction, useI18n } from "../../i18n/index.tsx";
import {
  definitionOf,
  emptyForm,
  type FieldForm,
  type FormProblems,
  formOf,
  formProblems,
  hasProblems,
  withLabel,
  withOptionLabel,
} from "../../lib/field-form.ts";
import { type FieldType, localizedByDefault } from "../../lib/fields.ts";
import { languageName } from "../../lib/languages.ts";
import { SwitchField } from "../TaxonomySettingsDialog.tsx";

type FT = TFunction<"fields">;
type SetForm = (next: FieldForm) => void;

export interface FieldFormContext {
  t: FT;
  form: FieldForm;
  set: SetForm;
  locales: readonly string[];
  defaultLocale: string;
  uiLocale: string;
  isNew: boolean;
  problems: FormProblems;
}

/** Label and help per site language; the default language's label is required. */
function LabelFields({
  t,
  form,
  set,
  locales,
  defaultLocale,
  uiLocale,
  problems,
}: FieldFormContext) {
  const many = locales.length > 1;
  return (
    <>
      {locales.map((l) => {
        const v = form.labels[l] ?? { label: "", help: "" };
        const isDefault = l === defaultLocale;
        const language = languageName(uiLocale, l);
        return (
          <div key={l} className="grid gap-3 sm:grid-cols-2" data-locale={l}>
            <Input
              className="w-full"
              label={many ? t("fields.dialog.labelIn", { language }) : t("fields.dialog.label")}
              value={v.label}
              onValueChange={(x) => set(withLabel(form, l, x, isDefault))}
              error={isDefault && problems.label ? t("fields.dialog.errors.label") : undefined}
              maxLength={100}
            />
            <Input
              className="w-full"
              label={many ? t("fields.dialog.helpIn", { language }) : t("fields.dialog.help")}
              value={v.help}
              onValueChange={(x) =>
                set({ ...form, labels: { ...form.labels, [l]: { ...v, help: x } } })
              }
              maxLength={300}
            />
          </div>
        );
      })}
    </>
  );
}

/** A select's options: value (stored, never shown to readers) and a label per language. */
export function OptionFields({
  t,
  form,
  set,
  locales,
  defaultLocale,
  uiLocale,
  isNew,
  problems,
}: FieldFormContext) {
  const many = locales.length > 1;
  return (
    <div className="grid gap-3" data-testid="field-options">
      <div className="grid gap-0.5">
        <Text bold as="span">
          {t("fields.dialog.options")}
        </Text>
        <Text variant="secondary" size="sm" as="span">
          {t("fields.dialog.optionsHint")}
        </Text>
        {problems.options && (
          <Text variant="error" size="sm" as="span">
            {t(`fields.dialog.errors.options.${problems.options}`)}
          </Text>
        )}
      </div>
      {form.options.map((o, i) => (
        <InsetPanel key={i}>
          <div className="grid gap-3" data-option={i}>
            {locales.map((l) => (
              <Input
                key={l}
                className="w-full"
                label={
                  many
                    ? t("fields.dialog.optionLabelIn", { language: languageName(uiLocale, l) })
                    : t("fields.dialog.optionLabel")
                }
                value={o.labels[l] ?? ""}
                onValueChange={(x) =>
                  set(
                    withOptionLabel(form, {
                      index: i,
                      locale: l,
                      label: x,
                      isDefault: l === defaultLocale,
                    }),
                  )
                }
                maxLength={100}
              />
            ))}
            <div className="flex flex-wrap items-end gap-2">
              <Input
                className="w-full min-w-0 flex-1 basis-48 font-mono"
                label={t("fields.dialog.optionValue")}
                value={o.value}
                onValueChange={(x) =>
                  set({
                    ...form,
                    options: form.options.map((p, j) =>
                      j === i ? { ...p, value: x, valueEdited: true } : p,
                    ),
                  })
                }
                maxLength={128}
              />
              <Button
                variant="ghost"
                shape="square"
                icon={<Trash />}
                aria-label={t("fields.dialog.removeOption")}
                onClick={() => set({ ...form, options: form.options.filter((_, j) => j !== i) })}
              />
            </div>
          </div>
        </InsetPanel>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus />}
          disabled={form.options.length >= FIELD_LIMITS.selectOptions}
          onClick={() =>
            set({
              ...form,
              options: [...form.options, { value: "", valueEdited: false, labels: {} }],
            })
          }
        >
          {t("fields.dialog.addOption")}
        </Button>
      </div>
      <SwitchField
        testId="field-multiple"
        label={t("fields.dialog.multiple")}
        hint={isNew ? t("fields.dialog.multipleHint") : t("fields.dialog.needsOperation")}
        checked={form.multiple}
        onChange={(multiple) => set({ ...form, multiple })}
        disabled={!isNew}
      />
    </div>
  );
}

/** What only some types have: length and lines, bounds, search, options. */
function TypeFields(c: FieldFormContext) {
  const { t, form, set, problems } = c;
  if (form.type === "select") return <OptionFields {...c} />;
  return (
    <>
      {form.type === "text" && (
        <>
          <Input
            className="w-full"
            type="number"
            label={t("fields.dialog.maxLength")}
            description={t("fields.dialog.maxLengthHint", { max: FIELD_LIMITS.textLength })}
            value={form.maxLength}
            onValueChange={(maxLength) => set({ ...form, maxLength })}
            error={
              problems.maxLength
                ? t("fields.dialog.errors.maxLength", { max: FIELD_LIMITS.textLength })
                : undefined
            }
            min={1}
            max={FIELD_LIMITS.textLength}
          />
          <SwitchField
            testId="field-multiline"
            label={t("fields.dialog.multiline")}
            hint={t("fields.dialog.multilineHint")}
            checked={form.multiline}
            onChange={(multiline) => set({ ...form, multiline })}
          />
        </>
      )}
      {form.type === "number" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              className="w-full"
              type="number"
              label={t("fields.dialog.minimum")}
              value={form.minimum}
              onValueChange={(minimum) => set({ ...form, minimum })}
              error={
                problems.bounds ? t(`fields.dialog.errors.bounds.${problems.bounds}`) : undefined
              }
            />
            <Input
              className="w-full"
              type="number"
              label={t("fields.dialog.maximum")}
              value={form.maximum}
              onValueChange={(maximum) => set({ ...form, maximum })}
            />
          </div>
          <SwitchField
            testId="field-integer"
            label={t("fields.dialog.integer")}
            hint={t("fields.dialog.integerHint")}
            checked={form.integer}
            onChange={(integer) => set({ ...form, integer })}
          />
        </>
      )}
      {(form.type === "text" || form.type === "richText") && (
        <SwitchField
          testId="field-searchable"
          label={t("fields.dialog.searchable")}
          hint={t("fields.dialog.searchableHint")}
          checked={form.searchable}
          onChange={(searchable) => set({ ...form, searchable })}
        />
      )}
    </>
  );
}

/** The type, the key and the switches every type has. */
function CommonFields(c: FieldFormContext) {
  const { t, form, set, isNew, problems } = c;
  const types = Object.fromEntries(FIELD_TYPES.map((type) => [type, t(`fields.types.${type}`)]));
  return (
    <>
      <Select
        className="w-full"
        label={t("fields.dialog.type")}
        description={isNew ? undefined : t("fields.dialog.needsOperation")}
        value={form.type}
        disabled={!isNew}
        onValueChange={(v) => {
          const type = v as FieldType;
          set({
            ...emptyForm(type, c.locales),
            labels: form.labels,
            key: form.key,
            keyEdited: form.keyEdited,
            localized: localizedByDefault(type),
          });
        }}
        items={types}
        data-testid="field-type"
      />
      <LabelFields {...c} />
      <Input
        className="w-full font-mono"
        label={t("fields.dialog.key")}
        description={isNew ? t("fields.dialog.keyHint") : t("fields.dialog.keySaved")}
        value={form.key}
        disabled={!isNew}
        onValueChange={(key) => set({ ...form, key, keyEdited: true })}
        error={problems.key ? t(`fields.dialog.errors.key.${problems.key}`) : undefined}
        maxLength={40}
      />
      <SwitchField
        testId="field-localized"
        label={t("fields.dialog.localized")}
        hint={isNew ? t("fields.dialog.localizedHint") : t("fields.dialog.needsOperation")}
        checked={form.localized}
        onChange={(localized) => set({ ...form, localized })}
        disabled={!isNew}
      />
      {form.type !== "boolean" && (
        <SwitchField
          testId="field-required"
          label={t("fields.dialog.required")}
          hint={t("fields.dialog.requiredHint")}
          checked={form.requiredToPublish}
          onChange={(requiredToPublish) => set({ ...form, requiredToPublish })}
        />
      )}
    </>
  );
}

/**
 * "Add field" and "Edit field" (RFC-0041 §7): type, label and help per site language, the key
 * (derived from the label and editable until saved), per-language values, "Needed to publish" and
 * the type's options. A saved field keeps its key, type, localization and `multiple` here: those
 * change through the operation dialogs. The dialog edits the builder's draft only.
 */
export function FieldDialog({
  open,
  onOpenChange,
  initial,
  isNew,
  taken,
  defaultLocale,
  locales,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field being edited; none adds one. */
  initial: FieldDefinition | undefined;
  /** Not saved yet: the key, type and localization can still change. */
  isNew: boolean;
  /** Keys the collection's other fields use. */
  taken: readonly string[];
  defaultLocale: string;
  locales: readonly string[];
  onApply: (def: FieldDefinition) => void;
}) {
  const { t, locale } = useI18n("fields");
  const [form, setForm] = useState<FieldForm>(() => emptyForm("text", locales));
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(initial ? formOf(initial, locales) : emptyForm("text", locales));
    setSubmitted(false);
  }, [open]);
  const problems = formProblems(form, { defaultLocale, taken, isNew });
  const ctx: FieldFormContext = {
    t,
    form,
    set: setForm,
    locales,
    defaultLocale,
    uiLocale: locale,
    isNew,
    problems: submitted ? problems : {},
  };
  const submit = () => {
    setSubmitted(true);
    if (hasProblems(problems)) return;
    onApply(definitionOf(form));
    onOpenChange(false);
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {initial ? t("fields.dialog.editTitle") : t("fields.dialog.addTitle")}
        </LayerDialog.Title>
        <LayerDialog.Description>{t("fields.dialog.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="field-form">
            <CommonFields {...ctx} />
            <TypeFields {...ctx} />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary onClick={submit} data-testid="field-apply">
            {initial ? t("fields.dialog.apply") : t("fields.dialog.add")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
