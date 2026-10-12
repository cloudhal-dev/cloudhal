import {
  Badge,
  Banner,
  Button,
  InsetPanel,
  LayerDialog,
  Select,
  SkeletonLine,
  Switch,
  Tabs,
  Text,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  ChartLine,
  Copy,
  Info,
  LockSimple,
  ShieldWarning,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LOCALES, type Locale, translate, useI18n } from "../i18n/index.tsx";
import {
  type AnalyticsForm,
  deploymentState,
  formOf,
  isDirty,
  noticeText,
  PLAN_OPTIONS,
  patchOf,
  planFrom,
  planValue,
  RETENTION_OPTIONS,
  rebase,
  retentionFrom,
  retentionValue,
  VITALS_OPTIONS,
  vitalsCostPercent,
  vitalsFrom,
} from "../lib/analytics-settings.ts";
import {
  type AnalyticsFeature,
  type AnalyticsSettingsPatch,
  ApiRequestError,
  api,
  isNotEnabled,
} from "../lib/api.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { ReadOnly } from "./Gating.tsx";
import { SettingRow, SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate, useMe } from "./useMe.ts";

/** The section's id in the settings table of contents (`#analytics` deep links land here). */
export const ANALYTICS_SETTINGS_SECTION = "analytics";

/** Query key of a site's analytics settings; under `["analytics", siteId]` so a save refreshes every analytics read. */
export const analyticsSettingsKey = (siteId: string) => ["analytics", siteId, "settings"] as const;

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;
const isForbidden = (e: unknown) => e instanceof ApiRequestError && e.status === 403;

/** A switch with its explanation right under it (related text closer together). */
function SwitchField({
  label,
  hint,
  checked,
  onChange,
  disabled,
  title,
  testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  title: string | undefined;
  testId: string;
}) {
  return (
    <div className="grid gap-1.5" data-testid={testId} data-checked={checked ? "on" : "off"}>
      <Switch
        label={label}
        checked={checked}
        disabled={disabled}
        title={title}
        onCheckedChange={onChange}
      />
      <Text variant="secondary" size="sm">
        {hint}
      </Text>
    </div>
  );
}

function SectionSkeleton() {
  const { t } = useI18n();
  return (
    <div className="grid gap-3" role="status">
      <span className="sr-only">{t("common.loading")}</span>
      <SkeletonLine minWidth={30} maxWidth={45} />
      <SkeletonLine minWidth={60} maxWidth={85} />
      <SkeletonLine minWidth={50} maxWidth={70} />
    </div>
  );
}

/** "Not running" / "can't read yet" (RFC-0006 §8, A1): why the numbers may be missing. */
function DeploymentBanner({ feature }: { feature: AnalyticsFeature | undefined }) {
  const { t } = useI18n();
  const state = deploymentState(feature);
  if (state === "ready") return null;
  return (
    <div data-analytics-deployment={state}>
      <Banner
        variant="secondary"
        icon={<Info weight="fill" />}
        title={t(
          state === "off"
            ? "analyticsSettings.deployment.offTitle"
            : "analyticsSettings.deployment.cantReadTitle",
        )}
        description={t(
          state === "off"
            ? "analyticsSettings.deployment.offDescription"
            : "analyticsSettings.deployment.cantReadDescription",
        )}
      />
    </div>
  );
}

/** Where visits go and how they come back (`features.analytics`), as label/value rows. */
function DeploymentFacts({ feature }: { feature: AnalyticsFeature }) {
  const { t } = useI18n();
  const recording = feature.enabled && feature.store !== "none";
  return (
    <dl
      className="-mb-3 divide-y divide-kumo-hairline border-kumo-hairline border-t"
      aria-label={t("analyticsSettings.deployment.title")}
      data-testid="analytics-deployment"
    >
      <SettingRow label={t("analyticsSettings.deployment.store")}>
        <Badge variant={recording ? "success" : "neutral"} appearance="dot">
          {t(`analyticsSettings.deployment.stores.${recording ? feature.store : "none"}`)}
        </Badge>
      </SettingRow>
      {recording && (
        <>
          <SettingRow label={t("analyticsSettings.deployment.reader")}>
            <Badge variant={feature.reader === "none" ? "warning" : "success"} appearance="dot">
              {t(`analyticsSettings.deployment.readers.${feature.reader}`)}
            </Badge>
          </SettingRow>
          <SettingRow
            label={t("analyticsSettings.deployment.rollups")}
            hint={t(`analyticsSettings.deployment.rollupHints.${feature.rollups}`)}
          >
            <Text as="span">
              {t(`analyticsSettings.deployment.rollupModes.${feature.rollups}`)}
            </Text>
          </SettingRow>
          <SettingRow
            label={t("analyticsSettings.deployment.liveDays")}
            hint={t("analyticsSettings.deployment.liveDaysHint")}
          >
            <Text as="span">
              {t("analyticsSettings.deployment.liveDaysValue", { days: feature.liveDays })}
            </Text>
          </SettingRow>
        </>
      )}
    </dl>
  );
}

/** The site owner's privacy-notice paragraph (RFC-0006 §6.5), in the variant the switches give. */
function PrivacyNotice({ uniqueVisitors, unsaved }: { uniqueVisitors: boolean; unsaved: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [language, setLanguage] = useState<Locale>(locale);
  const heading = translate(language, "analyticsSettings.notice.heading");
  const paragraphs = [
    translate(language, "analyticsSettings.notice.base"),
    ...(uniqueVisitors ? [translate(language, "analyticsSettings.notice.unique")] : []),
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(noticeText(heading, paragraphs));
      toast.success(t("analyticsSettings.notice.copied"));
    } catch (e) {
      toast.error(t("errors.title"), e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <div
      className="grid gap-3 border-kumo-hairline border-t pt-5"
      data-testid="privacy-notice"
      data-variant={uniqueVisitors ? "unique" : "base"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-[1_1_16rem] gap-1.5">
          <Text bold as="h3">
            {t("analyticsSettings.notice.title")}
          </Text>
          <Text variant="secondary" size="sm">
            {unsaved
              ? `${t("analyticsSettings.notice.hint")} ${t("analyticsSettings.notice.unsaved")}`
              : t("analyticsSettings.notice.hint")}
          </Text>
        </div>
        <fieldset className="min-w-0 overflow-x-auto">
          <legend className="sr-only">{t("analyticsSettings.notice.languages")}</legend>
          <Tabs
            variant="segmented"
            size="sm"
            value={language}
            onValueChange={(v) => setLanguage(v === "tr" ? "tr" : "en")}
            tabs={(Object.keys(LOCALES) as Locale[]).map((l) => ({ value: l, label: LOCALES[l] }))}
          />
        </fieldset>
      </div>
      <InsetPanel variant="recessed" label={t("analyticsSettings.notice.title")}>
        <div lang={language} className="grid gap-1.5">
          <Text bold>{heading}</Text>
          {paragraphs.map((p) => (
            <Text key={p}>{p}</Text>
          ))}
        </div>
      </InsetPanel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="secondary" size="sm">
          {t("analyticsSettings.notice.legal")}
        </Text>
        <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => void copy()}>
          {t("analyticsSettings.notice.copy")}
        </Button>
      </div>
    </div>
  );
}

/** Turning unique visitors on is a privacy decision: say what it means before the switch flips. */
function UniqueVisitorsConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <LayerDialog.Alert open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("analyticsSettings.unique.confirmTitle")}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("analyticsSettings.unique.confirmDescription")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4">
            <Banner
              variant="alert"
              icon={<ShieldWarning weight="fill" />}
              title={t("analyticsSettings.unique.confirmBannerTitle")}
              description={t("analyticsSettings.unique.confirmBanner")}
            />
            <div className="grid gap-1.5">
              <Text bold as="span">
                {t("analyticsSettings.unique.confirmNotice")}
              </Text>
              <InsetPanel variant="recessed">
                <Text>{t("analyticsSettings.notice.unique")}</Text>
              </InsetPanel>
            </div>
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary variant="primary" onClick={onConfirm}>
            {t("analyticsSettings.unique.confirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}

/**
 * Site settings › Analytics (RFC-0006 §10.3, DESIGN.md §2v): count visits, unique visitors (behind
 * a personal-data confirmation), page-speed sampling, how long daily totals stay, the plan hint for
 * the quota warning, the privacy notice to copy, and what the deployment can do. Reading needs
 * `analytics.read` (Authors and above), changing `analytics.settings` (Administrators); one PUT with
 * `rev`, a 409 offers the latest copy and keeps the other unsaved edits.
 */
export function AnalyticsSettingsSection({ siteId }: { siteId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const read = useGate("analytics.read");
  const gate = useGate("analytics.settings");
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance });
  const settings = useQuery({
    queryKey: analyticsSettingsKey(siteId),
    queryFn: () => api.analytics.settings(siteId),
    // Wait for /api/me: a Contributor is never asked (the server would answer 403 anyway).
    enabled: !me.isPending && read.allowed,
    retry: (count, error) => !isNotEnabled(error) && !isForbidden(error) && count < 1,
  });
  const feature = instance.data?.features.analytics ?? settings.data?.feature;
  const [draft, setDraft] = useState<{ base: AnalyticsForm; form: AnalyticsForm }>();
  const [confirmUnique, setConfirmUnique] = useState(false);

  // The server's copy moved (our save, "Load latest"): its changes win, other edits stay.
  const latest = settings.data?.settings;
  useEffect(() => {
    if (!latest) return;
    const next = formOf(latest);
    setDraft((d) =>
      d ? { base: next, form: rebase(d.base, d.form, next) } : { base: next, form: next },
    );
  }, [latest]);

  const save = useMutation({
    mutationFn: (patch: AnalyticsSettingsPatch) =>
      api.analytics.updateSettings(siteId, latest?.rev ?? 0, patch),
    onSuccess: async (result, patch) => {
      qc.setQueryData<{ settings: typeof result.settings; feature: AnalyticsFeature }>(
        analyticsSettingsKey(siteId),
        (prev) => (prev ? { ...prev, settings: result.settings } : prev),
      );
      await qc.invalidateQueries({
        queryKey: ["analytics", siteId],
        predicate: (q) => q.queryKey[2] !== "settings",
      });
      const reachesSite = "enabled" in patch || "vitalsOneIn" in patch;
      toast.success(
        t("analyticsSettings.saved"),
        result.saltDeleted
          ? t("analyticsSettings.savedSaltDeleted")
          : reachesSite
            ? t(
                result.purged
                  ? "analyticsSettings.savedPurged"
                  : "analyticsSettings.savedNotPurged",
              )
            : undefined,
      );
    },
  });

  const set = <K extends keyof AnalyticsForm>(field: K, value: AnalyticsForm[K]) =>
    setDraft((d) => (d ? { ...d, form: { ...d.form, [field]: value } } : d));
  const dirty = draft ? isDirty(draft.base, draft.form) : false;
  const submit = () => {
    if (!draft || !dirty || !gate.allowed) return;
    save.mutate(patchOf(draft.base, draft.form));
  };
  const discard = () => {
    setDraft((d) => (d ? { ...d, form: d.base } : d));
    save.reset();
  };
  const reload = () => {
    save.reset();
    void settings.refetch();
  };

  const state = deploymentState(feature);
  const status = !draft ? null : state === "off" ? (
    <Badge variant="neutral" appearance="dot">
      {t("analyticsSettings.status.notRunning")}
    </Badge>
  ) : draft.base.enabled ? (
    <Badge variant="success" appearance="dot">
      {t("analyticsSettings.status.on")}
    </Badge>
  ) : (
    <Badge variant="neutral" appearance="dot">
      {t("analyticsSettings.status.off")}
    </Badge>
  );

  const body = (() => {
    if (!read.allowed)
      return (
        <Banner
          variant="secondary"
          icon={<LockSimple weight="fill" />}
          title={t("analyticsSettings.noAccessTitle")}
          description={read.reason}
        />
      );
    if (isNotEnabled(settings.error))
      return (
        <Banner
          variant="secondary"
          icon={<ChartLine weight="fill" />}
          title={t("analyticsSettings.notAvailableTitle")}
          description={t("analyticsSettings.notAvailableDescription")}
        />
      );
    if (settings.error && !draft)
      return (
        <ErrorBanner
          error={settings.error}
          onRetry={() => void settings.refetch()}
          retrying={settings.isFetching}
        />
      );
    if (!draft) return <SectionSkeleton />;
    const { base, form } = draft;
    const vitalsCost = vitalsCostPercent(form.vitalsOneIn);
    const retention = RETENTION_OPTIONS.includes(form.rollupRetentionDays)
      ? RETENTION_OPTIONS
      : [...RETENTION_OPTIONS, form.rollupRetentionDays];
    return (
      <>
        <DeploymentBanner feature={feature} />
        {save.error &&
          (isConflict(save.error) ? (
            <div role="alert">
              <Banner
                variant="alert"
                icon={<Warning weight="fill" />}
                title={t("analyticsSettings.conflictTitle")}
                description={t("analyticsSettings.conflictDescription")}
                action={
                  <Banner.Action
                    variant="secondary"
                    icon={<ArrowClockwise />}
                    onClick={reload}
                    loading={settings.isFetching}
                  >
                    {t("analyticsSettings.loadLatest")}
                  </Banner.Action>
                }
              />
            </div>
          ) : (
            <Banner
              variant="error"
              size="sm"
              icon={<WarningCircle weight="fill" />}
              title={t("analyticsSettings.failed")}
              description={save.error.message}
            />
          ))}
        <ReadOnly reason={gate.reason} className="grid min-w-0 gap-5">
          <SwitchField
            testId="analytics-enabled"
            label={t("analyticsSettings.enabled.label")}
            hint={t("analyticsSettings.enabled.hint")}
            checked={form.enabled}
            onChange={(on) => set("enabled", on)}
            disabled={!gate.allowed}
            title={gate.reason}
          />
          <div className="grid gap-3">
            <SwitchField
              testId="analytics-unique"
              label={t("analyticsSettings.unique.label")}
              hint={
                form.enabled
                  ? t("analyticsSettings.unique.hint")
                  : `${t("analyticsSettings.unique.hint")} ${t("analyticsSettings.unique.needsVisits")}`
              }
              checked={form.uniqueVisitors}
              onChange={(on) => {
                // Turning it on is a personal-data decision: confirm first (RFC-0006 §6.4).
                if (on && !base.uniqueVisitors) setConfirmUnique(true);
                else set("uniqueVisitors", on);
              }}
              disabled={!gate.allowed || !form.enabled}
              title={gate.reason}
            />
            {base.uniqueVisitors && !form.uniqueVisitors && (
              <div data-testid="salt-warning">
                <Banner
                  variant="alert"
                  size="sm"
                  icon={<Warning weight="fill" />}
                  title={t("analyticsSettings.unique.offWarningTitle")}
                  description={t("analyticsSettings.unique.offWarning")}
                />
              </div>
            )}
          </div>
          <div className="@container">
            <div className="grid items-start gap-5 @lg:grid-cols-2">
              <Select
                label={t("analyticsSettings.vitals.label")}
                description={`${t("analyticsSettings.vitals.hint")} ${
                  vitalsCost === 0
                    ? t("analyticsSettings.vitals.costOff")
                    : t("analyticsSettings.vitals.cost", { percent: vitalsCost })
                }`}
                value={String(form.vitalsOneIn)}
                onValueChange={(v) => set("vitalsOneIn", vitalsFrom(String(v)))}
                items={VITALS_OPTIONS.map((n) => ({
                  value: String(n),
                  label: t(`analyticsSettings.vitals.options.${n}`),
                }))}
              />
              <Select
                label={t("analyticsSettings.retention.label")}
                description={t("analyticsSettings.retention.hint")}
                value={retentionValue(form.rollupRetentionDays)}
                onValueChange={(v) => set("rollupRetentionDays", retentionFrom(String(v)))}
                items={retention.map((days) => ({
                  value: retentionValue(days),
                  label:
                    days === null
                      ? t("analyticsSettings.retention.options.forever")
                      : RETENTION_OPTIONS.includes(days)
                        ? t(
                            `analyticsSettings.retention.options.${String(days) as "1825" | "730" | "365"}`,
                          )
                        : t("analyticsSettings.retention.days", { days }),
                }))}
              />
              <Select
                label={t("analyticsSettings.plan.label")}
                description={t("analyticsSettings.plan.hint")}
                value={planValue(form.planHint)}
                onValueChange={(v) => set("planHint", planFrom(String(v)))}
                items={PLAN_OPTIONS.map((p) => ({
                  value: p,
                  label: t(`analyticsSettings.plan.options.${p}`),
                }))}
              />
            </div>
          </div>
        </ReadOnly>
        <PrivacyNotice uniqueVisitors={form.uniqueVisitors} unsaved={dirty} />
        {feature && <DeploymentFacts feature={feature} />}
      </>
    );
  })();

  return (
    <SettingsSection
      id={ANALYTICS_SETTINGS_SECTION}
      title={t("analyticsSettings.title")}
      description={t("analyticsSettings.description")}
      aside={status}
      footer={
        draft ? (
          <>
            {dirty && (
              <Button variant="ghost" onClick={discard} disabled={save.isPending}>
                {t("common.discard")}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={submit}
              loading={save.isPending}
              disabled={!gate.allowed || !dirty}
              title={gate.reason}
            >
              {t("common.saveChanges")}
            </Button>
          </>
        ) : undefined
      }
    >
      {body}
      <UniqueVisitorsConfirm
        open={confirmUnique}
        onOpenChange={setConfirmUnique}
        onConfirm={() => {
          set("uniqueVisitors", true);
          setConfirmUnique(false);
        }}
      />
    </SettingsSection>
  );
}
