import type { Automation, ScheduleRun } from "@cloudhal/core-contracts";
import {
  ActorBadge,
  Badge,
  Banner,
  Button,
  DeleteResource,
  DropdownMenu,
  Empty,
  LayerCard,
  PageLayout,
  ScheduleStatusBadge,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { DotsThree, Info, Robot } from "@phosphor-icons/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ModeBadge } from "../components/AgentModes.tsx";
import { AutomationDialog } from "../components/AutomationDialog.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import {
  NewScheduleButton,
  SchedulesBanners,
  scheduleKeys,
  schedulesMissing,
  useSchedulesHeader,
  useScheduleWords,
  useSiteZone,
} from "../components/Schedules.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { api, errorCode } from "../lib/api.ts";
import { formatWhen, zoneLabel } from "../lib/schedules.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { type AutomationsSearch, validateSchedulesSearch } from "../lib/schedules-search.ts";

const ROUTE = "/sites/$siteId/schedules/automations" as const;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Site › Automation › Schedules › Automations (RFC-0008 §15.1, §11; DESIGN.md §2x): the site's
 * built-in jobs and agent tasks — what runs, as whom, when (in words, from the server's rule
 * preview), the next and the last run, an On switch (pause / resume), and a menu with Run now,
 * Edit, History, Duplicate and Delete. People create and change them; agents only pause their own.
 */
export function AutomationsPage() {
  const { t, locale, words } = useScheduleWords();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search: AutomationsSearch = validateSchedulesSearch(useSearch({ from: ROUTE }));
  const navigate = useNavigate();
  const header = useSchedulesHeader(siteId, "automations");
  const zone = useSiteZone(siteId);
  const qc = useQueryClient();
  const toast = useToast();
  const read = useGate("schedules.read");
  const manage = useGate("automations.manage");
  const [text, setText] = useState("");
  const [copyOf, setCopyOf] = useState<Automation | undefined>();
  const [deleting, setDeleting] = useState<Automation | undefined>();
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const list = useQuery({
    queryKey: scheduleKeys.automations(siteId),
    queryFn: () => schedulesApi.automations.list(siteId),
    enabled: read.allowed,
    retry: (count, error) => !schedulesMissing(error) && count < 1,
  });
  const runs = useQuery({
    queryKey: [...scheduleKeys.runs(siteId), "recent"],
    queryFn: () => schedulesApi.runs.list(siteId),
    enabled: read.allowed && (list.data?.length ?? 0) > 0,
    retry: false,
  });
  const automations = list.data ?? [];
  // "When" in words: the server renders each rule in the Studio language (one implementation, §9.4).
  const sentences = useQueries({
    queries: automations.map((a) => ({
      queryKey: [
        ...scheduleKeys.all(siteId),
        "preview-rule",
        a.recurrence.start,
        a.recurrence.rule ?? "",
        a.recurrence.timeZone,
        locale,
      ],
      queryFn: () =>
        schedulesApi.automations.previewRule(siteId, {
          start: a.recurrence.start,
          timeZone: a.recurrence.timeZone,
          ...(a.recurrence.rule ? { rule: a.recurrence.rule } : {}),
          locale,
        }),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const lastRun = new Map<string, ScheduleRun>();
  for (const run of runs.data?.runs ?? [])
    if (run.subject.kind === "automation" && !lastRun.has(run.subject.automationId))
      lastRun.set(run.subject.automationId, run);

  const refresh = () => qc.invalidateQueries({ queryKey: scheduleKeys.all(siteId) });
  const toggle = useMutation({
    mutationFn: (input: { automation: Automation; on: boolean }) =>
      input.on
        ? schedulesApi.automations.resume(siteId, input.automation.id, input.automation.rev)
        : schedulesApi.automations.pause(siteId, input.automation.id, input.automation.rev),
    onSuccess: async (a, input) => {
      await refresh();
      toast.success(
        input.on
          ? t("schedules.automations.resumed", { name: a.name })
          : t("schedules.automations.paused", { name: a.name }),
      );
    },
    onError: async (e) => {
      await refresh();
      toast.error(t("schedules.actions.failed"), message(e));
    },
  });
  const runNow = useMutation({
    mutationFn: (a: Automation) => schedulesApi.automations.runNow(siteId, a.id),
    onSuccess: async (r, a) => {
      await refresh();
      toast.success(
        r.window
          ? t("schedules.automations.ranNow", {
              name: a.name,
              time: formatWhen(r.window.closesAt, locale, zone.timeZone),
            })
          : t("schedules.automations.ranNowBuiltin", { name: a.name }),
      );
    },
    onError: (e, a) =>
      toast.error(
        t("schedules.actions.failed"),
        errorCode(e) === "conflict"
          ? t("schedules.automations.runConflict", { name: a.name })
          : message(e),
      ),
  });
  const remove = useMutation({
    mutationFn: (a: Automation) => schedulesApi.automations.remove(siteId, a.id, a.rev),
    onSuccess: async () => {
      setDeleting(undefined);
      await refresh();
      toast.success(t("schedules.automations.deleted"));
    },
  });

  const editing = search.edit ? automations.find((a) => a.id === search.edit) : undefined;
  const dialogOpen = search.new === "1" || editing !== undefined || copyOf !== undefined;
  const closeDialog = () => {
    setCopyOf(undefined);
    void navigate({ to: ROUTE, params: { siteId }, search: {} });
  };

  const q = text.trim().toLocaleLowerCase(locale);
  const visible = automations.filter(
    (a) =>
      !q ||
      a.name.toLocaleLowerCase(locale).includes(q) ||
      (a.job.kind === "builtin" &&
        t(`schedules.automations.builtins.${a.job.builtin}.name`)
          .toLocaleLowerCase(locale)
          .includes(q)),
  );
  const missing = schedulesMissing(list.error);
  const off = instance.data?.features.schedules?.automations === false;
  const col = "schedules.automations.columns" as const;

  const body = (() => {
    if (!read.allowed)
      return (
        <Empty
          icon={<Robot size={48} />}
          title={t("schedules.noAccess")}
          description={read.reason}
        />
      );
    if (missing)
      return (
        <Empty
          icon={<Robot size={48} />}
          title={t("schedules.unavailable.title")}
          description={t("schedules.unavailable.description")}
        />
      );
    return (
      <>
        <SchedulesBanners siteId={siteId} />
        {off && (
          <Banner
            variant="secondary"
            icon={<Info weight="fill" />}
            description={t("schedules.automations.unavailable")}
          />
        )}
        <ListToolbar
          search={text}
          onSearch={setText}
          placeholder={t("schedules.automations.search")}
        />
        {list.data && visible.length === 0 ? (
          <Empty
            icon={<Robot size={48} />}
            title={t("schedules.automations.empty.title")}
            description={t("schedules.automations.empty.description")}
            contents={
              <Button
                variant="secondary"
                disabled={!manage.allowed}
                title={manage.reason}
                onClick={() =>
                  void navigate({ to: ROUTE, params: { siteId }, search: { new: "1" } })
                }
              >
                {t("schedules.automations.new")}
              </Button>
            }
          />
        ) : (
          <LayerCard className="overflow-x-auto p-0" data-testid="automations">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t(`${col}.name`)}</Table.Head>
                  <Table.Head>{t(`${col}.agent`)}</Table.Head>
                  <Table.Head>{t(`${col}.when`)}</Table.Head>
                  <Table.Head>{t(`${col}.next`)}</Table.Head>
                  <Table.Head>{t(`${col}.last`)}</Table.Head>
                  <Table.Head>{t(`${col}.on`)}</Table.Head>
                  <Table.Head sticky="right">
                    <span className="sr-only">{t(`${col}.menu`)}</span>
                  </Table.Head>
                </Table.Row>
              </Table.Header>
              {list.isPending ? (
                <TableSkeleton columns={7} />
              ) : (
                <Table.Body>
                  {visible.map((a) => {
                    const i = automations.indexOf(a);
                    const sentence = sentences[i]?.data?.text;
                    const last = lastRun.get(a.id);
                    const on = a.state === "active";
                    const canToggle =
                      a.state === "active" || a.state === "paused" || a.state === "auto-paused";
                    return (
                      <Table.Row key={a.id} data-automation={a.id}>
                        <Table.Cell>
                          <div className="grid min-w-0 gap-1">
                            <Text bold truncate>
                              {a.name}
                            </Text>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline">
                                {a.job.kind === "builtin"
                                  ? t(`schedules.automations.builtins.${a.job.builtin}.name`)
                                  : t("schedules.automations.job.agentTask")}
                              </Badge>
                              {a.state !== "active" && (
                                <Tooltip
                                  content={
                                    a.pausedReason
                                      ? t(`schedules.automations.pausedReason.${a.pausedReason}`)
                                      : words.status.automation[a.state]
                                  }
                                >
                                  <ScheduleStatusBadge
                                    status={{ subject: "automation", state: a.state }}
                                    words={words}
                                  />
                                </Tooltip>
                              )}
                            </span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          {a.job.kind === "agent-task" ? (
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <ActorBadge
                                kind="agent"
                                label={t("schedules.calendar.filters.origin.agent")}
                              />
                              <ModeBadge mode={a.job.modeCap} subtle />
                            </span>
                          ) : (
                            <ActorBadge
                              kind="system"
                              label={t("schedules.automations.scheduler")}
                            />
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <Tooltip
                            content={`${a.recurrence.rule ?? a.recurrence.start} · ${zoneLabel(a.recurrence.timeZone)}`}
                          >
                            <Text as="span">{sentence ?? "…"}</Text>
                          </Tooltip>
                        </Table.Cell>
                        <Table.Cell>
                          {a.nextRunAt && on ? (
                            <RelativeTime iso={a.nextRunAt} />
                          ) : (
                            <Text variant="secondary" size="sm" as="span">
                              {t("schedules.automations.noNext")}
                            </Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          {last ? (
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <ScheduleStatusBadge
                                status={{ subject: "run", state: last.state }}
                                words={words}
                              />
                              <RelativeTime iso={last.endedAt ?? last.occurrenceAt} />
                            </span>
                          ) : (
                            <Text variant="secondary" size="sm" as="span">
                              {t("schedules.automations.never")}
                            </Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <Switch
                            aria-label={t("schedules.automations.pause", { name: a.name })}
                            checked={on}
                            disabled={!manage.allowed || !canToggle || toggle.isPending}
                            title={manage.reason}
                            onCheckedChange={(next: boolean) =>
                              toggle.mutate({ automation: a, on: next })
                            }
                          />
                        </Table.Cell>
                        <Table.Cell sticky="right">
                          <DropdownMenu>
                            <DropdownMenu.Trigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  shape="square"
                                  icon={<DotsThree weight="bold" />}
                                  aria-label={t("schedules.automations.menu.label", {
                                    name: a.name,
                                  })}
                                />
                              }
                            />
                            <DropdownMenu.Content align="end">
                              <DropdownMenu.Item
                                disabled={!manage.allowed || !on}
                                title={manage.reason}
                                onClick={() => runNow.mutate(a)}
                              >
                                {t("schedules.automations.menu.runNow")}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                disabled={!manage.allowed}
                                title={manage.reason}
                                onClick={() =>
                                  void navigate({
                                    to: ROUTE,
                                    params: { siteId },
                                    search: { edit: a.id },
                                  })
                                }
                              >
                                {t("schedules.automations.menu.edit")}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onClick={() =>
                                  void navigate({
                                    to: "/sites/$siteId/schedules/history",
                                    params: { siteId },
                                    search: { automation: a.id },
                                  })
                                }
                              >
                                {t("schedules.automations.menu.history")}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                disabled={!manage.allowed}
                                title={manage.reason}
                                onClick={() => setCopyOf(a)}
                              >
                                {t("schedules.automations.menu.duplicate")}
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                variant="danger"
                                disabled={!manage.allowed}
                                title={manage.reason}
                                onClick={() => {
                                  remove.reset();
                                  setDeleting(a);
                                }}
                              >
                                {t("schedules.automations.menu.delete")}
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        )}
        <Text variant="secondary" size="sm">
          {t("schedules.automations.peopleOnly")}
        </Text>
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
      <AutomationDialog
        siteId={siteId}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        automation={editing}
        copyOf={copyOf}
      />
      <DeleteResource
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        resourceType={t("schedules.automations.deleteType")}
        resourceName={deleting?.name ?? ""}
        notice={
          <Banner
            variant="alert"
            icon={<Info weight="fill" />}
            description={t("schedules.automations.deleteNotice")}
          />
        }
        isDeleting={remove.isPending}
        errorMessage={remove.error ? message(remove.error) : undefined}
        onDelete={async () => {
          if (deleting) await remove.mutateAsync(deleting).catch(() => undefined);
        }}
      />
    </PageLayout>
  );
}
