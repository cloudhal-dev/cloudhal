import { Banner, Input, LayerDialog, Select, Tabs, Text } from "@cloudhal/ui";
import { ArrowRight, ClockCountdown, Info, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ownModeOf } from "../lib/agents.ts";
import { type AgentKeySummary, api, type ElevationInput, type KeyMode } from "../lib/api.ts";
import {
  activeElevation,
  type CustomUnit,
  ELEVATION_PRESETS,
  elevationSummary,
  formatDuration,
  formatUntil,
  modesAbove,
  parseCustomDuration,
} from "../lib/elevation.ts";
import { AutoModeConfirm, ModeBadge, ModePicker } from "./AgentModes.tsx";
import { useToast } from "./Toast.ts";
import { useAgentModeRules } from "./useAgentModeRules.ts";
import { useNow } from "./useNow.ts";

type Preset = `${(typeof ELEVATION_PRESETS)[number]}` | "custom";
const DEFAULT_PRESET: Preset = "60";

/**
 * Row-menu "Elevate temporarily" (DESIGN.md §2g, ADR-0016): a more autonomous mode for a while,
 * after which the key is back in its own mode without anyone doing anything. Only the modes above
 * the key's own are offered; Auto needs the same explicit consent as everywhere else. A refusal
 * (400) stays in the dialog with the server's reason.
 */
export function ElevateAgentKeyDialog({
  agentKey: currentKey,
  onOpenChange,
}: {
  /** The key to elevate; `undefined` closes the dialog (it stays mounted to animate). */
  agentKey: AgentKeySummary | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useAgentModeRules();
  const now = useNow();
  const durationLabel = useId();
  // Keep showing the last key while the dialog animates closed.
  const last = useRef(currentKey);
  if (currentKey) last.current = currentKey;
  const agentKey = currentKey ?? last.current;
  const own = ownModeOf(agentKey);
  const targets = modesAbove(own, rules.modes);
  const name = agentKey?.name ?? t("agents.unnamed");
  const inForce = agentKey
    ? activeElevation({ mode: own, elevation: agentKey.elevation }, now)
    : undefined;
  const { minMinutes, maxMinutes } = rules.elevation;
  const presets = ELEVATION_PRESETS.filter((m) => m >= minMinutes && m <= maxMinutes);

  const [mode, setMode] = useState<KeyMode>(targets[0] ?? "auto");
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("minutes");
  const [reason, setReason] = useState("");
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const elevate = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ElevationInput }) =>
      api.agentKeys.elevate(id, input),
    onSuccess: async (updated) => {
      qc.setQueryData<AgentKeySummary[]>(["agent-keys"], (keys) =>
        keys?.map((k) => (k.id === updated.id ? updated : k)),
      );
      onOpenChange(false);
      const elevated = updated.elevation;
      toast.success(
        t("agents.elevate.done"),
        elevated
          ? t("agents.elevate.doneDescription", {
              name: updated.name ?? t("agents.unnamed"),
              mode: t(`agents.modes.names.${elevated.mode}`),
              time: formatUntil(elevated.until, locale),
              from: t(`agents.modes.names.${updated.mode}`),
            })
          : undefined,
      );
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
    },
  });

  // Each opening starts afresh: the next mode up, one hour, no reason.
  useEffect(() => {
    if (currentKey) {
      setMode(modesAbove(ownModeOf(currentKey), rules.modes)[0] ?? "auto");
      setPreset(DEFAULT_PRESET);
      setCustomValue("");
      setCustomUnit("minutes");
      setReason("");
      setAutoConfirmed(false);
      setSubmitted(false);
      elevate.reset();
    }
  }, [currentKey?.id]);

  const custom =
    preset === "custom" ? parseCustomDuration(customValue, customUnit, rules.elevation) : undefined;
  const minutes =
    preset === "custom" ? (custom && "minutes" in custom ? custom.minutes : undefined) : +preset;
  const bounds = {
    min: formatDuration(minMinutes, locale, "long"),
    max: formatDuration(maxMinutes, locale, "long"),
  };
  // Out of bounds shows while typing; an empty or unreadable value only after a submit attempt.
  const customError =
    custom && "error" in custom && (custom.error !== "invalid" || submitted)
      ? t(`agents.elevate.customErrors.${custom.error}`, bounds)
      : undefined;
  const needsConsent = mode === "auto";

  const choose = (next: KeyMode) => {
    setMode(next);
    setAutoConfirmed(false);
    elevate.reset();
  };
  const submit = () => {
    setSubmitted(true);
    if (!agentKey || elevate.isPending || !targets.includes(mode) || minutes === undefined) return;
    if (needsConsent && !autoConfirmed) return;
    const why = reason.trim();
    elevate.mutate({ id: agentKey.id, input: { mode, minutes, ...(why ? { reason: why } : {}) } });
  };

  return (
    <LayerDialog.Root
      open={currentKey !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={elevate.isPending}
    >
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("agents.elevate.title")}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("agents.elevate.description", { name })}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="elevate-key">
            {inForce && (
              <div data-testid="elevation-replaces">
                <Banner
                  variant="default"
                  size="sm"
                  icon={<ClockCountdown weight="fill" />}
                  title={t("agents.elevate.replacesTitle")}
                  description={t("agents.elevate.replaces", {
                    name,
                    mode: t(`agents.modes.names.${inForce.mode}`),
                    time: formatUntil(inForce.until, locale, { now }),
                  })}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="own-mode">
              <Text size="sm" bold as="span">
                {t("agents.elevate.ownMode")}
              </Text>
              <ModeBadge mode={own} />
              <Text variant="secondary" size="sm" as="span">
                {t("agents.elevate.ownModeHint")}
              </Text>
            </div>
            <div className="grid gap-2">
              <Text size="sm" bold as="span">
                {t("agents.elevate.legend")}
              </Text>
              <ModePicker
                value={mode}
                onValueChange={choose}
                only={targets}
                legend={t("agents.elevate.legend")}
              />
            </div>
            {needsConsent && (
              <AutoModeConfirm
                checked={autoConfirmed}
                onCheckedChange={setAutoConfirmed}
                showError={submitted}
              />
            )}
            <fieldset className="grid min-w-0 gap-3" aria-labelledby={durationLabel}>
              <Text size="sm" bold as="span" id={durationLabel}>
                {t("agents.elevate.duration")}
              </Text>
              <div className="min-w-0 overflow-x-auto" data-testid="elevation-presets">
                <Tabs
                  variant="segmented"
                  value={preset}
                  onValueChange={(v) => setPreset(v as Preset)}
                  tabs={[
                    ...presets.map((m) => ({
                      value: `${m}` as Preset,
                      label: t(`agents.elevate.presets.${m}`),
                    })),
                    { value: "custom", label: t("agents.elevate.presets.custom") },
                  ]}
                />
              </div>
              {preset === "custom" && (
                <div className="flex flex-wrap items-start gap-3" data-testid="elevation-custom">
                  <div className="min-w-0 flex-[1_1_9rem]">
                    <Input
                      className="w-full"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="any"
                      label={t("agents.elevate.customValue")}
                      description={t("agents.elevate.customHint", bounds)}
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
            <Input
              className="w-full"
              label={t("agents.elevate.reason")}
              placeholder={t("agents.elevate.reasonPlaceholder")}
              description={t("agents.elevate.reasonHint")}
              value={reason}
              onValueChange={setReason}
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {elevate.error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("agents.elevate.failed")}
                description={elevate.error.message}
              />
            )}
            {/* What will happen, right above the action that makes it happen. */}
            <div
              className="grid gap-2 rounded-lg px-4 py-3 ring ring-kumo-hairline"
              data-testid="elevation-summary"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex items-center gap-2">
                  <Text variant="secondary" size="sm" as="span">
                    {t("agents.elevate.now")}
                  </Text>
                  <ModeBadge mode={own} />
                </span>
                <ArrowRight size={16} className="text-kumo-subtle" aria-hidden />
                <span className="flex items-center gap-2">
                  <Text variant="secondary" size="sm" as="span">
                    {t("agents.elevate.elevated")}
                  </Text>
                  <ModeBadge mode={mode} />
                </span>
              </div>
              {minutes !== undefined && (
                <div className="flex items-start gap-2">
                  <span className="flex h-lh items-center text-kumo-subtle">
                    <ClockCountdown size={16} />
                  </span>
                  <Text bold data-testid="elevation-summary-text">
                    {elevationSummary(t, locale, { from: own, minutes, now })}
                  </Text>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="flex h-lh items-center text-kumo-subtle">
                  <Info size={16} />
                </span>
                <Text variant="secondary" size="sm">
                  {t("agents.elevate.nextCall")}
                </Text>
              </div>
            </div>
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            onClick={submit}
            loading={elevate.isPending}
            disabled={targets.length === 0}
          >
            {t("agents.elevate.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
