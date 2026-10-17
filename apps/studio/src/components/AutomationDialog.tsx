/**
 * The automation editor (RFC-0008 §15.1, §11; DESIGN.md §2x): a `LayerDialog size="lg"` — the name,
 * the job (Cloudhal's built-in checks, or an agent task with its own key, mode cap, "reads visitor
 * text" profile, instructions, run window and budget), when it repeats (`RecurrenceEditor`, with the
 * server's next runs in `NextRuns`) and what it can do, in words. People only: agents can pause
 * their own automation, nothing else (D7). An agent task's key is minted on create and shown once.
 */
import type { Automation } from "@cloudhal/core-contracts";
import {
  Banner,
  ClipboardText,
  DateTimeField,
  type DateTimeValue,
  DEFAULT_RECURRENCE,
  Input,
  InputArea,
  InsetPanel,
  LayerDialog,
  NextRuns,
  Radio,
  RecurrenceEditor,
  type RecurrenceValue,
  recurrenceProblems,
  recurrenceRule,
  Switch,
  Text,
} from "@cloudhal/ui";
import { Info, Key, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AutomationInput,
  type BuiltinJob,
  errorCode,
  errorDetail,
  type KeyMode,
} from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { localDateTime, recurrenceValueOf, wallClockOf } from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { AutoModeConfirm, ModePicker } from "./AgentModes.tsx";
import { problemText, scheduleKeys, useScheduleWords, useSiteZone } from "./Schedules.tsx";
import { useToast } from "./Toast.ts";

export const BUILTIN_JOBS: readonly BuiltinJob[] = [
  "broken-links",
  "stale-content",
  "feed-check",
  "weekly-digest",
  "cleanup",
];
type JobChoice = BuiltinJob | "agent-task";

const DEFAULT_BUDGET = { maxToolCalls: 100, maxWrites: 20, maxApprovalRequests: 5, maxMinutes: 15 };

interface Form {
  name: string;
  job: JobChoice;
  staleAfterDays: string;
  modeCap: KeyMode;
  readsUntrustedText: boolean;
  instructions: string;
  windowMinutes: string;
  budget: Record<keyof typeof DEFAULT_BUDGET, string>;
  recurrence: RecurrenceValue;
  /** "Once": the day and time. */
  once: DateTimeValue;
}

function formOf(automation: Automation | undefined, today: string): Form {
  const base: Form = {
    name: "",
    job: "broken-links",
    staleAfterDays: "365",
    modeCap: "edits",
    readsUntrustedText: false,
    instructions: "",
    windowMinutes: "30",
    budget: {
      maxToolCalls: String(DEFAULT_BUDGET.maxToolCalls),
      maxWrites: String(DEFAULT_BUDGET.maxWrites),
      maxApprovalRequests: String(DEFAULT_BUDGET.maxApprovalRequests),
      maxMinutes: String(DEFAULT_BUDGET.maxMinutes),
    },
    recurrence: DEFAULT_RECURRENCE,
    once: { date: today, time: DEFAULT_RECURRENCE.time },
  };
  if (!automation) return base;
  const r = automation.recurrence;
  const job = automation.job;
  return {
    ...base,
    name: automation.name,
    job: job.kind === "builtin" ? job.builtin : "agent-task",
    staleAfterDays: String(job.kind === "builtin" ? (job.staleAfterDays ?? 365) : 365),
    ...(job.kind === "agent-task"
      ? {
          modeCap: job.modeCap,
          readsUntrustedText: job.readsUntrustedText,
          instructions: job.instructions,
          windowMinutes: String(job.windowMinutes),
          budget: {
            maxToolCalls: String(job.budget.maxToolCalls),
            maxWrites: String(job.budget.maxWrites),
            maxApprovalRequests: String(job.budget.maxApprovalRequests),
            maxMinutes: String(job.budget.maxMinutes),
          },
        }
      : {}),
    recurrence: recurrenceValueOf(r.rule, r.preset, r.start),
    once: { date: r.start.slice(0, 10), time: r.start.slice(11, 16) },
  };
}

const whole = (v: string, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** The recurrence a form stands for: the start (`LocalDateTime`), the rule and the preset. */
export function recurrenceOf(form: Pick<Form, "recurrence" | "once">, today: string) {
  const rule = recurrenceRule(form.recurrence);
  const start =
    form.recurrence.preset === "once"
      ? localDateTime({ date: form.once.date ?? today, time: form.once.time ?? "09:07" })
      : localDateTime({ date: today, time: form.recurrence.time });
  return { start, preset: form.recurrence.preset, ...(rule ? { rule } : {}) };
}

/** The request body for a form (validated before). */
export function automationInputOf(form: Form, today: string, timeZone: string): AutomationInput {
  const recurrence = { ...recurrenceOf(form, today), timeZone };
  if (form.job !== "agent-task")
    return {
      name: form.name.trim(),
      job: {
        kind: "builtin",
        builtin: form.job,
        ...(form.job === "stale-content" ? { staleAfterDays: Number(form.staleAfterDays) } : {}),
      },
      recurrence,
    };
  return {
    name: form.name.trim(),
    job: {
      kind: "agent-task",
      instructions: form.instructions.trim(),
      modeCap: form.modeCap,
      readsUntrustedText: form.readsUntrustedText,
      windowMinutes: Number(form.windowMinutes),
      budget: {
        maxToolCalls: Number(form.budget.maxToolCalls),
        maxWrites: Number(form.budget.maxWrites),
        maxApprovalRequests: Number(form.budget.maxApprovalRequests),
        maxMinutes: Number(form.budget.maxMinutes),
      },
    },
    recurrence,
  };
}

/** Waits until `value` has not changed for `ms` (the rule preview while someone types). */
function useSettled<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

export function AutomationDialog({
  siteId,
  open,
  onOpenChange,
  automation,
  copyOf,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this one; creating otherwise. */
  automation?: Automation | undefined;
  /** "Duplicate": a new automation prefilled from this one. */
  copyOf?: Automation | undefined;
}) {
  const { t, locale, field } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form>(() => formOf(automation ?? copyOf, zone.today));
  const [attempted, setAttempted] = useState(false);
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [secret, setSecret] = useState<string | undefined>();
  // The form starts over each time the dialog opens (for another automation), never while it is
  // open: the site or the words arriving later must not wipe what the person typed.
  const latest = useRef({ automation, copyOf, today: zone.today, t });
  latest.current = { automation, copyOf, today: zone.today, t };
  const session = open ? `${automation?.id ?? "new"}:${copyOf?.id ?? ""}` : undefined;
  useEffect(() => {
    if (!session) return;
    const { automation, copyOf, today, t } = latest.current;
    const next = formOf(automation ?? copyOf, today);
    if (copyOf && !automation)
      next.name = t("schedules.automations.copyName", { name: copyOf.name });
    setForm(next);
    setAttempted(false);
    setAutoConfirmed(automation?.job.kind === "agent-task" && automation.job.modeCap === "auto");
    setSecret(undefined);
  }, [session]);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const d = "schedules.automationDialog" as const;
  const agent = form.job === "agent-task";
  const editing = automation !== undefined;

  // ---- checks ----
  const problems = recurrenceProblems(form.recurrence);
  const problemWords = Object.fromEntries(
    problems.map((p) => [p, t(`${d}.recurrence.problems.${p}`)]),
  );
  const errors = {
    name: !form.name.trim() ? t(`${d}.name.required`) : undefined,
    instructions:
      agent && !form.instructions.trim() ? t(`${d}.agent.errors.instructions`) : undefined,
    window:
      agent && whole(form.windowMinutes, 5, 240) === undefined
        ? t(`${d}.agent.errors.window`)
        : undefined,
    budget:
      agent &&
      (whole(form.budget.maxToolCalls, 0, 10_000) === undefined ||
        whole(form.budget.maxWrites, 0, 10_000) === undefined ||
        whole(form.budget.maxApprovalRequests, 0, 1_000) === undefined ||
        whole(form.budget.maxMinutes, 1, 240) === undefined)
        ? t(`${d}.agent.errors.budget`)
        : undefined,
    stale:
      form.job === "stale-content" && whole(form.staleAfterDays, 1, 3650) === undefined
        ? t(`${d}.agent.errors.budget`)
        : undefined,
  };
  const needsConsent =
    agent &&
    form.modeCap === "auto" &&
    !(automation?.job.kind === "agent-task" && automation.job.modeCap === "auto");
  const valid =
    Object.values(errors).every((e) => e === undefined) &&
    problems.length === 0 &&
    !(needsConsent && !autoConfirmed);

  // ---- the server's next runs and sentence ----
  const rec = useSettled(useMemo(() => recurrenceOf(form, zone.today), [form, zone.today]));
  const preview = useQuery({
    queryKey: [
      ...scheduleKeys.all(siteId),
      "preview-rule",
      rec.start,
      rec.rule ?? "",
      zone.timeZone,
      locale,
    ],
    queryFn: () =>
      schedulesApi.automations.previewRule(siteId, {
        start: rec.start,
        timeZone: zone.timeZone,
        ...(rec.rule ? { rule: rec.rule } : {}),
        locale,
      }),
    enabled: open && problems.length === 0,
    retry: false,
    placeholderData: (prev) => prev,
  });

  const save = useMutation({
    mutationFn: async () => {
      const input = automationInputOf(form, zone.today, zone.timeZone);
      if (!automation) return schedulesApi.automations.create(siteId, input);
      const job =
        input.job.kind === "agent-task"
          ? {
              instructions: input.job.instructions,
              modeCap: input.job.modeCap,
              readsUntrustedText: input.job.readsUntrustedText,
              windowMinutes: input.job.windowMinutes,
              budget: input.job.budget,
            }
          : input.job.builtin === "stale-content"
            ? { staleAfterDays: input.job.staleAfterDays }
            : undefined;
      const updated = await schedulesApi.automations.update(siteId, automation.id, automation.rev, {
        name: input.name,
        recurrence: input.recurrence,
        ...(job ? { job } : {}),
      });
      return { automation: updated, key: undefined };
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
      toast.success(editing ? t(`${d}.saved`) : t(`${d}.created`), result.automation.name);
      if (result.key?.secret) setSecret(result.key.secret);
      else onOpenChange(false);
    },
  });

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    save.mutate();
  };
  const show = (e: string | undefined) => (attempted ? e : undefined);
  const can = !agent
    ? t(`${d}.can.builtin`)
    : form.readsUntrustedText
      ? t(`${d}.can.untrusted`)
      : t(`${d}.can.${form.modeCap}`);
  const occurrences = preview.data?.occurrences ?? [];
  const r = `${d}.recurrence` as const;

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={save.isPending}>
      <LayerDialog.Content size="lg" closeLabel={t(`${d}.close`)}>
        <LayerDialog.Title>
          {secret ? t(`${d}.reveal.title`) : editing ? t(`${d}.titleEdit`) : t(`${d}.titleNew`)}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {secret ? t(`${d}.reveal.description`) : t(`${d}.description`)}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {secret ? (
            <div className="grid gap-4" data-testid="automation-key">
              <Banner
                variant="alert"
                icon={<Key weight="fill" />}
                title={t(`${d}.reveal.warning`)}
              />
              <ClipboardText text={secret} size="lg" />
            </div>
          ) : (
            <div className="grid gap-6" data-testid="automation-dialog">
              <Input
                className="w-full"
                label={t(`${d}.name.label`)}
                placeholder={t(`${d}.name.placeholder`)}
                value={form.name}
                maxLength={120}
                onValueChange={(v) => set("name", v)}
                error={show(errors.name)}
              />
              <Radio.Group
                appearance="card"
                value={form.job}
                onValueChange={(v) => set("job", v as JobChoice)}
                disabled={editing}
              >
                <Radio.Legend>{t(`${d}.job.legend`)}</Radio.Legend>
                {BUILTIN_JOBS.map((job) => (
                  <Radio.Item
                    key={job}
                    value={job}
                    label={t(`schedules.automations.builtins.${job}.name`)}
                    description={t(`schedules.automations.builtins.${job}.description`)}
                  />
                ))}
                <Radio.Item
                  value="agent-task"
                  label={t(`${d}.job.agentTask`)}
                  description={t(`${d}.job.agentTaskHint`)}
                />
              </Radio.Group>
              {form.job === "stale-content" && (
                <Input
                  className="w-full"
                  type="number"
                  inputMode="numeric"
                  label={t(`${d}.staleAfterDays.label`)}
                  description={t(`${d}.staleAfterDays.description`)}
                  value={form.staleAfterDays}
                  onValueChange={(v) => set("staleAfterDays", v)}
                  error={show(errors.stale)}
                />
              )}
              {agent && (
                <div className="grid gap-5" data-testid="agent-task">
                  <InsetPanel layout="row">
                    <span className="flex h-lh items-center text-kumo-subtle">
                      <Key size={16} />
                    </span>
                    <Text variant="secondary" size="sm">
                      {t(`${d}.agent.keyNote`)}
                    </Text>
                  </InsetPanel>
                  <div className="grid gap-1.5">
                    <Text bold as="span">
                      {t(`${d}.agent.mode`)}
                    </Text>
                    <Text variant="secondary" size="sm">
                      {t(`${d}.agent.modeCap`)}
                    </Text>
                  </div>
                  <ModePicker
                    value={form.modeCap}
                    onValueChange={(m) => set("modeCap", m)}
                    legend={t(`${d}.agent.mode`)}
                  />
                  {form.modeCap === "auto" && (
                    <AutoModeConfirm
                      checked={autoConfirmed}
                      onCheckedChange={setAutoConfirmed}
                      showError={attempted}
                    />
                  )}
                  <Switch
                    label={t(`${d}.agent.untrusted.label`)}
                    checked={form.readsUntrustedText}
                    onCheckedChange={(on: boolean) => set("readsUntrustedText", on)}
                    disabled={
                      editing &&
                      automation?.job.kind === "agent-task" &&
                      !automation.job.readsUntrustedText
                    }
                  />
                  <Text variant="secondary" size="sm">
                    {t(`${d}.agent.untrusted.description`)}
                  </Text>
                  <InputArea
                    className="w-full"
                    label={t(`${d}.agent.instructions.label`)}
                    description={t(`${d}.agent.instructions.description`)}
                    placeholder={t(`${d}.agent.instructions.placeholder`)}
                    value={form.instructions}
                    onValueChange={(v) => set("instructions", v)}
                    autoResize
                    minRows={3}
                    maxRows={10}
                    error={show(errors.instructions)}
                  />
                  <Input
                    className="w-full"
                    type="number"
                    inputMode="numeric"
                    label={t(`${d}.agent.window.label`)}
                    description={t(`${d}.agent.window.description`)}
                    value={form.windowMinutes}
                    onValueChange={(v) => set("windowMinutes", v)}
                    error={show(errors.window)}
                  />
                  <fieldset className="m-0 grid gap-3 border-0 p-0">
                    <legend className="grid gap-1.5 pb-3">
                      <Text bold as="span">
                        {t(`${d}.agent.budget.title`)}
                      </Text>
                      <Text variant="secondary" size="sm" as="span">
                        {t(`${d}.agent.budget.description`)}
                      </Text>
                    </legend>
                    <div className="@container">
                      <div className="grid items-start gap-4 @md:grid-cols-2">
                        {(
                          [
                            ["maxToolCalls", "calls"],
                            ["maxWrites", "writes"],
                            ["maxApprovalRequests", "requests"],
                            ["maxMinutes", "minutes"],
                          ] as const
                        ).map(([key, label]) => (
                          <Input
                            key={key}
                            className="w-full"
                            type="number"
                            inputMode="numeric"
                            label={t(`${d}.agent.budget.${label}`)}
                            value={form.budget[key]}
                            onValueChange={(v) => set("budget", { ...form.budget, [key]: v })}
                          />
                        ))}
                      </div>
                    </div>
                    {show(errors.budget) && (
                      <Text variant="error" size="sm">
                        {errors.budget}
                      </Text>
                    )}
                  </fieldset>
                </div>
              )}
              <RecurrenceEditor
                value={form.recurrence}
                onChange={(v) => set("recurrence", v)}
                locale={locale}
                weekStartsOn={zone.weekStartsOn}
                hourCycle={zone.hourCycle}
                presets={["hourly", "daily", "weekdays", "weekly", "monthly", "once", "custom"]}
                sentence={preview.data?.text}
                problems={attempted || problems.length > 0 ? problemWords : {}}
                labels={{
                  legend: t(`${r}.legend`),
                  presets: {
                    hourly: t(`${r}.presets.hourly`),
                    daily: t(`${r}.presets.daily`),
                    weekdays: t(`${r}.presets.weekdays`),
                    weekly: t(`${r}.presets.weekly`),
                    monthly: t(`${r}.presets.monthly`),
                    once: t(`${r}.presets.once`),
                    custom: t(`${r}.presets.custom`),
                  },
                  time: t(`${r}.time`),
                  minute: t(`${r}.minute`),
                  weekday: t(`${r}.weekday`),
                  monthDay: t(`${r}.monthDay`),
                  monthDayOption: (day) => t(`${r}.monthDayOption`, { day }),
                  lastDay: t(`${r}.lastDay`),
                  interval: t(`${r}.interval`),
                  frequency: t(`${r}.frequency`),
                  frequencies: {
                    daily: (count) => t(`${r}.days`, { count }),
                    weekly: (count) => t(`${r}.weeks`, { count }),
                    monthly: (count) => t(`${r}.months`, { count }),
                  },
                  weekdays: t(`${r}.weekdays`),
                  monthlyOn: t(`${r}.monthlyOn`),
                  monthlyDay: t(`${r}.monthlyDay`),
                  monthlyWeekday: t(`${r}.monthlyWeekday`),
                  ordinal: t(`${r}.ordinal`),
                  ordinals: {
                    "1": t(`${r}.ordinals.1`),
                    "2": t(`${r}.ordinals.2`),
                    "3": t(`${r}.ordinals.3`),
                    "4": t(`${r}.ordinals.4`),
                    "-1": t(`${r}.ordinals.-1`),
                  },
                  end: t(`${r}.end`),
                  ends: {
                    never: t(`${r}.ends.never`),
                    on: t(`${r}.ends.on`),
                    after: t(`${r}.ends.after`),
                  },
                  endDate: t(`${r}.endDate`),
                  endCount: t(`${r}.endCount`),
                  avoidOnTheHour: t(`${r}.avoidOnTheHour`),
                  invalidTime: t("schedules.field.invalidTime"),
                  summary: t(`${r}.summary`),
                }}
              />
              {form.recurrence.preset === "once" && (
                <DateTimeField
                  label={t(`${r}.onceAt`)}
                  value={form.once}
                  onChange={(v) => set("once", v)}
                  locale={locale}
                  timeZone={zone.timeZone}
                  zoneLabel={zone.zoneLabel}
                  hourCycle={zone.hourCycle}
                  labels={field}
                  min={zone.today}
                  today={zone.today}
                  error={
                    form.once.date && form.once.time
                      ? undefined
                      : attempted
                        ? problemText(
                            t,
                            locale,
                            { code: "incomplete" },
                            { value: form.once, timeZone: zone.timeZone },
                          )
                        : undefined
                  }
                  className="w-full"
                />
              )}
              {preview.error ? (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  description={t(`${d}.nextRuns.invalid`, {
                    message:
                      preview.error instanceof Error
                        ? apiErrorText(t, preview.error)
                        : String(preview.error),
                  })}
                />
              ) : (
                <NextRuns
                  runs={occurrences.map((o) => ({
                    at: o.at,
                    ...(preview.data?.dstAdjusted.includes(o.at) ? { clockChange: true } : {}),
                    ...(o.adjusted === "dst-gap"
                      ? {
                          note: t(`${d}.nextRuns.moved`, {
                            local: o.local.slice(11, 16),
                            time: wallClockOf(o.at, zone.timeZone).time,
                          }),
                        }
                      : {}),
                  }))}
                  locale={locale}
                  timeZone={zone.timeZone}
                  hourCycle={zone.hourCycle}
                  loading={preview.isPending && problems.length === 0}
                  labels={{
                    title: t(`${d}.nextRuns.title`),
                    clockChange: t(`${d}.nextRuns.clockChange`),
                    empty: t(`${d}.nextRuns.empty`),
                    loading: t(`${d}.nextRuns.loading`),
                  }}
                />
              )}
              <InsetPanel label={t(`${d}.can.title`)}>
                <span className="flex items-center gap-2">
                  <ShieldCheck size={16} className="shrink-0 text-kumo-subtle" />
                  <Text bold as="span" size="sm">
                    {t(`${d}.can.title`)}
                  </Text>
                </span>
                <Text variant="secondary" size="sm" data-testid="automation-can">
                  {can}
                </Text>
              </InsetPanel>
              {save.error && (
                <Banner
                  variant="error"
                  icon={<Info weight="fill" />}
                  title={t("schedules.actions.failed")}
                  description={
                    errorCode(save.error) === "mode_cap_above_key"
                      ? t(`${d}.modeCapAboveKey`, {
                          mode: t(
                            `agents.modes.names.${(errorDetail(save.error, "keyMode") ?? "edits") as KeyMode}`,
                          ),
                        })
                      : save.error instanceof Error
                        ? apiErrorText(t, save.error)
                        : String(save.error)
                  }
                />
              )}
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={secret ? undefined : t(`${d}.cancel`)}>
          <LayerDialog.Actions.Primary
            loading={save.isPending}
            onClick={secret ? () => onOpenChange(false) : submit}
            data-testid="automation-save"
          >
            {secret ? t(`${d}.reveal.done`) : editing ? t(`${d}.save`) : t(`${d}.create`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
