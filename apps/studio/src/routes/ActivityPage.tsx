import {
  Banner,
  Button,
  DirectionalIcon,
  Empty,
  LayerCard,
  Link,
  LinkButton,
  PageLayout,
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
  UserFocus,
  UsersThree,
} from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ActivityDetailDialog } from "../components/ActivityDetailDialog.tsx";
import { ActorCell, DecisionCell, Outcome, ToolCell, useToolLabel } from "../components/Audit.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useCan, useMemberRoles } from "../components/useMe.ts";
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

/** Whose trail: one site's, or the deployment's own events (members, invites; `audit:read`). */
export type ActivitySource = { kind: "site"; siteId: string } | { kind: "deployment" };

/** Infinite, newest-first audit trail (cursor = `nextBefore`). */
export function useActivity(source: ActivitySource | string, pageSize = PAGE_SIZE) {
  const s: ActivitySource = typeof source === "string" ? { kind: "site", siteId: source } : source;
  return useInfiniteQuery({
    queryKey: ["activity", s.kind === "site" ? s.siteId : "deployment", pageSize],
    queryFn: ({ pageParam }) =>
      s.kind === "site"
        ? api.activity.list(s.siteId, { limit: pageSize, before: pageParam })
        : api.activity.deployment({ limit: pageSize, before: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
}

/** Site › Activity: every tool call and policy decision (DESIGN.md §2h). */
export function ActivityPage() {
  const t = useT();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  // The list below shares this query (same key); a 404 means the server keeps no audit trail.
  const notEnabled = isNotEnabled(useActivity(siteId).error);
  // Without `audit:read` the server lists only the person's own rows and their agents' (RFC-0005).
  const seesAll = useCan("activity.all");
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.activity.title") }]} />}
      icon={<ClockCounterClockwise size={24} />}
      title={t("pageHeaders.activity.title")}
      description={t("pageHeaders.activity.description")}
    >
      {notEnabled ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("activity.notEnabledTitle")}
          description={t("activity.notEnabledDescription")}
        />
      ) : (
        <>
          {!seesAll && (
            <Banner
              variant="secondary"
              icon={<UserFocus weight="fill" />}
              title={t("activity.ownOnlyTitle")}
              description={t("activity.ownOnly")}
            />
          )}
          <ActivityList source={{ kind: "site", siteId }} />
        </>
      )}
    </PageLayout>
  );
}

/** Toolbar, table and paging of the audit trail (the server keeps one). */
export function ActivityList({ source }: { source: ActivitySource }) {
  const t = useT();
  const label = useToolLabel();
  const activity = useActivity(source);
  const roles = useMemberRoles();
  const siteId = source.kind === "site" ? source.siteId : undefined;
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER);
  const [selected, setSelected] = useState<AuditRow | undefined>();
  const loaded = useMemo(() => activity.data?.pages.flatMap((p) => p.items) ?? [], [activity.data]);
  const rows = useMemo(() => filterActivity(loaded, filter, label), [loaded, filter, label]);
  const filtered = isFiltered(filter);
  const nothingYet = activity.isSuccess && loaded.length === 0;

  return (
    <>
      <ErrorBanner
        error={activity.error}
        onRetry={() => activity.refetch()}
        retrying={activity.isRefetching}
      />
      {/* One row, one control height (Kumo default): search left; clear, filters and refresh right. */}
      <ListToolbar
        search={filter.search}
        onSearch={(search) => setFilter((f) => ({ ...f, search }))}
        placeholder={t("activity.search")}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {filtered && (
              <Button variant="ghost" onClick={() => setFilter(NO_FILTER)}>
                {t("activity.clearFilters")}
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Toolbar aria-label={t("activity.filters.label")}>
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
              <RefreshButton
                variant="secondary"
                aria-label={t("activity.refresh")}
                loading={activity.isRefetching && !activity.isFetchingNextPage}
                onClick={() => activity.refetch()}
              />
            </div>
          </div>
        }
      />
      {/* Kumo Empty is framed itself: it takes the table's place, never inside the LayerCard. */}
      {nothingYet && source.kind === "deployment" ? (
        <Empty
          icon={<UsersThree size={48} className="text-kumo-inactive" />}
          title={t("members.activity.empty")}
          description={t("members.activity.emptyDescription")}
        />
      ) : nothingYet ? (
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
      ) : activity.isSuccess && rows.length === 0 ? (
        // Filtered to nothing: in the table's place, without a header to scroll past.
        <Empty
          icon={<Funnel size={48} className="text-kumo-inactive" />}
          title={t("activity.noMatches")}
          description={t("activity.noMatchesDescription")}
          contents={
            <Button variant="secondary" onClick={() => setFilter(NO_FILTER)}>
              {t("activity.clearFilters")}
            </Button>
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
                {/* Deployment events (members, invites) run no skill and take no snapshot. */}
                {siteId && <Table.Head>{t("activity.columns.skill")}</Table.Head>}
                {siteId && <Table.Head>{t("activity.columns.snapshot")}</Table.Head>}
                <Table.Head sticky="right" />
              </Table.Row>
            </Table.Header>
            {activity.isPending ? (
              <TableSkeleton columns={siteId ? COLUMNS : COLUMNS - 2} rows={6} />
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
                      <ToolCell tool={r.tool} row={r} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <DecisionCell row={r} />
                    </Table.Cell>
                    <Table.Cell className="min-w-56 max-w-80">
                      <ActorCell
                        actor={r.actor}
                        mode={r.mode}
                        elevation={r.elevation}
                        role={roles.get(r.actor.id)}
                      />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <RelativeTime iso={r.at} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <Outcome outcome={r.outcome} />
                    </Table.Cell>
                    {siteId && (
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
                    )}
                    {siteId && (
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
                    )}
                    <Table.Cell sticky="right" className="text-end">
                      <Button
                        variant="ghost"
                        size="xs"
                        shape="square"
                        icon={<DirectionalIcon icon={CaretRight} />}
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
    </>
  );
}
