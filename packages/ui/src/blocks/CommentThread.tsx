import { Button, cn, SkeletonLine, Text } from "@cloudflare/kumo";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CommentWords } from "./CommentParts.tsx";
import { CommentRow, type CommentRowData } from "./CommentRow.tsx";
import {
  buildCommentThread,
  type CommentThreadNode,
  commentAnchorId,
  commentAuthorName,
} from "./comment-model.ts";
import { useReducedMotion } from "./useChartPalette.ts";

export interface CommentThreadLabels {
  /** Accessible name of the thread list ("Comments on Ferry timetable"). */
  thread: string;
  /** Accessible name of a reply list: `(name)` → "Replies to Mehmet". */
  replies: (name: string) => string;
  /** The toggle under collapsed replies: `(n)` → "Show 4 more replies". */
  showMore: (count: number) => string;
  /** The toggle once they are shown ("Show fewer replies"). */
  showFewer: string;
  /** Spoken while the thread loads ("Loading comments"). */
  loading: string;
}

export interface CommentThreadProps {
  /** Every comment of the entry the viewer may see, in any order (the block sorts, §4.3). */
  comments: readonly CommentRowData[];
  words: CommentWords;
  labels: CommentThreadLabels;
  locale: string;
  now?: number;
  /** Replies shown under a top-level comment before the rest fold behind "Show n more". Default 3. */
  collapseAfter?: number;
  /** A row's `DropdownMenu` of actions. */
  renderActions?: (comment: CommentRowData) => ReactNode;
  /** Under a comment's text: its moderation history (`CommentHistory`), its reports (`CommentReports`). */
  renderDetails?: (comment: CommentRowData) => ReactNode;
  /**
   * The staff reply form when the person replies to this comment (`null` otherwise): under a
   * top-level comment it follows its replies, under a reply it follows that reply.
   */
  renderReply?: (comment: CommentRowData) => ReactNode;
  /** Bulk selection: the selected ids and the toggle; `label(c)` names each checkbox. */
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (id: string, checked: boolean) => void;
    label: (comment: CommentRowData) => string;
  };
  loading?: boolean;
  /** Shown instead of the list when there are no comments (a `SectionEmpty`). */
  empty?: ReactNode;
  /** Shown instead of the list when loading failed (an error `Banner` with "Try again"). */
  error?: ReactNode;
  className?: string;
}

function ThreadSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-0 divide-y divide-kumo-hairline" data-testid="comment-thread-loading">
      <span role="status" className="sr-only">
        {label}
      </span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden
          className={cn("grid gap-2 px-4 py-3 sm:px-5", i === 1 && "ml-6 sm:ml-10")}
        >
          <SkeletonLine minWidth={20} maxWidth={35} />
          <SkeletonLine minWidth={60} maxWidth={95} />
          <SkeletonLine minWidth={40} maxWidth={70} />
        </div>
      ))}
    </div>
  );
}

/**
 * An entry's comments as Studio's thread view shows them (RFC-0007 §4.3, §14; DESIGN.md §2w):
 * two levels, oldest first. Replies to replies stay on the second level with "In reply to …",
 * which moves focus to the comment answered (smoothly, unless reduced motion is asked for) and
 * tints it briefly. More than `collapseAfter` replies fold behind "Show n more replies". Replies
 * whose top-level comment is missing hang under a "This comment was removed" tombstone.
 *
 * Every comment is a `CommentRow`; the screen supplies the actions, details and reply form.
 */
export function CommentThread({
  comments,
  words,
  labels,
  locale,
  now,
  collapseAfter = 3,
  renderActions,
  renderDetails,
  renderReply,
  selection,
  loading,
  empty,
  error,
  className,
}: CommentThreadProps) {
  const tree = useMemo(() => buildCommentThread(comments), [comments]);
  const byId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const jump = useCallback(
    (id: string) => {
      const target = byId.get(id);
      const rootId = target?.parentId ?? id;
      const node = tree.find((n) => n.id === rootId);
      const index = node?.replies.findIndex((r) => r.id === id) ?? -1;
      const finish = () => {
        const el = document.getElementById(commentAnchorId(id));
        if (!el) return;
        el.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
        el.focus({ preventScroll: true });
        setHighlighted(id);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHighlighted(null), 2000);
      };
      if (index >= collapseAfter && !expanded.has(rootId)) {
        setExpanded((s) => new Set(s).add(rootId));
        // Wait for the folded reply to render.
        requestAnimationFrame(finish);
      } else finish();
    },
    [byId, tree, collapseAfter, expanded, reducedMotion],
  );

  if (error) return <>{error}</>;
  if (loading) return <ThreadSkeleton label={labels.loading} />;
  if (tree.length === 0) return <>{empty}</>;

  const row = (c: CommentRowData, reply: boolean) => {
    const answered =
      reply && c.inReplyToId && c.inReplyToId !== c.parentId ? byId.get(c.inReplyToId) : undefined;
    return (
      <CommentRow
        comment={c}
        words={words}
        locale={locale}
        showEntry={false}
        highlighted={highlighted === c.id}
        onJump={jump}
        {...(now ? { now } : {})}
        {...(answered
          ? {
              inReplyTo: {
                id: answered.id,
                name: commentAuthorName(answered.author) ?? words.author.anonymous,
              },
            }
          : {})}
        {...(selection
          ? {
              selection: {
                checked: selection.selected.has(c.id),
                onCheckedChange: (checked: boolean) => selection.onToggle(c.id, checked),
                label: selection.label(c),
              },
            }
          : {})}
        actions={renderActions?.(c)}
      >
        {renderDetails?.(c)}
      </CommentRow>
    );
  };

  return (
    <ol
      aria-label={labels.thread}
      className={cn("m-0 grid list-none divide-y divide-kumo-hairline p-0", className)}
      data-testid="comment-thread"
    >
      {tree.map((node) => (
        <ThreadItem
          key={node.id}
          node={node}
          row={row}
          words={words}
          labels={labels}
          collapseAfter={collapseAfter}
          expanded={expanded.has(node.id)}
          onExpandedChange={(open) =>
            setExpanded((s) => {
              const next = new Set(s);
              if (open) next.add(node.id);
              else next.delete(node.id);
              return next;
            })
          }
          renderReply={renderReply}
        />
      ))}
    </ol>
  );
}

function ThreadItem({
  node,
  row,
  words,
  labels,
  collapseAfter,
  expanded,
  onExpandedChange,
  renderReply,
}: {
  node: CommentThreadNode<CommentRowData>;
  row: (c: CommentRowData, reply: boolean) => ReactNode;
  words: CommentWords;
  labels: CommentThreadLabels;
  collapseAfter: number;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  renderReply: ((comment: CommentRowData) => ReactNode) | undefined;
}) {
  const reply = node.comment ? renderReply?.(node.comment) : undefined;
  const listId = useId();
  const hidden = Math.max(0, node.replies.length - collapseAfter);
  const shown = expanded ? node.replies : node.replies.slice(0, collapseAfter);
  const parentName = node.comment
    ? (commentAuthorName(node.comment.author) ?? words.author.anonymous)
    : words.removed;
  return (
    <li className="min-w-0" data-thread-root={node.id}>
      {node.comment ? (
        row(node.comment, false)
      ) : (
        <div
          id={commentAnchorId(node.id)}
          tabIndex={-1}
          className="px-4 py-3 focus:outline-none sm:px-5"
          data-comment-placeholder
        >
          <Text variant="secondary">{words.removed}</Text>
        </div>
      )}
      {node.replies.length > 0 && (
        <div className="ml-4 border-kumo-hairline border-l pb-2 sm:ml-8">
          <ol
            id={listId}
            aria-label={labels.replies(parentName)}
            className="m-0 grid list-none divide-y divide-kumo-hairline p-0"
          >
            {shown.map((c) => (
              <li key={c.id} className="min-w-0">
                {row(c, true)}
                <ReplySlot>{renderReply?.(c)}</ReplySlot>
              </li>
            ))}
          </ol>
          {hidden > 0 && (
            <div className="px-4 pt-1 sm:px-5">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-controls={listId}
                icon={expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
                onClick={() => onExpandedChange(!expanded)}
              >
                {expanded ? labels.showFewer : labels.showMore(hidden)}
              </Button>
            </div>
          )}
        </div>
      )}
      <ReplySlot>{reply}</ReplySlot>
    </li>
  );
}

function ReplySlot({ children }: { children: ReactNode }) {
  if (children === undefined || children === null || children === false) return null;
  return <div className="px-4 pb-4 sm:px-5">{children}</div>;
}
