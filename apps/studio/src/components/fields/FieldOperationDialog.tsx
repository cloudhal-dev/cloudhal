import type { Site } from "@cloudhal/core-contracts";
import { fieldLabel } from "@cloudhal/core-ts/fields";
import { Banner, Checkbox, LayerDialog, Loader, Text } from "@cloudhal/ui";
import { ArrowCounterClockwise, Camera, CheckCircle, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { type TFunction, useI18n } from "../../i18n/index.tsx";
import { apiErrorText } from "../../lib/api-errors.ts";
import { emptyForm } from "../../lib/field-form.ts";
import { keyProblem } from "../../lib/fields.ts";
import { FieldOperationReport } from "./FieldOperationReport.tsx";
import {
  freshInputs,
  type Inputs,
  OperationInputs,
  type OperationKind,
  type OperationTarget,
  requestOf,
  subOf,
  targetBlocked,
} from "./OperationInputs.tsx";
import { StuckOperation } from "./StuckOperation.tsx";
import { type FieldOperationState, useFieldOperation } from "./useFieldOperation.ts";

type FT = TFunction<"fields">;

export type { OperationKind, OperationTarget } from "./OperationInputs.tsx";
export { targetTypes } from "./OperationInputs.tsx";

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
          {/* The words beside it say it; the spinner is only seen. */}
          <span aria-hidden="true">
            <Loader size="sm" />
          </span>
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

/** The primary button: check, confirm the run, finish a stuck one, or close once finished. */
function primaryLabel(t: FT, step: FieldOperationState["step"], kind: OperationKind): string {
  if (step === "choose" || step === "checking") return t("fields.operation.check");
  if (step === "stuck") return t("fields.operation.stuckFinish");
  if (step === "done" || step === "reverted") return t("fields.operation.close");
  return t(`fields.operation.confirm.${kind}`);
}

/**
 * Whether the primary button waits: an invalid or unchanged key, a type change's target settings
 * still missing (collections, sub-fields), the clear opt-in, or a stuck run's confirmation.
 */
function primaryBlocked(input: {
  step: FieldOperationState["step"];
  target: OperationTarget | undefined;
  inputs: Inputs;
  defaultLocale: string;
  keyError: string | undefined;
  needsClear: boolean;
  stuckConfirmed: boolean;
}): boolean {
  const { step, target, inputs } = input;
  if (step === "report") return input.needsClear;
  if (step === "stuck") return !input.stuckConfirmed;
  if (step !== "choose") return false;
  if (!target || input.keyError !== undefined) return true;
  if (target.kind === "change_field_type") return targetBlocked(inputs, input.defaultLocale);
  const current = inputs.sub ? subOf(target.def, inputs.sub)?.key : target.def.key;
  return target.kind === "rename_field" && inputs.key === current;
}

/** The dialog's inputs and opt-ins, started over for each target, and the new key's problem. */
function useOperationInputs(o: {
  open: boolean;
  target: OperationTarget | undefined;
  taken: readonly string[];
  locales: readonly string[];
  referenceTypes: boolean;
  state: FieldOperationState;
  t: FT;
}) {
  const { open, target, state, locales, referenceTypes } = o;
  const [inputs, setInputs] = useState<Inputs>({
    key: "",
    sub: "",
    type: "text",
    form: emptyForm("text", locales),
  });
  const [clear, setClear] = useState(false);
  const [clearStuck, setClearStuck] = useState(false);
  // A new target or opening starts over.
  useEffect(() => {
    if (!open || !target) return state.stop();
    state.reset();
    setClear(false);
    setClearStuck(false);
    const fresh = freshInputs(target, "", { locales, referenceTypes });
    setInputs(fresh);
    if (target.resume) {
      if (target.resume.reverting) void state.undo(target.resume.operationId);
      else void state.resume(target.resume.operationId);
    } else if (target.kind === "set_field_localized" || target.kind === "remove_field")
      void state.check(requestOf(target, fresh, false));
  }, [open, target]);
  // A sub-field's new key must be free among its repeater's other sub-fields.
  const def = target?.def;
  const siblings =
    def?.type === "repeater" && inputs.sub
      ? def.fields.filter((s) => s.key !== inputs.sub).map((s) => s.key)
      : o.taken;
  const problem = target?.kind === "rename_field" ? keyProblem(inputs.key, siblings) : undefined;
  const keyError = problem ? o.t(`fields.dialog.errors.key.${problem}`) : undefined;
  return { inputs, setInputs, clear, setClear, clearStuck, setClearStuck, keyError };
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
  site,
  referenceTypes,
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
  site: Site;
  /** The server takes reference and repeater fields (RFC-0045). */
  referenceTypes: boolean;
}) {
  const { t, locale } = useI18n("fields");
  const state = useFieldOperation(siteId, collection);
  const { inputs, setInputs, clear, setClear, clearStuck, setClearStuck, keyError } =
    useOperationInputs({ open, target, taken, locales, referenceTypes, state, t });
  const def = target?.def;
  const busy = state.step === "checking" || state.step === "running" || state.step === "reverting";
  const report = state.report?.report;
  const needsClear = (report?.unconvertible ?? 0) > 0 && !clear;
  const name = def ? fieldLabel(def, locale, defaultLocale) : "";
  const kind = target?.kind ?? "rename_field";
  const primary = () => {
    if (!target) return;
    if (state.step === "choose") return void state.check(requestOf(target, inputs, false));
    if (state.step === "report") return void state.run(requestOf(target, inputs, clear));
    if (state.step === "stuck" && state.stuck) {
      setClearStuck(false);
      return void state.finishClearing(state.stuck);
    }
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
                // "Clear and finish" continues the run as it was asked: nothing here changes it.
                disabled={busy || finished || state.step === "stuck"}
                site={site}
                referenceTypes={referenceTypes}
              />
            )}
            {state.step === "checking" && (
              <div className="flex items-center gap-3" role="status">
                <span aria-hidden="true">
                  <Loader size="sm" />
                </span>
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
            {state.step === "stuck" && state.stuck && (
              <StuckOperation
                t={t}
                stuck={state.stuck}
                confirmed={clearStuck}
                onConfirm={setClearStuck}
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
            variant={state.step === "stuck" ? "destructive" : "primary"}
            disabled={primaryBlocked({
              step: state.step,
              target,
              inputs,
              defaultLocale,
              keyError,
              needsClear,
              stuckConfirmed: clearStuck,
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
