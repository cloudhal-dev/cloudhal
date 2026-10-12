import { Banner, LayerDialog, Text } from "@cloudflare/kumo";
import { ArrowRight, CheckCircle, HandPalm, Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { DateTimeField, type DateTimeFieldLabels, type DateTimeValue } from "./DateTimeField.tsx";
import { InsetPanel } from "./InsetPanel.tsx";

/**
 * What moving does to the approval (RFC-0008 D4): a person who may approve keeps it (`kept`);
 * an agent's move or any content change voids it and asks again (`voided`); nothing was
 * approved yet (`none`).
 */
export type RescheduleApprovalEffect = "kept" | "voided" | "none";

export interface RescheduleDialogLabels {
  /** "Move to…" or "Move ‘Election results’". */
  title: string;
  description?: string;
  /** The summary's two sides ("Now", "New"). */
  now: string;
  next: string;
  /** The summary while no new time is valid ("Pick a new time"). */
  pickTime: string;
  /** The approval notes: "The approval is kept — you may approve it." / "Moving voids the approval; it asks again." */
  approvalKept: string;
  approvalVoided: string;
  /** The primary action ("Move"), the dismiss ("Cancel") and the close button's name. */
  confirm: string;
  cancel: string;
  close: string;
  /** The date-and-time field's words. */
  field: DateTimeFieldLabels;
  /** The field's label ("New time"). */
  fieldLabel: string;
}

export interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item moved, plain text. */
  subject: string;
  /** The time in force, already written in the site zone ("Mon 2 Nov, 09:00"). */
  current: string;
  /** The new wall-clock time, controlled (a drop prefills the new day with the old time). */
  value: DateTimeValue;
  onValueChange: (next: DateTimeValue) => void;
  /** The new time written out for the summary, once it is valid. */
  nextLabel?: string | undefined;
  approvalEffect: RescheduleApprovalEffect;
  /** A clash the screen found ("Another release publishes ‘Budget’ at 09:00"): an alert banner. */
  conflict?: string | undefined;
  /** The field's validation message (past, too soon, DST gap). */
  error?: string | undefined;
  /** A failed move ("This schedule changed somewhere else"), with the screen's action. */
  failure?: { title: string; description?: string; action?: ReactNode } | undefined;
  onConfirm: () => void;
  busy?: boolean;
  locale: string;
  timeZone: string;
  zoneLabel: string;
  today?: string;
  hourCycle?: "h23" | "h12";
  labels: RescheduleDialogLabels;
}

/**
 * "Move to…" (RFC-0008 §15.4, §15.6; D4, D12): a `LayerDialog size="base"`, always rendered and
 * controlled by `open`, with the item, a "Now → New" `InsetPanel`, the `DateTimeField` in the
 * site zone, an alert `Banner` for a clash, an info or alert `Banner` saying whether the approval
 * is kept or voided, and the primary "Move" (disabled until the new time is valid and
 * different). It is where a drop, a keyboard move and every item's "Move to…" end: nothing is
 * written before "Move". The screen shows the toast with **Undo** for 10 s afterwards.
 */
export function RescheduleDialog({
  open,
  onOpenChange,
  subject,
  current,
  value,
  onValueChange,
  nextLabel,
  approvalEffect,
  conflict,
  error,
  failure,
  onConfirm,
  busy,
  locale,
  timeZone,
  zoneLabel,
  today,
  hourCycle,
  labels,
}: RescheduleDialogProps) {
  const ready = !!value.date && !!value.time && !error && !!nextLabel && nextLabel !== current;
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="base" closeLabel={labels.close}>
        <LayerDialog.Title>{labels.title}</LayerDialog.Title>
        <LayerDialog.Description>{labels.description ?? subject}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-reschedule="">
            <InsetPanel layout="row">
              <span className="grid min-w-0 gap-0.5">
                <Text as="span" variant="secondary" size="sm">
                  {labels.now}
                </Text>
                <Text as="span" bold>
                  <span data-reschedule-current="">{current}</span>
                </Text>
              </span>
              <ArrowRight size={16} aria-hidden className="shrink-0 text-kumo-subtle" />
              <span className="grid min-w-0 gap-0.5">
                <Text as="span" variant="secondary" size="sm">
                  {labels.next}
                </Text>
                <Text as="span" bold variant={nextLabel ? undefined : "secondary"}>
                  <span data-reschedule-next="">{nextLabel ?? labels.pickTime}</span>
                </Text>
              </span>
            </InsetPanel>
            <DateTimeField
              label={labels.fieldLabel}
              value={value}
              onChange={onValueChange}
              locale={locale}
              timeZone={timeZone}
              zoneLabel={zoneLabel}
              hourCycle={hourCycle}
              labels={labels.field}
              error={error}
              {...(today ? { today, min: today } : {})}
              className="w-full"
            />
            {conflict && (
              <Banner
                variant="alert"
                size="sm"
                icon={<Warning weight="fill" />}
                description={conflict}
              />
            )}
            {approvalEffect === "kept" && (
              <div data-approval-effect="kept">
                <Banner
                  size="sm"
                  icon={<CheckCircle weight="fill" />}
                  description={labels.approvalKept}
                />
              </div>
            )}
            {approvalEffect === "voided" && (
              <div data-approval-effect="voided">
                <Banner
                  variant="alert"
                  size="sm"
                  icon={<HandPalm weight="fill" />}
                  description={labels.approvalVoided}
                />
              </div>
            )}
            {failure && (
              <Banner
                variant="error"
                title={failure.title}
                description={failure.description}
                action={failure.action}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={labels.cancel}>
          <LayerDialog.Actions.Primary
            loading={busy}
            disabled={!ready}
            onClick={onConfirm}
            data-reschedule-confirm=""
          >
            {labels.confirm}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
