import type { FieldDefinition } from "@cloudhal/core-contracts";
import { canConvert, FIELD_TYPES, fieldLabel } from "@cloudhal/core-ts/fields";
import { Banner, Checkbox, Input, LayerDialog, Loader, Select, Text } from "@cloudhal/ui";
import { ArrowCounterClockwise, Camera, CheckCircle, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { type TFunction, useI18n } from "../../i18n/index.tsx";
import type { FieldOperationRequest } from "../../lib/api.ts";
import { apiErrorText } from "../../lib/api-errors.ts";
import { definitionOf, emptyForm, type FieldForm, formOf } from "../../lib/field-form.ts";
import { type FieldType, keyProblem } from "../../lib/fields.ts";
import { OptionFields } from "./FieldDialog.tsx";
import { FieldOperationReport } from "./FieldOperationReport.tsx";
import { type FieldOperationState, useFieldOperation } from "./useFieldOperation.ts";

type FT = TFunction<"fields">;
export type OperationKind = FieldOperationRequest["op"];

/** What an operation dialog was opened for: a field and an operation, or a run to pick up. */
export interface OperationTarget {
  kind: OperationKind;
  def: FieldDefinition;
  /** An operation already started (a closed dialog, another tab, an agent's approved call). */
  resume?: { operationId: string; reverting: boolean } | undefined;
}

/** The types a field can change to (RFC-0041 §6's table); a select can also flip `multiple`. */
export const targetTypes = (from: FieldType) =>
  FIELD_TYPES.filter((to) => (to === from ? to === "select" : canConvert(from, to)));

interface Inputs {
  key: string;
  type: FieldType;
  options: FieldForm;
}

function requestOf(target: OperationTarget, inputs: Inputs, clear: boolean): FieldOperationRequest {
  const { def } = target;
  switch (target.kind) {
    case "rename_field":
      return { op: "rename_field", from: def.key, to: inputs.key };
    case "set_field_localized":
      return { op: "set_field_localized", key: def.key, localized: !def.localized };
    case "remove_field":
      return { op: "remove_field", key: def.key };
    default: {
      const select = inputs.type === "select" ? definitionOf(inputs.options) : undefined;
      return {
        op: "change_field_type",
        key: def.key,
        type: inputs.type,
        ...(select?.type === "select"
          ? { options: select.options, multiple: select.multiple === true }
          : {}),
        ...(clear ? { onInvalid: "clear" as const } : {}),
      };
    }
  }
}

/** The inputs of rename and type change; localization and removal have none. */
function OperationInputs(props: {
  t: FT;
  target: OperationTarget;
  inputs: Inputs;
  setInputs: (next: Inputs) => void;
  keyError: string | undefined;
  locales: readonly string[];
  defaultLocale: string;
  uiLocale: string;
  disabled: boolean;
}) {
  const { t, target, inputs, setInputs } = props;
  if (target.kind === "rename_field")
    return (
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
    );
  if (target.kind !== "change_field_type") return null;
  const types = targetTypes(target.def.type);
  return (
    <div className="grid gap-5">
      <Select
        className="w-full"
        label={t("fields.operation.newType")}
        value={inputs.type}
        disabled={props.disabled}
        onValueChange={(v) => setInputs({ ...inputs, type: v as FieldType })}
        items={Object.fromEntries(types.map((ty) => [ty, t(`fields.types.${ty}`)]))}
        data-testid="field-new-type"
      />
      {inputs.type === "select" && (
        <OptionFields
          t={t}
          form={inputs.options}
          set={(options) => setInputs({ ...inputs, options })}
          locales={props.locales}
          defaultLocale={props.defaultLocale}
          uiLocale={props.uiLocale}
          isNew
          problems={{}}
        />
      )}
    </div>
  );
}

/** The state banners: running, done (with Revert), reverted, and a failure. */
function OperationStatus({
  t,
  state,
  onRevert,
}: {
  t: FT;
  state: FieldOperationState;
  onRevert: () => void;
}) {
  const { step, result, revert, rewritten, error } = state;
  return (
    <>
      {error !== undefined && (
        <Banner
          variant="error"
          size="sm"
          icon={<Warning weight="fill" />}
          title={t("fields.operation.failed")}
          description={apiErrorText(t, error)}
        />
      )}
      {(step === "running" || step === "reverting") && (
        <div
          className="flex items-center gap-3"
          role="status"
          data-testid="field-operation-running"
        >
          <Loader size="sm" />
          <Text as="span">
            {step === "running"
              ? t("fields.operation.running", { count: rewritten })
              : t("fields.operation.reverting")}
          </Text>
        </div>
      )}
      {step === "done" && result && (
        <Banner
          variant="default"
          icon={<CheckCircle weight="fill" />}
          title={t("fields.operation.doneTitle")}
          description={t("fields.operation.done", { count: result.report.touched })}
          action={
            <Banner.Action variant="secondary" icon={<ArrowCounterClockwise />} onClick={onRevert}>
              {t("fields.operation.revert")}
            </Banner.Action>
          }
        />
      )}
      {step === "reverted" && revert && (
        <Banner
          variant="default"
          icon={<CheckCircle weight="fill" />}
          title={t("fields.operation.revertedTitle")}
          description={t("fields.operation.reverted", { count: revert.restored })}
        />
      )}
    </>
  );
}

/** The run is about to happen: what it does, what is kept, and the opt-in to clear values. */
function OperationNotes({
  t,
  target,
  state,
  clear,
  setClear,
}: {
  t: FT;
  target: OperationTarget;
  state: FieldOperationState;
  clear: boolean;
  setClear: (v: boolean) => void;
}) {
  const report = state.report?.report;
  if (state.step !== "report" || !report) return null;
  const themes = target.kind === "rename_field" || target.kind === "change_field_type";
  return (
    <div className="grid gap-3">
      {themes && (
        <Banner
          variant="alert"
          size="sm"
          icon={<Warning weight="fill" />}
          description={t("fields.operation.themeWarning", { key: target.def.key })}
        />
      )}
      {report.unconvertible > 0 && (
        <Checkbox
          label={t("fields.operation.clear", { count: report.unconvertible })}
          checked={clear}
          onCheckedChange={(v: boolean) => setClear(v)}
          data-testid="field-operation-clear"
        />
      )}
      <span className="flex items-start gap-2">
        <span className="flex h-lh items-center">
          <Camera size={16} />
        </span>
        <Text variant="secondary" size="sm">
          {t("fields.operation.snapshotNote")}
        </Text>
      </span>
    </div>
  );
}

/** The primary button: check, confirm the run, or close once finished. */
function primaryLabel(t: FT, step: FieldOperationState["step"], kind: OperationKind): string {
  if (step === "choose" || step === "checking") return t("fields.operation.check");
  if (step === "done" || step === "reverted") return t("fields.operation.close");
  return t(`fields.operation.confirm.${kind}`);
}

/** Whether the primary button waits: an invalid or unchanged key, or the clear opt-in. */
function primaryBlocked(input: {
  step: FieldOperationState["step"];
  target: OperationTarget | undefined;
  key: string;
  keyError: string | undefined;
  needsClear: boolean;
}): boolean {
  const { step, target } = input;
  if (step === "report") return input.needsClear;
  if (step !== "choose") return false;
  if (!target || input.keyError !== undefined) return true;
  return target.kind === "rename_field" && input.key === target.def.key;
}

/**
 * Rename, change type, change localization and remove (RFC-0041 §6, §7): the change is never a
 * plain edit. The dialog runs the dry run and shows its report (counts, per language, samples, the
 * theme note), needs an explicit confirmation — and the "clear" opt-in when values cannot be
 * converted — then runs the operation, continuing until it is done, and offers Revert.
 */
export function FieldOperationDialog({
  open,
  onOpenChange,
  siteId,
  collection,
  target,
  taken,
  defaultLocale,
  locales,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  collection: string;
  target: OperationTarget | undefined;
  /** Keys of the collection's other fields. */
  taken: readonly string[];
  defaultLocale: string;
  locales: readonly string[];
}) {
  const { t, locale } = useI18n("fields");
  const state = useFieldOperation(siteId, collection);
  const [inputs, setInputs] = useState<Inputs>({
    key: "",
    type: "text",
    options: emptyForm("select", locales),
  });
  const [clear, setClear] = useState(false);
  const def = target?.def;
  useEffect(() => {
    if (!open || !target) return state.stop();
    state.reset();
    setClear(false);
    const types = targetTypes(target.def.type);
    setInputs({
      key: target.def.key,
      type: types[0] ?? target.def.type,
      options:
        target.def.type === "select" ? formOf(target.def, locales) : emptyForm("select", locales),
    });
    if (target.resume) {
      if (target.resume.reverting) void state.undo(target.resume.operationId);
      else void state.resume(target.resume.operationId);
    } else if (target.kind === "set_field_localized" || target.kind === "remove_field")
      void state.check(requestOf(target, inputs, false));
  }, [open, target]);
  const problem = target?.kind === "rename_field" ? keyProblem(inputs.key, taken) : undefined;
  const keyError = problem ? t(`fields.dialog.errors.key.${problem}`) : undefined;
  const busy = state.step === "checking" || state.step === "running" || state.step === "reverting";
  const report = state.report?.report;
  const needsClear = (report?.unconvertible ?? 0) > 0 && !clear;
  const name = def ? fieldLabel(def, locale, defaultLocale) : "";
  const kind = target?.kind ?? "rename_field";
  const primary = () => {
    if (!target) return;
    if (state.step === "choose") return void state.check(requestOf(target, inputs, false));
    if (state.step === "report") return void state.run(requestOf(target, inputs, clear));
    onOpenChange(false);
  };
  const finished = state.step === "done" || state.step === "reverted";
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t(`fields.operation.titles.${kind}`, { name })}</LayerDialog.Title>
        <LayerDialog.Description>
          {target?.kind === "set_field_localized"
            ? t(def?.localized ? "fields.operation.toShared" : "fields.operation.toLocalized")
            : t(
                `fields.operation.descriptions.${kind as Exclude<OperationKind, "set_field_localized">}`,
              )}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="field-operation" data-step={state.step}>
            {target && !target.resume && (
              <OperationInputs
                t={t}
                target={target}
                inputs={inputs}
                setInputs={(next) => {
                  setInputs(next);
                  if (state.step === "report") state.reset();
                }}
                keyError={keyError}
                locales={locales}
                defaultLocale={defaultLocale}
                uiLocale={locale}
                disabled={busy || finished}
              />
            )}
            {state.step === "checking" && (
              <div className="flex items-center gap-3" role="status">
                <Loader size="sm" />
                <Text as="span">{t("fields.operation.checking")}</Text>
              </div>
            )}
            {report && (state.step === "report" || state.step === "running") && (
              <FieldOperationReport t={t} locale={locale} report={report} />
            )}
            {target && (
              <OperationNotes
                t={t}
                target={target}
                state={state}
                clear={clear}
                setClear={setClear}
              />
            )}
            <OperationStatus
              t={t}
              state={state}
              onRevert={() => {
                const id = state.result?.operationId ?? target?.resume?.operationId;
                if (id) void state.undo(id);
              }}
            />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={finished ? t("common.close") : t("common.cancel")}>
          <LayerDialog.Actions.Primary
            onClick={primary}
            loading={busy}
            disabled={primaryBlocked({
              step: state.step,
              target,
              key: inputs.key,
              keyError,
              needsClear,
            })}
            data-testid="field-operation-primary"
          >
            {primaryLabel(t, state.step, kind)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
