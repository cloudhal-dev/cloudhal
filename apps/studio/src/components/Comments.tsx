import {
  Badge,
  Banner,
  Button,
  type CommentEvent,
  type CommentHistoryLabels,
  type CommentModerationLabels,
  type CommentReportsLabels,
  type CommentRowData,
  type CommentThreadLabels,
  type CommentWords,
  DropdownMenu,
  InputArea,
  LayerDialog,
  Select,
  type StatementOfReasonsLabels,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowBendUpLeft,
  ArrowClockwise,
  ArrowCounterClockwise,
  ChatsCircle,
  CheckCircle,
  DotsThree,
  EyeSlash,
  Info,
  Prohibit,
  Trash,
  UserCircle,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type TFunction, useI18n, useT } from "../i18n/index.tsx";
import {
  ApiRequestError,
  api,
  type CommentEventRow,
  type CommentModerateAction,
  type CommentModerationResponse,
  type CommentReasonCode,
  type CommentView,
} from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import {
  actionsFor,
  commentsKey,
  defaultReason,
  type ModerationError,
  type ModerationOutcome,
  moderationOutcome,
} from "../lib/comments.ts";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

type T = TFunction<"comments">;

// ---- words for the blocks -------------------------------------------------------------------

/** The words every comment block shares (DESIGN.md §2w `CommentWords`), built once per screen. */
export function commentWords(t: T): CommentWords {
  const w = "comments.words" as const;
  return {
    status: {
      pending: t(`${w}.status.pending`),
      approved: t(`${w}.status.approved`),
      hidden: t(`${w}.status.hidden`),
      spam: t(`${w}.status.spam`),
      deleted: t(`${w}.status.deleted`),
    },
    label: {
      "spam-suspect": t(`${w}.label.spam-suspect`),
      toxic: t(`${w}.label.toxic`),
      "off-topic": t(`${w}.label.off-topic`),
      question: t(`${w}.label.question`),
      "needs-reply": t(`${w}.label.needs-reply`),
      praise: t(`${w}.label.praise`),
      "personal-data": t(`${w}.label.personal-data`),
      links: t(`${w}.label.links`),
      "watch-word": t(`${w}.label.watch-word`),
      "instruction-like": t(`${w}.label.instruction-like`),
    },
    labelHint: {
      "spam-suspect": t(`${w}.labelHint.spam-suspect`),
      toxic: t(`${w}.labelHint.toxic`),
      "off-topic": t(`${w}.labelHint.off-topic`),
      question: t(`${w}.labelHint.question`),
      "needs-reply": t(`${w}.labelHint.needs-reply`),
      praise: t(`${w}.labelHint.praise`),
      "personal-data": t(`${w}.labelHint.personal-data`),
      links: t(`${w}.labelHint.links`),
      "watch-word": t(`${w}.labelHint.watch-word`),
      "instruction-like": t(`${w}.labelHint.instruction-like`),
    },
    labelSource: (label, confidence) => {
      // Names of agents and people are plain text from our own records, never reader text.
      if (label.source === "rule") return t(`${w}.source.rule`);
      if (label.source === "classifier")
        return confidence
          ? t(`${w}.source.classifierSure`, { confidence })
          : t(`${w}.source.classifier`);
      if (label.source === "agent") {
        const name = label.by?.name ?? t(`${w}.source.anAgent`);
        return confidence
          ? t(`${w}.source.agentSure`, { name, confidence })
          : t(`${w}.source.agent`, { name });
      }
      return t(`${w}.source.person`, { name: label.by?.name ?? t(`${w}.source.someone`) });
    },
    author: {
      guest: t(`${w}.author.guest`),
      reader: t(`${w}.author.reader`),
      author: t(`${w}.author.author`),
      team: t(`${w}.author.team`),
      anonymous: t(`${w}.author.anonymous`),
    },
    draftedBy: (agent) => t(`${w}.draftedBy`, { agent }),
    inReplyTo: (name) => t(`${w}.inReplyTo`, { name }),
    onEntry: (title) => t(`${w}.onEntry`, { title }),
    removed: t(`${w}.removed`),
    edited: t(`${w}.edited`),
    noScript: t(`${w}.noScript`),
    reports: (count) => t(`${w}.reports`, { count }),
    labels: t(`${w}.labels`),
    newTab: t(`${w}.newTab`),
    untrusted: { title: t(`${w}.untrustedTitle`), description: t(`${w}.untrustedDescription`) },
  };
}

export function moderationWords(t: T): CommentModerationLabels {
  const m = "comments.moderation" as const;
  return {
    action: {
      approve: t(`${m}.action.approve`),
      hide: t(`${m}.action.hide`),
      spam: t(`${m}.action.spam`),
      hold: t(`${m}.action.hold`),
      restore: t(`${m}.action.restore`),
      delete: t(`${m}.action.delete`),
      erase: t(`${m}.action.erase`),
      label: t(`${m}.action.label`),
      reply: t(`${m}.action.reply`),
    },
    effect: {
      approve: t(`${m}.effect.approve`),
      hide: t(`${m}.effect.hide`),
      spam: t(`${m}.effect.spam`),
      hold: t(`${m}.effect.hold`),
      restore: t(`${m}.effect.restore`),
      delete: t(`${m}.effect.delete`),
      erase: t(`${m}.effect.erase`),
    },
    reason: reasonWords(t),
    actorKind: {
      human: t(`${m}.actorKind.human`),
      agent: t(`${m}.actorKind.agent`),
      system: t(`${m}.actorKind.system`),
    },
    approvedFor: (person, agent) => t(`${m}.approvedFor`, { person, agent }),
  };
}

export function reasonWords(t: T): Record<CommentReasonCode, string> {
  const r = "comments.moderation.reason" as const;
  return {
    spam: t(`${r}.spam`),
    abuse: t(`${r}.abuse`),
    "off-topic": t(`${r}.off-topic`),
    "personal-data": t(`${r}.personal-data`),
    "illegal-content": t(`${r}.illegal-content`),
    "legal-order": t(`${r}.legal-order`),
    "author-request": t(`${r}.author-request`),
    "erasure-request": t(`${r}.erasure-request`),
    duplicate: t(`${r}.duplicate`),
    other: t(`${r}.other`),
  };
}

export function statementLabels(t: T): StatementOfReasonsLabels {
  const s = "comments.statement" as const;
  return {
    title: t(`${s}.title`),
    decision: t(`${s}.decision`),
    grounds: t(`${s}.grounds`),
    facts: t(`${s}.facts`),
    noFacts: t(`${s}.noFacts`),
    automated: t(`${s}.automated`),
    automatedYes: t(`${s}.automatedYes`),
    automatedNo: t(`${s}.automatedNo`),
    decidedBy: t(`${s}.decidedBy`),
    decidedAt: t(`${s}.decidedAt`),
    noGrounds: t(`${s}.noGrounds`),
  };
}

export function historyLabels(t: T): CommentHistoryLabels {
  return {
    title: (count) => t("comments.history.title", { count }),
    empty: t("comments.history.empty"),
  };
}

export function reportLabels(t: T): CommentReportsLabels {
  const r = "comments.reports" as const;
  return {
    title: t(`${r}.title`),
    summary: (open, total) => t(`${r}.summary`, { open, total }),
    reason: {
      spam: t(`${r}.reason.spam`),
      abuse: t(`${r}.reason.abuse`),
      "personal-data": t(`${r}.reason.personal-data`),
      "illegal-content": t(`${r}.reason.illegal-content`),
      other: t(`${r}.reason.other`),
    },
    open: t(`${r}.open`),
    resolved: t(`${r}.resolved`),
    noDetails: t(`${r}.noDetails`),
    details: t(`${r}.details`),
  };
}

export function threadLabels(t: T, title: string): CommentThreadLabels {
  return {
    thread: t("comments.thread.listLabel", { title }),
    replies: (name) => t("comments.thread.replies", { name }),
    showMore: (count) => t("comments.thread.showMore", { count }),
    showFewer: t("comments.thread.showFewer"),
    loading: t("comments.loading"),
  };
}

/** The shared words of one screen, in the Studio language. */
export function useCommentWords() {
  const { t, locale } = useI18n("comments");
  return { t, locale, words: commentWords(t) };
}

/** A comment as the blocks take it: the entry links to its thread view. */
export function rowData(siteId: string, comment: CommentView): CommentRowData {
  const { entry: _entry, ...rest } = comment;
  return {
    ...rest,
    ...(comment.entry
      ? {
          entry: {
            title: comment.entry.title,
            path: comment.entry.path,
            href: `/sites/${siteId}/comments/${encodeURIComponent(comment.nodeId)}`,
          },
        }
      : {}),
  };
}

/** A `comment_events` row as `CommentHistory` takes it (no text, no email). */
export function eventOf(row: CommentEventRow): CommentEvent {
  const action = (
    ["approve", "hide", "spam", "hold", "restore", "delete", "erase", "label", "reply"].includes(
      row.action,
    )
      ? row.action
      : "label"
  ) as CommentEvent["action"];
  return {
    id: row.id,
    action,
    actor: row.actor,
    at: row.at,
    automated: row.automated,
    ...(row.reasonCode ? { reasonCode: row.reasonCode } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

// ---- moderation -----------------------------------------------------------------------------

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

/** The past-tense action for toasts ("approved", "hidden" …). */
function pastAction(t: T, action: CommentModerateAction): string {
  return t(`comments.actions.past.${action}`);
}

/**
 * Moderates comments (`POST …/comments/moderate`) and says what happened: one toast when all went
 * through, a per-reason summary when some did not (each comment stands alone, §4.4) — the screen
 * gets the outcome to mark the rows that were left as they are.
 */
export function useModerateComments(
  siteId: string,
  onOutcome?: (outcome: ModerationOutcome, action: CommentModerateAction) => void,
) {
  const t = useT("comments");
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ids: string[];
      action: CommentModerateAction;
      revs: Record<string, number>;
      reasonCode?: CommentReasonCode;
      note?: string;
    }): Promise<CommentModerationResponse> => api.comments.moderate(siteId, input),
    onSuccess: async (response, input) => {
      const outcome = moderationOutcome(response.results);
      const action = pastAction(t, input.action);
      const total = response.results.length;
      if (outcome.failed.length === 0) {
        toast.success(
          t("comments.results.done", { count: total, action }),
          response.purge === "queued" ? t("comments.results.purgeQueued") : undefined,
        );
      } else {
        const lines = (Object.entries(outcome.byError) as [ModerationError, number][]).map(
          ([error, count]) => t(`comments.results.errors.${error}`, { count }),
        );
        toast.error(
          t("comments.results.partialTitle", { done: outcome.done.length, total, action }),
          `${t("comments.results.partialDescription")} ${lines.join(" · ")}`,
        );
      }
      onOutcome?.(outcome, input.action);
      await Promise.all([
        qc.invalidateQueries({ queryKey: commentsKey(siteId) }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (error) =>
      toast.error(
        isConflict(error) ? t("comments.results.conflictTitle") : t("comments.results.failed"),
        isConflict(error) ? t("comments.results.conflictDescription") : apiErrorText(t, error),
      ),
  });
}

/** Soft delete of one comment (Editors and above): text removed at once, reason required. */
export function useDeleteComment(siteId: string) {
  const t = useT("comments");
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { comment: CommentView; reasonCode: CommentReasonCode; note?: string }) =>
      api.comments.remove(
        siteId,
        input.comment.id,
        input.comment.rev,
        input.reasonCode,
        input.note,
      ),
    onSuccess: async () => {
      toast.success(t("comments.moderation.action.delete"), t("comments.results.purgeQueued"));
      await qc.invalidateQueries({ queryKey: commentsKey(siteId) });
    },
    onError: (error) =>
      toast.error(
        isConflict(error) ? t("comments.results.conflictTitle") : t("comments.results.failed"),
        isConflict(error) ? t("comments.results.conflictDescription") : apiErrorText(t, error),
      ),
  });
}

/** A failed comment in a partial bulk result: a small error badge on its row. */
export function FailedBadge({ error }: { error: ModerationError | undefined }) {
  const t = useT("comments");
  if (!error) return null;
  return (
    <span className="inline-flex" data-moderation-error={error}>
      <Badge variant="error" icon={<WarningCircle size={16} />}>
        {t(`comments.results.failedBadge.${error}`)}
      </Badge>
    </span>
  );
}

export type ReasonAction = "hide" | "spam" | "delete";

/**
 * Hide…, Mark as spam… and Delete… (RFC-0007 §4.2: these need a reason): a small `LayerDialog`
 * with the reason `Select` (the `reasonCode`s in words) and an optional note. Always rendered,
 * controlled by `open`.
 */
export function ModerateDialog({
  open,
  onOpenChange,
  action,
  count,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ReasonAction;
  count: number;
  busy: boolean;
  error?: string | undefined;
  onConfirm: (input: { reasonCode: CommentReasonCode; note?: string }) => void;
}) {
  const t = useT("comments");
  const reasons = reasonWords(t);
  const [reason, setReason] = useState<CommentReasonCode>(defaultReason(action));
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setReason(defaultReason(action));
    setNote("");
  }, [open, action]);
  const title =
    action === "delete"
      ? t("comments.dialog.deleteTitle")
      : action === "spam"
        ? t("comments.dialog.spamTitle", { count })
        : t("comments.dialog.hideTitle", { count });
  const description = t(
    action === "delete"
      ? "comments.dialog.deleteDescription"
      : action === "spam"
        ? "comments.dialog.spamDescription"
        : "comments.dialog.hideDescription",
  );
  const confirm = t(
    action === "delete"
      ? "comments.dialog.deleteConfirm"
      : action === "spam"
        ? "comments.dialog.spamConfirm"
        : "comments.dialog.hideConfirm",
  );
  const Root = action === "delete" ? LayerDialog.Alert : LayerDialog.Root;
  return (
    <Root open={open} onOpenChange={onOpenChange} dismissDisabled={busy}>
      <LayerDialog.Content size="sm" closeLabel={t("common.close")}>
        <LayerDialog.Title>{title}</LayerDialog.Title>
        <LayerDialog.Description>{description}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="moderate-dialog" data-action={action}>
            <Select
              label={t("comments.dialog.reason")}
              description={t("comments.dialog.reasonHint")}
              value={reason}
              onValueChange={(v) => setReason((v ?? defaultReason(action)) as CommentReasonCode)}
              items={reasons}
              className="w-full"
              data-testid="moderate-reason"
            />
            <InputArea
              label={t("comments.dialog.note")}
              description={t("comments.dialog.noteHint")}
              value={note}
              onValueChange={setNote}
              maxLength={500}
              autoResize
              minRows={2}
              maxRows={5}
              className="w-full"
              data-testid="moderate-note"
            />
            {error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("comments.results.failed")}
                description={error}
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            variant={action === "delete" ? "destructive" : "primary"}
            loading={busy}
            onClick={() =>
              onConfirm({ reasonCode: reason, ...(note.trim() ? { note: note.trim() } : {}) })
            }
            data-testid="moderate-confirm"
          >
            {confirm}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </Root>
  );
}

/** What a comment's menu can ask the screen to do. */
export type CommentMenuAction =
  | CommentModerateAction
  | "delete"
  | "reply"
  | "openThread"
  | "commenter"
  | "resolve";

/**
 * A comment's row menu (RFC-0007 §14): Approve or Restore, Hide…, Mark as spam…, Back to pending,
 * Delete… (Editors and above), Reply, Open thread, Commenter… — what the status allows, each
 * disabled with the reason when the person's role cannot (DESIGN.md §2s).
 */
export function CommentMenu({
  comment,
  onAction,
  hide = [],
  notOwnReason,
}: {
  comment: Pick<CommentView, "id" | "status" | "reports">;
  onAction: (action: CommentMenuAction) => void;
  /** Items this screen leaves out (the thread view has no "Open thread"). */
  hide?: readonly CommentMenuAction[];
  /** The article is someone else's and the person moderates only their own (an Author): why not. */
  notOwnReason?: string | undefined;
}) {
  const t = useT("comments");
  const moderateGate = useGate("comments.moderate");
  const moderateAny = useGate("comments.moderateAny");
  const replyGate = useGate("comments.reply");
  const moderate = { reason: moderateGate.reason ?? notOwnReason };
  const reply = { reason: replyGate.reason ?? notOwnReason };
  const commenters = useGate("commenters.data");
  const allowed = actionsFor(comment.status);
  const icons: Record<CommentModerateAction, typeof CheckCircle> = {
    approve: CheckCircle,
    restore: ArrowCounterClockwise,
    hide: EyeSlash,
    spam: Prohibit,
    hold: ArrowClockwise,
  };
  const label: Record<CommentModerateAction, string> = {
    approve: t("comments.actions.approve"),
    restore: t("comments.actions.restore"),
    hide: t("comments.actions.hide"),
    spam: t("comments.actions.spam"),
    hold: t("comments.actions.hold"),
  };
  const item = (
    id: CommentMenuAction,
    text: string,
    icon: typeof CheckCircle,
    reason: string | undefined,
    variant?: "danger",
  ) =>
    hide.includes(id) ? null : reason ? (
      // A disabled item takes no pointer events, so the tooltip hangs on a wrapper.
      <Tooltip key={id} content={reason} side="left" render={<div />}>
        <DropdownMenu.Item icon={icon} disabled {...(variant ? { variant } : {})}>
          {text}
        </DropdownMenu.Item>
      </Tooltip>
    ) : (
      <DropdownMenu.Item
        key={id}
        icon={icon}
        onClick={() => onAction(id)}
        data-comment-action={id}
        {...(variant ? { variant } : {})}
      >
        {text}
      </DropdownMenu.Item>
    );
  return (
    <DropdownMenu>
      <Tooltip
        content={t("comments.actions.menu")}
        render={
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<DotsThree weight="bold" />}
                aria-label={t("comments.actions.menu")}
                data-testid="comment-menu"
              />
            }
          />
        }
      />
      <DropdownMenu.Content align="end">
        {allowed.map((a) => item(a, label[a], icons[a], moderate.reason))}
        {comment.status !== "deleted" &&
          item("delete", t("comments.actions.delete"), Trash, moderateAny.reason, "danger")}
        {(comment.reports?.count ?? 0) > 0 &&
          item("resolve", t("comments.actions.resolve"), Warning, moderate.reason)}
        <DropdownMenu.Separator />
        {comment.status === "approved" &&
          item("reply", t("comments.actions.reply"), ArrowBendUpLeft, reply.reason)}
        {item("openThread", t("comments.actions.openThread"), ChatsCircle, undefined)}
        {item("commenter", t("comments.actions.commenter"), UserCircle, commenters.reason)}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/** "Comments aren't available on this server" (the routes answer 404 without the comments key). */
export function CommentsUnavailable() {
  const t = useT("comments");
  return (
    <div data-testid="comments-unavailable">
      <Banner
        variant="secondary"
        icon={<Info weight="fill" />}
        title={t("comments.unavailable.title")}
        description={t("comments.unavailable.description")}
      />
    </div>
  );
}

/** A 409 on a single comment or thread: say so and offer to reload. */
export function ConflictBanner({
  title,
  description,
  onReload,
  reloading,
}: {
  title: string;
  description: string;
  onReload: () => void;
  reloading?: boolean;
}) {
  const t = useT("comments");
  return (
    <div role="alert" data-testid="comment-conflict">
      <Banner
        variant="alert"
        icon={<Warning weight="fill" />}
        title={title}
        description={description}
        action={
          <Banner.Action
            variant="secondary"
            icon={<ArrowClockwise />}
            onClick={onReload}
            loading={reloading}
          >
            {t("comments.results.reload")}
          </Banner.Action>
        }
      />
    </div>
  );
}
