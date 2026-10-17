import {
  ActorBadge,
  AgendaList,
  ApprovalDialog,
  Badge,
  Button,
  CalendarMonth,
  CalendarNav,
  type CalendarView,
  Code,
  calendarLocaleProps,
  DatePicker,
  DropdownMenu,
  dateToDay,
  dayToDate,
  Empty,
  formatDay,
  formatMonth,
  formatScheduleTime,
  Input,
  LayerCard,
  LayerDialog,
  LinkButton,
  PageLayout,
  Popover,
  type ScheduleEntry,
  ScheduleFilters,
  type ScheduleFilterValue,
  type ScheduleView,
  SectionCard,
  SectionEmpty,
  Text,
  TimezoneNote,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  DotsThree,
  HandPalm,
  Heartbeat,
  Keyboard,
  TerminalWindow,
  X,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { ScheduleDialog } from "../components/ScheduleDialog.tsx";
import {
  itemsLabel,
  NewScheduleButton,
  ReductionBadge,
  reductionMode,
  SchedulesBanners,
  type ST,
  scheduleKeys,
  schedulesMissing,
  useMoveDialog,
  useReleaseAbilities,
  useReleaseMutations,
  useSchedulerStatus,
  useSchedulesHeader,
  useScheduleWords,
  useSiteZone,
} from "../components/Schedules.tsx";
import { useToast } from "../components/Toast.ts";
import { useCan, useGate, useMe } from "../components/useMe.ts";
import { usePendingApprovals } from "../components/usePendingApprovals.ts";
import { type Approval, api, type CalendarItem, type ReleaseView } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import {
  APPROVAL_FACET,
  BUILTIN_VIEWS,
  browserZone,
  entryOf,
  filtersOf,
  formatMinutes,
  formatWhen,
  isBuiltinView,
  KIND_FACET,
  matchesFilters,
  monthOfSearch,
  monthPeriod,
  needsAttention,
  ORIGIN_FACET,
  readSavedViews,
  releaseAt,
  type SavedView,
  STATE_FACET,
  sameFilters,
  searchOfFilters,
  stepMonth,
  todayIn,
  viewFilters,
  weekOf,
  writeSavedViews,
  zoneCity,
  zoneOffset,
} from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { type CalendarSearch, validateSchedulesSearch } from "../lib/schedules-search.ts";

const ROUTE = "/sites/$siteId/schedules" as const;
type Search = CalendarSearch;

/** Two-key chords (`g t`, `g d`) wait this long for their second key. */
const CHORD_MS = 1200;

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable ||
      el.closest("[role=dialog],[role=menu],[role=listbox]") !== null)
  );
};

/** The release requests waiting in Approvals, by release id. */
function requestsByRelease(approvals: readonly Approval[] | undefined) {
  const out = new Map<string, Approval>();
  for (const a of approvals ?? []) {
    const id = a.releaseId;
    if (id && a.status === "pending") out.set(id, a);
  }
  return out;
}

/** Approve or deny a release request (carried out by the server, §10.4), with a confirmation. */
function useDecide(siteId: string, t: ST) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { request: Approval; decision: "approve" | "deny"; title: string }) =>
      api.approvals.decide(siteId, input.request.id, input.decision),
    onSuccess: async (_r, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["approvals", siteId] }),
        qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success(
        input.decision === "approve"
          ? t("schedules.actions.approved", { title: input.title })
          : t("schedules.actions.denied"),
      );
    },
    onError: async (e) => {
      await qc.invalidateQueries({ queryKey: ["approvals", siteId] });
      toast.error(t("schedules.actions.gone"), apiErrorText(t, e));
    },
  });
}

/** The aside (380 px, sticky): what waits for approval, the scheduler, the CLI. */
function CalendarAside({
  siteId,
  t,
  requests,
  onApprove,
}: {
  siteId: string;
  t: ST;
  requests: { request: Approval; title: string; at: string | undefined }[];
  onApprove: (r: { request: Approval; title: string; at: string | undefined }) => void;
}) {
  const { locale, timeZone } = useSiteZone(siteId);
  const scheduler = useSchedulerStatus();
  const s = scheduler.data;
  const a = "schedules.aside" as const;
  const tone = s?.state === "running" ? "success" : s?.state === "unknown" ? "secondary" : "error";
  return (
    <>
      <SectionCard
        title={t(`${a}.waiting.title`)}
        icon={<HandPalm size={16} />}
        actions={
          requests.length > 0 ? <Badge variant="warning">{requests.length}</Badge> : undefined
        }
        flush
      >
        {requests.length === 0 ? (
          <SectionEmpty
            title={t(`${a}.waiting.empty`)}
            description={t(`${a}.waiting.description`)}
          />
        ) : (
          <div className="divide-y divide-kumo-hairline" data-testid="waiting-releases">
            {requests.map((r) => (
              <div key={r.request.id} className="grid gap-2 px-5 py-3">
                <div className="grid gap-0.5">
                  <Text bold truncate>
                    {r.title}
                  </Text>
                  {r.at && (
                    <Text variant="secondary" size="sm">
                      {t(`${a}.waiting.due`, { time: formatWhen(r.at, locale, timeZone) })}
                    </Text>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<CheckCircle />}
                    onClick={() => onApprove(r)}
                    disabled={r.request.canDecide === false}
                  >
                    {t("schedules.actions.approve")}
                  </Button>
                  {r.request.releaseId && (
                    <LinkButton
                      size="sm"
                      variant="ghost"
                      href={`/sites/${siteId}/schedules/releases/${r.request.releaseId}`}
                      icon={ArrowRight}
                    >
                      {t(`${a}.waiting.open`)}
                    </LinkButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard
        title={t(`${a}.scheduler.title`)}
        icon={<Heartbeat size={16} />}
        actions={
          s ? (
            <Badge variant={tone} appearance="dot">
              {t(`${a}.scheduler.state.${s.state}`)}
            </Badge>
          ) : undefined
        }
      >
        <dl className="-my-2 divide-y divide-kumo-hairline">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <dt>
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.scheduler.lastTick`)}
              </Text>
            </dt>
            <dd className="m-0">
              {s?.lastTickAt ? (
                <RelativeTime iso={s.lastTickAt} />
              ) : (
                <Text as="span" size="sm">
                  {t(`${a}.scheduler.never`)}
                </Text>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <dt>
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.scheduler.mode`)}
              </Text>
            </dt>
            <dd className="m-0">
              <Text as="span" size="sm">
                {t(`${a}.scheduler.modes.${s?.mode ?? "unknown"}`)}
              </Text>
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <dt>
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.scheduler.lag`)}
              </Text>
            </dt>
            <dd className="m-0">
              <Text as="span" size="sm">
                {s && s.lag.p50 !== null && s.lag.p95 !== null
                  ? t(`${a}.scheduler.lagValue`, {
                      p50: `${Math.round(s.lag.p50)} s`,
                      p95: `${Math.round(s.lag.p95)} s`,
                    })
                  : t(`${a}.scheduler.noLag`)}
              </Text>
            </dd>
          </div>
        </dl>
        <Text variant="secondary" size="sm">
          {t(`${a}.scheduler.promise`)}
        </Text>
        <div>
          <LinkButton
            href={`/sites/${siteId}/settings#schedules`}
            variant="ghost"
            size="sm"
            icon={ArrowRight}
          >
            {t(`${a}.scheduler.settings`)}
          </LinkButton>
        </div>
      </SectionCard>
      <SectionCard title={t(`${a}.terminal.title`)} icon={<TerminalWindow size={16} />}>
        <Text variant="secondary">{t(`${a}.terminal.description`)}</Text>
        <Code lang="bash" code="cloudhal schedules list" />
        <Code lang="bash" code="cloudhal schedules status --remote" />
      </SectionCard>
    </>
  );
}

/** "Go to date": a `Popover` with the Studio-language `DatePicker`. */
function GoToDate({
  t,
  locale,
  today,
  open,
  onOpenChange,
  onPick,
}: {
  t: ST;
  locale: string;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (day: string) => void;
}) {
  const f = "schedules.field.calendar" as const;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button
            variant="secondary"
            shape="square"
            icon={<CalendarBlank />}
            aria-label={t("schedules.calendar.nav.goTo")}
            data-go-to=""
          />
        }
      />
      <Popover.Content align="start" positionMethod="fixed" className="grid gap-2">
        <Popover.Title>{t("schedules.calendar.nav.goTo")}</Popover.Title>
        <DatePicker
          mode="single"
          defaultMonth={dayToDate(today)}
          onChange={(d?: Date) => {
            if (!d) return;
            onPick(dateToDay(d));
            onOpenChange(false);
          }}
          today={dayToDate(today)}
          {...calendarLocaleProps(
            locale,
            {
              previousMonth: t(`${f}.previousMonth`),
              nextMonth: t(`${f}.nextMonth`),
              navigation: t(`${f}.months`),
              day: (date, { today: isToday, selected }) => {
                const named = selected ? t(`${f}.daySelected`, { date }) : date;
                return isToday ? t(`${f}.dayToday`, { date: named }) : named;
              },
            },
            "UTC",
          )}
        />
      </Popover.Content>
    </Popover>
  );
}

/** The keyboard shortcuts of the calendar (RFC-0008 §15.6), opened with `?`. */
function ShortcutsDialog({
  t,
  open,
  onOpenChange,
}: {
  t: ST;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const s = "schedules.shortcuts" as const;
  const rows: [string[], string][] = [
    [["j"], t(`${s}.next`)],
    [["k"], t(`${s}.previous`)],
    [["a"], t(`${s}.agenda`)],
    [["m"], t(`${s}.month`)],
    [["g", "t"], t(`${s}.today`)],
    [["g", "d"], t(`${s}.goTo`)],
    [["c"], t(`${s}.newSchedule`)],
    [["f"], t(`${s}.filters`)],
    [["?"], t(`${s}.help`)],
  ];
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm" closeLabel={t(`${s}.close`)}>
        <LayerDialog.Title>{t(`${s}.title`)}</LayerDialog.Title>
        <LayerDialog.Description>{t(`${s}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <dl className="m-0 grid divide-y divide-kumo-hairline" data-testid="shortcuts">
            {rows.map(([keys, label]) => (
              <div key={keys.join("+")} className="flex items-center justify-between gap-4 py-2">
                <dt>
                  <Text as="span">{label}</Text>
                </dt>
                <dd className="m-0 flex items-center gap-1.5">
                  {keys.map((k, i) => (
                    <span key={k} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <Text as="span" variant="secondary" size="sm">
                          {t(`${s}.followedBy`)}
                        </Text>
                      )}
                      <kbd className="rounded bg-kumo-recessed px-1.5 font-mono text-kumo-default text-xs">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** "Save view…": a name for the filters in force, kept in this browser. */
function SaveViewDialog({
  t,
  open,
  onOpenChange,
  onSave,
}: {
  t: ST;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (label: string) => void;
}) {
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setAttempted(false);
    }
  }, [open]);
  const v = "schedules.calendar.saveView" as const;
  const submit = () => {
    setAttempted(true);
    if (!name.trim()) return;
    onSave(name.trim().slice(0, 60));
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm" closeLabel={t("schedules.move.close")}>
        <LayerDialog.Title>{t(`${v}.title`)}</LayerDialog.Title>
        <LayerDialog.Description>{t(`${v}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          <Input
            className="w-full"
            label={t(`${v}.name`)}
            placeholder={t(`${v}.placeholder`)}
            value={name}
            onValueChange={setName}
            error={attempted && !name.trim() ? t(`${v}.required`) : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("schedules.move.cancel")}>
          <LayerDialog.Actions.Primary onClick={submit}>
            {t(`${v}.save`)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/**
 * Site › Automation › Schedules › Calendar (RFC-0008 §15.1–§15.7, DESIGN.md §2x): what publishes,
 * expires and runs on this site and when, as an Agenda (the default on every width) or a Month
 * (a dot grid and a day list on phones). Filters, the view, the month and the search live in the
 * URL. Moving an item — its "Move to…", a drag on desktop Month, or Alt+arrow — always goes
 * through `RescheduleDialog`, then a toast with Undo. Proposals are dashed; releases waiting for
 * approval are decided here or in the aside.
 */
export function SchedulesPage() {
  const { t, locale, words } = useScheduleWords();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search: Search = validateSchedulesSearch(useSearch({ from: ROUTE }));
  const navigate = useNavigate();
  const header = useSchedulesHeader(siteId, "calendar");
  const zone = useSiteZone(siteId);
  const me = useMe().data;
  const read = useGate("schedules.read");
  const writeOwn = useCan("schedules.write");
  const writeAny = useCan("schedules.writeAny");
  const canWrite = writeOwn || writeAny;
  const [mine, setMine] = useState(false);
  const viewer = browserZone();
  const displayZone = mine ? viewer : zone.timeZone;
  const now = Date.now();
  const today = todayIn(displayZone, now);
  const [selectedDay, setSelectedDay] = useState<string | undefined>();
  const [goToOpen, setGoToOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState<SavedView[]>(() => readSavedViews());
  const [announcement, setAnnouncement] = useState<string | undefined>();
  const [deciding, setDeciding] = useState<
    { request: Approval; title: string; at: string | undefined } | undefined
  >();
  const [publishing, setPublishing] = useState<
    ReleaseView | Pick<ReleaseView, "id" | "rev" | "title"> | undefined
  >();

  // ---- the URL ----
  const view: CalendarView = search.view === "month" ? "month" : "agenda";
  const week = search.v === "week";
  const month = week ? today.slice(0, 7) : monthOfSearch(search.date, today);
  const savedView = search.v?.startsWith("saved:")
    ? saved.find((s) => `saved:${s.id}` === search.v)
    : undefined;
  const filters: ScheduleFilterValue = savedView ? savedView.filters : filtersOf(search);
  const setSearch = (patch: Partial<Search>, replace = false) =>
    void navigate({
      to: ROUTE,
      params: { siteId },
      search: ((prev: Search) => {
        const next: Search = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof Search)[])
          if (next[k] === undefined || next[k] === "") delete next[k];
        return next;
      }) as never,
      replace,
    });
  const setFilters = (value: ScheduleFilterValue) =>
    setSearch({
      kind: undefined,
      state: undefined,
      origin: undefined,
      approval: undefined,
      v: undefined,
      ...searchOfFilters(value),
    });
  const setMonth = (next: string) => setSearch({ date: next, v: week ? undefined : search.v });
  const setView = (next: CalendarView) =>
    setSearch({ view: next === "month" ? "month" : undefined });

  // ---- data ----
  const period = monthPeriod(month, zone.weekStartsOn, zone.timeZone);
  const calendar = useInfiniteQuery({
    queryKey: scheduleKeys.calendar(siteId, period.from, period.to),
    queryFn: ({ pageParam }) =>
      schedulesApi.calendar(siteId, {
        from: period.from,
        to: period.to,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: read.allowed && !!zone.site,
    retry: (count, error) => !schedulesMissing(error) && count < 1,
  });
  const releases = useQuery({
    queryKey: scheduleKeys.releases(siteId),
    queryFn: () => schedulesApi.releases.list(siteId),
    enabled: read.allowed,
    retry: false,
  });
  const approvals = usePendingApprovals(siteId);
  const requests = useMemo(() => requestsByRelease(approvals.data), [approvals.data]);
  const byId = useMemo(() => new Map((releases.data ?? []).map((r) => [r.id, r])), [releases.data]);
  const items: CalendarItem[] = useMemo(
    () => (calendar.data?.pages ?? []).flatMap((p) => p.items),
    [calendar.data],
  );

  const entries: ScheduleEntry[] = useMemo(
    () =>
      items.map((item) => {
        const e = entryOf(siteId, item, now, { canMove: canWrite });
        const r = item.target.releaseId ? byId.get(item.target.releaseId) : undefined;
        const by = r?.createdBy.name ?? r?.createdBy.id;
        if (r && !r.title) e.title = itemsLabel(t, r.items.length);
        const w = "schedules.words.origin" as const;
        if (by)
          e.originLabel =
            r?.state === "draft" || r?.state === "awaiting_approval"
              ? t(`${w}.proposedBy`, { name: by })
              : t(`${w}.by`, { name: by });
        else e.originLabel = t(`${w}.${item.origin}`);
        // A gate-only reduction an agent filed reads "Edits mode reduction", not "Automatic".
        if (reductionMode(r) && e.approval === "auto") delete e.approval;
        if (e.approval === "waiting" || e.status.state === "awaiting_approval") {
          const left = Date.parse(item.at) - now;
          if (left > 0)
            e.timeLeft = t("schedules.words.timeLeft", {
              time: formatMinutes(left / 60_000, locale),
            });
        }
        return e;
      }),
    [items, byId, now, canWrite, siteId, t, locale],
  );

  const isMine = (e: ScheduleEntry) => {
    const id = e.id.startsWith("rel_") ? e.id : undefined;
    const r = id ? byId.get(id) : undefined;
    if (!r || !me) return false;
    return (
      r.createdBy.id === me.actor.id ||
      (r.approval?.kind === "person" &&
        (r.approval.by.id === me.actor.id || r.approval.by.id === me.userId))
    );
  };
  const weekDays = week ? weekOf(today, zone.weekStartsOn) : undefined;
  const visible = entries.filter((e) => {
    if (
      !matchesFilters(e, filters, {
        text: search.q ?? "",
        ...(search.v === "mine" ? { mine: isMine } : {}),
      })
    )
      return false;
    const day = e.day ?? e.at;
    if (weekDays) {
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: displayZone }).format(new Date(e.at));
      return d >= weekDays.first && d <= weekDays.last;
    }
    // The agenda lists the month; the grid also shows the neighbouring days it draws.
    if (view === "agenda") {
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: displayZone }).format(new Date(e.at));
      return d.slice(0, 7) === month;
    }
    return !!day;
  });
  const attention = entries.filter(needsAttention).length;
  const filtered = Object.keys(filters).length > 0 || !!search.q || week || search.v === "mine";

  // ---- moving ----
  const move = useMoveDialog(siteId, {
    sameMinute: (at, releaseId) =>
      items.filter(
        (i) =>
          i.kind === "release" &&
          i.target.releaseId !== releaseId &&
          Math.floor(Date.parse(i.at) / 60_000) === Math.floor(Date.parse(at) / 60_000),
      ).length,
    onMoved: setAnnouncement,
  });
  const mutations = useReleaseMutations(siteId);
  const decide = useDecide(siteId, t);
  const moveEntry = (e: ScheduleEntry, toDay?: string) => {
    const releaseId = e.id.startsWith("rel_") ? e.id : undefined;
    if (!releaseId) return;
    move.start({ releaseId, title: e.title, at: e.at, ...(toDay ? { toDay } : {}) });
  };

  // ---- views ----
  const builtinViews: ScheduleView[] = BUILTIN_VIEWS.map((id) => ({
    id,
    label: t(`schedules.calendar.views.${id}`),
    builtin: true,
  }));
  const views: ScheduleView[] = [
    ...builtinViews,
    ...saved.map((s) => ({ id: `saved:${s.id}`, label: s.label })),
  ];
  const currentView =
    search.v ??
    (Object.keys(filters).length === 0 && !search.q
      ? "all"
      : BUILTIN_VIEWS.find(
          (v) =>
            v !== "week" && v !== "mine" && v !== "all" && sameFilters(viewFilters(v), filters),
        ));
  const chooseView = (id: string) => {
    if (isBuiltinView(id))
      setSearch({
        kind: undefined,
        state: undefined,
        origin: undefined,
        approval: undefined,
        ...searchOfFilters(viewFilters(id)),
        v: id === "all" ? undefined : id,
      });
    else
      setSearch({
        v: id,
        kind: undefined,
        state: undefined,
        origin: undefined,
        approval: undefined,
      });
  };

  // ---- keyboard (RFC-0008 §15.6; Studio's own: ⌘K and / for the palette) ----
  const chord = useRef<{ key: string; at: number } | undefined>(undefined);
  const latest = useRef({ month, view, setMonth, setView, setSearch });
  latest.current = { month, view, setMonth, setView, setSearch };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const l = latest.current;
      const pending =
        chord.current && Date.now() - chord.current.at < CHORD_MS ? chord.current : undefined;
      chord.current = undefined;
      if (pending?.key === "g") {
        if (e.key === "t") {
          e.preventDefault();
          l.setSearch({ date: undefined, v: undefined });
        } else if (e.key === "d") {
          e.preventDefault();
          setGoToOpen(true);
        }
        return;
      }
      switch (e.key) {
        case "g":
          chord.current = { key: "g", at: Date.now() };
          return;
        case "j":
          e.preventDefault();
          l.setMonth(stepMonth(l.month, 1));
          return;
        case "k":
          e.preventDefault();
          l.setMonth(stepMonth(l.month, -1));
          return;
        case "a":
          e.preventDefault();
          l.setView("agenda");
          return;
        case "m":
          e.preventDefault();
          l.setView("month");
          return;
        case "c":
          e.preventDefault();
          l.setSearch({ new: "publish" });
          return;
        case "f":
          e.preventDefault();
          document.querySelector<HTMLElement>("[data-schedule-facet]")?.focus();
          return;
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- words for the blocks ----
  const c = "schedules.calendar" as const;
  const kindPlural = (e: readonly ScheduleEntry[]) => {
    const counts = new Map<string, number>();
    for (const x of e) counts.set(words.kind[x.kind], (counts.get(words.kind[x.kind]) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${n} ${k.toLocaleLowerCase(locale)}`).join(", ");
  };
  const rangeLabel = weekDays
    ? `${formatDay(weekDays.first, locale, "medium")} – ${formatDay(weekDays.last, locale, "medium")}`
    : formatMonth(month, locale);
  const siteCity = zoneCity(zone.timeZone);
  const zoneNote = mine
    ? t(`${c}.zone.mine`, { zone: zoneCity(viewer), offset: zoneOffset(viewer, now) })
    : t(`${c}.zone.note`, { zone: siteCity, offset: zoneOffset(zone.timeZone, now) });
  const nowIso = new Date(now).toISOString();
  const zoneDetail =
    viewer !== zone.timeZone
      ? t(`${c}.zone.detail`, {
          siteTime: formatScheduleTime(nowIso, locale, zone.timeZone),
          siteZone: siteCity,
          myTime: formatScheduleTime(nowIso, locale, viewer),
          myZone: zoneCity(viewer),
        })
      : undefined;

  const renderOrigin = (e: ScheduleEntry) => {
    const r = e.id.startsWith("rel_") ? byId.get(e.id) : undefined;
    if (!r) return null;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <ActorBadge kind={r.createdBy.kind} label={t(`activity.kinds.${r.createdBy.kind}`)} />
        <Text as="span" size="sm" variant="secondary" truncate>
          {r.createdBy.name ?? r.createdBy.id}
        </Text>
      </span>
    );
  };

  const renderActions = (e: ScheduleEntry) => {
    const releaseId = e.id.startsWith("rel_") ? e.id : undefined;
    if (!releaseId) return null;
    const request = requests.get(releaseId);
    const r = byId.get(releaseId);
    return (
      <EntryActions
        t={t}
        siteId={siteId}
        entry={e}
        release={r}
        request={request}
        onMove={() => moveEntry(e)}
        onApprove={() => request && setDeciding({ request, title: e.title, at: e.at })}
        onDeny={() => request && decide.mutate({ request, decision: "deny", title: e.title })}
        onUnschedule={() => r && mutations.unschedule.mutate(r)}
        onPublishNow={() => r && setPublishing(r)}
        busy={decide.isPending}
      />
    );
  };

  const waiting = [...requests.values()]
    .map((request) => {
      const r = request.releaseId ? byId.get(request.releaseId) : undefined;
      return {
        request,
        title: r?.title ?? (r ? itemsLabel(t, r.items.length) : request.prompt),
        at: releaseAt(r),
      };
    })
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  const missing = schedulesMissing(calendar.error) || schedulesMissing(releases.error);
  const body = (() => {
    if (!read.allowed)
      return (
        <Empty
          icon={<CalendarBlank size={48} />}
          title={t("schedules.noAccess")}
          description={read.reason}
        />
      );
    if (missing)
      return (
        <Empty
          icon={<CalendarBlank size={48} />}
          title={t("schedules.unavailable.title")}
          description={t("schedules.unavailable.description")}
        />
      );
    return (
      <>
        <SchedulesBanners
          siteId={siteId}
          attention={attention}
          onReviewAttention={() => chooseView("attention")}
        />
        <div className="grid gap-3">
          <ListToolbar
            search={search.q ?? ""}
            onSearch={(q) => setSearch({ q }, true)}
            placeholder={t(`${c}.search`)}
            actions={
              <ScheduleFilters
                value={filters}
                onChange={setFilters}
                facets={[
                  {
                    facet: "kind",
                    options: KIND_FACET.map((k) => ({ value: k, label: words.kind[k] })),
                  },
                  {
                    facet: "state",
                    options: STATE_FACET.map((s) => ({
                      value: s,
                      label: t(`${c}.filters.state.${s}`),
                    })),
                  },
                  {
                    facet: "origin",
                    options: ORIGIN_FACET.map((o) => ({
                      value: o,
                      label: t(`${c}.filters.origin.${o}`),
                    })),
                  },
                  {
                    facet: "approval",
                    options: APPROVAL_FACET.map((o) => ({
                      value: o,
                      label: t(`${c}.filters.approval.${o}`),
                    })),
                  },
                ]}
                labels={{
                  toolbar: t(`${c}.filters.toolbar`),
                  facet: {
                    kind: t(`${c}.filters.facet.kind`),
                    state: t(`${c}.filters.facet.state`),
                    origin: t(`${c}.filters.facet.origin`),
                    approval: t(`${c}.filters.facet.approval`),
                    collection: t(`${c}.filters.facet.collection`),
                    term: t(`${c}.filters.facet.term`),
                    locale: t(`${c}.filters.facet.locale`),
                  },
                  selected: (facet, count) => t(`${c}.filters.selected`, { facet, count }),
                  clear: t(`${c}.filters.clear`),
                  view: currentView ? t(`${c}.filters.view`) : t(`${c}.views.custom`),
                  builtinViews: t(`${c}.filters.builtinViews`),
                  savedViews: t(`${c}.filters.savedViews`),
                  saveView: t(`${c}.filters.saveView`),
                }}
                views={views}
                view={currentView}
                onViewChange={chooseView}
                onSaveView={() => setSaveOpen(true)}
              />
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <CalendarNav
              className="flex-1"
              rangeLabel={rangeLabel}
              onPrevious={() => setMonth(stepMonth(month, -1))}
              onNext={() => setMonth(stepMonth(month, 1))}
              onToday={() => setSearch({ date: undefined, v: week ? undefined : search.v })}
              todayShown={month === today.slice(0, 7)}
              view={view}
              onViewChange={setView}
              goTo={
                <GoToDate
                  t={t}
                  locale={locale}
                  today={today}
                  open={goToOpen}
                  onOpenChange={setGoToOpen}
                  onPick={(day) => {
                    setSelectedDay(day);
                    setSearch({ date: day.slice(0, 7), v: undefined });
                  }}
                />
              }
              labels={{
                group: t(`${c}.nav.group`),
                previous: t(`${c}.nav.previous`),
                next: t(`${c}.nav.next`),
                today: t(`${c}.nav.today`),
                view: t(`${c}.nav.view`),
                views: { agenda: t(`${c}.nav.views.agenda`), month: t(`${c}.nav.views.month`) },
                viewHint: t(`${c}.nav.viewHint`),
              }}
            />
          </div>
          <TimezoneNote
            label={zoneNote}
            detail={zoneDetail}
            {...(viewer !== zone.timeZone
              ? {
                  toggle: {
                    label: t(`${c}.zone.showMine`),
                    checked: mine,
                    onCheckedChange: setMine,
                  },
                }
              : {})}
          />
        </div>
        {/* The agenda's day headings stick under the top bar: the card must not clip them. */}
        <LayerCard
          className={view === "agenda" ? "overflow-visible p-0" : "p-0"}
          data-testid="calendar"
          data-view={view}
        >
          {view === "agenda" ? (
            <AgendaList
              entries={visible}
              today={today}
              now={now}
              locale={locale}
              timeZone={displayZone}
              hourCycle={zone.hourCycle}
              words={words}
              loading={calendar.isPending}
              hasMore={calendar.hasNextPage}
              loadingMore={calendar.isFetchingNextPage}
              onLoadMore={() => void calendar.fetchNextPage()}
              renderActions={renderActions}
              renderOrigin={renderOrigin}
              renderMeta={(e) => {
                const r = e.id.startsWith("rel_") ? byId.get(e.id) : undefined;
                const overlaps = items.find((i) => i.id === e.id)?.overlaps?.length ?? 0;
                const reduction = reductionMode(r);
                if (!r && overlaps === 0) return null;
                return (
                  <>
                    {reduction && <ReductionBadge mode={reduction} />}
                    {r?.title && r.items.length > 1 && (
                      <Badge variant="outline">{itemsLabel(t, r.items.length)}</Badge>
                    )}
                    {overlaps > 0 && (
                      <Tooltip content={t("schedules.release.items.overlapHint")}>
                        <Badge variant="warning">
                          {overlaps === 1
                            ? t("schedules.calendar.overlapOne")
                            : t("schedules.calendar.overlap", { count: overlaps })}
                        </Badge>
                      </Tooltip>
                    )}
                  </>
                );
              }}
              labels={{
                list: t(`${c}.agenda.list`),
                now: t(`${c}.agenda.now`),
                doneToday: (n) =>
                  n === 1
                    ? t(`${c}.agenda.doneTodayOne`)
                    : t(`${c}.agenda.doneToday`, { count: n }),
                moreRuns: (n) =>
                  n === 1 ? t(`${c}.agenda.moreRunsOne`) : t(`${c}.agenda.moreRuns`, { count: n }),
                loadMore: t(`${c}.agenda.loadMore`),
                loading: t(`${c}.agenda.loading`),
                emptyTitle: filtered ? t(`${c}.agenda.filteredTitle`) : t(`${c}.agenda.emptyTitle`),
                emptyDescription: filtered
                  ? t(`${c}.agenda.filteredDescription`)
                  : t(`${c}.agenda.emptyDescription`),
              }}
              emptyContents={
                filtered ? (
                  <Button variant="secondary" onClick={() => chooseView("all")}>
                    {t(`${c}.filters.clear`)}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setSearch({ new: "publish" })}>
                    {t("schedules.newSchedule.publish")}
                  </Button>
                )
              }
            />
          ) : (
            <div className="px-3 py-3 sm:px-4">
              <CalendarMonth
                month={month}
                today={today}
                entries={visible}
                locale={locale}
                timeZone={displayZone}
                weekStartsOn={zone.weekStartsOn}
                words={words}
                hourCycle={zone.hourCycle}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onMonthChange={(m, day) => {
                  setSelectedDay(day);
                  setMonth(m);
                }}
                onOpenEntry={(e) => {
                  if (e.href) {
                    const [path, query = ""] = e.href.split("?");
                    void navigate({
                      to: path as "/",
                      ...(query
                        ? { search: Object.fromEntries(new URLSearchParams(query)) as never }
                        : {}),
                    });
                  }
                }}
                {...(canWrite
                  ? {
                      onMove: (m: { entry: ScheduleEntry; toDay: string }) =>
                        moveEntry(m.entry, m.toDay),
                    }
                  : {})}
                renderActions={renderActions}
                renderOrigin={renderOrigin}
                announcement={announcement}
                labels={{
                  instructions: t(`${c}.month.instructions`),
                  day: ({ date, today: isToday, entries: list }) =>
                    [
                      date,
                      isToday ? t(`${c}.month.today`) : undefined,
                      list.length === 0
                        ? t(`${c}.month.noItems`)
                        : `${list.length === 1 ? t(`${c}.month.itemsOne`) : t(`${c}.month.items`, { count: list.length })}: ${kindPlural(list)}`,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  more: (n) => t(`${c}.month.more`, { count: n }),
                  emptyDay: t(`${c}.month.emptyDay`),
                }}
              />
            </div>
          )}
        </LayerCard>
      </>
    );
  })();

  return (
    <PageLayout
      crumbs={header.crumbs}
      icon={header.icon}
      title={header.title}
      description={header.description}
      tabs={header.tabs}
      tab={header.tab}
      onTabChange={header.onTabChange}
      actions={
        <>
          {/* Shortcuts need a keyboard: the button is for wider screens (`?` works everywhere). */}
          <span className="hidden md:flex">
            <Tooltip content={t("schedules.shortcuts.title")}>
              <Button
                variant="secondary"
                shape="square"
                icon={<Keyboard />}
                aria-label={t("schedules.shortcuts.title")}
                onClick={() => setHelpOpen(true)}
              />
            </Tooltip>
          </span>
          <NewScheduleButton onNew={header.onNew} />
        </>
      }
      aside={
        // The month grid takes the whole width; the aside goes with the agenda.
        read.allowed && !missing && view === "agenda" ? (
          <CalendarAside
            siteId={siteId}
            t={t}
            requests={waiting}
            onApprove={(r) => setDeciding(r)}
          />
        ) : undefined
      }
    >
      {body}
      {move.element}
      <ScheduleDialog
        siteId={siteId}
        open={search.new === "publish" || search.new === "release"}
        onOpenChange={(open) => {
          if (!open) setSearch({ new: undefined });
        }}
        mode={search.new === "release" ? "release" : "publish"}
      />
      <ApprovalDialog
        open={deciding !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeciding(undefined);
        }}
        title={t("schedules.actions.approveTitle", { title: deciding?.title ?? "" })}
        description={
          deciding?.at
            ? t("schedules.actions.approveDescription", {
                time: formatWhen(deciding.at, locale, zone.timeZone),
              })
            : t("schedules.actions.approveOnApproval")
        }
        confirmLabel={t("schedules.actions.approve")}
        cancelLabel={t("schedules.move.cancel")}
        busy={decide.isPending}
        onConfirm={async () => {
          if (!deciding) return;
          await decide.mutateAsync({ ...deciding, decision: "approve" }).catch(() => undefined);
          setDeciding(undefined);
        }}
      />
      <ApprovalDialog
        open={publishing !== undefined}
        onOpenChange={(open) => {
          if (!open) setPublishing(undefined);
        }}
        title={t("schedules.release.publishNow.title")}
        description={t("schedules.release.publishNow.description")}
        confirmLabel={t("schedules.release.publishNow.confirm")}
        cancelLabel={t("schedules.move.cancel")}
        busy={mutations.publishNow.isPending}
        onConfirm={async () => {
          if (!publishing) return;
          await mutations.publishNow.mutateAsync(publishing).catch(() => undefined);
          setPublishing(undefined);
        }}
      />
      <ShortcutsDialog t={t} open={helpOpen} onOpenChange={setHelpOpen} />
      <SaveViewDialog
        t={t}
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={(label) => {
          const view: SavedView = { id: Date.now().toString(36), label, filters };
          const next = [...saved, view];
          setSaved(next);
          writeSavedViews(next);
          setSaveOpen(false);
          setSearch({ v: `saved:${view.id}` });
        }}
      />
    </PageLayout>
  );
}

/** A row's trailing actions: Deny / Approve while it waits for the person; ⋯ otherwise. */
function EntryActions({
  t,
  siteId,
  entry,
  release,
  request,
  onMove,
  onApprove,
  onDeny,
  onUnschedule,
  onPublishNow,
  busy,
}: {
  t: ST;
  siteId: string;
  entry: ScheduleEntry;
  release: ReleaseView | undefined;
  request: Approval | undefined;
  onMove: () => void;
  onApprove: () => void;
  onDeny: () => void;
  onUnschedule: () => void;
  onPublishNow: () => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const abilities = useReleaseAbilities(release);
  const state = entry.status.state;
  const a = "schedules.actions" as const;
  const decide = request && request.canDecide !== false;
  return (
    <span className="flex items-center gap-1.5">
      {decide && (
        <>
          <Button size="sm" variant="secondary" icon={<X />} onClick={onDeny} disabled={busy}>
            {t(`${a}.deny`)}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<CheckCircle />}
            onClick={onApprove}
            disabled={busy}
          >
            {t(`${a}.approve`)}
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              size="sm"
              variant="ghost"
              shape="square"
              icon={<DotsThree weight="bold" />}
              aria-label={t(`${a}.menu`, { title: entry.title })}
            />
          }
        />
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item
            onClick={() =>
              void navigate({
                to: "/sites/$siteId/schedules/releases/$releaseId",
                params: { siteId, releaseId: entry.id },
              })
            }
          >
            {t(`${a}.open`)}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={!entry.movable || !abilities.write}
            onClick={onMove}
            data-move=""
          >
            {t(`${a}.moveTo`)}
          </DropdownMenu.Item>
          {(state === "scheduled" || state === "missed" || state === "expired") && (
            <DropdownMenu.Item disabled={!abilities.approve} onClick={onPublishNow}>
              {t(`${a}.publishNow`)}
            </DropdownMenu.Item>
          )}
          {(state === "scheduled" || state === "awaiting_approval") && (
            <DropdownMenu.Item disabled={!abilities.write} onClick={onUnschedule}>
              {t(`${a}.unschedule`)}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu>
    </span>
  );
}
