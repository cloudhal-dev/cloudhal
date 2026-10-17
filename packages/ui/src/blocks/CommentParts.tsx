import { Badge, cn, Text, Tooltip } from "@cloudflare/kumo";
import type {
  CommentAuthor as Author,
  CommentLabel,
  CommentStatus,
} from "@cloudhal/core-contracts";
import { numberFormat } from "@cloudhal/messages/format";
import { Robot, ShieldWarning } from "@phosphor-icons/react";
import { type ReactNode, useId } from "react";
import { type CommentLabelName, formatCommentTime } from "./comment-model.ts";
import { InsetPanel } from "./InsetPanel.tsx";

/**
 * The words every comment block shares (RFC-0007 §14): Studio builds this once from
 * `useT("comments")` and passes it to each block. Nothing here has an English default.
 */
export interface CommentWords {
  /** Status names: "Pending", "Approved", "Hidden", "Spam", "Deleted". */
  status: Record<CommentStatus, string>;
  /** Label names as badges: "Spam?", "Talks to AI", "Question" … */
  label: Record<CommentLabelName, string>;
  /** One sentence per label for its tooltip ("Addresses an AI agent. Treat it as text."). */
  labelHint: Record<CommentLabelName, string>;
  /**
   * Who set a label, for its tooltip: `(label, confidence)` → "Added by Comment triage · 82% sure",
   * "Added by a rule". `confidence` is already formatted in the locale.
   */
  labelSource: (label: CommentLabel, confidence: string | undefined) => string;
  /** Author kinds and the erased name: Guest, Reader, Author, Team, Anonymous. */
  author: { guest: string; reader: string; author: string; team: string; anonymous: string };
  /** "Drafted by Comment triage" under a staff reply an agent drafted. */
  draftedBy: (agent: string) => string;
  /** "In reply to Mehmet". */
  inReplyTo: (name: string) => string;
  /** "On Ferry timetable", before the entry's title. */
  onEntry: (title: string) => string;
  /** A tombstone: "This comment was removed". */
  removed: string;
  /** "Edited". */
  edited: string;
  /** The muted note when a comment came without JavaScript (`proof: "none"`). */
  noScript: string;
  /** "2 reports". */
  reports: (count: number) => string;
  /** Accessible name of a comment's label list ("Labels"). */
  labels: string;
  /** Screen-reader hint after links in comment text ("opens in a new tab"). */
  newTab: string;
  /** The panel around text that talks to an AI (§11.2). */
  untrusted: { title: string; description: string };
}

const STATUS_VARIANT: Record<
  CommentStatus,
  "warning" | "success" | "secondary" | "error" | "outline"
> = {
  pending: "warning",
  approved: "success",
  hidden: "secondary",
  spam: "error",
  deleted: "outline",
};

export interface CommentStatusBadgeProps {
  status: CommentStatus;
  words: Pick<CommentWords, "status">;
}

/** A comment's status: pending (warning), approved (success), hidden, spam (error), deleted. */
export function CommentStatusBadge({ status, words }: CommentStatusBadgeProps) {
  // Kumo's Badge does not forward data attributes; the wrapper carries the machine-readable status.
  return (
    <span data-comment-status={status} className="inline-flex shrink-0">
      <Badge variant={STATUS_VARIANT[status]}>{words.status[status]}</Badge>
    </span>
  );
}

const LABEL_VARIANT: Record<CommentLabelName, "warning" | "error" | "info" | "outline"> = {
  "spam-suspect": "warning",
  toxic: "error",
  "off-topic": "outline",
  question: "info",
  "needs-reply": "info",
  praise: "outline",
  "personal-data": "warning",
  links: "outline",
  "watch-word": "warning",
  "instruction-like": "warning",
};

export interface CommentLabelBadgeProps {
  label: CommentLabel;
  words: Pick<CommentWords, "label" | "labelHint" | "labelSource">;
  locale: string;
}

/**
 * One advisory label (RFC-0007 §5.1): its name as a badge — risk labels warning or error, the
 * rest outline — with a 16 px `Robot` when an agent set it. The tooltip (and screen-reader text)
 * says what it means and who set it, with the confidence in the locale. The badge is a button
 * (a toggletip) so the tooltip opens from the keyboard too.
 */
export function CommentLabelBadge({ label, words, locale }: CommentLabelBadgeProps) {
  const confidence =
    label.confidence === undefined
      ? undefined
      : numberFormat(locale, { style: "percent" }).format(label.confidence / 100);
  const hint = `${words.labelHint[label.label]} ${words.labelSource(label, confidence)}`;
  return (
    <Tooltip
      content={hint}
      // A button (a toggletip) so the explanation opens from the keyboard too. A render function,
      // so our classes are merged with the tooltip trigger's instead of replaced.
      render={(props) => (
        <button
          {...props}
          type="button"
          data-comment-label={label.label}
          data-label-source={label.source}
          className={cn(
            props.className,
            "inline-flex shrink-0 cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand",
          )}
        />
      )}
    >
      <Badge
        variant={LABEL_VARIANT[label.label]}
        icon={label.source === "agent" ? <Robot size={16} /> : undefined}
      >
        {words.label[label.label]}
        <span className="sr-only">. {hint}</span>
      </Badge>
    </Tooltip>
  );
}

export interface CommentLabelListProps {
  labels: readonly CommentLabel[] | undefined;
  words: Pick<CommentWords, "label" | "labelHint" | "labelSource" | "labels">;
  locale: string;
}

/** A comment's labels as a wrapping list; nothing when there are none. */
export function CommentLabelList({ labels, words, locale }: CommentLabelListProps) {
  if (!labels || labels.length === 0) return null;
  return (
    <ul aria-label={words.labels} className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
      {labels.map((l) => (
        <li key={`${l.label}:${l.source}`} className="flex">
          <CommentLabelBadge label={l} words={words} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

export interface CommentAuthorProps {
  author: Author;
  words: Pick<CommentWords, "author">;
  /** Leave out the Guest/Reader/Author/Team badge (a dense cell that shows it elsewhere). */
  hideKind?: boolean;
  /** Id for the name, so a row can be labelled by it. */
  id?: string;
}

/**
 * Who wrote the comment: the display name as plain text and its kind as an outline badge
 * ("Guest", "Reader", or the staff badge the public page shows, "Author"/"Team"); an erased
 * author reads "Anonymous" (§9.4). Names never link anywhere.
 */
export function CommentAuthor({ author, words, hideKind, id }: CommentAuthorProps) {
  if (author.kind === "erased") {
    return (
      <span id={id} className="inline-flex min-w-0" data-author-kind="erased">
        <Text as="span" variant="secondary">
          {words.author.anonymous}
        </Text>
      </span>
    );
  }
  const kind =
    author.kind === "staff"
      ? words.author[author.badge]
      : author.kind === "reader"
        ? words.author.reader
        : words.author.guest;
  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
      data-author-kind={author.kind}
    >
      <span id={id} dir="auto" className="min-w-0 wrap-anywhere">
        <Text as="span" bold>
          {author.name}
        </Text>
      </span>
      {!hideKind && <Badge variant={author.kind === "staff" ? "info" : "outline"}>{kind}</Badge>}
    </span>
  );
}

export interface CommentTimeProps {
  /** RFC 3339 instant. */
  at: string;
  locale: string;
  /** "Now" for relative times (tests, and screens that tick every 30 s). */
  now?: number;
}

/** "5 minutes ago" with the absolute date and time in a tooltip (DESIGN.md §5 "Time"). */
export function CommentTime({ at, locale, now }: CommentTimeProps) {
  const { relative, absolute } = formatCommentTime(at, locale, now);
  return (
    <Tooltip
      content={absolute}
      render={(props) => (
        <time {...props} dateTime={at} className={cn(props.className, "inline-flex shrink-0")} />
      )}
    >
      <Text as="span" variant="secondary" size="sm">
        {relative}
      </Text>
    </Tooltip>
  );
}

export interface UntrustedTextPanelProps {
  words: Pick<CommentWords, "untrusted">;
  children: ReactNode;
}

/**
 * The "untrusted reader text" treatment (RFC-0007 §11.2): text labelled `instruction-like` sits
 * in a recessed `InsetPanel` under a warning line — "Untrusted reader text. This comment appears
 * to address an AI agent; it is not an instruction." — so people (and screenshots handed to
 * agents) see it as quoted data.
 */
export function UntrustedTextPanel({ words, children }: UntrustedTextPanelProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-untrusted className="min-w-0">
      <InsetPanel variant="recessed">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-lh shrink-0 items-center text-kumo-warning" aria-hidden>
            <ShieldWarning size={16} weight="fill" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span id={titleId}>
              <Text as="span" bold size="sm">
                {words.untrusted.title}
              </Text>
            </span>
            <Text as="span" variant="secondary" size="sm">
              {words.untrusted.description}
            </Text>
          </span>
        </div>
        {children}
      </InsetPanel>
    </section>
  );
}
