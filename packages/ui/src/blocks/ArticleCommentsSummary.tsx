import { Badge, Button, LinkButton, SkeletonLine, Tabs, Text } from "@cloudflare/kumo";
import { CalendarBlank, ChatsCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  COMMENT_THREAD_MODES,
  type CommentThreadMode,
  type CommentThreadState,
} from "./comment-model.ts";

export interface ArticleCommentsSummaryLabels {
  /** Accessible name of the mode tabs ("Comments on this article"). */
  mode: string;
  /** Default · Open · Closed · Hidden. */
  modes: Record<CommentThreadMode, string>;
  /** The effective state: Open, Closed, Hidden, Off. */
  state: Record<CommentThreadState, string>;
  /** Before the state badge ("Readers see"). */
  now: string;
  /**
   * Count badges: `(count, formatted)` → "12 approved", "3 pending", "1 reported" (`formatted` is
   * the count in the locale; `count` picks the plural).
   */
  approved: (count: number, formatted: string) => string;
  pending: (count: number, formatted: string) => string;
  reported: (count: number, formatted: string) => string;
  /** Accessible name of the counts ("Comment counts"). */
  counts: string;
  /** The ghost button beside the close date ("Change"). */
  change: string;
  /** The ghost link to the thread view ("Moderate"). */
  moderate: string;
  /** Spoken while loading ("Loading comments"). */
  loading: string;
  /** Kumo's scroll buttons on narrow tabs ("Scroll tabs left/right"), in the Studio language. */
  scrollStart?: string;
  scrollEnd?: string;
}

export interface ArticleCommentsSummaryProps {
  locale: string;
  labels: ArticleCommentsSummaryLabels;
  /** The entry's override (`comment_threads.mode`). */
  mode: CommentThreadMode;
  /** What readers get now (`threadState`). */
  state: CommentThreadState;
  /** Changes the mode; without it (or with `modeReadOnlyReason`) the mode is shown, not offered. */
  onModeChange?: (mode: CommentThreadMode) => void;
  /** Why the person cannot change the mode (an Author on someone else's article, §2s). */
  modeReadOnlyReason?: string;
  /** The close line, already worded: "Closes on 10 January 2027 (90 days after publishing)". */
  closes?: string;
  /** Opens the "Close on…" picker; shows the ghost "Change" next to `closes`. */
  onChangeClose?: () => void;
  counts: { approved: number; pending: number; reported: number };
  /** The thread view (`/sites/:siteId/comments/:nodeId`). */
  href: string;
  /** While a mode change is saved. */
  saving?: boolean;
  loading?: boolean;
  /**
   * Replaces the body with the card's own state (a `SectionEmpty`): comments off for the
   * collection (with "Comment settings" for those who may change them), never published ("Comments
   * open when this article is published"), or — for Contributors — the reason (DESIGN.md §2s).
   */
  empty?: ReactNode;
}

const STATE_VARIANT: Record<CommentThreadState, "success" | "neutral" | "warning"> = {
  open: "success",
  closed: "neutral",
  hidden: "warning",
  off: "neutral",
};

/**
 * The body of the article editor's "Comments" card (RFC-0007 §14 `ArticleCommentsCard`;
 * DESIGN.md §2w): the thread mode as segmented `Tabs size="sm"` (Default · Open · Closed ·
 * Hidden), the effective state as a dot badge, the close date with a ghost "Change", the counts
 * as badges (approved, pending as warning, reported as error) and a ghost "Moderate" link to the
 * thread. The card itself (`SectionCard` "Comments", `ChatsCircle`) is the screen's.
 */
export function ArticleCommentsSummary({
  locale,
  labels,
  mode,
  state,
  onModeChange,
  modeReadOnlyReason,
  closes,
  onChangeClose,
  counts,
  href,
  saving,
  loading,
  empty,
}: ArticleCommentsSummaryProps) {
  if (empty !== undefined && empty !== null && empty !== false) return <>{empty}</>;
  if (loading)
    return (
      <div className="grid gap-3" data-testid="article-comments-loading">
        <span role="status" className="sr-only">
          {labels.loading}
        </span>
        <span aria-hidden className="grid gap-2">
          <SkeletonLine minWidth={70} maxWidth={100} />
          <SkeletonLine minWidth={40} maxWidth={70} />
          <SkeletonLine minWidth={30} maxWidth={50} />
        </span>
      </div>
    );
  const number = new Intl.NumberFormat(locale);
  const fmt = (n: number) => number.format(n);
  const editable = Boolean(onModeChange) && !modeReadOnlyReason;
  return (
    <div className="grid min-w-0 gap-4" data-testid="article-comments">
      {editable ? (
        <fieldset
          aria-label={labels.mode}
          aria-busy={saving || undefined}
          className="m-0 min-w-0 border-0 p-0"
        >
          <Tabs
            variant="segmented"
            size="sm"
            value={mode}
            onValueChange={(v) => onModeChange?.(v as CommentThreadMode)}
            tabs={COMMENT_THREAD_MODES.map((m) => ({ value: m, label: labels.modes[m] }))}
            labels={{
              ...(labels.scrollStart ? { scrollStart: labels.scrollStart } : {}),
              ...(labels.scrollEnd ? { scrollEnd: labels.scrollEnd } : {}),
            }}
            listClassName="w-full"
          />
        </fieldset>
      ) : (
        <div className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Text as="span" variant="secondary" size="sm">
              {labels.mode}
            </Text>
            <Badge variant="outline">{labels.modes[mode]}</Badge>
          </span>
          {modeReadOnlyReason && (
            <Text variant="secondary" size="sm">
              {modeReadOnlyReason}
            </Text>
          )}
        </div>
      )}
      <div className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="secondary" size="sm">
            {labels.now}
          </Text>
          <span className="inline-flex" data-thread-state={state}>
            <Badge variant={STATE_VARIANT[state]} appearance="dot">
              {labels.state[state]}
            </Badge>
          </span>
        </span>
        {closes && (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="flex min-w-0 items-start gap-2">
              <span className="flex h-lh shrink-0 items-center text-kumo-subtle" aria-hidden>
                <CalendarBlank size={16} />
              </span>
              <Text variant="secondary" size="sm">
                {closes}
              </Text>
            </span>
            {onChangeClose && editable && (
              <Button variant="ghost" size="sm" onClick={onChangeClose}>
                {labels.change}
              </Button>
            )}
          </div>
        )}
      </div>
      <ul
        aria-label={labels.counts}
        className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0"
      >
        <li className="flex" data-count="approved">
          <Badge variant="success">{labels.approved(counts.approved, fmt(counts.approved))}</Badge>
        </li>
        {counts.pending > 0 && (
          <li className="flex" data-count="pending">
            <Badge variant="warning">{labels.pending(counts.pending, fmt(counts.pending))}</Badge>
          </li>
        )}
        {counts.reported > 0 && (
          <li className="flex" data-count="reported">
            <Badge variant="error">{labels.reported(counts.reported, fmt(counts.reported))}</Badge>
          </li>
        )}
      </ul>
      <div className="flex justify-start">
        <LinkButton variant="ghost" size="sm" href={href} icon={<ChatsCircle size={16} />}>
          {labels.moderate}
        </LinkButton>
      </div>
    </div>
  );
}
