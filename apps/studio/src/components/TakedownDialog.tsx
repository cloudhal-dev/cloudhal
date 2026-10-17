import type { Asset } from "@cloudhal/core-contracts";
import { Banner, Checkbox, InputArea, InsetPanel, LayerDialog, Text } from "@cloudhal/ui";
import { ProhibitInset, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { apiErrorText } from "../lib/api-errors.ts";

/**
 * Take down a file (RFC-0004 §4.6, Owner only): the bytes are deleted from storage and from every
 * snapshot, its URL answers 410 Gone (451 for a legal reason), the file is retired and the same
 * bytes cannot come back until an Owner allows it. A reason is required and audited; browsers that
 * cached the file may keep their copy, and the dialog says so.
 */
export function TakedownDialog({
  asset,
  name,
  open,
  onOpenChange,
  busy,
  error,
  onConfirm,
}: {
  asset: Asset | undefined;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  /** The failed takedown, worded by `apiErrorText`. */
  error: unknown;
  onConfirm: (input: { reason: string; legal: boolean }) => void;
}) {
  const t = useT("media");
  const [reason, setReason] = useState("");
  const [legal, setLegal] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setLegal(false);
    setTried(false);
  }, [open]);
  const missing = reason.trim() === "";
  return (
    <LayerDialog.Alert open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("media.takedown.title", { name })}</LayerDialog.Title>
        <LayerDialog.Description>{t("media.takedown.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="takedown-dialog">
            <Banner
              variant="alert"
              icon={<ProhibitInset weight="fill" />}
              title={t("media.takedown.warningTitle")}
              description={t("media.takedown.warning")}
            />
            <InsetPanel label={t("media.takedown.consequences")}>
              <Text as="span" bold>
                {t("media.takedown.consequences")}
              </Text>
              <div className="grid gap-1.5">
                {(["bytes", "status", "retired", "reupload", "caches"] as const).map((k) => (
                  <Text key={k} as="span" variant="secondary" size="sm">
                    {t(`media.takedown.points.${k}`)}
                  </Text>
                ))}
              </div>
            </InsetPanel>
            <InputArea
              label={t("media.takedown.reason")}
              value={reason}
              placeholder={t("media.takedown.reasonPlaceholder")}
              onValueChange={setReason}
              description={t("media.takedown.reasonHint")}
              error={tried && missing ? t("media.takedown.reasonRequired") : undefined}
              maxLength={1000}
              autoResize
              minRows={3}
              maxRows={6}
              className="w-full"
              data-testid="takedown-reason"
            />
            <Checkbox
              label={t("media.takedown.legal")}
              checked={legal}
              onCheckedChange={(v: boolean) => setLegal(v)}
            />
            {Boolean(error) && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("errors.title")}
                description={apiErrorText(t, error)}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant="destructive"
            loading={busy}
            disabled={!asset}
            onClick={() => {
              setTried(true);
              if (missing) return;
              onConfirm({ reason: reason.trim(), legal });
            }}
            data-testid="takedown-confirm"
          >
            {t("media.takedown.confirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}
