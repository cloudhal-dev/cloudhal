import {
  Banner,
  Button,
  calendarLocaleProps,
  DatePicker,
  formatCommentDate,
  LayerDialog,
  Text,
} from "@cloudhal/ui";
import { WarningCircle, X } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type TFunction, useI18n } from "../i18n/index.tsx";
import {
  ApiRequestError,
  api,
  type CommentThreadMode,
  type CommentThreadView,
} from "../lib/api.ts";
import { closeInstant, commentsKey } from "../lib/comments.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { useToast } from "./Toast.ts";

type T = TFunction<"comments">;

/** "Closes on 10 Jan 2027", "Closed since …" or "Never closes", from the computed close time. */
export function closeLine(
  t: T,
  thread: Pick<CommentThreadView, "closesAt">,
  locale: string,
  now: number = Date.now(),
): string {
  if (!thread.closesAt) return t("comments.thread.neverCloses");
  const date = formatCommentDate(thread.closesAt, locale);
  return Date.parse(thread.closesAt) <= now
    ? t("comments.thread.closed", { date })
    : t("comments.thread.closes", { date });
}

/**
 * Changes a thread's mode or close date (`PUT …/comment-threads/:nodeId`, CAS on its `rev`). A
 * 409 means someone changed it meanwhile: the toast says so and the thread is read again.
 */
export function useSetThread(siteId: string, nodeId: string) {
  const { t } = useI18n("comments");
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rev: number; mode: CommentThreadMode; closesAt?: string | null }) =>
      api.comments.setThread(siteId, nodeId, input.rev, {
        mode: input.mode,
        ...(input.closesAt !== undefined ? { closesAt: input.closesAt } : {}),
      }),
    onSuccess: async () => {
      toast.success(t("comments.thread.saved"));
      await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
    },
    onError: async (error) => {
      const conflict = error instanceof ApiRequestError && error.status === 409;
      toast.error(
        t("comments.thread.failed"),
        conflict ? t("comments.thread.conflict") : error.message,
      );
      if (conflict) await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
    },
  });
}

/**
 * "Close on…" (RFC-0007 §14): a `DatePicker` in the Studio language (`calendarLocaleProps`); the
 * thread stays open through the end of the day picked (UTC). "Remove close date" goes back to the
 * computed one. Always rendered, controlled by `open`.
 */
export function CloseDateDialog({
  open,
  onOpenChange,
  current,
  busy,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
  busy: boolean;
  error?: string | undefined;
  onSave: (closesAt: string | null) => void;
}) {
  const { t, locale } = useI18n("comments");
  const [day, setDay] = useState<Date | undefined>();
  useEffect(() => {
    if (open) setDay(current ? new Date(current) : undefined);
  }, [open, current]);
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="sm" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("comments.thread.closeDialogTitle")}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("comments.thread.closeDialogDescription")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid justify-items-start gap-4" data-testid="close-date-dialog">
            <DatePicker
              mode="single"
              selected={day}
              onChange={(d: Date | undefined) => setDay(d)}
              disabled={{ before: new Date() }}
              {...calendarLocaleProps(locale, {
                previousMonth: t("comments.thread.calendar.previousMonth"),
                nextMonth: t("comments.thread.calendar.nextMonth"),
                navigation: t("comments.thread.calendar.months"),
                day: (date, { today, selected }) => {
                  const named = selected
                    ? t("comments.thread.calendar.daySelected", { date })
                    : date;
                  return today ? t("comments.thread.calendar.dayToday", { date: named }) : named;
                },
              })}
            />
            {day && (
              <Text variant="secondary" size="sm">
                {t("comments.thread.closes", {
                  date: formatCommentDate(closeInstant(day), locale),
                })}
              </Text>
            )}
            {current && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X />}
                onClick={() => onSave(null)}
                disabled={busy}
                data-testid="close-date-clear"
              >
                {t("comments.thread.clearClose")}
              </Button>
            )}
            {error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("comments.thread.failed")}
                description={error}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={busy}
            disabled={!day}
            onClick={() => day && onSave(closeInstant(day))}
            data-testid="close-date-save"
          >
            {t("comments.thread.saveClose")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** "Hide every comment on this article?" before the mode becomes Hidden (a takedown). */
export function HideThreadConfirm({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  const { t } = useI18n("comments");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("comments.thread.hideConfirmTitle")}
      description={t("comments.thread.hideConfirmDescription")}
      confirmLabel={t("comments.thread.hideConfirm")}
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
