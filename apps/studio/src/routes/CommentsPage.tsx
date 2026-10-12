import {
  Banner,
  type BulkAction,
  BulkActionBar,
  Button,
  CommentFilters,
  type CommentFiltersLabels,
  type CommentFilterValue,
  CommentRow,
  commentFilterSince,
  DEFAULT_COMMENT_FILTERS,
  Empty,
  LayerCard,
  LinkButton,
  Meter,
  PageLayout,
  Pagination,
  RefreshButton,
  SectionCard,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import {
  ArrowCounterClockwise,
  ArrowRight,
  ChatsCircle,
  CheckCircle,
  ClockCountdown,
  DownloadSimple,
  EyeSlash,
  GearSix,
  Info,
  LockSimple,
  Prohibit,
  Question,
  Robot,
  Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CommentMenu,
  type CommentMenuAction,
  ConflictBanner,
  FailedBadge,
  ModerateDialog,
  plural,
  type ReasonAction,
  rowData,
  useCommentWords,
  useDeleteComment,
  useModerateComments,
} from "../components/Comments.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { SettingRow } from "../components/Settings.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate, useMe } from "../components/useMe.ts";
import { usePendingApprovals } from "../components/usePendingApprovals.ts";
import type { TFunction } from "../i18n/index.tsx";
import {
  api,
  type CommentLabelName,
  type CommentModerateAction,
  type CommentView,
  isNotEnabled,
} from "../lib/api.ts";
import {
  bulkActionsFor,
  commentsKey,
  eligibleFor,
  type ModerationError,
  matchesSearch,
  pendingCommentApprovals,
  QUEUE_PAGE_SIZE,
  QUEUE_TABS,
  type QueueTab,
  revsOf,
  touchedByAgent,
} from "../lib/comments.ts";

type T = TFunction<"comments">;

function filterLabels(
  t: T,
  words: ReturnType<typeof useCommentWords>["words"],
): CommentFiltersLabels {
  const f = "comments.filters" as const;
  return {
    toolbar: t(`${f}.toolbar`),
    facet: {
      status: t(`${f}.facet.status`),
      entry: t(`${f}.facet.entry`),
      label: t(`${f}.facet.label`),
      actor: t(`${f}.facet.actor`),
      date: t(`${f}.facet.date`),
    },
    status: {
      all: t(`${f}.status.all`),
      pending: t(`${f}.status.pending`),
      approved: t(`${f}.status.approved`),
      hidden: t(`${f}.status.hidden`),
      spam: t(`${f}.status.spam`),
      deleted: t(`${f}.status.deleted`),
      reported: t(`${f}.status.reported`),
    },
    allEntries: t(`${f}.allEntries`),
    allLabels: t(`${f}.allLabels`),
    label: words.label,
    actor: { all: t(`${f}.actor.all`), agents: t(`${f}.actor.agents`) },
    date: {
      all: t(`${f}.date.all`),
      "24h": t(`${f}.date.24h`),
      "7d": t(`${f}.date.7d`),
      "30d": t(`${f}.date.30d`),
      "90d": t(`${f}.date.90d`),
    },
    clear: t(`${f}.clear`),
  };
}

const ACTION_ICON: Record<CommentModerateAction, typeof CheckCircle> = {
  approve: CheckCircle,
  restore: ArrowCounterClockwise,
  hide: EyeSlash,
  spam: Prohibit,
  hold: ClockCountdown,
};

/** The aside: how moderation works, and today's numbers (daily cap, purges waiting). */
function QueueAside({ siteId, t }: { siteId: string; t: T }) {
  const qc = useQueryClient();
  const toast = useToast();
  const settingsGate = useGate("comments.settings");
  const exportGate = useGate("comments.moderateAny");
  const personalGate = useGate("commenters.data");
  // The export is paged on the server (D1 Free's 50 queries per request): fetch every page, save one file.
  const [exporting, setExporting] = useState<"plain" | "personal">();
  const runExport = async (personal: boolean) => {
    setExporting(personal ? "personal" : "plain");
    try {
      const blob = await api.comments.exportFile(siteId, personal);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `comments-${siteId}${personal ? "-personal" : ""}.jsonl`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(
        t(personal ? "comments.aside.exportPersonal" : "comments.aside.export"),
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setExporting(undefined);
    }
  };
  const summary = useQuery({
    queryKey: [...commentsKey(siteId), "summary", "today"],
    queryFn: () => api.comments.summary(siteId, "today"),
    retry: false,
  });
  const purge = useMutation({
    mutationFn: () => api.comments.purgeSiteCache(siteId),
    onSuccess: async () => {
      toast.success(t("comments.aside.purged"));
      await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
    },
    onError: (e) => toast.error(t("comments.aside.purgeFailed"), e.message),
  });
  const cap = summary.data?.dailyCap;
  const pendingPurges = summary.data?.purge.pending ?? 0;
  return (
    <>
      <SectionCard title={t("comments.aside.howTitle")} icon={<Question size={16} />}>
        <dl className="-my-3 divide-y divide-kumo-hairline">
          <SettingRow label={t("comments.aside.how.wait")} hint={t("comments.aside.how.waitHint")}>
            {null}
          </SettingRow>
          <SettingRow
            label={t("comments.aside.how.agents")}
            hint={t("comments.aside.how.agentsHint")}
          >
            {null}
          </SettingRow>
          <SettingRow
            label={t("comments.aside.how.reports")}
            hint={t("comments.aside.how.reportsHint")}
          >
            {null}
          </SettingRow>
        </dl>
      </SectionCard>
      <SectionCard
        title={t("comments.aside.todayTitle")}
        icon={<ClockCountdown size={16} />}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton
              href={`/sites/${siteId}/settings#comments`}
              variant="secondary"
              size="sm"
              icon={GearSix}
              disabled={!settingsGate.allowed}
              title={settingsGate.reason}
            >
              {t("comments.aside.settings")}
            </LinkButton>
            {exportGate.allowed && (
              <Button
                variant="ghost"
                size="sm"
                icon={DownloadSimple}
                loading={exporting === "plain"}
                onClick={() => void runExport(false)}
                data-testid="comments-export"
              >
                {t("comments.aside.export")}
              </Button>
            )}
            {exportGate.allowed && personalGate.allowed && (
              <Button
                variant="ghost"
                size="sm"
                icon={DownloadSimple}
                loading={exporting === "personal"}
                onClick={() => void runExport(true)}
              >
                {t("comments.aside.exportPersonal")}
              </Button>
            )}
          </div>
        }
      >
        {cap ? (
          <div className="grid gap-3" data-testid="comments-today">
            <Meter
              label={t("comments.aside.cap")}
              value={cap.used}
              max={Math.max(cap.cap, 1)}
              customValue={t("comments.aside.capValue", { used: cap.used, cap: cap.cap })}
            />
            {cap.paused && (
              <Banner
                variant="alert"
                size="sm"
                icon={<Warning weight="fill" />}
                title={t("comments.aside.paused")}
              />
            )}
            {pendingPurges > 0 && (
              <div className="grid gap-2" data-testid="comments-purging">
                <div className="grid gap-0.5">
                  <Text bold as="span">
                    {t("comments.aside.purging")}
                  </Text>
                  <Text variant="secondary" size="sm" as="span">
                    {plural(
                      t,
                      "comments.aside.purgingHint",
                      "comments.aside.purgingHintOne",
                      pendingPurges,
                    )}
                  </Text>
                </div>
                {exportGate.allowed && (
                  <span>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={purge.isPending}
                      onClick={() => purge.mutate()}
                    >
                      {t("comments.aside.purgeNow")}
                    </Button>
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-2" role="status">
            <span className="sr-only">{t("common.loading")}</span>
            <SkeletonLine minWidth={40} maxWidth={60} />
            <SkeletonLine minWidth={80} maxWidth={100} />
          </div>
        )}
      </SectionCard>
    </>
  );
}

/** Skeleton rows while a page of comments loads. */
function QueueSkeleton({ label }: { label: string }) {
  return (
    <div className="divide-y divide-kumo-hairline" data-testid="comments-loading">
      <span role="status" className="sr-only">
        {label}
      </span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} aria-hidden className="grid gap-2 px-4 py-3 sm:px-5">
          <SkeletonLine minWidth={20} maxWidth={35} />
          <SkeletonLine minWidth={60} maxWidth={95} />
          <SkeletonLine minWidth={30} maxWidth={60} />
        </div>
      ))}
    </div>
  );
}

/**
 * Site › Content › Comments (RFC-0007 §14, DESIGN.md §2w): the moderation queue. Page tabs are the
 * status (Pending · Reported · Approved · Spam · Hidden); filters narrow by article, label, agents
 * and date; rows are `CommentRow`s with a selection checkbox and a menu; while rows are selected
 * the `BulkActionBar` replaces the toolbar. Every name and text is untrusted reader text, shown as
 * plain text (`CommentText`), in the untrusted panel when it talks to an AI.
 */
export function CommentsPage() {
  const { t, locale, words } = useCommentWords();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search = useSearch({ from: "/sites/$siteId/comments" });
  const navigate = useNavigate();
  const toast = useToast();
  const known = !useMe().isPending;
  const read = useGate("comments.read");
  const moderateGate = useGate("comments.moderate");
  const tab: QueueTab = search.tab ?? "pending";
  const [filters, setFilters] = useState<CommentFilterValue>(DEFAULT_COMMENT_FILTERS);
  const [text, setText] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlyMap<string, ModerationError>>(() => new Map());
  const [dialog, setDialog] = useState<{ open: boolean; action: ReasonAction; ids: string[] }>({
    open: false,
    action: "hide",
    ids: [],
  });
  const [deleting, setDeleting] = useState<CommentView | undefined>();
  // The date filter's window starts when it is picked, so the query key stays stable.
  const since = useMemo(() => commentFilterSince(filters.date), [filters.date]);
  const cursor = cursors[page - 1];
  const list = useQuery({
    queryKey: [
      ...commentsKey(siteId),
      "list",
      tab,
      filters.entry,
      filters.label,
      since ?? "",
      cursor ?? "",
    ],
    queryFn: () =>
      api.comments.list(siteId, {
        status: tab,
        ...(filters.entry !== "all" ? { node: filters.entry } : {}),
        ...(filters.label !== "all" ? { label: filters.label as CommentLabelName } : {}),
        ...(since ? { since } : {}),
        ...(cursor ? { cursor } : {}),
        limit: QUEUE_PAGE_SIZE,
      }),
    enabled: known && read.allowed,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "posts"],
    queryFn: () => api.entries.list(siteId, "posts"),
    enabled: known && read.allowed,
  });
  const approvals = usePendingApprovals(siteId);
  const requests = pendingCommentApprovals(approvals.data);

  const resetPaging = () => {
    setCursors([undefined]);
    setPage(1);
    setSelected(new Set());
    setFailed(new Map());
  };
  const setTab = (next: string) => {
    resetPaging();
    void navigate({
      to: "/sites/$siteId/comments",
      params: { siteId },
      search: next === "pending" ? {} : { tab: next as QueueTab },
    });
  };

  const items = list.data?.items ?? [];
  const visible = items.filter(
    (c) => matchesSearch(c, text, locale) && (filters.actor !== "agents" || touchedByAgent(c)),
  );
  const chosen = visible.filter((c) => selected.has(c.id));
  const counts = list.data?.counts;
  const filtered =
    text.trim() !== "" ||
    filters.entry !== "all" ||
    filters.label !== "all" ||
    filters.actor !== "all" ||
    filters.date !== "all";

  const moderate = useModerateComments(siteId, (outcome) => {
    setFailed(new Map(outcome.failed.map((f) => [f.id, f.error])));
    // What went through leaves the selection; what did not stays selected to try again.
    setSelected(new Set(outcome.failed.map((f) => f.id)));
    setDialog((d) => ({ ...d, open: false }));
  });
  const remove = useDeleteComment(siteId);

  const run = (action: CommentModerateAction, ids: string[], extra = {}) =>
    moderate.mutate({ ids, action, revs: revsOf(items, ids), ...extra });
  const start = (action: CommentModerateAction, targets: CommentView[]) => {
    const ids = eligibleFor(action, targets);
    if (ids.length === 0) return;
    moderate.reset();
    if (action === "hide" || action === "spam") setDialog({ open: true, action, ids });
    else run(action, ids);
  };

  const onMenu = async (comment: CommentView, action: CommentMenuAction) => {
    const thread = (s: Record<string, string> = {}) =>
      navigate({
        to: "/sites/$siteId/comments/$nodeId",
        params: { siteId, nodeId: comment.nodeId },
        search: s,
      });
    if (action === "delete") {
      remove.reset();
      setDeleting(comment);
    } else if (action === "reply") await thread({ reply: comment.id });
    else if (action === "openThread" || action === "resolve") await thread({ comment: comment.id });
    else if (action === "commenter") {
      try {
        const { commenter } = await api.comments.findCommenter(siteId, { commentId: comment.id });
        if (commenter)
          await navigate({
            to: "/sites/$siteId/commenters/$commenterId",
            params: { siteId, commenterId: commenter.id },
          });
        else toast.error(t("comments.commenter.title"), t("comments.commenter.noEmail"));
      } catch (e) {
        toast.error(t("comments.commenter.title"), e instanceof Error ? e.message : String(e));
      }
    } else start(action, [comment]);
  };

  const label: Record<CommentModerateAction, string> = {
    approve: t("comments.actions.approve"),
    restore: t("comments.actions.restore"),
    hide: t("comments.actions.hide"),
    spam: t("comments.actions.spam"),
    hold: t("comments.actions.hold"),
  };
  const bulkActions: BulkAction[] = bulkActionsFor(tab).map((action, i) => {
    const eligible = eligibleFor(action, chosen).length;
    const reason = !moderateGate.allowed
      ? moderateGate.reason
      : eligible === 0
        ? t("comments.bulk.notFor", { action: t(`comments.actions.past.${action}`) })
        : undefined;
    const Icon = ACTION_ICON[action];
    return {
      id: action,
      label: label[action],
      icon: <Icon />,
      variant: i === 0 && (action === "approve" || action === "restore") ? "primary" : "secondary",
      onClick: () => start(action, chosen),
      disabled: reason !== undefined,
      ...(reason ? { disabledReason: reason } : {}),
      loading: moderate.isPending && moderate.variables?.action === action,
    };
  });

  const tabLabel = (key: QueueTab) => {
    const name = t(`comments.tabs.${key}`);
    const n = key === "pending" || key === "reported" ? counts?.[key] : undefined;
    return n ? t("comments.tabCount", { label: name, count: n.toLocaleString(locale) }) : name;
  };
  const notEnabled = isNotEnabled(list.error);
  const conflicts = [...failed.values()].filter((e) => e === "conflict").length;

  const body = (() => {
    if (!read.allowed)
      return (
        <Banner
          variant="secondary"
          icon={<LockSimple weight="fill" />}
          title={t("comments.noAccessTitle")}
          description={read.reason}
        />
      );
    if (notEnabled)
      return (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("comments.unavailable.title")}
          description={t("comments.unavailable.description")}
        />
      );
    return (
      <>
        <ErrorBanner error={list.error} onRetry={() => void list.refetch()} />
        {requests.length > 0 && (
          <div data-testid="comment-requests">
            <Banner
              variant="default"
              icon={<Robot weight="fill" />}
              title={
                requests.length === 1
                  ? requestTitle(t, requests[0] as (typeof requests)[number])
                  : t("comments.agentRequests.titleMany", { count: requests.length })
              }
              description={t("comments.agentRequests.description")}
              action={
                <LinkButton
                  href={`/sites/${siteId}/approvals`}
                  variant="secondary"
                  size="sm"
                  icon={ArrowRight}
                >
                  {t("comments.agentRequests.review")}
                </LinkButton>
              }
            />
          </div>
        )}
        {conflicts > 0 && (
          <ConflictBanner
            title={t("comments.results.conflictTitle")}
            description={t("comments.results.errors.conflict", { count: conflicts })}
            onReload={() => {
              setFailed(new Map());
              void list.refetch();
            }}
            reloading={list.isFetching}
          />
        )}
        {selected.size > 0 ? (
          <BulkActionBar
            selected={chosen.length}
            total={visible.length}
            onSelectAll={(checked) =>
              setSelected(checked ? new Set(visible.map((c) => c.id)) : new Set())
            }
            onClear={() => setSelected(new Set())}
            actions={bulkActions}
            labels={{
              bar: t("comments.bulk.bar"),
              selectAll: t("comments.bulk.selectAll"),
              selected: (count) => t("comments.bulk.selected", { count }),
              clear: t("comments.bulk.clear"),
            }}
          />
        ) : (
          <ListToolbar
            search={text}
            onSearch={setText}
            placeholder={t("comments.search")}
            actions={
              <>
                <CommentFilters
                  value={filters}
                  onChange={(next) => {
                    resetPaging();
                    setFilters(next);
                  }}
                  labels={filterLabels(t, words)}
                  entries={(entries.data ?? []).map((e) => ({ value: e.id, label: e.title }))}
                  entriesLoading={entries.isPending}
                />
                <RefreshButton
                  variant="secondary"
                  aria-label={t("comments.refresh")}
                  loading={list.isRefetching}
                  onClick={() => void list.refetch()}
                />
              </>
            }
          />
        )}
        {list.data && visible.length === 0 ? (
          <Empty
            icon={<ChatsCircle size={48} className="text-kumo-inactive" />}
            title={t(filtered ? "comments.empty.filtered.title" : `comments.empty.${tab}.title`)}
            description={t(
              filtered
                ? "comments.empty.filtered.description"
                : `comments.empty.${tab}.description`,
            )}
          />
        ) : (
          <LayerCard className="p-0" data-testid="comment-queue">
            {list.isPending ? (
              <QueueSkeleton label={t("comments.loading")} />
            ) : (
              <div className="divide-y divide-kumo-hairline">
                {visible.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={rowData(siteId, c)}
                    words={words}
                    locale={locale}
                    selection={{
                      checked: selected.has(c.id),
                      onCheckedChange: (checked) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        }),
                      label: t("comments.bulk.select", {
                        name: c.author.kind === "erased" ? words.author.anonymous : c.author.name,
                      }),
                    }}
                    actions={<CommentMenu comment={c} onAction={(a) => void onMenu(c, a)} />}
                  >
                    {failed.has(c.id) && (
                      <span>
                        <FailedBadge error={failed.get(c.id)} />
                      </span>
                    )}
                  </CommentRow>
                ))}
              </div>
            )}
          </LayerCard>
        )}
        {(page > 1 || list.data?.nextCursor) && (
          <Pagination
            page={page}
            perPage={QUEUE_PAGE_SIZE}
            hasNextPage={Boolean(list.data?.nextCursor)}
            text={() => t("comments.page", { page })}
            setPage={(next) => {
              if (next > page && list.data?.nextCursor) {
                const nextCursor = list.data.nextCursor;
                setCursors((c) => {
                  const copy = c.slice(0, page);
                  copy[page] = nextCursor;
                  return copy;
                });
              }
              setSelected(new Set());
              setFailed(new Map());
              setPage(Math.max(1, next));
            }}
          />
        )}
      </>
    );
  })();

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("comments.title") }]} />}
      icon={<ChatsCircle size={24} />}
      title={t("comments.title")}
      description={t("comments.description")}
      {...(read.allowed && !notEnabled
        ? {
            tabs: QUEUE_TABS.map((value) => ({ value, label: tabLabel(value) })),
            tab,
            onTabChange: setTab,
          }
        : {})}
      aside={read.allowed && !notEnabled ? <QueueAside siteId={siteId} t={t} /> : undefined}
    >
      {body}
      <ModerateDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        action={dialog.action}
        count={dialog.ids.length}
        busy={moderate.isPending}
        error={moderate.error?.message}
        onConfirm={(input) => run(dialog.action as CommentModerateAction, dialog.ids, input)}
      />
      <ModerateDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        action="delete"
        count={1}
        busy={remove.isPending}
        error={remove.error?.message}
        onConfirm={(input) => {
          if (!deleting) return;
          remove.mutate(
            { comment: deleting, ...input },
            {
              onSuccess: () => setDeleting(undefined),
              onError: () => {
                setDeleting(undefined);
                void list.refetch();
              },
            },
          );
        }}
      />
    </PageLayout>
  );
}

/** "Comment triage asks to approve 8 comments". */
function requestTitle(t: T, request: { actor: { name?: string; id: string }; input?: unknown }) {
  const agent = request.actor.name ?? request.actor.id;
  const ids = (request.input as { ids?: unknown } | undefined)?.ids;
  const count = Array.isArray(ids) ? ids.length : 1;
  return plural(t, "comments.agentRequests.title", "comments.agentRequests.titleOne", count, {
    agent,
  });
}
