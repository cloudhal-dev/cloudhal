import { dateTimeFormat, formatNumber } from "@cloudhal/messages/format";
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Input,
  InsetPanel,
  LayerDialog,
  Meter,
  Radio,
  Select,
  SensitiveInput,
  SkeletonLine,
  Switch,
  Tabs,
  TagInput,
  Text,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  ChatsCircle,
  Copy,
  Info,
  LockSimple,
  ShieldCheck,
  ShieldWarning,
  Trash,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import {
  LOCALE_LIST,
  LOCALES,
  type Locale,
  translate,
  useI18n,
  useMessages,
} from "../i18n/index.tsx";
import { api, type CommentSettingsPatch, isNotEnabled } from "../lib/api.ts";
import { apiErrorText, isConflict } from "../lib/api-errors.ts";
import {
  CLOSE_OPTIONS,
  type CommentsForm,
  cleanWords,
  collectionKeys,
  daysFrom,
  daysValue,
  formOf,
  formProblems,
  isDirty,
  patchOf,
  RETENTION_FIELDS,
  RETENTION_OPTIONS,
  ROWS_PER_COMMENT,
  rebase,
} from "../lib/comment-settings.ts";
import { commentSettingsKey, commentsKey } from "../lib/comments.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { ReadOnly } from "./Gating.tsx";
import { SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate, useMe } from "./useMe.ts";

/** The section's id in the settings table of contents (`#comments` deep links land here). */
export const COMMENT_SETTINGS_SECTION = "comments";

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
  hint: ReactNode;
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

/** The site owner's disclosure snippet (RFC-0007 §9.6), in English and Turkish, following the switches. */
function DisclosureNotice({ form, unsaved }: { form: CommentsForm; unsaved: boolean }) {
  const { t, locale } = useI18n("commentsSettings");
  useMessages(["commentsSettings"], LOCALE_LIST);
  const toast = useToast();
  const [language, setLanguage] = useState<Locale>(locale);
  const heading = translate(language, "commentsSettings.notice.heading");
  const paragraphs = [
    translate(language, "commentsSettings.notice.base"),
    ...(form.protection === "turnstile"
      ? [translate(language, "commentsSettings.notice.turnstile")]
      : []),
    ...(form.aiLabels === "workers-ai" ? [translate(language, "commentsSettings.notice.ai")] : []),
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${heading}\n\n${paragraphs.join(" ")}`);
      toast.success(t("commentsSettings.notice.copied"));
    } catch (e) {
      toast.error(t("errors.title"), e ? apiErrorText(t, e) : undefined);
    }
  };
  return (
    <div className="grid gap-3 border-kumo-hairline border-t pt-5" data-testid="comments-notice">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-[1_1_16rem] gap-1.5">
          <Text bold as="h3">
            {t("commentsSettings.notice.title")}
          </Text>
          <Text variant="secondary" size="sm">
            {unsaved ? t("commentsSettings.notice.hintUnsaved") : t("commentsSettings.notice.hint")}
          </Text>
        </div>
        <fieldset className="min-w-0 overflow-x-auto">
          <legend className="sr-only">{t("commentsSettings.notice.languages")}</legend>
          <Tabs
            variant="segmented"
            size="sm"
            value={language}
            onValueChange={(v) => setLanguage(v as Locale)}
            tabs={(Object.keys(LOCALES) as Locale[]).map((l) => ({ value: l, label: LOCALES[l] }))}
          />
        </fieldset>
      </div>
      <InsetPanel variant="recessed" label={t("commentsSettings.notice.title")}>
        <div lang={language} className="grid gap-1.5">
          <Text bold>{heading}</Text>
          {paragraphs.map((p) => (
            <Text key={p}>{p}</Text>
          ))}
        </div>
      </InsetPanel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="secondary" size="sm">
          {t("commentsSettings.notice.legal")}
        </Text>
        <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => void copy()}>
          {t("commentsSettings.notice.copy")}
        </Button>
      </div>
    </div>
  );
}

/** Before AI labels turn on: what is sent, to whom, and the free daily allowance. */
function AiLabelsConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n("commentsSettings");
  return (
    <LayerDialog.Alert open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("commentsSettings.ai.confirmTitle")}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("commentsSettings.ai.confirmDescription")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <Banner
            variant="alert"
            icon={<ShieldWarning weight="fill" />}
            title={t("commentsSettings.ai.label")}
            description={t("commentsSettings.ai.confirmBanner")}
          />
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary variant="primary" onClick={onConfirm}>
            {t("commentsSettings.ai.confirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}

/**
 * The Turnstile secret (RFC-0007 §7.6, §12): write-only. Once saved, Studio shows "Saved" with the
 * date, a ghost "Replace" and "Remove"; it never reads the value back.
 */
function TurnstileSecret({
  siteId,
  info,
  canStore,
  disabled,
  title,
}: {
  siteId: string;
  info: { updatedAt: string } | null;
  canStore: boolean;
  disabled: boolean;
  title: string | undefined;
}) {
  const { t, locale } = useI18n("commentsSettings");
  const toast = useToast();
  const qc = useQueryClient();
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: () => api.comments.setSecret(siteId, "turnstile-secret", value.trim()),
    onSuccess: async () => {
      setValue("");
      setReplacing(false);
      toast.success(t("commentsSettings.protection.secretSavedToast"));
      await qc.invalidateQueries({ queryKey: commentSettingsKey(siteId) });
    },
    onError: (e) => toast.error(t("commentsSettings.protection.secretFailed"), e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.comments.deleteSecret(siteId, "turnstile-secret"),
    onSuccess: async () => {
      toast.success(t("commentsSettings.protection.secretRemovedToast"));
      await qc.invalidateQueries({ queryKey: commentSettingsKey(siteId) });
    },
    onError: (e) => toast.error(t("commentsSettings.protection.secretFailed"), e.message),
  });
  if (!canStore)
    return (
      <Banner
        variant="secondary"
        size="sm"
        icon={<Info weight="fill" />}
        title={t("commentsSettings.protection.secret")}
        description={t("commentsSettings.protection.keysMissing")}
      />
    );
  if (info && !replacing)
    return (
      <div className="grid gap-1.5" data-testid="turnstile-secret" data-state="saved">
        <Text bold as="span">
          {t("commentsSettings.protection.secret")}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" appearance="dot">
            {t("commentsSettings.protection.secretSavedOn", {
              date: dateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(info.updatedAt),
              ),
            })}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            title={title}
            onClick={() => setReplacing(true)}
          >
            {t("commentsSettings.protection.secretReplace")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash />}
            loading={remove.isPending}
            disabled={disabled}
            title={title}
            onClick={() => remove.mutate()}
          >
            {t("commentsSettings.protection.secretRemove")}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="grid gap-2" data-testid="turnstile-secret" data-state="empty">
      <SensitiveInput
        label={t("commentsSettings.protection.secret")}
        description={
          info
            ? t("commentsSettings.protection.secretHint")
            : t("commentsSettings.protection.needsSecret")
        }
        value={value}
        onValueChange={setValue}
        autoComplete="off"
        className="w-full"
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={save.isPending}
          disabled={disabled || value.trim() === ""}
          title={title}
          onClick={() => save.mutate()}
          data-testid="turnstile-secret-save"
        >
          {t("commentsSettings.protection.secretSave")}
        </Button>
        {info && (
          <Button variant="ghost" size="sm" onClick={() => setReplacing(false)}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Site settings › Comments (RFC-0007 §4.5, §14; DESIGN.md §2w): accept comments and where, keep
 * them visible while off, when threads close, bot protection (proof of work or Turnstile with its
 * write-only secret and the CSP it needs), JavaScript-less posting, link and word rules, the daily
 * cap with today's use, AI labels (opt-in, confirmed), retention and the disclosure snippet. Reading
 * needs `comments.read`, changing `comments.settings` (Administrators); one PUT with `rev`, a 409
 * offers the latest copy and keeps the person's other edits.
 */
export function CommentSettingsSection({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n("commentsSettings");
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const read = useGate("comments.read");
  const gate = useGate("comments.settings");
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const feature = instance.data?.features.comments;
  const settings = useQuery({
    queryKey: commentSettingsKey(siteId),
    queryFn: () => api.comments.settings(siteId),
    enabled: !me.isPending && read.allowed && feature?.available !== false,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const today = useQuery({
    queryKey: [...commentsKey(siteId), "summary", "today"],
    queryFn: () => api.comments.summary(siteId, "today"),
    enabled: settings.isSuccess,
    retry: false,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "collections"],
    queryFn: () => api.entries.list(siteId),
    enabled: settings.isSuccess,
  });
  const [draft, setDraft] = useState<{ base: CommentsForm; form: CommentsForm }>();
  const [confirmAi, setConfirmAi] = useState(false);
  const [tried, setTried] = useState(false);

  const latest = settings.data?.settings;
  useEffect(() => {
    if (!latest) return;
    const next = formOf(latest);
    setDraft((d) =>
      d ? { base: next, form: rebase(d.base, d.form, next) } : { base: next, form: next },
    );
  }, [latest]);

  const save = useMutation({
    mutationFn: (patch: CommentSettingsPatch) =>
      api.comments.updateSettings(siteId, latest?.rev ?? 0, patch),
    onSuccess: async (result) => {
      setTried(false);
      qc.setQueryData<Awaited<ReturnType<typeof api.comments.settings>>>(
        commentSettingsKey(siteId),
        (prev) => (prev ? { ...prev, settings: result.settings } : prev),
      );
      toast.success(
        t("commentsSettings.saved"),
        result.purge !== "none" ? t("commentsSettings.savedPurged") : undefined,
      );
      await qc.invalidateQueries({
        queryKey: commentsKey(siteId),
        predicate: (q) => q.queryKey[2] !== "settings",
      });
    },
  });

  const set = <K extends keyof CommentsForm>(field: K, value: CommentsForm[K]) =>
    setDraft((d) => (d ? { ...d, form: { ...d.form, [field]: value } } : d));
  const dirty = draft ? isDirty(draft.base, draft.form) : false;
  const problems = draft ? formProblems(draft.form) : {};
  const submit = () => {
    setTried(true);
    if (!draft || !dirty || !gate.allowed || Object.keys(problems).length > 0) return;
    save.mutate(patchOf(draft.base, draft.form));
  };
  const discard = () => {
    setTried(false);
    setDraft((d) => (d ? { ...d, form: d.base } : d));
    save.reset();
  };
  const reload = () => {
    save.reset();
    void settings.refetch();
  };

  const unavailable = feature?.available === false || isNotEnabled(settings.error);
  const status = unavailable ? (
    <Badge variant="neutral" appearance="dot">
      {t("commentsSettings.status.unavailable")}
    </Badge>
  ) : draft ? (
    <Badge variant={draft.base.enabled ? "success" : "neutral"} appearance="dot">
      {t(draft.base.enabled ? "commentsSettings.status.on" : "commentsSettings.status.off")}
    </Badge>
  ) : null;

  const daysLabel = (days: number | null) =>
    days === null
      ? t("commentsSettings.closeAfter.never")
      : days === 365
        ? t("commentsSettings.closeAfter.year")
        : t("commentsSettings.closeAfter.days", { days });
  const closeItems = (current: number | null, withSite: boolean) => {
    const options = CLOSE_OPTIONS.includes(current) ? CLOSE_OPTIONS : [...CLOSE_OPTIONS, current];
    return [
      ...(withSite ? [{ value: "site", label: t("commentsSettings.collections.sameAsSite") }] : []),
      ...options.map((d) => ({ value: daysValue(d), label: daysLabel(d) })),
    ];
  };
  const retentionLabel = (days: number | null) =>
    days === null
      ? t("commentsSettings.retention.keep")
      : days === 183
        ? t("commentsSettings.retention.sixMonths")
        : days === 365
          ? t("commentsSettings.retention.year")
          : t("commentsSettings.retention.days", { days });

  const body = (() => {
    if (!read.allowed)
      return (
        <Banner
          variant="secondary"
          icon={<LockSimple weight="fill" />}
          title={t("commentsSettings.noAccessTitle")}
          description={read.reason}
        />
      );
    if (unavailable)
      return (
        <Banner
          variant="secondary"
          icon={<ChatsCircle weight="fill" />}
          title={t("commentsSettings.unavailableTitle")}
          description={t("commentsSettings.unavailableDescription")}
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
    if (!draft || !settings.data)
      return (
        <div className="grid gap-3" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={60} maxWidth={85} />
          <SkeletonLine minWidth={50} maxWidth={70} />
        </div>
      );
    const { form } = draft;
    const off = !gate.allowed;
    const collections = collectionKeys(form, [
      ...new Set((entries.data ?? []).map((e) => e.collection)),
    ]);
    const used = today.data?.dailyCap.used;
    const show = (p: keyof typeof problems) => tried && problems[p] === true;
    return (
      <>
        {save.error &&
          (isConflict(save.error) ? (
            <div role="alert">
              <Banner
                variant="alert"
                icon={<Warning weight="fill" />}
                title={t("commentsSettings.conflictTitle")}
                description={t("commentsSettings.conflictDescription")}
                action={
                  <Banner.Action
                    variant="secondary"
                    icon={<ArrowClockwise />}
                    onClick={reload}
                    loading={settings.isFetching}
                  >
                    {t("commentsSettings.loadLatest")}
                  </Banner.Action>
                }
              />
            </div>
          ) : (
            <Banner
              variant="error"
              size="sm"
              icon={<WarningCircle weight="fill" />}
              title={t("commentsSettings.failed")}
              description={apiErrorText(t, save.error)}
            />
          ))}
        <ReadOnly reason={gate.reason} className="grid min-w-0 gap-5">
          <SwitchField
            testId="comments-enabled"
            label={t("commentsSettings.enabled.label")}
            hint={t("commentsSettings.enabled.hint")}
            checked={form.enabled}
            onChange={(on) => set("enabled", on)}
            disabled={off}
            title={gate.reason}
          />
          <div className="grid gap-3" data-testid="comments-collections">
            <div className="grid gap-1.5">
              <Text bold as="span">
                {t("commentsSettings.collections.label")}
              </Text>
              <Text variant="secondary" size="sm">
                {t("commentsSettings.collections.hint")}
              </Text>
            </div>
            {collections.map((key) => {
              const c = form.collections[key];
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
                  data-collection={key}
                >
                  <Checkbox
                    label={<span className="font-mono text-[0.9em]">/{key}</span>}
                    checked={c?.enabled === true}
                    disabled={off}
                    onCheckedChange={(v: boolean) =>
                      set("collections", {
                        ...form.collections,
                        [key]: { ...(c ?? {}), enabled: v },
                      })
                    }
                  />
                  {c?.enabled && (
                    <Select
                      aria-label={t("commentsSettings.collections.closeAfter", {
                        collection: `/${key}`,
                      })}
                      value={daysValue(c.closeAfterDays)}
                      onValueChange={(v) => {
                        const days = daysFrom(String(v));
                        const { closeAfterDays: _old, ...rest } = c;
                        set("collections", {
                          ...form.collections,
                          [key]: days === undefined ? rest : { ...rest, closeAfterDays: days },
                        });
                      }}
                      items={closeItems(c.closeAfterDays ?? null, true)}
                      disabled={off}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <SwitchField
            testId="comments-show-when-off"
            label={t("commentsSettings.showWhenOff.label")}
            hint={t("commentsSettings.showWhenOff.hint")}
            checked={form.showWhenOff}
            onChange={(on) => set("showWhenOff", on)}
            disabled={off}
            title={gate.reason}
          />
          <Select
            label={t("commentsSettings.closeAfter.label")}
            description={t("commentsSettings.closeAfter.hint")}
            value={daysValue(form.closeAfterDays)}
            onValueChange={(v) => set("closeAfterDays", daysFrom(String(v)) ?? null)}
            items={closeItems(form.closeAfterDays, false)}
            disabled={off}
            data-testid="comments-close-after"
          />
          <div className="grid gap-3">
            <Radio.Group
              appearance="card"
              legend={t("commentsSettings.protection.legend")}
              value={form.protection}
              onValueChange={(v) => set("protection", v === "turnstile" ? "turnstile" : "pow")}
              disabled={off}
            >
              <Radio.Item
                value="pow"
                label={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {t("commentsSettings.protection.pow")}
                    <Badge variant="success" icon={<ShieldCheck size={16} />}>
                      {t("commentsSettings.protection.powBadge")}
                    </Badge>
                  </span>
                }
                description={t("commentsSettings.protection.powHint")}
              />
              <Radio.Item
                value="turnstile"
                label={t("commentsSettings.protection.turnstile")}
                description={t("commentsSettings.protection.turnstileHint")}
              />
            </Radio.Group>
            {form.protection === "turnstile" && (
              <div className="grid gap-4" data-testid="turnstile-fields">
                <Input
                  label={t("commentsSettings.protection.siteKey")}
                  description={t("commentsSettings.protection.siteKeyHint")}
                  value={form.turnstileSiteKey}
                  onValueChange={(v: string) => set("turnstileSiteKey", v)}
                  error={
                    show("turnstileSiteKey")
                      ? t("commentsSettings.protection.siteKeyInvalid")
                      : undefined
                  }
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full font-mono"
                  disabled={off}
                />
                <TurnstileSecret
                  siteId={siteId}
                  info={settings.data.secrets["turnstile-secret"]}
                  canStore={settings.data.canStoreSecrets}
                  disabled={off}
                  title={gate.reason}
                />
                <Text variant="secondary" size="sm">
                  {t("commentsSettings.protection.csp")}
                </Text>
              </div>
            )}
          </div>
          <SwitchField
            testId="comments-no-script"
            label={t("commentsSettings.noScript.label")}
            hint={t("commentsSettings.noScript.hint")}
            checked={form.allowWithoutScript}
            onChange={(on) => set("allowWithoutScript", on)}
            disabled={off}
            title={gate.reason}
          />
          <div className="@container">
            <div className="grid items-start gap-5 @lg:grid-cols-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={10}
                label={t("commentsSettings.linkLimit.label")}
                description={t("commentsSettings.linkLimit.hint")}
                value={String(form.linkLimit)}
                onValueChange={(v: string) => set("linkLimit", v === "" ? Number.NaN : Number(v))}
                error={show("linkLimit") ? t("commentsSettings.linkLimit.invalid") : undefined}
                className="w-full"
                disabled={off}
                data-testid="comments-link-limit"
              />
              <div className="grid gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100000}
                  label={t("commentsSettings.dailyCap.label")}
                  description={t("commentsSettings.dailyCap.hint", {
                    rows: ROWS_PER_COMMENT,
                    cap: Number.isFinite(form.dailyCap) ? formatNumber(locale, form.dailyCap) : "—",
                    writes: Number.isFinite(form.dailyCap)
                      ? formatNumber(locale, form.dailyCap * ROWS_PER_COMMENT)
                      : "—",
                  })}
                  value={String(form.dailyCap)}
                  onValueChange={(v: string) => set("dailyCap", v === "" ? Number.NaN : Number(v))}
                  error={show("dailyCap") ? t("commentsSettings.dailyCap.invalid") : undefined}
                  className="w-full"
                  disabled={off}
                  data-testid="comments-daily-cap"
                />
                {used !== undefined && (
                  <Meter
                    label={t("commentsSettings.dailyCap.today")}
                    value={used}
                    max={Math.max(1, draft.base.dailyCap)}
                    customValue={t("commentsSettings.dailyCap.todayValue", {
                      used: formatNumber(locale, used),
                      cap: formatNumber(locale, draft.base.dailyCap),
                    })}
                  />
                )}
              </div>
              <TagInput
                label={t("commentsSettings.words.watch")}
                description={t("commentsSettings.words.watchHint")}
                value={form.watchWords}
                onValueChange={(words: string[]) => set("watchWords", cleanWords(words))}
                error={show("watchWords") ? t("commentsSettings.words.invalid") : undefined}
                className="w-full"
                disabled={off}
              />
              <TagInput
                label={t("commentsSettings.words.blocked")}
                description={t("commentsSettings.words.blockedHint")}
                value={form.blockedWords}
                onValueChange={(words: string[]) => set("blockedWords", cleanWords(words))}
                error={show("blockedWords") ? t("commentsSettings.words.invalid") : undefined}
                className="w-full"
                disabled={off}
              />
            </div>
          </div>
          <SwitchField
            testId="comments-ai"
            label={t("commentsSettings.ai.label")}
            hint={
              feature?.aiLabels
                ? t("commentsSettings.ai.hint")
                : t("commentsSettings.ai.hintUnavailable")
            }
            checked={form.aiLabels === "workers-ai"}
            onChange={(on) => {
              if (on && draft.base.aiLabels !== "workers-ai") setConfirmAi(true);
              else set("aiLabels", on ? "workers-ai" : "off");
            }}
            disabled={off || (!feature?.aiLabels && form.aiLabels !== "workers-ai")}
            title={gate.reason}
          />
          <div
            className="grid gap-3 border-kumo-hairline border-t pt-5"
            data-testid="comments-retention"
          >
            <div className="grid gap-1.5">
              <Text bold as="h3">
                {t("commentsSettings.retention.title")}
              </Text>
              <Text variant="secondary" size="sm">
                {t("commentsSettings.retention.hint")}
              </Text>
            </div>
            <div className="@container">
              <div className="grid items-start gap-5 @lg:grid-cols-2">
                {RETENTION_FIELDS.map((field) => {
                  const current = form.retention[field];
                  const options = RETENTION_OPTIONS[field].includes(current)
                    ? RETENTION_OPTIONS[field]
                    : [...RETENTION_OPTIONS[field], current];
                  return (
                    <Select
                      key={field}
                      label={t(`commentsSettings.retention.${field}`)}
                      value={daysValue(current)}
                      onValueChange={(v) => {
                        const days = daysFrom(String(v));
                        set("retention", {
                          ...form.retention,
                          [field]: days === undefined ? current : days,
                        });
                      }}
                      items={options.map((d) => ({
                        value: daysValue(d),
                        label: retentionLabel(d),
                      }))}
                      className="w-full"
                      disabled={off}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </ReadOnly>
        <DisclosureNotice form={form} unsaved={dirty} />
      </>
    );
  })();

  return (
    <SettingsSection
      id={COMMENT_SETTINGS_SECTION}
      title={t("commentsSettings.title")}
      description={t("commentsSettings.description")}
      aside={status}
      footer={
        draft && !unavailable ? (
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
              data-testid="comments-settings-save"
            >
              {t("common.saveChanges")}
            </Button>
          </>
        ) : undefined
      }
    >
      {body}
      <AiLabelsConfirm
        open={confirmAi}
        onOpenChange={setConfirmAi}
        onConfirm={() => {
          set("aiLabels", "workers-ai");
          setConfirmAi(false);
        }}
      />
    </SettingsSection>
  );
}
