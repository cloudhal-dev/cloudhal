import { Banner, Input, LayerDialog, Select, Surface, Tabs, Text } from "@cloudhal/ui";
import { ArrowRight, ClockCountdown, Info, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ApiRequestError, type Approval, api, type KeyMode } from "../lib/api.ts";
import { elevationRequestOf, grantPresets } from "../lib/approvals.ts";
import {
  type CustomUnit,
  formatDuration,
  formatUntil,
  parseCustomDuration,
} from "../lib/elevation.ts";
import { AutoModeConfirm, ModeBadge } from "./AgentModes.tsx";
import { CannotTakeNotice, cannotTake, useShortDuration } from "./ElevationRequest.tsx";
import { useToast } from "./Toast.ts";
import { useAgentModeRules } from "./useAgentModeRules.ts";
import { useNow } from "./useNow.ts";
import { approvalsKey } from "./usePendingApprovals.ts";

type Preset = `${number}` | "custom";

/**
 * Approving an agent's `request_elevation` (DESIGN.md §2m, ADR-0016 addendum). The mode is what
 * the agent asked for and cannot be changed here; the time can be shortened, never extended. Auto
 * needs the same explicit consent as everywhere else. The server grants the elevation on the
 * agent's key with the approver's rights; `{minutes}` is sent only when shortened. A 400 stays in
 * the dialog; a 409 shows the server's reason and refreshes the list, where the request stays
 * while it is still pending. Always mounted; `request` undefined closes it.
 */
export function ApproveElevationDialog({
  siteId,
  request: current,
  ownMode,
  onOpenChange,
}: {
  siteId: string;
  request: Approval | undefined;
  /** The key's own mode (agent keys list, else the request); undefined when unknown. */
  ownMode: KeyMode | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useAgentModeRules();
  const now = useNow();
  const durationLabel = useId();
  // Keep showing the last request while the dialog animates closed.
  const last = useRef(current);
  if (current) last.current = current;
  const request = current ?? last.current;
  const elevation = request ? elevationRequestOf(request) : undefined;
  const requested = elevation?.minutes ?? 60;
  const mode: KeyMode = elevation?.mode ?? "edits";
  const agent = request ? (request.actor.name ?? request.actor.id) : "";
  const modeName = t(`agents.modes.names.${mode}`);
  const presets = grantPresets(requested, rules.elevation);

  const [preset, setPreset] = useState<Preset>(`${requested}`);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("minutes");
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const grant = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number | undefined }) =>
      api.approvals.grantElevation(siteId, id, minutes),
    onSuccess: async (_r, { minutes }) => {
      onOpenChange(false);
      const until = new Date(Date.now() + (minutes ?? requested) * 60_000).toISOString();
      const params = { agent, mode: modeName, time: formatUntil(until, locale) };
      toast.success(
        t("approvals.elevation.done"),
        ownMode
          ? t("approvals.elevation.doneDescription", {
              ...params,
              from: t(`agents.modes.names.${ownMode}`),
            })
          : t("approvals.elevation.doneDescriptionNoOwn", params),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
        qc.invalidateQueries({ queryKey: ["agent-keys"] }),
        qc.invalidateQueries({ queryKey: ["activity", siteId] }),
      ]);
    },
    onError: async (error) => {
      // 409: decided meanwhile, or the key can no longer take it (then it is still pending).
      if (error instanceof ApiRequestError && error.status === 409)
        await Promise.all([
          qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
          qc.invalidateQueries({ queryKey: ["agent-keys"] }),
        ]);
    },
  });

  // Each opening starts afresh: the time the agent asked for, no consent yet.
  useEffect(() => {
    if (current) {
      setPreset(`${elevationRequestOf(current)?.minutes ?? 60}`);
      setCustomValue("");
      setCustomUnit("minutes");
      setAutoConfirmed(false);
      setSubmitted(false);
      grant.reset();
    }
  }, [current?.id]);

  // Custom durations stay within the server's minimum and the request: shorter, never longer.
  const bounds = { minMinutes: rules.elevation.minMinutes, maxMinutes: requested };
  const custom =
    preset === "custom" ? parseCustomDuration(customValue, customUnit, bounds) : undefined;
  const minutes =
    preset === "custom" ? (custom && "minutes" in custom ? custom.minutes : undefined) : +preset;
  const boundWords = {
    min: formatDuration(bounds.minMinutes, locale, "long"),
    max: formatDuration(bounds.maxMinutes, locale, "long"),
  };
  const customError =
    custom && "error" in custom && (custom.error !== "invalid" || submitted)
      ? t(`agents.elevate.customErrors.${custom.error}`, boundWords)
      : undefined;
  const needsConsent = mode === "auto";
  const conflict = grant.error instanceof ApiRequestError && grant.error.status === 409;

  const submit = () => {
    setSubmitted(true);
    if (!request || !elevation || grant.isPending || minutes === undefined) return;
    if (minutes > requested) return;
    if (needsConsent && !autoConfirmed) return;
    // The server grants what was asked unless told otherwise: send minutes only when shortened.
    grant.mutate({ id: request.id, minutes: minutes < requested ? minutes : undefined });
  };

  // The standard presets keep their words ("1 hour"); an odd request reads "1 hr 30 min".
  const presetLabel = useShortDuration();
  const until = minutes === undefined ? undefined : new Date(now + minutes * 60_000).toISOString();

  return (
    <LayerDialog.Root
      open={current !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={grant.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {request ? t("approvals.elevation.title", { mode: modeName, agent }) : ""}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {request ? t("approvals.elevation.description", { agent }) : ""}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {request && elevation && (
            <div className="grid gap-5" data-testid="approve-elevation">
              {cannotTake(ownMode, elevation) && <CannotTakeNotice agent={agent} own={ownMode} />}
              <Surface className="grid gap-1 rounded-lg px-4 py-3 ring ring-kumo-hairline">
                <Text variant="secondary" size="xs" as="span">
                  {t("approvals.elevation.reasonLabel")}
                </Text>
                {/* Agent-written: plain text only, never markup. */}
                {elevation.reason ? (
                  <Text>“{elevation.reason}”</Text>
                ) : (
                  <Text variant="secondary">{t("approvals.elevation.noReason")}</Text>
                )}
              </Surface>
              <div className="grid gap-1.5" data-testid="elevation-mode">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Text size="sm" bold as="span">
                    {t("approvals.elevation.mode")}
                  </Text>
                  <ModeBadge mode={mode} />
                </div>
                <Text variant="secondary" size="sm">
                  {t("approvals.elevation.modeFixed")}
                </Text>
              </div>
              {needsConsent && (
                <AutoModeConfirm
                  checked={autoConfirmed}
                  onCheckedChange={setAutoConfirmed}
                  showError={submitted}
                />
              )}
              <fieldset className="grid min-w-0 gap-3" aria-labelledby={durationLabel}>
                <div className="grid gap-1.5">
                  <Text size="sm" bold as="span" id={durationLabel}>
                    {t("agents.elevate.duration")}
                  </Text>
                  <Text variant="secondary" size="sm">
                    {t("approvals.elevation.requested", {
                      duration: formatDuration(requested, locale, "long"),
                    })}
                  </Text>
                </div>
                <div className="min-w-0 overflow-x-auto" data-testid="grant-presets">
                  <Tabs
                    variant="segmented"
                    value={preset}
                    onValueChange={(v) => {
                      setPreset(v as Preset);
                      grant.reset();
                    }}
                    tabs={[
                      ...presets.map((m) => ({ value: `${m}` as Preset, label: presetLabel(m) })),
                      { value: "custom", label: t("agents.elevate.presets.custom") },
                    ]}
                  />
                </div>
                {preset === "custom" && (
                  <div className="flex flex-wrap items-start gap-3" data-testid="grant-custom">
                    <div className="min-w-0 flex-[1_1_9rem]">
                      <Input
                        className="w-full"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        step="any"
                        label={t("agents.elevate.customValue")}
                        description={t("agents.elevate.customHint", boundWords)}
                        value={customValue}
                        onValueChange={setCustomValue}
                        error={customError}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                          }
                        }}
                      />
                    </div>
                    <div className="w-36">
                      <Select
                        className="w-full"
                        label={t("agents.elevate.customUnit")}
                        value={customUnit}
                        onValueChange={(v) => setCustomUnit(v as CustomUnit)}
                        items={{
                          minutes: t("agents.elevate.units.minutes"),
                          hours: t("agents.elevate.units.hours"),
                        }}
                      />
                    </div>
                  </div>
                )}
              </fieldset>
              {grant.error && (
                <div data-testid="grant-error" data-status={conflict ? 409 : undefined}>
                  <Banner
                    variant="error"
                    size="sm"
                    icon={<WarningCircle weight="fill" />}
                    title={t("approvals.elevation.failed")}
                    description={
                      conflict ? (
                        <span className="grid gap-1">
                          <span>{grant.error.message}</span>
                          <span>{t("approvals.elevation.stillPending")}</span>
                        </span>
                      ) : (
                        grant.error.message
                      )
                    }
                  />
                </div>
              )}
              {/* What will happen, right above the action that makes it happen. */}
              <div
                className="grid gap-2 rounded-lg px-4 py-3 ring ring-kumo-hairline"
                data-testid="grant-summary"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {ownMode && (
                    <>
                      <span className="flex items-center gap-2">
                        <Text variant="secondary" size="sm" as="span">
                          {t("agents.elevate.now")}
                        </Text>
                        <ModeBadge mode={ownMode} />
                      </span>
                      <ArrowRight size={16} className="text-kumo-subtle" aria-hidden />
                    </>
                  )}
                  <span className="flex items-center gap-2">
                    <Text variant="secondary" size="sm" as="span">
                      {t("agents.elevate.elevated")}
                    </Text>
                    <ModeBadge mode={mode} />
                  </span>
                </div>
                {until && !cannotTake(ownMode, elevation) && (
                  <div className="flex items-start gap-2">
                    <span className="flex h-lh items-center text-kumo-subtle">
                      <ClockCountdown size={16} />
                    </span>
                    <Text bold data-testid="grant-summary-text">
                      {ownMode
                        ? t("approvals.elevation.summary", {
                            agent,
                            mode: modeName,
                            time: formatUntil(until, locale, { now }),
                            from: t(`agents.modes.names.${ownMode}`),
                          })
                        : t("approvals.elevation.summaryNoOwn", {
                            agent,
                            mode: modeName,
                            time: formatUntil(until, locale, { now }),
                          })}
                    </Text>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="flex h-lh items-center text-kumo-subtle">
                    <Info size={16} />
                  </span>
                  <Text variant="secondary" size="sm">
                    {t("approvals.elevation.nextCall")}
                  </Text>
                </div>
              </div>
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary onClick={submit} loading={grant.isPending}>
            {t("approvals.elevation.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
