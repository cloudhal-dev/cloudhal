import type { ScheduleRun, ScheduleRunState } from "@cloudhal/core-contracts";
import {
  ActorBadge,
  Button,
  Empty,
  LayerCard,
  LinkButton,
  PageLayout,
  RefreshButton,
  SCHEDULE_RUN_STATES,
  ScheduleRunHeader,
  ScheduleRunRow,
  type ScheduleRunRowData,
  Select,
  Table,
  Text,
  Toolbar,
} from "@cloudhal/ui";
import { ClockCounterClockwise, GitDiff, ListMagnifyingGlass } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { ScheduleRunDialog } from "../components/ScheduleRunDialog.tsx";
import {
  itemsLabel,
  NewScheduleButton,
  SchedulesBanners,
  scheduleKeys,
  schedulesMissing,
  useSchedulesHeader,
  useScheduleWords,
  useSiteZone,
} from "../components/Schedules.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useGate } from "../components/useMe.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { type HistorySearch, validateSchedulesSearch } from "../lib/schedules-search.ts";

const ROUTE = "/sites/$siteId/schedules/history" as const;
type KindFilter = "all" | "release" | "builtin" | "agent-task";
type OriginFilter = "all" | "scheduler" | "person";

const kindOf = (run: ScheduleRun): Exclude<KindFilter, "all"> =>
  run.subject.kind === "release" ? "release" : run.subject.job;

/**
 * Site › Automation › Schedules › History (RFC-0008 §15.1, §11.7; DESIGN.md §2x): every run of a
 * release or an automation, newest first — the state and the outcome apart ("ran" is not "did
 * something"), lateness, budget use, the taint marker, and links to the snapshot and the activity.
 * Filters by state, kind and who started it live in the URL; paging is a cursor ("Load more").
 */
export function ScheduleHistoryPage() {
  const { t, locale, words } = useScheduleWords();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search: HistorySearch = validateSchedulesSearch(useSearch({ from: ROUTE }));
  const navigate = useNavigate();
  const header = useSchedulesHeader(siteId, "history");
  const zone = useSiteZone(siteId);
  const read = useGate("schedules.read");
  const [text, setText] = useState("");
  const [openRun, setOpenRun] = useState<{ run: ScheduleRun; title: string } | undefined>();
  const state = (SCHEDULE_RUN_STATES as readonly string[]).includes(search.state ?? "")
    ? (search.state as ScheduleRunState)
    : undefined;
  const kind: KindFilter =
    search.kind === "release" || search.kind === "builtin" || search.kind === "agent-task"
      ? search.kind
      : "all";
  const origin: OriginFilter =
    search.origin === "scheduler" || search.origin === "person" ? search.origin : "all";
  const setSearch = (patch: Partial<HistorySearch>) =>
    void navigate({
      to: ROUTE,
      params: { siteId },
      search: ((prev: HistorySearch) => {
        const next: HistorySearch = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof HistorySearch)[])
          if (next[k] === undefined) delete next[k];
        return next;
      }) as never,
    });

  const runs = useInfiniteQuery({
    queryKey: [
      ...scheduleKeys.runs(siteId),
      state ?? "",
      search.automation ?? "",
      search.release ?? "",
    ],
    queryFn: ({ pageParam }) =>
      schedulesApi.runs.list(siteId, {
        ...(state ? { state: [state] } : {}),
        ...(search.automation ? { automationId: search.automation } : {}),
        ...(search.release ? { releaseId: search.release } : {}),
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: read.allowed,
    retry: (count, error) => !schedulesMissing(error) && count < 1,
  });
  const releases = useQuery({
    queryKey: scheduleKeys.releases(siteId),
    queryFn: () => schedulesApi.releases.list(siteId),
    enabled: read.allowed,
    retry: false,
  });
  const automations = useQuery({
    queryKey: scheduleKeys.automations(siteId),
    queryFn: () => schedulesApi.automations.list(siteId),
    enabled: read.allowed,
    retry: false,
  });
  const releaseById = new Map((releases.data ?? []).map((r) => [r.id, r]));
  const automationById = new Map((automations.data ?? []).map((a) => [a.id, a]));

  const loaded = (runs.data?.pages ?? []).flatMap((p) => p.runs);
  const rowOf = (run: ScheduleRun): ScheduleRunRowData => {
    const subject = run.subject;
    const release = subject.kind === "release" ? releaseById.get(subject.releaseId) : undefined;
    const automation =
      subject.kind === "automation" ? automationById.get(subject.automationId) : undefined;
    const title =
      subject.kind === "release"
        ? (release?.title ??
          (release ? itemsLabel(t, release.items.length) : t("schedules.history.unknown")))
        : (automation?.name ?? t("schedules.history.unknown"));
    const budget =
      automation?.job.kind === "agent-task"
        ? {
            maxToolCalls: automation.job.budget.maxToolCalls,
            maxWrites: automation.job.budget.maxWrites,
            maxApprovalRequests: automation.job.budget.maxApprovalRequests,
          }
        : undefined;
    return {
      id: run.id,
      at: run.startedAt ?? run.occurrenceAt,
      subject: subject.kind,
      ...(subject.kind === "automation" ? { job: subject.job } : {}),
      title,
      href:
        subject.kind === "release"
          ? `/sites/${siteId}/schedules/releases/${subject.releaseId}`
          : `/sites/${siteId}/schedules/automations?edit=${subject.automationId}`,
      state: run.state,
      outcome: run.outcome,
      trigger: run.trigger,
      latenessSeconds: run.latenessSeconds,
      adjusted: run.adjusted,
      usage: run.usage,
      budget,
      taint: run.taint,
    };
  };
  const q = text.trim().toLocaleLowerCase(locale);
  const rows = loaded
    .filter((r) => kind === "all" || kindOf(r) === kind)
    .filter((r) =>
      origin === "all"
        ? true
        : origin === "person"
          ? r.trigger === "manual"
          : r.trigger !== "manual",
    )
    .map((run) => ({ run, row: rowOf(run) }))
    .filter(({ row }) => !q || row.title.toLocaleLowerCase(locale).includes(q));
  const filtered = !!state || kind !== "all" || origin !== "all" || !!q;
  const missing = schedulesMissing(runs.error);
  const forAutomation = search.automation ? automationById.get(search.automation) : undefined;
  const h = "schedules.history" as const;

  const snapshotOf = (run: ScheduleRun) => {
    if (run.subject.kind !== "release") return undefined;
    const outcome = releaseById.get(run.subject.releaseId)?.outcome;
    return outcome?.kind === "published" && outcome.runId === run.id
      ? outcome.snapshotId
      : undefined;
  };

  const body = (() => {
    if (!read.allowed)
      return (
        <Empty
          icon={<ClockCounterClockwise size={48} />}
          title={t("schedules.noAccess")}
          description={read.reason}
        />
      );
    if (missing)
      return (
        <Empty
          icon={<ClockCounterClockwise size={48} />}
          title={t("schedules.unavailable.title")}
          description={t("schedules.unavailable.description")}
        />
      );
    return (
      <>
        <SchedulesBanners siteId={siteId} />
        {forAutomation && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text bold>{t(`${h}.forAutomation`, { name: forAutomation.name })}</Text>
            <Button variant="ghost" onClick={() => setSearch({ automation: undefined })}>
              {t(`${h}.showAll`)}
            </Button>
          </div>
        )}
        <ListToolbar
          search={text}
          onSearch={setText}
          placeholder={t(`${h}.search`)}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {filtered && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setText("");
                    setSearch({ state: undefined, kind: undefined, origin: undefined });
                  }}
                >
                  {t(`${h}.filters.clear`)}
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Toolbar aria-label={t(`${h}.filters.toolbar`)}>
                  <Select
                    aria-label={t(`${h}.filters.state`)}
                    value={state ?? "all"}
                    onValueChange={(v) => setSearch({ state: v === "all" ? undefined : String(v) })}
                    items={{
                      all: t(`${h}.filters.allStates`),
                      ...Object.fromEntries(
                        SCHEDULE_RUN_STATES.map((s) => [s, words.status.run[s]]),
                      ),
                    }}
                    render={<Toolbar.Button />}
                  />
                  <Select
                    aria-label={t(`${h}.filters.kind`)}
                    value={kind}
                    onValueChange={(v) => setSearch({ kind: v === "all" ? undefined : String(v) })}
                    items={{
                      all: t(`${h}.filters.allKinds`),
                      release: t(`${h}.filters.kinds.release`),
                      builtin: t(`${h}.filters.kinds.builtin`),
                      "agent-task": t(`${h}.filters.kinds.agent-task`),
                    }}
                    render={<Toolbar.Button />}
                  />
                  <Select
                    aria-label={t(`${h}.filters.origin`)}
                    value={origin}
                    onValueChange={(v) =>
                      setSearch({ origin: v === "all" ? undefined : String(v) })
                    }
                    items={{
                      all: t(`${h}.filters.allOrigins`),
                      scheduler: t(`${h}.filters.origins.scheduler`),
                      person: t(`${h}.filters.origins.person`),
                    }}
                    render={<Toolbar.Button />}
                  />
                </Toolbar>
                <RefreshButton
                  variant="secondary"
                  aria-label={t("schedules.history.title")}
                  loading={runs.isRefetching && !runs.isFetchingNextPage}
                  onClick={() => void runs.refetch()}
                />
              </div>
            </div>
          }
        />
        {runs.isSuccess && rows.length === 0 ? (
          <Empty
            icon={<ClockCounterClockwise size={48} />}
            title={filtered ? t(`${h}.filtered.title`) : t(`${h}.empty.title`)}
            description={filtered ? t(`${h}.filtered.description`) : t(`${h}.empty.description`)}
          />
        ) : (
          <LayerCard className="overflow-x-auto p-0" data-testid="runs">
            <Table>
              <Table.Header>
                <ScheduleRunHeader
                  labels={{
                    time: t(`${h}.columns.time`),
                    kind: t(`${h}.columns.kind`),
                    subject: t(`${h}.columns.subject`),
                    origin: t(`${h}.columns.origin`),
                    state: t(`${h}.columns.state`),
                    outcome: t(`${h}.columns.outcome`),
                    lateness: t(`${h}.columns.lateness`),
                    usage: t(`${h}.columns.usage`),
                    links: t(`${h}.columns.links`),
                  }}
                />
              </Table.Header>
              {runs.isPending ? (
                <TableSkeleton columns={9} />
              ) : (
                <Table.Body>
                  {rows.map(({ run, row }) => {
                    const snapshot = snapshotOf(run);
                    return (
                      <ScheduleRunRow
                        key={run.id}
                        run={row}
                        words={words}
                        locale={locale}
                        timeZone={zone.timeZone}
                        hourCycle={zone.hourCycle}
                        origin={
                          run.trigger === "manual" ? (
                            <ActorBadge kind="human" label={t("activity.kinds.human")} />
                          ) : (
                            <ActorBadge kind="system" label={t(`${h}.scheduler`)} />
                          )
                        }
                        actions={
                          <span className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<ListMagnifyingGlass />}
                              onClick={() => setOpenRun({ run, title: row.title })}
                              data-run-details={run.id}
                            >
                              {t(`${h}.details`)}
                            </Button>
                            {snapshot && (
                              <LinkButton
                                href={`/sites/${siteId}/snapshots?diff=${snapshot}`}
                                variant="ghost"
                                size="sm"
                                icon={GitDiff}
                              >
                                {t(`${h}.snapshot`)}
                              </LinkButton>
                            )}
                            <LinkButton
                              href={`/sites/${siteId}/activity`}
                              variant="ghost"
                              size="sm"
                            >
                              {t(`${h}.activity`)}
                            </LinkButton>
                          </span>
                        }
                        labels={{
                          subject: {
                            release: t(`${h}.row.subject.release`),
                            builtin: t(`${h}.row.subject.builtin`),
                            agentTask: t(`${h}.row.subject.agentTask`),
                          },
                          trigger: {
                            cron: t(`${h}.row.trigger.cron`),
                            alarm: t(`${h}.row.trigger.alarm`),
                            request: t(`${h}.row.trigger.request`),
                            node: t(`${h}.row.trigger.node`),
                            manual: t(`${h}.row.trigger.manual`),
                          },
                          outcome: {
                            "did-work": t(`${h}.row.outcome.did-work`),
                            "nothing-to-do": t(`${h}.row.outcome.nothing-to-do`),
                            proposed: t(`${h}.row.outcome.proposed`),
                            "waiting-approval": t(`${h}.row.outcome.waiting-approval`),
                          },
                          onTime: t(`${h}.row.onTime`),
                          late: (d) => t(`${h}.row.late`, { duration: d }),
                          adjusted: {
                            "dst-gap": t(`${h}.row.adjusted.dst-gap`),
                            tzdata: t(`${h}.row.adjusted.tzdata`),
                          },
                          usage: (p) => t(`${h}.row.usage`, p),
                          overBudget: t(`${h}.row.overBudget`),
                          taint: t(`${h}.row.taint`),
                          taintHint: (tool, time) => t(`${h}.row.taintHint`, { tool, time }),
                          none: t(`${h}.row.none`),
                        }}
                      />
                    );
                  })}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        )}
        {runs.isSuccess && loaded.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text variant="secondary" size="sm">
              {t(`${h}.showing`, { count: rows.length })}
            </Text>
            {runs.hasNextPage ? (
              <Button
                variant="secondary"
                loading={runs.isFetchingNextPage}
                onClick={() => void runs.fetchNextPage()}
              >
                {t(`${h}.loadMore`)}
              </Button>
            ) : (
              <Text variant="secondary" size="sm">
                {t(`${h}.allShown`)}
              </Text>
            )}
          </div>
        )}
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
      actions={<NewScheduleButton onNew={header.onNew} />}
    >
      {body}
      <ScheduleRunDialog
        siteId={siteId}
        run={openRun?.run}
        title={openRun?.title ?? ""}
        onOpenChange={(open) => {
          if (!open) setOpenRun(undefined);
        }}
      />
    </PageLayout>
  );
}
