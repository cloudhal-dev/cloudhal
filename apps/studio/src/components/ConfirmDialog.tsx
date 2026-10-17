import { Banner, LayerDialog, Text } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { apiErrorText } from "../lib/api-errors.ts";

/**
 * Non-typed destructive confirmation (DESIGN.md §2d): `LayerDialog.Alert`, always rendered and
 * controlled by `open`; dismissal is blocked while the action runs; a failure stays in the dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  detail,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  detail?: string | undefined;
  confirmLabel: string;
  busy?: boolean;
  /** A failure: a sentence, or the failed request's error (worded by `apiErrorText`). */
  error?: unknown;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <LayerDialog.Alert open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="sm" closeLabel={t("common.close")}>
        <LayerDialog.Title>{title}</LayerDialog.Title>
        <LayerDialog.Description>{description}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4">
            {detail && <Text variant="secondary">{detail}</Text>}
            {Boolean(error) && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("errors.title")}
                description={typeof error === "string" ? error : apiErrorText(t, error)}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary variant="destructive" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}
