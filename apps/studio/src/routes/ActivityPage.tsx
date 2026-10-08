import {
  Banner,
  Button,
  Empty,
  LayerCard,
  Link,
  LinkButton,
  RefreshButton,
  Select,
  Table,
  Text,
  Toolbar,
} from "@cloudhal/ui";
import {
  CaretRight,
  ClockCounterClockwise,
  Funnel,
  Info,
  Key,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ActivityDetailDialog } from "../components/ActivityDetailDialog.tsx";
import { ActivityViews } from "../components/ActivityViews.tsx";
import { ActorCell, DecisionCell, Outcome, ToolCell, useToolLabel } from "../components/Audit.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useT } from "../i18n/index.tsx";
import {
  type ActivityFilter,
  type DecisionFilter,
  filterActivity,
  isFiltered,
  type KindFilter,
  NO_FILTER,
} from "../lib/activity.ts";
import { type AuditRow, api, isNotEnabled } from "../lib/api.ts";

const PAGE_SIZE = 50;
const COLUMNS = 8;

/** Infinite, newest-first audit trail for one site (cursor = `nextBefore`). */
export function useActivity(siteId: string, pageSize = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: ["activity", siteId, pageSize],
    queryFn: ({ pageParam }) => api.activity.list(siteId, { limit: pageSize, before: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
}

/** Site › Activity: every tool call and policy decision (DESIGN.md §2h). */
export function ActivityPage() {
  const t = useT();
  const label = useToolLabel();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const activity = useActivity(siteId);
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER);
  const [selected, setSelected] = useState<AuditRow | undefined>();
  const loaded = useMemo(() => activity.data?.pages.flatMap((p) => p.items) ?? [], [activity.data]);
  const rows = useMemo(() => filterActivity(loaded, filter, label), [loaded, filter, label]);
  const notEnabled = isNotEnabled(activity.error);
  const filtered = isFiltered(filter);

  if (notEnabled) {
    return (
      <div className="grid gap-6">
        <div>
          <ActivityViews siteId={siteId} value="activity" />
        </div>
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("activity.notEnabledTitle")}
          description={t("activity.notEnabledDescription")}
        />
      </div>
    );
  }

  const nothingYet = activity.isSuccess && loaded.length === 0;

  return (
    <div className="grid gap-4">
      <div>
        <ActivityViews siteId={siteId} value="activity" />
      </div>
      <ErrorBanner
        error={activity.error}
        onRetry={() => activity.refetch()}
        retrying={activity.isRefetching}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Toolbar size="sm" className="w-full max-w-sm" aria-label={t("activity.search")}>
          <Toolbar.Button icon={<MagnifyingGlass />} aria-label={t("activity.search")} />
          <Toolbar.Input
            aria-label={t("activity.search")}
            placeholder={t("activity.search")}
            value={filter.search}
            onChange={(e) =>
              setFilter((f) => ({ ...f, search: (e.target as HTMLInputElement).value }))
            }
            className="flex-1"
          />
        </Toolbar>
        <Toolbar size="sm" aria-label={t("activity.filters.kind")}>
          <Toolbar.Button icon={<Funnel />} aria-label={t("activity.filters.kind")} />
          <Select
            aria-label={t("activity.filters.kind")}
            value={filter.kind}
            onValueChange={(v) => setFilter((f) => ({ ...f, kind: v as KindFilter }))}
            items={{
              all: t("activity.filters.allKinds"),
              agent: t("activity.kinds.agent"),
              human: t("activity.kinds.human"),
              system: t("activity.kinds.system"),
            }}
            render={<Toolbar.Button />}
          />
          <Select
            aria-label={t("activity.filters.decision")}
            value={filter.decision}
            onValueChange={(v) => setFilter((f) => ({ ...f, decision: v as DecisionFilter }))}
            items={{
              all: t("activity.filters.allDecisions"),
              allow: t("activity.decisions.allow"),
              "approval-required": t("activity.decisions.approval-required"),
              deny: t("activity.decisions.deny"),
            }}
            render={<Toolbar.Button />}
          />
        </Toolbar>
        <div className="ml-auto flex items-center gap-2">
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => setFilter(NO_FILTER)}>
              {t("activity.clearFilters")}
            </Button>
          )}
          <RefreshButton
            variant="secondary"
            size="sm"
            aria-label={t("common.retry")}
            loading={activity.isRefetching && !activity.isFetchingNextPage}
            onClick={() => activity.refetch()}
          />
        </div>
      </div>
      {nothingYet ? (
        <Empty
          icon={<ClockCounterClockwise size={48} className="text-kumo-inactive" />}
          title={t("activity.empty")}
          description={t("activity.emptyDescription")}
          commandLine="cloudhal mcp"
          contents={
            <LinkButton href="/agents" variant="secondary" icon={Key}>
              {t("commands.createAgentKey")}
            </LinkButton>
          }
        />
      ) : (
        <LayerCard className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t("activity.columns.tool")}</Table.Head>
                <Table.Head>{t("activity.columns.decision")}</Table.Head>
                <Table.Head>{t("activity.columns.actor")}</Table.Head>
                <Table.Head>{t("activity.columns.when")}</Table.Head>
                <Table.Head>{t("activity.columns.outcome")}</Table.Head>
                <Table.Head>{t("activity.columns.skill")}</Table.Head>
                <Table.Head>{t("activity.columns.snapshot")}</Table.Head>
                <Table.Head sticky="right" />
              </Table.Row>
            </Table.Header>
            {activity.isPending ? (
              <TableSkeleton columns={COLUMNS} rows={6} />
            ) : rows.length === 0 ? (
              <Table.Body>
                <Table.Row>
                  <Table.Cell colSpan={COLUMNS}>
                    <Empty
                      size="sm"
                      icon={<Funnel size={32} className="text-kumo-inactive" />}
                      title={t("activity.noMatches")}
                      description={t("activity.noMatchesDescription")}
                      contents={
                        <Button variant="secondary" size="sm" onClick={() => setFilter(NO_FILTER)}>
                          {t("activity.clearFilters")}
                        </Button>
                      }
                    />
                  </Table.Cell>
                </Table.Row>
              </Table.Body>
            ) : (
              <Table.Body>
                {rows.map((r) => (
                  // Mouse users can click anywhere on the row; the trailing button is the
                  // keyboard/screen-reader path to the same dialog.
                  <Table.Row
                    key={r.id}
                    data-event-id={r.id}
                    data-decision={r.decision}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer hover:bg-kumo-tint"
                  >
                    <Table.Cell className="whitespace-nowrap">
                      <ToolCell tool={r.tool} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <DecisionCell row={r} />
                    </Table.Cell>
                    <Table.Cell className="min-w-56 max-w-80">
                      <ActorCell actor={r.actor} mode={r.mode} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <RelativeTime iso={r.at} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <Outcome outcome={r.outcome} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {r.skill ? (
                        <Text variant="mono-secondary" as="span">
                          {r.skill}
                        </Text>
                      ) : (
                        <Text variant="secondary" as="span">
                          —
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      {r.snapshotId ? (
                        // biome-ignore lint/a11y/noStaticElementInteractions: only stops the row click
                        // biome-ignore lint/a11y/useKeyWithClickEvents: the link handles keys itself
                        <span onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/sites/${siteId}/snapshots?diff=${r.snapshotId}`}
                            variant="inline"
                          >
                            <span className="font-mono text-[0.9em]">{r.snapshotId}</span>
                          </Link>
                        </span>
                      ) : (
                        <Text variant="secondary" as="span">
                          —
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell sticky="right" className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        shape="square"
                        icon={<CaretRight />}
                        aria-label={`${t("activity.viewEvent")}: ${label(r.tool)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(r);
                        }}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            )}
          </Table>
        </LayerCard>
      )}
      {!nothingYet && activity.isSuccess && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text variant="secondary" size="sm">
            {t("activity.showing", { shown: rows.length, loaded: loaded.length })}
          </Text>
          {activity.hasNextPage ? (
            <Button
              variant="secondary"
              onClick={() => activity.fetchNextPage()}
              loading={activity.isFetchingNextPage}
            >
              {t("activity.loadMore")}
            </Button>
          ) : (
            <Text variant="secondary" size="sm">
              {t("activity.allLoaded")}
            </Text>
          )}
        </div>
      )}
      <ActivityDetailDialog
        siteId={siteId}
        row={selected}
        onOpenChange={(o) => !o && setSelected(undefined)}
      />
    </div>
  );
}
