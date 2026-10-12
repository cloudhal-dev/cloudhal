import { Badge, Checkbox, cn, Link, Text } from "@cloudflare/kumo";
import type { Comment } from "@cloudhal/core-contracts";
import { ArrowBendUpLeft, Robot } from "@phosphor-icons/react";
import { type MouseEvent, type ReactNode, useId } from "react";
import {
  CommentAuthor,
  CommentLabelList,
  CommentStatusBadge,
  CommentTime,
  type CommentWords,
  UntrustedTextPanel,
} from "./CommentParts.tsx";
import { CommentText } from "./CommentText.tsx";
import { commentAnchorId, isInstructionLike } from "./comment-model.ts";

/**
 * A comment as Studio receives it: the `Comment` contract plus the REST response's Studio-only
 * fields (RFC-0007 §12) — never an email or an IP hash.
 */
export type CommentRowData = Pick<
  Comment,
  | "id"
  | "author"
  | "status"
  | "createdAt"
  | "editedAt"
  | "body"
  | "labels"
  | "parentId"
  | "inReplyToId"
  | "moderation"
> & {
  /** How the submission proved itself; `none` shows the muted "No JavaScript" note. */
  proof?: "pow" | "turnstile" | "none" | "staff" | "import";
  /** Open reports on the comment (DSA Art. 16). */
  reports?: { count: number };
  /** The entry the comment belongs to: its title, its editor or thread link, its public path. */
  entry?: { title: string; href?: string; path?: string };
};

export interface CommentRowProps {
  comment: CommentRowData;
  words: CommentWords;
  locale: string;
  /** "Now" for relative times. */
  now?: number;
  /** Show the entry line ("On Ferry timetable /posts/ferries"). Default: when `entry` is set. */
  showEntry?: boolean;
  /** The comment this one answers when it is a reply to a reply (§4.3); the thread computes it. */
  inReplyTo?: { id: string; name: string };
  /** Moves focus to another comment of the thread (the "in reply to" link); without it the link is a plain `#comment-…` anchor. */
  onJump?: (id: string) => void;
  /** A selection checkbox at the start of the row (bulk moderation). */
  selection?: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string };
  /** Right of the status badge: the row's `DropdownMenu` (Approve, Hide…, Spam…, Reply, …). */
  actions?: ReactNode;
  /** Under the text: moderation history, reports, a reply form. */
  children?: ReactNode;
  /** A brief tint after a jump to this comment. */
  highlighted?: boolean;
  className?: string;
}

/**
 * One comment in Studio (RFC-0007 §14; DESIGN.md §2w): author and kind, time, "edited", the
 * "No JavaScript" note, the status badge and the row's actions on the first line; the entry,
 * "in reply to …", reports and "Drafted by …" on the second; then the text exactly as the public
 * page shows it (`CommentText`), inside the untrusted-text panel when it is labelled
 * `instruction-like`; then its labels. A deleted comment, or one whose text was erased, reads
 * "This comment was removed". The element is `#comment-<id>` and focusable from a jump.
 *
 * Not a card: rows sit in a flush `SectionCard`'s `divide-y` list or in `CommentThread`.
 */
export function CommentRow({
  comment,
  words,
  locale,
  now,
  showEntry,
  inReplyTo,
  onJump,
  selection,
  actions,
  children,
  highlighted,
  className,
}: CommentRowProps) {
  const nameId = useId();
  const text = comment.body?.text;
  const removed = comment.status === "deleted" || !text;
  const muted = comment.status === "hidden" || comment.status === "spam";
  const entry = (showEntry ?? true) ? comment.entry : undefined;
  const drafted = comment.author.kind === "staff" ? comment.author.draftedBy : undefined;
  const reports = comment.reports?.count ?? 0;
  const body = removed ? (
    <Text variant="secondary">{words.removed}</Text>
  ) : (
    <CommentText text={text} muted={muted} newTabLabel={words.newTab} />
  );
  const meta = entry || inReplyTo || reports > 0 || drafted;

  return (
    <article
      id={commentAnchorId(comment.id)}
      tabIndex={-1}
      aria-labelledby={nameId}
      data-comment-id={comment.id}
      data-status={comment.status}
      className={cn(
        "flex min-w-0 scroll-mt-20 items-start gap-3 px-4 py-3 focus:outline-none sm:px-5",
        highlighted && "bg-kumo-tint",
        className,
      )}
    >
      {selection && (
        <span className="flex h-lh shrink-0 items-center">
          <Checkbox
            checked={selection.checked}
            onCheckedChange={(checked) => selection.onCheckedChange(checked === true)}
            aria-label={selection.label}
          />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-2">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <CommentAuthor author={comment.author} words={words} id={nameId} />
            <CommentTime at={comment.createdAt} locale={locale} {...(now ? { now } : {})} />
            {comment.editedAt && (
              <Text as="span" variant="secondary" size="sm">
                · {words.edited}
              </Text>
            )}
            {comment.proof === "none" && (
              <Text as="span" variant="secondary" size="sm">
                · {words.noScript}
              </Text>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CommentStatusBadge status={comment.status} words={words} />
            {actions}
          </div>
        </header>
        {meta && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {entry && (
              <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2">
                <Text as="span" variant="secondary" size="sm">
                  {entry.href ? (
                    <Link href={entry.href} variant="current">
                      {words.onEntry(entry.title)}
                    </Link>
                  ) : (
                    words.onEntry(entry.title)
                  )}
                </Text>
                {entry.path && (
                  <Text as="span" variant="mono-secondary">
                    {entry.path}
                  </Text>
                )}
              </span>
            )}
            {inReplyTo && (
              <span className="inline-flex min-w-0 items-center gap-1 text-kumo-subtle">
                <ArrowBendUpLeft size={16} aria-hidden />
                <Text as="span" variant="secondary" size="sm">
                  <Link
                    // A native anchor: an in-page fragment must not go through the app router.
                    render={(props) => <a {...props} href={`#${commentAnchorId(inReplyTo.id)}`} />}
                    variant="current"
                    onClick={(e: MouseEvent) => {
                      if (!onJump) return;
                      e.preventDefault();
                      onJump(inReplyTo.id);
                    }}
                    data-in-reply-to={inReplyTo.id}
                  >
                    {words.inReplyTo(inReplyTo.name)}
                  </Link>
                </Text>
              </span>
            )}
            {reports > 0 && <Badge variant="error">{words.reports(reports)}</Badge>}
            {drafted && (
              <span className="inline-flex min-w-0 items-center gap-1 text-kumo-subtle">
                <Robot size={16} aria-hidden />
                <Text as="span" variant="secondary" size="sm">
                  {words.draftedBy(drafted.name ?? drafted.id)}
                </Text>
              </span>
            )}
          </div>
        )}
        {!removed && isInstructionLike(comment.labels) ? (
          <UntrustedTextPanel words={words}>{body}</UntrustedTextPanel>
        ) : (
          body
        )}
        <CommentLabelList labels={comment.labels} words={words} locale={locale} />
        {children}
      </div>
    </article>
  );
}
