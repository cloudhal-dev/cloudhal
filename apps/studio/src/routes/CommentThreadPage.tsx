import {
  Badge,
  Banner,
  Button,
  CommentAuthor,
  CommentHistory,
  CommentReports,
  type CommentRowData,
  CommentText,
  CommentThread,
  InputArea,
  InsetPanel,
  LayerDialog,
  LinkButton,
  PageLayout,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
  StatementOfReasons,
  Tabs,
  Text,
} from "@cloudhal/ui";
import {
  ArrowSquareOut,
  CalendarBlank,
  ChatsCircle,
  ClockCounterClockwise,
  Info,
  PaperPlaneRight,
  WarningCircle,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CommentMenu,
  type CommentMenuAction,
  eventOf,
  historyLabels,
  ModerateDialog,
  moderationWords,
  type ReasonAction,
  reportLabels,
  rowData,
  statementLabels,
  threadLabels,
  useCommentWords,
  useDeleteComment,
  useModerateComments,
} from "../components/Comments.tsx";
import {
  CloseDateDialog,
  closeLine,
  HideThreadConfirm,
  useSetThread,
} from "../components/CommentThreadControls.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { DetailsCard, EditorLayout } from "../components/EditorLayout.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { SettingRow } from "../components/Settings.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate, useMe, useSelf } from "../components/useMe.ts";
import {
  api,
  type CommentModerateAction,
  type CommentReportRow,
  type CommentThreadMode,
  type CommentView,
  isNotEnabled,
} from "../lib/api.ts";
import {
  commentsKey,
  commentThreadKey,
  REPLY_MAX,
  replyProblem,
  revsOf,
  threadModeOf,
} from "../lib/comments.ts";
import { isOwnEntry } from "../lib/roles.ts";

const STATE_VARIANT = {
  open: "success",
  closed: "neutral",
  hidden: "warning",
  off: "neutral",
} as const;

/**
 * The staff reply form under the comment answered (RFC-0007 §14): plain text up to 5,000
 * characters, a read-only preview rendered by `CommentText` exactly as the public page will, the
 * badge it will carry, and "Publish reply" — published at once under the person's name.
 */
function ReplyForm({
  siteId,
  comment,
  badge,
  onDone,
}: {
  siteId: string;
  comment: CommentView;
  badge: "author" | "team";
  onDone: () => void;
}) {
  const { t, words } = useCommentWords();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe().data;
  const name = me?.actor.name ?? me?.actor.id ?? "";
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const problem = replyProblem(text);
  const publish = useMutation({
    mutationFn: () => api.comments.reply(siteId, comment.id, text.trim()),
    onSuccess: async () => {
      toast.success(t("comments.reply.published"), t("comments.reply.publishedDescription"));
      setText("");
      onDone();
      await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
    },
  });
  const count = [...text].length;
  return (
    <form
      className="grid gap-4"
      data-testid="reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!problem) publish.mutate();
      }}
    >
      <InputArea
        label={t("comments.reply.title", { name })}
        description={
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">{t("comments.reply.hint")}</span>
            <span
              className={
                count > REPLY_MAX
                  ? "shrink-0 text-kumo-danger tabular-nums"
                  : "shrink-0 tabular-nums"
              }
              data-testid="reply-count"
            >
              {t("comments.reply.counter", { count, max: REPLY_MAX.toLocaleString() })}
            </span>
          </span>
        }
        value={text}
        onValueChange={setText}
        error={
          tried && problem
            ? t(problem === "short" ? "comments.reply.tooShort" : "comments.reply.tooLong")
            : undefined
        }
        autoResize
        minRows={3}
        maxRows={12}
        className="w-full"
        data-testid="reply-text"
      />
      <InsetPanel variant="recessed" label={t("comments.reply.preview")}>
        <Text as="span" variant="secondary" size="sm">
          {t("comments.reply.preview")}
        </Text>
        <div className="grid gap-2" data-testid="reply-preview">
          <CommentAuthor author={{ kind: "staff", personId: "", name, badge }} words={words} />
          {text.trim() ? (
            <CommentText text={text} newTabLabel={words.newTab} />
          ) : (
            <Text variant="secondary">{t("comments.reply.previewEmpty")}</Text>
          )}
        </div>
      </InsetPanel>
      {publish.error && (
        <Banner
          variant="error"
          size="sm"
          icon={<WarningCircle weight="fill" />}
          title={t("comments.reply.failed")}
          description={publish.error.message}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text variant="secondary" size="sm" as="span">
          {t("comments.reply.badgeLine", { badge: words.author[badge] })}
        </Text>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onDone} disabled={publish.isPending}>
            {t("comments.reply.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={<PaperPlaneRight />}
            loading={publish.isPending}
            data-testid="reply-publish"
          >
            {t("comments.reply.publish")}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "Resolve this report": what the moderator did, kept with the report. */
function ResolveDialog({
  report,
  onOpenChange,
  busy,
  error,
  onConfirm,
}: {
  report: CommentReportRow | undefined;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (resolution: string) => void;
}) {
  const { t } = useCommentWords();
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (report) {
      setText("");
      setTried(false);
    }
  }, [report]);
  const missing = text.trim() === "";
  return (
    <LayerDialog.Root
      open={report !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={busy}
    >
      <LayerDialog.Content size="sm" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("comments.reports.resolveTitle")}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("comments.reports.resolveDescription")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="resolve-dialog">
            <InputArea
              label={t("comments.reports.resolution")}
              description={t("comments.reports.resolutionHint")}
              value={text}
              onValueChange={setText}
              error={tried && missing ? t("comments.reports.resolutionRequired") : undefined}
              maxLength={500}
              autoResize
              minRows={2}
              maxRows={5}
              className="w-full"
            />
            {error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("comments.reports.failed")}
                description={error}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={busy}
            onClick={() => {
              setTried(true);
              if (!missing) onConfirm(text.trim());
            }}
          >
            {t("comments.reports.resolveConfirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/**
 * A comment's details in the thread: the statement of reasons of a hidden, spam or deleted comment
 * (DSA Art. 17), its moderation history and its reports (DSA Art. 16) with "Resolve…". Read with
 * `GET …/comments/:id` when it matters (reports, a removal, the comment linked to) or on demand.
 */
function CommentDetails({
  siteId,
  comment,
  focused,
  canResolve,
  onResolve,
}: {
  siteId: string;
  comment: CommentRowData;
  focused: boolean;
  canResolve: boolean;
  onResolve: (report: CommentReportRow) => void;
}) {
  const { t, locale } = useCommentWords();
  const removed =
    comment.status === "hidden" || comment.status === "spam" || comment.status === "deleted";
  const reported = (comment.reports?.count ?? 0) > 0;
  const [asked, setAsked] = useState(false);
  const enabled = focused || reported || removed || asked;
  const detail = useQuery({
    queryKey: [...commentsKey(siteId), "comment", comment.id],
    queryFn: () => api.comments.get(siteId, comment.id),
    enabled,
  });
  const words = moderationWords(t);
  if (!enabled)
    return (
      <span>
        <Button
          variant="ghost"
          size="sm"
          icon={<ClockCounterClockwise />}
          onClick={() => setAsked(true)}
          data-testid="comment-history-open"
        >
          {t("comments.history.show")}
        </Button>
      </span>
    );
  if (detail.isPending)
    return (
      <div className="grid gap-2" role="status">
        <span className="sr-only">{t("common.loading")}</span>
        <SkeletonLine minWidth={30} maxWidth={50} />
      </div>
    );
  if (!detail.data)
    return <ErrorBanner error={detail.error} onRetry={() => void detail.refetch()} />;
  const { history, reports } = detail.data;
  return (
    <div className="grid gap-3" data-testid="comment-details">
      {removed && comment.moderation && (
        <StatementOfReasons
          moderation={comment.moderation}
          locale={locale}
          labels={statementLabels(t)}
          words={words}
        />
      )}
      {reports.length > 0 && (
        <CommentReports
          reports={reports.map((r) => ({
            id: r.id,
            reason: r.reason,
            createdAt: r.createdAt,
            ...(r.details ? { details: r.details } : {}),
            ...(r.resolvedAt ? { resolvedAt: r.resolvedAt } : {}),
            ...(r.resolution ? { resolution: r.resolution } : {}),
          }))}
          locale={locale}
          labels={reportLabels(t)}
          renderActions={(r) =>
            r.resolvedAt ? null : (
              <Button
                variant="secondary"
                size="sm"
                disabled={!canResolve}
                onClick={() => {
                  const row = reports.find((x) => x.id === r.id);
                  if (row) onResolve(row);
                }}
              >
                {t("comments.reports.resolve")}
              </Button>
            )
          }
        />
      )}
      <CommentHistory
        events={history.map(eventOf)}
        locale={locale}
        labels={historyLabels(t)}
        words={words}
        defaultOpen={focused || asked}
      />
    </div>
  );
}

/**
 * Site › Comments › one article's thread (RFC-0007 §14, DESIGN.md §2w; editor template without a
 * preview): the `CommentThread` — two levels, oldest first, every status the person may see — with
 * each comment's statement of reasons, history and reports, the staff reply form under the comment
 * answered, and the aside's "Thread" card (mode, close date) and details.
 */
export function CommentThreadPage() {
  const { t, locale, words } = useCommentWords();
  const { siteId, nodeId } = useParams({ from: "/sites/$siteId/comments/$nodeId" });
  const search = useSearch({ from: "/sites/$siteId/comments/$nodeId" });
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const self = useSelf();
  const known = !useMe().isPending;
  const read = useGate("comments.read");
  const moderateAny = useGate("comments.moderateAny");
  const moderateOwn = useGate("comments.moderate");
  const replyAny = useGate("comments.reply");
  const entry = useQuery({
    queryKey: ["entry", siteId, nodeId],
    queryFn: () => api.entries.get(siteId, nodeId),
    enabled: known && read.allowed,
    retry: false,
  });
  const thread = useQuery({
    queryKey: commentThreadKey(siteId, nodeId),
    queryFn: () => api.comments.thread(siteId, nodeId),
    enabled: known && read.allowed,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const list = useInfiniteQuery({
    queryKey: [...commentsKey(siteId), "list", "thread", nodeId],
    queryFn: ({ pageParam }) =>
      api.comments.list(siteId, {
        node: nodeId,
        order: "oldest",
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: known && read.allowed,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
  const comments = list.data?.pages.flatMap((p) => p.items) ?? [];
  const byId = new Map(comments.map((c) => [c.id, c]));
  const [replyTo, setReplyTo] = useState<string | undefined>(search.reply);
  const [dialog, setDialog] = useState<{ open: boolean; action: ReasonAction; ids: string[] }>({
    open: false,
    action: "hide",
    ids: [],
  });
  const [deleting, setDeleting] = useState<CommentView | undefined>();
  const [resolving, setResolving] = useState<CommentReportRow | undefined>();
  const [closeOpen, setCloseOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);

  const own = entry.data ? isOwnEntry(entry.data, self) : false;
  const notOwnModerate = moderateAny.allowed || own ? undefined : moderateAny.reason;
  const notOwnReply = replyAny.allowed || own ? undefined : replyAny.reason;
  const mayModerate = moderateOwn.allowed && !notOwnModerate;
  const title = entry.data?.title ?? "";

  const moderate = useModerateComments(siteId, () => setDialog((d) => ({ ...d, open: false })));
  const remove = useDeleteComment(siteId);
  const setThread = useSetThread(siteId, nodeId);
  const resolve = useMutation({
    mutationFn: (input: { report: CommentReportRow; resolution: string }) =>
      api.comments.resolveReport(siteId, input.report.id, input.resolution),
    onSuccess: async () => {
      setResolving(undefined);
      toast.success(t("comments.reports.resolvedToast"));
      await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
    },
  });

  // A link to one comment (a notification, the queue's "Open thread") lands on it.
  const focus = search.comment ?? search.reply;
  useEffect(() => {
    if (!focus || !byId.has(focus)) return;
    const el = document.getElementById(`comment-${focus}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [focus, byId.size]);

  const onMenu = (comment: CommentView, action: CommentMenuAction) => {
    if (action === "reply") setReplyTo(comment.id);
    else if (action === "delete") {
      remove.reset();
      setDeleting(comment);
    } else if (action === "resolve") {
      void navigate({
        to: "/sites/$siteId/comments/$nodeId",
        params: { siteId, nodeId },
        search: { comment: comment.id },
      });
    } else if (action === "commenter") {
      void api.comments
        .findCommenter(siteId, { commentId: comment.id })
        .then(async ({ commenter }) => {
          if (commenter)
            await navigate({
              to: "/sites/$siteId/commenters/$commenterId",
              params: { siteId, commenterId: commenter.id },
            });
          else toast.error(t("comments.commenter.title"), t("comments.commenter.noEmail"));
        })
        .catch((e: Error) => toast.error(t("comments.commenter.title"), e.message));
    } else if (action === "hide" || action === "spam") {
      moderate.reset();
      setDialog({ open: true, action, ids: [comment.id] });
    } else if (action !== "openThread") {
      moderate.mutate({
        ids: [comment.id],
        action: action as CommentModerateAction,
        revs: revsOf(comments, [comment.id]),
      });
    }
  };

  const view = thread.data?.thread;
  const counts = thread.data?.counts;
  const notEnabled = isNotEnabled(thread.error) && isNotEnabled(list.error);
  const missing = isNotEnabled(thread.error) && !notEnabled;
  const mode = view?.mode ?? "default";
  const changeMode = (next: CommentThreadMode) => {
    if (!view || next === mode) return;
    if (next === "hidden") setHideOpen(true);
    else setThread.mutate({ rev: view.rev, mode: next });
  };

  const main = (
    <SectionCard
      title={t("comments.title")}
      icon={<ChatsCircle size={16} />}
      description={t("comments.thread.description")}
      actions={
        counts ? (
          <Badge variant="secondary">{counts.approved.toLocaleString(locale)}</Badge>
        ) : undefined
      }
      flush
    >
      <CommentThread
        comments={comments.map((c) => rowData(siteId, c))}
        words={words}
        labels={threadLabels(t, title)}
        locale={locale}
        loading={list.isPending}
        error={
          list.error && !isNotEnabled(list.error) ? (
            <div className="px-5 py-4">
              <ErrorBanner error={list.error} onRetry={() => void list.refetch()} />
            </div>
          ) : undefined
        }
        empty={
          <SectionEmpty
            icon={<ChatsCircle size={32} className="text-kumo-inactive" />}
            title={t("comments.thread.empty")}
            description={t("comments.thread.emptyDescription")}
          />
        }
        renderActions={(c) => {
          const full = byId.get(c.id);
          return full ? (
            <CommentMenu
              comment={full}
              onAction={(a) => onMenu(full, a)}
              hide={["openThread"]}
              notOwnReason={notOwnModerate ?? notOwnReply}
            />
          ) : null;
        }}
        renderDetails={(c) => (
          <CommentDetails
            siteId={siteId}
            comment={c}
            focused={focus === c.id}
            canResolve={mayModerate}
            onResolve={(r) => {
              resolve.reset();
              setResolving(r);
            }}
          />
        )}
        renderReply={(c) => {
          const full = byId.get(c.id);
          if (!full || replyTo !== c.id) return null;
          if (full.status !== "approved")
            return (
              <Text variant="secondary" size="sm">
                {t("comments.reply.notApproved")}
              </Text>
            );
          return (
            <ReplyForm
              siteId={siteId}
              comment={full}
              badge={own ? "author" : "team"}
              onDone={() => setReplyTo(undefined)}
            />
          );
        }}
      />
      {list.hasNextPage && (
        <div className="border-kumo-hairline border-t px-5 py-3">
          <Button
            variant="secondary"
            size="sm"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t("comments.thread.loadMore")}
          </Button>
        </div>
      )}
    </SectionCard>
  );

  const aside = (
    <>
      <SectionCard title={t("comments.thread.cardTitle")} icon={<CalendarBlank size={16} />}>
        {view ? (
          <div className="grid gap-4" data-testid="thread-controls">
            <div className="grid gap-1.5">
              <Text bold as="span">
                {t("comments.thread.mode")}
              </Text>
              <span className="inline-flex" title={notOwnModerate ?? moderateOwn.reason}>
                <Tabs
                  variant="segmented"
                  size="sm"
                  value={mode}
                  onValueChange={(v) => mayModerate && changeMode(threadModeOf(v))}
                  tabs={(["default", "open", "closed", "hidden"] as const).map((m) => ({
                    value: m,
                    label: t(`comments.thread.modes.${m}`),
                    ...(mayModerate ? {} : { disabled: true }),
                  }))}
                />
              </span>
              <Text variant="secondary" size="sm">
                {t(`comments.thread.modeHints.${mode}`)}
              </Text>
            </div>
            <dl className="-mb-3 divide-y divide-kumo-hairline border-kumo-hairline border-t">
              <SettingRow label={t("comments.thread.readersSee")}>
                <Badge variant={STATE_VARIANT[view.state]} appearance="dot">
                  {t(`comments.thread.state.${view.state}`)}
                </Badge>
              </SettingRow>
              <SettingRow label={t("comments.thread.closeOn")} hint={closeLine(t, view, locale)}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<CalendarBlank />}
                  disabled={!mayModerate}
                  title={notOwnModerate ?? moderateOwn.reason}
                  onClick={() => {
                    setThread.reset();
                    setCloseOpen(true);
                  }}
                  data-testid="thread-close-change"
                >
                  {t("comments.thread.changeClose")}
                </Button>
              </SettingRow>
            </dl>
          </div>
        ) : (
          <div className="grid gap-2" role="status">
            <span className="sr-only">{t("common.loading")}</span>
            <SkeletonLine minWidth={50} maxWidth={80} />
            <SkeletonLine minWidth={30} maxWidth={60} />
          </div>
        )}
      </SectionCard>
      <DetailsCard
        rows={[
          {
            label: t("comments.thread.entryId"),
            value: <Text variant="mono-secondary">{nodeId}</Text>,
          },
          ...(entry.data
            ? [
                {
                  label: t("comments.thread.path"),
                  value: (
                    <Text variant="mono-secondary">{`/${entry.data.collection}/${entry.data.slug}`}</Text>
                  ),
                },
              ]
            : []),
          ...(counts
            ? (["approved", "pending", "reported", "hidden", "spam"] as const).map((k) => ({
                label: t(`comments.thread.${k}Count`),
                value: <Text as="span">{counts[k].toLocaleString(locale)}</Text>,
              }))
            : []),
        ]}
      />
    </>
  );

  return (
    <PageLayout
      crumbs={
        <SiteCrumbs
          siteId={siteId}
          trail={[
            { label: t("comments.title"), href: `/sites/${siteId}/comments` },
            { label: title || nodeId },
          ]}
          copy={nodeId}
        />
      }
      title={title || undefined}
      loading={entry.isPending && read.allowed}
      description={
        view ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATE_VARIANT[view.state]} appearance="dot">
              {t(`comments.thread.state.${view.state}`)}
            </Badge>
            <span>{closeLine(t, view, locale)}</span>
          </span>
        ) : undefined
      }
      actions={
        entry.data ? (
          <LinkButton
            href={`/sites/${siteId}/articles/${nodeId}`}
            variant="secondary"
            icon={ArrowSquareOut}
          >
            {t("comments.thread.openArticle")}
          </LinkButton>
        ) : undefined
      }
    >
      {!read.allowed ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("comments.noAccessTitle")}
          description={read.reason}
        />
      ) : notEnabled ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("comments.unavailable.title")}
          description={t("comments.unavailable.description")}
        />
      ) : missing ? (
        <Banner
          variant="secondary"
          icon={<Info weight="fill" />}
          title={t("comments.thread.notFoundTitle")}
          description={t("comments.thread.notFoundDescription")}
        />
      ) : (
        <EditorLayout main={main} aside={aside} />
      )}
      <ModerateDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        action={dialog.action}
        count={dialog.ids.length}
        busy={moderate.isPending}
        error={moderate.error?.message}
        onConfirm={(input) =>
          moderate.mutate({
            ids: dialog.ids,
            action: dialog.action as CommentModerateAction,
            revs: revsOf(comments, dialog.ids),
            ...input,
          })
        }
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
            { onSettled: () => setDeleting(undefined) },
          );
        }}
      />
      <ResolveDialog
        report={resolving}
        onOpenChange={(open) => !open && setResolving(undefined)}
        busy={resolve.isPending}
        error={resolve.error?.message}
        onConfirm={(resolution) => resolving && resolve.mutate({ report: resolving, resolution })}
      />
      <CloseDateDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        current={view?.closesAt ?? null}
        busy={setThread.isPending}
        error={setThread.error?.message}
        onSave={(closesAt) =>
          view &&
          setThread.mutate(
            { rev: view.rev, mode: view.mode, closesAt },
            { onSuccess: () => setCloseOpen(false) },
          )
        }
      />
      <HideThreadConfirm
        open={hideOpen}
        onOpenChange={setHideOpen}
        busy={setThread.isPending}
        onConfirm={() =>
          view &&
          setThread.mutate(
            { rev: view.rev, mode: "hidden" },
            { onSuccess: () => setHideOpen(false) },
          )
        }
      />
    </PageLayout>
  );
}
