/**
 * Shared parts of the Schedules screens (RFC-0008 §15, DESIGN.md §2x): the words every schedule
 * block takes, the site's zone, the page header shared by the Calendar, Automations and History
 * tabs (title, tabs, "New schedule ▾", the attention / paused / stalled banners), the release
 * mutations with their toasts, and "Move to…" (`RescheduleDialog` + Undo). Loads with the
 * schedule screens only (`bundle-budget.ts` `LAZY_ONLY`).
 */
import type { Release } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  type DateTimeFieldLabels,
  type DateTimeValue,
  DropdownMenu,
  firstDayOfWeek,
  hourCycleOf,
  LinkButton,
  RescheduleDialog,
  type ScheduleWords,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowClockwise,
  ArrowRight,
  CalendarDots,
  CalendarPlus,
  CaretDown,
  Package,
  PauseCircle,
  Robot,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { type TFunction, useI18n } from "../i18n/index.tsx";
import {
  ApiRequestError,
  api,
  errorCode,
  isNotEnabled,
  type KeyMode,
  type ReleaseView,
} from "../lib/api.ts";
import {
  formatMinutes,
  formatWhen,
  localDateTime,
  moveEffect,
  todayIn,
  type WhenProblem,
  wallClockOf,
  whenProblem,
  zonedToInstant,
  zoneLabel,
} from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { SiteCrumbs } from "./Crumbs.tsx";
import { isStalled, SchedulerStalledBanner } from "./SchedulerStalled.tsx";
import { useToast } from "./Toast.ts";
import { useCan, useMe } from "./useMe.ts";

export type ST = TFunction<"schedules">;

/** Query keys: everything under `["schedules", siteId]`, invalidated together after a change. */
export const scheduleKeys = {
  all: (siteId: string) => ["schedules", siteId] as const,
  calendar: (siteId: string, from: string, to: string) =>
    ["schedules", siteId, "calendar", from, to] as const,
  releases: (siteId: string) => ["schedules", siteId, "releases"] as const,
  release: (siteId: string, id: string) => ["schedules", siteId, "release", id] as const,
  automations: (siteId: string) => ["schedules", siteId, "automations"] as const,
  runs: (siteId: string) => ["schedules", siteId, "runs"] as const,
  settings: (siteId: string) => ["schedules", siteId, "settings"] as const,
};

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

/** The `ScheduleWords` every block takes, the date-time field's words, and duration wording. */
export function useScheduleWords() {
  const { t, locale } = useI18n("schedules");
  return useMemo(() => {
    const w = "schedules.words" as const;
    const words: ScheduleWords = {
      kind: {
        publish: t(`${w}.kind.publish`),
        expiry: t(`${w}.kind.expiry`),
        embargo: t(`${w}.kind.embargo`),
        release: t(`${w}.kind.release`),
        automation: t(`${w}.kind.automation`),
      },
      status: {
        release: {
          draft: t(`${w}.release.draft`),
          awaiting_approval: t(`${w}.release.awaiting_approval`),
          scheduled: t(`${w}.release.scheduled`),
          running: t(`${w}.release.running`),
          published: t(`${w}.release.published`),
          conflict: t(`${w}.release.conflict`),
          missed: t(`${w}.release.missed`),
          expired: t(`${w}.release.expired`),
          failed: t(`${w}.release.failed`),
          canceled: t(`${w}.release.canceled`),
        },
        automation: {
          active: t(`${w}.automation.active`),
          paused: t(`${w}.automation.paused`),
          "auto-paused": t(`${w}.automation.auto-paused`),
          broken: t(`${w}.automation.broken`),
          ended: t(`${w}.automation.ended`),
        },
        run: {
          due: t(`${w}.run.due`),
          ready: t(`${w}.run.ready`),
          running: t(`${w}.run.running`),
          succeeded: t(`${w}.run.succeeded`),
          failed: t(`${w}.run.failed`),
          missed: t(`${w}.run.missed`),
          skipped: t(`${w}.run.skipped`),
          "budget-exceeded": t(`${w}.run.budget-exceeded`),
          killed: t(`${w}.run.killed`),
        },
        approval: {
          waiting: t(`${w}.approval.waiting`),
          approved: t(`${w}.approval.approved`),
          auto: t(`${w}.approval.auto`),
          denied: t(`${w}.approval.denied`),
          expired: t(`${w}.approval.expired`),
        },
      },
    };
    const f = "schedules.field" as const;
    const field: DateTimeFieldLabels = {
      date: t(`${f}.date`),
      pickDate: t(`${f}.pickDate`),
      chooseDate: t(`${f}.chooseDate`),
      invalidTime: t(`${f}.invalidTime`),
      calendar: {
        previousMonth: t(`${f}.calendar.previousMonth`),
        nextMonth: t(`${f}.calendar.nextMonth`),
        navigation: t(`${f}.calendar.months`),
        day: (date, { today, selected }) => {
          const named = selected ? t(`${f}.calendar.daySelected`, { date }) : date;
          return today ? t(`${f}.calendar.dayToday`, { date: named }) : named;
        },
      },
    };
    /** "3 min", "2 h", "1 d" from seconds. */
    const duration = (seconds: number) => formatMinutes(seconds / 60, locale);
    return { t, locale, words, field, duration };
  }, [t, locale]);
}

/** "1 item", "3 items": what a release without a title is called. */
export const itemsLabel = (t: ST, count: number) =>
  count === 1 ? t("schedules.release.untitledOne") : t("schedules.release.untitled", { count });

/** A field problem in words ("02:30 does not exist on 29 March in Berlin; it runs at 03:30"). */
export function problemText(
  t: ST,
  locale: string,
  problem: WhenProblem | undefined,
  context: { value: Partial<DateTimeValue> | undefined; timeZone: string },
): string | undefined {
  if (!problem) return undefined;
  const p = "schedules.field.problems" as const;
  switch (problem.code) {
    case "incomplete":
      return t(`${p}.incomplete`);
    case "past":
      return t(`${p}.past`);
    case "soon":
      return t(`${p}.soon`);
    case "far":
      return t(`${p}.far`, { days: problem.days });
    case "gap":
      return t(`${p}.gap`, {
        time: context.value?.time ?? "",
        date: context.value?.date
          ? new Intl.DateTimeFormat(locale, {
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(new Date(`${context.value.date}T00:00:00Z`))
          : "",
        zone: zoneLabel(context.timeZone).replace(/ \(.*\)$/, ""),
        runsAt: problem.runsAt,
      });
  }
}

// ---------------------------------------------------------------------------------------------
// The site's clock
// ---------------------------------------------------------------------------------------------

/** The site's zone (UTC when it has none), its label, today there, and the locale's week. */
export function useSiteZone(siteId: string) {
  const { locale } = useI18n();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const timeZone = site.data?.timeZone ?? "UTC";
  const now = Date.now();
  return {
    site: site.data,
    timeZone,
    zoneLabel: zoneLabel(timeZone, now),
    today: todayIn(timeZone, now),
    weekStartsOn: firstDayOfWeek(locale),
    hourCycle: hourCycleOf(locale),
    locale,
  };
}

// ---------------------------------------------------------------------------------------------
// Who may do what with a release
// ---------------------------------------------------------------------------------------------

/**
 * Whether the person may change and approve a release (cosmetic: the server decides). Editors and
 * above change and approve any; Authors their own releases; Contributors only make drafts and
 * requests of their own work.
 */
export function useReleaseAbilities(release: Pick<Release, "createdBy"> | undefined) {
  const me = useMe().data;
  const writeAny = useCan("schedules.writeAny");
  const writeOwn = useCan("schedules.write");
  const approveAny = useCan("releases.approveAny");
  const approveOwn = useCan("releases.approve");
  const mine = !release || !me || release.createdBy.id === me.actor.id;
  return {
    write: writeAny || (writeOwn && mine),
    approve: approveAny || (approveOwn && mine),
  };
}

// ---------------------------------------------------------------------------------------------
// Release mutations
// ---------------------------------------------------------------------------------------------

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Unschedule, cancel, publish now and re-pin, each with its toast; the schedules refetch after. */
export function useReleaseMutations(siteId: string) {
  const { t } = useI18n("schedules");
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) }),
      qc.invalidateQueries({ queryKey: ["approvals", siteId] }),
      qc.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  const fail = (e: unknown) => {
    void refresh();
    toast.error(t("schedules.actions.failed"), message(e));
  };
  const d = "schedules.release.done" as const;
  return {
    unschedule: useMutation({
      mutationFn: (r: Pick<Release, "id" | "rev">) =>
        schedulesApi.releases.unschedule(siteId, r.id, r.rev),
      onSuccess: async () => {
        await refresh();
        toast.success(t(`${d}.unscheduled`));
      },
      onError: fail,
    }),
    cancel: useMutation({
      mutationFn: (r: Pick<Release, "id" | "rev">) =>
        schedulesApi.releases.cancel(siteId, r.id, r.rev),
      onSuccess: async (result) => {
        await refresh();
        toast.success(
          result.status === "approval-pending" ? t(`${d}.requested`) : t(`${d}.canceled`),
        );
      },
      onError: fail,
    }),
    publishNow: useMutation({
      mutationFn: (r: Pick<Release, "id" | "rev">) =>
        schedulesApi.releases.publishNow(siteId, r.id, r.rev),
      onSuccess: async () => {
        await Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
          qc.invalidateQueries({ queryKey: ["site", siteId] }),
        ]);
        toast.success(t(`${d}.published`));
      },
      onError: fail,
    }),
    repin: useMutation({
      mutationFn: (input: Pick<Release, "id" | "rev"> & { approve: boolean }) =>
        schedulesApi.releases.repin(siteId, input.id, input.rev, input.approve),
      onSuccess: async (result) => {
        await refresh();
        toast.success(
          result.status === "approval-pending" || result.release.state === "awaiting_approval"
            ? t(`${d}.requested`)
            : t(`${d}.repinned`),
        );
      },
      onError: fail,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// "Move to…" (D4, D12): one dialog for drops, keyboard moves and every item's menu
// ---------------------------------------------------------------------------------------------

/** What is being moved: the release, and (from a drop) the day it was dropped on. */
export interface MoveTarget {
  releaseId: string;
  title: string;
  at: string;
  toDay?: string;
}

/**
 * "Move to…": opens `RescheduleDialog` for a release with the old time of day on the new day (a
 * drop) or its current time, says whether the approval is kept or voided, warns about other
 * releases at the same minute, and confirms; after the move a toast offers **Undo** for 10 s.
 * Nothing is optimistic; a 409 says "This schedule changed somewhere else" with "Load the latest".
 */
export function useMoveDialog(
  siteId: string,
  options: {
    sameMinute?: (at: string, releaseId: string) => number;
    onMoved?: (text: string) => void;
  } = {},
) {
  const { t, locale, field } = useScheduleWords();
  const zone = useSiteZone(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<MoveTarget | undefined>();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<DateTimeValue>({});
  const release = useQuery({
    queryKey: scheduleKeys.release(siteId, target?.releaseId ?? ""),
    queryFn: () => schedulesApi.releases.get(siteId, target?.releaseId ?? ""),
    enabled: open && !!target,
  });
  const abilities = useReleaseAbilities(release.data);
  const move = useMutation({
    mutationFn: async (input: { release: ReleaseView; to: DateTimeValue }) =>
      schedulesApi.releases.reschedule(siteId, input.release.id, input.release.rev, {
        localTime: localDateTime({ date: input.to.date ?? "", time: input.to.time ?? "" }),
        timeZone: zone.timeZone,
      }),
  });
  const undo = useMutation({
    mutationFn: (input: { id: string; rev: number; back: string }) =>
      schedulesApi.releases.reschedule(siteId, input.id, input.rev, {
        localTime: input.back,
        timeZone: zone.timeZone,
      }),
  });

  const start = (next: MoveTarget) => {
    const from = wallClockOf(next.at, zone.timeZone);
    setTarget(next);
    setValue({ date: next.toDay ?? from.date, time: from.time });
    move.reset();
    setOpen(true);
  };

  const problem = whenProblem(value, zone.timeZone, { leadMinutes: 1 });
  const nextAt =
    value.date && value.time
      ? zonedToInstant({ date: value.date, time: value.time }, zone.timeZone).at
      : undefined;
  const clash = nextAt && target ? (options.sameMinute?.(nextAt, target.releaseId) ?? 0) : 0;
  const conflict = move.error instanceof ApiRequestError && move.error.status === 409;
  const nextLabel =
    nextAt && problem?.code !== "past" && problem?.code !== "incomplete"
      ? formatWhen(nextAt, locale, zone.timeZone)
      : undefined;

  const confirm = () => {
    const r = release.data;
    if (!r || !target || !value.date || !value.time) return;
    const back = localDateTime(wallClockOf(target.at, zone.timeZone));
    move.mutate(
      { release: r, to: value },
      {
        onSuccess: async (result) => {
          setOpen(false);
          await qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
          const time = nextLabel ?? "";
          options.onMoved?.(t("schedules.calendar.moved", { title: target.title, time }));
          const id = `move:${r.id}:${result.release.rev}`;
          toast.notice({
            id,
            title: t("schedules.move.moved", { time }),
            description: target.title,
            tone: "info",
            timeout: 10_000,
            actions: [
              {
                label: t("schedules.move.undo"),
                onClick: () =>
                  undo.mutate(
                    { id: r.id, rev: result.release.rev, back },
                    {
                      onSuccess: async () => {
                        await qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
                        toast.success(
                          t("schedules.move.undone", {
                            time: formatWhen(target.at, locale, zone.timeZone),
                          }),
                        );
                      },
                      onError: (e) => toast.error(t("schedules.actions.failed"), message(e)),
                    },
                  ),
              },
            ],
          });
        },
      },
    );
  };

  const element = (
    <RescheduleDialog
      open={open}
      onOpenChange={(next) => {
        if (!move.isPending) setOpen(next);
      }}
      subject={target?.title ?? ""}
      current={target ? formatWhen(target.at, locale, zone.timeZone) : ""}
      value={value}
      onValueChange={setValue}
      nextLabel={nextLabel}
      approvalEffect={release.data ? moveEffect(release.data, abilities.approve) : "none"}
      conflict={
        clash > 0
          ? clash === 1
            ? t("schedules.move.clashOne", { time: nextLabel ?? "" })
            : t("schedules.move.clash", { count: clash, time: nextLabel ?? "" })
          : undefined
      }
      error={
        problem && problem.code !== "incomplete" && problem.code !== "gap"
          ? problemText(t, locale, problem, { value, timeZone: zone.timeZone })
          : problem?.code === "gap"
            ? problemText(t, locale, problem, { value, timeZone: zone.timeZone })
            : undefined
      }
      failure={
        conflict
          ? {
              title: t("schedules.move.changed"),
              description: t("schedules.move.changedDescription"),
              action: (
                <Banner.Action
                  variant="secondary"
                  icon={<ArrowClockwise />}
                  loading={release.isFetching}
                  onClick={() => {
                    move.reset();
                    void release.refetch();
                    void qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
                  }}
                >
                  {t("schedules.move.reload")}
                </Banner.Action>
              ),
            }
          : move.error
            ? { title: t("schedules.actions.failed"), description: message(move.error) }
            : undefined
      }
      onConfirm={confirm}
      busy={move.isPending || release.isPending}
      locale={locale}
      timeZone={zone.timeZone}
      zoneLabel={zone.zoneLabel}
      today={zone.today}
      hourCycle={zone.hourCycle}
      labels={{
        title: target
          ? t("schedules.move.titleOf", { title: target.title })
          : t("schedules.move.title"),
        description: target?.title,
        now: t("schedules.move.now"),
        next: t("schedules.move.next"),
        pickTime: t("schedules.move.pickTime"),
        approvalKept: t("schedules.move.approvalKept"),
        approvalVoided: t("schedules.move.approvalVoided"),
        confirm: t("schedules.move.confirm"),
        cancel: t("schedules.move.cancel"),
        close: t("schedules.move.close"),
        field,
        fieldLabel: t("schedules.move.field"),
      }}
    />
  );
  return { start, element };
}

// ---------------------------------------------------------------------------------------------
// The page header shared by the three tabs
// ---------------------------------------------------------------------------------------------

export type SchedulesTab = "calendar" | "automations" | "history";

/** "New schedule ▾": a publish (the primary), a release, an automation. */
export function NewScheduleButton({
  onNew,
}: {
  onNew: (kind: "publish" | "release" | "automation") => void;
}) {
  const { t } = useI18n("schedules");
  const automations = useCan("automations.manage");
  return (
    <ButtonGroup aria-label={t("schedules.newSchedule.label")}>
      <Button
        variant="primary"
        icon={<CalendarPlus />}
        onClick={() => onNew("publish")}
        data-new-schedule=""
      >
        {t("schedules.newSchedule.label")}
      </Button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              variant="primary"
              shape="square"
              icon={<CaretDown />}
              aria-label={t("schedules.newSchedule.more")}
            />
          }
        />
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item icon={CalendarPlus} onClick={() => onNew("publish")}>
            {t("schedules.newSchedule.publish")}
          </DropdownMenu.Item>
          <DropdownMenu.Item icon={Package} onClick={() => onNew("release")}>
            {t("schedules.newSchedule.release")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={Robot}
            disabled={!automations}
            onClick={() => onNew("automation")}
          >
            {t("schedules.newSchedule.automation")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </ButtonGroup>
  );
}

/**
 * The props every tab passes to `PageLayout`: crumbs, the 24 px icon, title and description, the
 * tabs (sub-views of one page, each its own route), and "New schedule ▾".
 */
export function useSchedulesHeader(siteId: string, tab: SchedulesTab) {
  const { t } = useI18n("schedules");
  const navigate = useNavigate();
  const go = (next: string) => {
    const to =
      next === "automations"
        ? "/sites/$siteId/schedules/automations"
        : next === "history"
          ? "/sites/$siteId/schedules/history"
          : "/sites/$siteId/schedules";
    void navigate({ to, params: { siteId } });
  };
  const onNew = (kind: "publish" | "release" | "automation") => {
    if (kind === "automation")
      void navigate({
        to: "/sites/$siteId/schedules/automations",
        params: { siteId },
        search: { new: "1" },
      });
    else
      void navigate({ to: "/sites/$siteId/schedules", params: { siteId }, search: { new: kind } });
  };
  const title = t("schedules.title");
  return {
    crumbs: (
      <SiteCrumbs
        siteId={siteId}
        trail={
          tab === "calendar"
            ? [{ label: title }]
            : [
                { label: title, href: `/sites/${siteId}/schedules` },
                { label: t(`schedules.tabs.${tab}`) },
              ]
        }
      />
    ),
    icon: <CalendarDots size={24} />,
    title,
    description: t("schedules.description"),
    tabs: (["calendar", "automations", "history"] as const).map((value) => ({
      value,
      label: t(`schedules.tabs.${value}`),
    })),
    tab,
    onTabChange: go,
    onNew,
  };
}

/** The scheduler's health, polled while a schedule screen is open (404: no schedules here). */
export function useSchedulerStatus(enabled = true) {
  return useQuery({
    queryKey: ["scheduler"],
    queryFn: api.scheduler,
    enabled,
    refetchInterval: (q) => (isNotEnabled(q.state.error) ? false : 60_000),
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
}

/** Banners under the tabs: something needs attention, the site is paused, the scheduler stalled. */
export function SchedulesBanners({
  siteId,
  attention,
  onReviewAttention,
}: {
  siteId: string;
  /** Releases missed, failed or in conflict (Calendar tab). */
  attention?: number;
  onReviewAttention?: () => void;
}) {
  const { t } = useI18n("schedules");
  const settings = useQuery({
    queryKey: scheduleKeys.settings(siteId),
    queryFn: () => schedulesApi.settings.get(siteId),
    retry: false,
  });
  const scheduler = useSchedulerStatus();
  const stalled = isStalled(scheduler.data) ? scheduler.data : undefined;
  const banners: ReactNode[] = [];
  if (attention && attention > 0)
    banners.push(
      <div key="attention" role="status" data-banner="attention">
        <Banner
          variant="alert"
          icon={<WarningCircle weight="fill" />}
          title={
            attention === 1
              ? t("schedules.attention.titleOne")
              : t("schedules.attention.title", { count: attention })
          }
          description={t("schedules.attention.description")}
          action={
            onReviewAttention ? (
              <Banner.Action variant="secondary" icon={<ArrowRight />} onClick={onReviewAttention}>
                {t("schedules.attention.review")}
              </Banner.Action>
            ) : undefined
          }
        />
      </div>,
    );
  if (settings.data?.paused)
    banners.push(
      <div key="paused" data-banner="paused">
        <Banner
          variant="secondary"
          icon={<PauseCircle weight="fill" />}
          title={t("schedules.paused.title")}
          description={settings.data.pausedReason ?? t("schedules.paused.description")}
          action={
            <LinkButton
              href={`/sites/${siteId}/settings#schedules`}
              variant="secondary"
              size="sm"
              icon={ArrowRight}
            >
              {t("schedules.paused.settings")}
            </LinkButton>
          }
        />
      </div>,
    );
  if (stalled)
    banners.push(<SchedulerStalledBanner key="stalled" siteId={siteId} status={stalled} />);
  return banners.length > 0 ? <div className="grid gap-3">{banners}</div> : null;
}

/** A 404 from the schedules API: the server has no schedules. */
export const schedulesMissing = (error: unknown) =>
  isNotEnabled(error) || errorCode(error) === "schedules_disabled";

/**
 * The mode an agent held content back in (`metadata["cloudhal.mode"]` on a gate-only reduction):
 * such a release needed no person in that mode and is not an Auto-mode publish.
 */
export function reductionMode(release: Pick<Release, "metadata"> | undefined): KeyMode | undefined {
  const mode = release?.metadata?.["cloudhal.mode"];
  return mode === "plan" || mode === "manual" || mode === "edits" || mode === "auto"
    ? mode
    : undefined;
}

/** "Edits mode reduction", with what it means in a tooltip (instead of "Automatic"). */
export function ReductionBadge({ mode }: { mode: KeyMode }) {
  const { t } = useI18n("schedules");
  const name = t(`agents.modes.names.${mode}`);
  return (
    <Tooltip content={t("schedules.words.reductionHint", { mode: name })}>
      <Badge variant="outline" icon={<ShieldCheck />}>
        {t("schedules.words.reduction", { mode: name })}
      </Badge>
    </Tooltip>
  );
}
