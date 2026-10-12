import {
  Badge,
  Banner,
  CommentRow,
  CommentText,
  formatCommentDate,
  InsetPanel,
  LayerDialog,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import { ChatsCircle, Info, Robot, WarningCircle } from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useI18n } from "../i18n/index.tsx";
import { type Approval, api, type CommentView } from "../lib/api.ts";
import {
  type CommentRequest,
  commentRequestOf,
  commentsKey,
  requestCommentIds,
} from "../lib/comments.ts";
import { isOwnEntry } from "../lib/roles.ts";
import { plural, rowData, useCommentWords } from "./Comments.tsx";
import { useMe, useSelf } from "./useMe.ts";

/** "Approve 8 comments", "Publish a reply", "Open comments on an article". */
export function useCommentRequestTitle() {
  const { t } = useI18n("comments");
  return (request: CommentRequest): string => {
    const a = "comments.approvals" as const;
    if (request.kind === "reply") return t(`${a}.replyTitle`);
    if (request.kind === "thread") return t(`${a}.threadTitle`);
    const n = request.ids.length;
    if (request.kind === "label") return t(`${a}.labelTitle`, { count: n });
    if (request.action === "approve")
      return plural(t, `${a}.approveTitle`, `${a}.approveTitleOne`, n);
    if (request.action === "restore")
      return plural(t, `${a}.restoreTitle`, `${a}.restoreTitleOne`, n);
    return t(`${a}.moderateTitle.${request.action}`, { count: n });
  };
}

/** The confirm button: "Approve 8 comments", "Publish reply", "Open thread". */
function useConfirmLabel() {
  const { t } = useI18n("comments");
  return (request: CommentRequest): string => {
    const a = "comments.approvals" as const;
    if (request.kind === "reply") return t(`${a}.publishReply`);
    if (request.kind === "thread") return t(`${a}.openThread`);
    const n = request.ids.length;
    if (request.kind === "moderate" && request.action === "restore")
      return t(`${a}.restoreConfirm`, { count: n });
    return plural(t, `${a}.approveConfirm`, `${a}.approveConfirmOne`, n);
  };
}

/**
 * A pending comment request in the Approvals list (RFC-0007 §10.3, §14): what it asks in words —
 * never the server's English line — and, for a drafted reply, the reply itself quoted as plain
 * text. The comments themselves are read in the dialog Approve opens.
 */
export function CommentRequestDetails({ request }: { request: Approval }) {
  const { t, words } = useCommentWords();
  const title = useCommentRequestTitle();
  const parsed = commentRequestOf(request);
  if (!parsed) return null;
  const agent = request.actor.name ?? request.actor.id;
  return (
    <div className="grid gap-1.5" data-comment-request={parsed.kind}>
      <div className="flex items-start gap-2">
        <span className="flex h-lh items-center text-kumo-subtle">
          <ChatsCircle size={16} aria-hidden />
        </span>
        <Text>{title(parsed)}</Text>
      </div>
      {parsed.kind === "reply" && (
        <InsetPanel variant="recessed" className="gap-1">
          <span className="inline-flex items-center gap-1.5 text-kumo-subtle">
            <Robot size={16} aria-hidden />
            <Text variant="secondary" size="xs" as="span">
              {t("comments.approvals.replyDrafted", { agent })}
            </Text>
          </span>
          <CommentText text={parsed.text} clamp={3} newTabLabel={words.newTab} />
        </InsetPanel>
      )}
      <Text variant="secondary" size="sm">
        {t("comments.agentRequests.description")}
      </Text>
    </div>
  );
}

/**
 * Approve for a comment request (RFC-0007 §10.3, §14; DESIGN.md §2w `ApproveCommentsDialog`): the
 * comments themselves — full text, labels, the untrusted panel when one talks to an AI — never a
 * summary, the drafted reply and under whose name it goes out, or the thread change; "Single use,
 * for these comments as they are now". Approving carries the call out as the person.
 */
export function ApproveCommentsDialog({
  siteId,
  request,
  onOpenChange,
  busy,
  error,
  onConfirm,
}: {
  siteId: string;
  request: Approval | undefined;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (request: Approval) => void;
}) {
  const { t, locale, words } = useCommentWords();
  const title = useCommentRequestTitle();
  const confirmLabel = useConfirmLabel();
  const self = useSelf();
  const me = useMe().data;
  const parsed = request ? commentRequestOf(request) : undefined;
  const ids = parsed ? requestCommentIds(parsed) : [];
  const comments = useQueries({
    queries: ids.slice(0, 50).map((id) => ({
      queryKey: [...commentsKey(siteId), "comment", id],
      queryFn: () => api.comments.get(siteId, id),
      retry: false,
    })),
  });
  const first = comments[0]?.data?.comment;
  const nodeId = parsed?.kind === "thread" ? parsed.nodeId : first?.nodeId;
  const entry = useQuery({
    queryKey: ["entry", siteId, nodeId ?? ""],
    queryFn: () => api.entries.get(siteId, nodeId ?? ""),
    enabled: request !== undefined && nodeId !== undefined && parsed?.kind !== "moderate",
    retry: false,
  });
  const agent = request ? (request.actor.name ?? request.actor.id) : "";
  const loading = comments.some((q) => q.isPending);
  const badge = entry.data && isOwnEntry(entry.data, self) ? "author" : "team";

  const commentList = (
    <InsetPanel variant="outline" className="gap-0 p-0" label={t("comments.approvals.review")}>
      {loading ? (
        <div className="grid gap-2 px-4 py-3" role="status">
          <span className="sr-only">{t("comments.approvals.loading")}</span>
          <SkeletonLine minWidth={40} maxWidth={60} />
          <SkeletonLine minWidth={70} maxWidth={95} />
        </div>
      ) : (
        <div className="divide-y divide-kumo-hairline" data-testid="approval-comments">
          {comments.map((q, i) => {
            const c: CommentView | undefined = q.data?.comment;
            return c ? (
              <CommentRow key={c.id} comment={rowData(siteId, c)} words={words} locale={locale} />
            ) : (
              <div key={ids[i]} className="px-4 py-3">
                <Text variant="secondary">{t("comments.approvals.missing")}</Text>
              </div>
            );
          })}
        </div>
      )}
    </InsetPanel>
  );

  return (
    <LayerDialog.Root
      open={request !== undefined}
      onOpenChange={onOpenChange}
      dismissDisabled={busy}
    >
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{parsed ? title(parsed) : ""}</LayerDialog.Title>
        <LayerDialog.Description>
          {t("comments.approvals.dialogDescription")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="approve-comments-dialog">
            <Banner
              variant="default"
              icon={<Info weight="fill" />}
              title={t("comments.approvals.singleUse")}
              description={t("comments.approvals.singleUseHint")}
            />
            {parsed?.kind === "moderate" || parsed?.kind === "label" ? commentList : null}
            {parsed?.kind === "reply" && (
              <>
                <div className="grid gap-1.5">
                  <Text bold as="span">
                    {t("comments.approvals.replyTo")}
                  </Text>
                  {commentList}
                </div>
                <InsetPanel variant="recessed" className="gap-2">
                  <span className="inline-flex items-center gap-1.5 text-kumo-subtle">
                    <Robot size={16} aria-hidden />
                    <Text variant="secondary" size="sm" as="span">
                      {t("comments.approvals.replyDrafted", { agent })}
                    </Text>
                  </span>
                  <div data-testid="approval-reply">
                    <CommentText text={parsed.text} newTabLabel={words.newTab} />
                  </div>
                </InsetPanel>
                <Text variant="secondary" size="sm">
                  {t("comments.approvals.replyAs", {
                    name: me?.actor.name ?? me?.actor.id ?? "",
                    badge: words.author[badge],
                  })}
                </Text>
              </>
            )}
            {parsed?.kind === "thread" && (
              <InsetPanel variant="recessed" className="gap-1.5">
                <Text bold as="span">
                  {entry.data?.title ?? parsed.nodeId}
                </Text>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="success" appearance="dot">
                    {t("comments.approvals.threadTo", {
                      mode: t(`comments.thread.modes.${parsed.mode}`),
                    })}
                  </Badge>
                  <Text variant="secondary" size="sm" as="span">
                    {parsed.closesAt
                      ? t("comments.approvals.closesAt", {
                          date: formatCommentDate(parsed.closesAt, locale),
                        })
                      : parsed.closesAt === null
                        ? t("comments.approvals.noClose")
                        : ""}
                  </Text>
                </span>
              </InsetPanel>
            )}
            {error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("approvals.failed")}
                description={error}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={busy}
            disabled={!request || loading}
            onClick={() => request && onConfirm(request)}
            data-testid="approve-comments-confirm"
          >
            {parsed ? confirmLabel(parsed) : t("approvals.approve")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
