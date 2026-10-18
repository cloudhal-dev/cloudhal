import { Banner, InsetPanel, LayerDialog, Text, TransitionArrow } from "@cloudhal/ui";
import { ClockCountdown, Info, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { DEFAULT_MODE, isKeyMode } from "../lib/agents.ts";
import { type AgentKeySummary, api, type KeyMode } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { activeElevation, formatUntil, isMoreAutonomous } from "../lib/elevation.ts";
import { AutoModeConfirm, BypassHint, ModeBadge, ModePicker } from "./AgentModes.tsx";
import { useToast } from "./Toast.ts";
import { useNow } from "./useNow.ts";

/**
 * Row-menu "Change mode" (DESIGN.md §2g): the same mode cards as the create dialog, the change as
 * current → new, and explicit consent before switching to `auto`. The server audits the change and
 * applies it on the agent's next call; a refusal (400) stays in the dialog.
 */
export function ChangeAgentModeDialog({
  agentKey: currentKey,
  onOpenChange,
}: {
  /** The key to change; `undefined` closes the dialog (it stays mounted to animate). */
  agentKey: AgentKeySummary | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const now = useNow();
  const toast = useToast();
  // Keep showing the last key while the dialog animates closed.
  const last = useRef(currentKey);
  if (currentKey) last.current = currentKey;
  const agentKey = currentKey ?? last.current;
  const from: KeyMode = isKeyMode(agentKey?.mode) ? agentKey.mode : DEFAULT_MODE;
  const [mode, setMode] = useState<KeyMode>(from);
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const name = agentKey?.name ?? t("agents.unnamed");
  // A time-boxed elevation (ADR-0016) survives a change of the own mode only while it is higher.
  const inForce = agentKey
    ? activeElevation({ mode: from, elevation: agentKey.elevation }, now)
    : undefined;

  const change = useMutation({
    mutationFn: ({ id, next }: { id: string; next: KeyMode }) => api.agentKeys.setMode(id, next),
    onSuccess: async (updated) => {
      // The whole summary: an elevation the new mode reaches is gone from it.
      qc.setQueryData<AgentKeySummary[]>(["agent-keys"], (keys) =>
        keys?.map((k) => (k.id === updated.id ? updated : k)),
      );
      onOpenChange(false);
      toast.success(
        t("agents.changeMode.changed"),
        t("agents.changeMode.changedDescription", {
          name: updated.name ?? t("agents.unnamed"),
          mode: t(`agents.modes.names.${updated.mode}`),
        }),
      );
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
    },
  });

  // Each opening starts from the key's current mode.
  useEffect(() => {
    if (currentKey) {
      setMode(isKeyMode(currentKey.mode) ? currentKey.mode : DEFAULT_MODE);
      setAutoConfirmed(false);
      setSubmitted(false);
      change.reset();
    }
  }, [currentKey?.id]);

  const needsConsent = mode === "auto" && from !== "auto";
  const choose = (next: KeyMode) => {
    setMode(next);
    setAutoConfirmed(false);
    setSubmitted(false);
    change.reset();
  };
  const submit = () => {
    setSubmitted(true);
    if (!agentKey || mode === from || change.isPending) return;
    if (needsConsent && !autoConfirmed) return;
    change.mutate({ id: agentKey.id, next: mode });
  };

  return (
    <LayerDialog.Root
      open={currentKey !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={change.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("agents.changeMode.title")}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("agents.changeMode.description", { name })}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="change-mode">
            {inForce && (
              <div
                data-testid="change-mode-elevation"
                data-elevation-outcome={isMoreAutonomous(inForce.mode, mode) ? "keeps" : "ends"}
              >
                <Banner
                  variant="default"
                  size="sm"
                  icon={<ClockCountdown weight="fill" />}
                  title={t("agents.changeMode.elevatedTitle", {
                    mode: t(`agents.modes.names.${inForce.mode}`),
                    time: formatUntil(inForce.until, locale, { now }),
                  })}
                  description={
                    isMoreAutonomous(inForce.mode, mode)
                      ? t("agents.changeMode.elevationKeeps", {
                          time: formatUntil(inForce.until, locale, { now }),
                          mode: t(`agents.modes.names.${mode}`),
                        })
                      : t("agents.changeMode.elevationEnds", {
                          mode: t(`agents.modes.names.${mode}`),
                        })
                  }
                />
              </div>
            )}
            <ModePicker
              value={mode}
              onValueChange={choose}
              current={from}
              legend={t("agents.modes.legend")}
            />
            <BypassHint />
            {needsConsent && (
              <AutoModeConfirm
                checked={autoConfirmed}
                onCheckedChange={setAutoConfirmed}
                showError={submitted}
              />
            )}
            {change.error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("agents.changeMode.failed")}
                description={apiErrorText(t, change.error)}
              />
            )}
            {/* The change as it will apply, right above the action that makes it. */}
            <InsetPanel>
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2"
                data-testid="mode-transition"
              >
                <span className="flex items-center gap-2">
                  <Text variant="secondary" size="sm" as="span">
                    {t("agents.changeMode.from")}
                  </Text>
                  <ModeBadge mode={from} />
                </span>
                <TransitionArrow size={16} />
                <span className="flex items-center gap-2">
                  <Text variant="secondary" size="sm" as="span">
                    {t("agents.changeMode.to")}
                  </Text>
                  <ModeBadge mode={mode} />
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-lh items-center text-kumo-subtle">
                  <Info size={16} />
                </span>
                <Text variant="secondary" size="sm">
                  <Text as="span" size="sm" bold>
                    {t("agents.changeMode.nextCallTitle")}.
                  </Text>{" "}
                  {t("agents.changeMode.nextCall")}
                </Text>
              </div>
            </InsetPanel>
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            onClick={submit}
            loading={change.isPending}
            disabled={mode === from}
          >
            {t("agents.changeMode.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
