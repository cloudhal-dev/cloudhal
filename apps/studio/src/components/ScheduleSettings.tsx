/**
 * Site settings for schedules (RFC-0008 §15.1 "Site settings", §11.5–§11.6): the General section's
 * "Time zone" field (`Site.timeZone`, a `Combobox` over the browser's IANA zones with the browser's
 * own suggested), and the Schedules section — the scheduler's health, the site's kill switch (with
 * a reason, confirmed) and the daily automation write cap with today's use. Words come from the
 * lazy `scheduleSettings` namespace, loaded with the settings route.
 */
import {
  Badge,
  Banner,
  Button,
  Combobox,
  Input,
  InputArea,
  LayerDialog,
  Meter,
  SkeletonLine,
  Switch,
  Text,
} from "@cloudhal/ui";
import { ArrowClockwise, PauseCircle, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ApiRequestError, api, isNotEnabled, type ScheduleSettings } from "../lib/api.ts";
import { browserZone, formatMoment, knownZones, zoneLabel } from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { SettingRow, SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const SCHEDULE_SETTINGS_SECTION = "schedules";

interface ZoneOption {
  value: string;
  label: string;
}

/**
 * "Time zone" (`Site.timeZone`): a searchable `Combobox` of the zones this browser knows, written
 * "Istanbul (UTC+3)", with the browser's own zone offered first. Empty means UTC.
 */
export function TimeZoneField({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  /** The server refused the zone (`invalid_time_zone`). */
  invalid?: boolean;
}) {
  const { t } = useI18n("scheduleSettings");
  const z = "scheduleSettings.timeZone" as const;
  const mine = browserZone();
  const options: ZoneOption[] = useMemo(() => {
    const now = Date.now();
    const zones = knownZones();
    const ordered = [mine, ...zones.filter((zone) => zone !== mine)];
    return ordered.map((zone) => ({ value: zone, label: `${zoneLabel(zone, now)} · ${zone}` }));
  }, [mine]);
  const selected = options.find((o) => o.value === (value || "UTC")) ?? null;
  return (
    <div className="grid gap-1.5" data-testid="time-zone">
      <Combobox
        items={options}
        value={selected}
        onValueChange={(v) => onChange((v as ZoneOption | null)?.value ?? "")}
        isItemEqualToValue={(a: ZoneOption, b: ZoneOption) => a.value === b.value}
        itemToStringLabel={(o: ZoneOption) => o.label}
        label={t(`${z}.label`)}
        description={t(`${z}.description`)}
        error={invalid ? t(`${z}.invalid`) : undefined}
        disabled={disabled}
      >
        <Combobox.TriggerInput
          placeholder={t(`${z}.placeholder`)}
          clearLabel={t(`${z}.clear`)}
          showOptionsLabel={t(`${z}.show`)}
        />
        <Combobox.Content>
          <Combobox.Empty>{t(`${z}.empty`)}</Combobox.Empty>
          <Combobox.List>
            {(o: ZoneOption) => (
              <Combobox.Item key={o.value} value={o}>
                {o.label}
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
      {mine !== (value || "UTC") && (
        <div>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(mine)}>
            {t(`${z}.useBrowser`, { zone: zoneLabel(mine) })}
          </Button>
        </div>
      )}
    </div>
  );
}

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

/** Site › Settings › Schedules: scheduler health, the kill switch and the daily write cap. */
export function ScheduleSettingsSection({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n("scheduleSettings");
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("schedules.settings");
  const s = "scheduleSettings" as const;
  const key = ["schedules", siteId, "settings"] as const;
  const settings = useQuery({
    queryKey: key,
    queryFn: () => schedulesApi.settings.get(siteId),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const scheduler = useQuery({
    queryKey: ["scheduler"],
    queryFn: api.scheduler,
    retry: false,
  });
  const [cap, setCap] = useState("");
  const [confirming, setConfirming] = useState<"pause" | "resume" | undefined>();
  const [reason, setReason] = useState("");
  const savedCap = settings.data?.dailyWriteCap;
  useEffect(() => {
    if (savedCap !== undefined) setCap(String(savedCap));
  }, [savedCap]);

  const put = useMutation({
    mutationFn: (input: {
      rev: number;
      paused?: boolean;
      reason?: string;
      dailyWriteCap?: number;
    }) => schedulesApi.settings.put(siteId, input),
    onSuccess: async (next: ScheduleSettings, input) => {
      qc.setQueryData(key, (prev: ScheduleSettings | undefined) => ({ ...prev, ...next }));
      await qc.invalidateQueries({ queryKey: ["schedules", siteId] });
      setConfirming(undefined);
      toast.success(
        input.paused === true
          ? t(`${s}.killSwitch.pausedToast`)
          : input.paused === false
            ? t(`${s}.killSwitch.resumedToast`)
            : t(`${s}.cap.saved`),
      );
    },
  });

  if (isNotEnabled(settings.error))
    return (
      <SettingsSection id={SCHEDULE_SETTINGS_SECTION} title={t(`${s}.title`)}>
        <Banner
          variant="secondary"
          icon={<WarningCircle weight="fill" />}
          description={t(`${s}.unavailable`)}
        />
      </SettingsSection>
    );
  const data = settings.data;
  const capNumber = Number(cap);
  const capValid = Number.isInteger(capNumber) && capNumber >= 1 && capNumber <= 100_000;
  const capDirty = data !== undefined && capValid && capNumber !== data.dailyWriteCap;
  const health = scheduler.data;
  const tone =
    health?.state === "running" ? "success" : health?.state === "unknown" ? "secondary" : "error";

  return (
    <SettingsSection
      id={SCHEDULE_SETTINGS_SECTION}
      title={t(`${s}.title`)}
      description={t(`${s}.description`)}
      aside={
        data?.paused ? (
          <Badge variant="warning" icon={<PauseCircle />}>
            {t(`${s}.health.state.stopped`)}
          </Badge>
        ) : undefined
      }
      footer={
        <>
          {cap !== String(data?.dailyWriteCap ?? "") && (
            <Button variant="ghost" onClick={() => setCap(String(data?.dailyWriteCap ?? ""))}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!capDirty || !gate.allowed}
            title={gate.reason}
            loading={put.isPending && put.variables?.dailyWriteCap !== undefined}
            onClick={() => data && put.mutate({ rev: data.rev, dailyWriteCap: capNumber })}
          >
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      {!data ? (
        <div className="grid gap-3" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={60} maxWidth={85} />
        </div>
      ) : (
        <>
          {put.error && (
            <Banner
              variant={isConflict(put.error) ? "alert" : "error"}
              icon={<WarningCircle weight="fill" />}
              title={t(`${s}.failed`)}
              description={isConflict(put.error) ? t(`${s}.conflict`) : put.error.message}
              action={
                isConflict(put.error) ? (
                  <Banner.Action
                    variant="secondary"
                    icon={<ArrowClockwise />}
                    onClick={() => {
                      put.reset();
                      void settings.refetch();
                    }}
                  >
                    {t(`${s}.reload`)}
                  </Banner.Action>
                ) : undefined
              }
            />
          )}
          <dl className="-my-3 divide-y divide-kumo-hairline" data-testid="schedule-settings">
            <SettingRow label={t(`${s}.health.label`)} hint={t(`${s}.health.hint`)}>
              {health ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={tone} appearance="dot">
                    {t(`${s}.health.state.${health.state}`)}
                  </Badge>
                  <Text variant="secondary" size="sm" as="span">
                    {health.lastTickAt
                      ? t(`${s}.health.lastTick`, { time: formatMoment(health.lastTickAt, locale) })
                      : t(`${s}.health.never`)}
                  </Text>
                  <Text variant="secondary" size="sm" as="span">
                    {t(`${s}.health.modes.${health.mode ?? "unknown"}`)}
                  </Text>
                </span>
              ) : (
                <SkeletonLine minWidth={20} maxWidth={30} />
              )}
            </SettingRow>
            <SettingRow
              label={t(`${s}.killSwitch.label`)}
              hint={
                data.paused && data.pausedAt
                  ? `${t(`${s}.killSwitch.paused`, {
                      time: formatMoment(data.pausedAt, locale),
                      name: data.pausedBy?.name ?? data.pausedBy?.id ?? "—",
                    })}${data.pausedReason ? ` ${t(`${s}.killSwitch.reasonShown`, { reason: data.pausedReason })}` : ""}`
                  : t(`${s}.killSwitch.hint`)
              }
            >
              <Switch
                aria-label={t(`${s}.killSwitch.label`)}
                checked={data.paused}
                disabled={!gate.allowed || put.isPending}
                title={gate.reason}
                onCheckedChange={(on: boolean) => {
                  setReason("");
                  setConfirming(on ? "pause" : "resume");
                }}
              />
            </SettingRow>
            <SettingRow label={t(`${s}.cap.label`)} hint={t(`${s}.cap.hint`)}>
              <span className="grid w-56 max-w-full gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label={t(`${s}.cap.label`)}
                  value={cap}
                  onValueChange={setCap}
                  disabled={!gate.allowed}
                  title={gate.reason}
                  error={cap && !capValid ? t(`${s}.cap.error`) : undefined}
                  className="w-full"
                />
                <Meter
                  label={t(`${s}.cap.used`, {
                    used: (data.writesToday ?? 0).toLocaleString(locale),
                    cap: data.dailyWriteCap.toLocaleString(locale),
                  })}
                  value={data.writesToday ?? 0}
                  max={Math.max(1, data.dailyWriteCap)}
                />
              </span>
            </SettingRow>
          </dl>
        </>
      )}
      <LayerDialog.Alert
        open={confirming !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined);
        }}
        dismissDisabled={put.isPending}
      >
        <LayerDialog.Content size="sm" closeLabel={t("common.close")}>
          <LayerDialog.Title>
            {confirming === "pause"
              ? t(`${s}.killSwitch.confirmTitle`)
              : t(`${s}.killSwitch.resumeTitle`)}
          </LayerDialog.Title>
          <LayerDialog.Description>
            {confirming === "pause"
              ? t(`${s}.killSwitch.confirmDescription`)
              : t(`${s}.killSwitch.resumeDescription`)}
          </LayerDialog.Description>
          <LayerDialog.Body>
            {confirming === "pause" ? (
              <InputArea
                className="w-full"
                label={t(`${s}.killSwitch.reason`)}
                description={t(`${s}.killSwitch.reasonHint`)}
                placeholder={t(`${s}.killSwitch.reasonPlaceholder`)}
                value={reason}
                maxLength={500}
                onValueChange={setReason}
              />
            ) : (
              <span />
            )}
          </LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t("common.cancel")}>
            <LayerDialog.Actions.Primary
              variant={confirming === "pause" ? "destructive" : "primary"}
              loading={put.isPending}
              onClick={() =>
                data &&
                put.mutate({
                  rev: data.rev,
                  paused: confirming === "pause",
                  ...(confirming === "pause" && reason.trim() ? { reason: reason.trim() } : {}),
                })
              }
            >
              {confirming === "pause" ? t(`${s}.killSwitch.pause`) : t(`${s}.killSwitch.resume`)}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </SettingsSection>
  );
}
