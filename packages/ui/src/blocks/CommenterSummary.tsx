import { Badge, SkeletonLine, Text } from "@cloudflare/kumo";
import type { CommentStatus } from "@cloudhal/core-contracts";
import type { ReactNode } from "react";
import { CommentStatusBadge, type CommentWords } from "./CommentParts.tsx";
import { COMMENT_STATUSES, formatCommentDate, formatCommentTime } from "./comment-model.ts";
import { InsetPanel } from "./InsetPanel.tsx";

export type CommentBanSubject = "email" | "ip";

export interface CommenterBan {
  /** RFC 3339 end of the ban; `null` = until lifted. */
  until: string | null;
  subjects: readonly CommentBanSubject[];
  /** The reason in words ("Abuse"). */
  reason?: string;
}

export interface CommenterSummaryLabels {
  /** Row names. */
  names: string;
  email: string;
  firstSeen: string;
  lastSeen: string;
  ban: string;
  /** Accessible name of the counts ("Comments by status"). */
  counts: string;
  /** "Not banned". */
  notBanned: string;
  /** `(date)` → "Banned until 10 Jan 2027". */
  bannedUntil: (date: string) => string;
  /** "Banned until lifted". */
  bannedForever: string;
  /** What a ban covers: "Email address", "Network (until the month's salt rotates)". */
  banSubject: Record<CommentBanSubject, string>;
  /** Spoken while loading ("Loading commenter"). */
  loading: string;
}

export interface CommenterSummaryProps {
  locale: string;
  now?: number;
  words: Pick<CommentWords, "status">;
  labels: CommenterSummaryLabels;
  /** Every display name this commenter used, newest first. Plain text. */
  names: readonly string[];
  counts: Partial<Record<CommentStatus, number>>;
  firstSeen?: string;
  lastSeen?: string;
  /** The active ban, or `null`/absent when there is none. */
  ban?: CommenterBan | null;
  /**
   * The address, from the `commenters` routes only (`commenters:data`, RFC-0007 §10.1). Shown
   * **only** when `canSeeEmail` is true too, so a screen that fetched it for another reason cannot
   * leak it by accident.
   */
  email?: string;
  canSeeEmail?: boolean;
  /** Ban…, Export their data, Erase… — the screen's buttons, under the summary. */
  actions?: ReactNode;
  loading?: boolean;
  /** Replaces the body (an error `Banner`, or `ViewOnlyBanner` without `commenters:data`). */
  error?: ReactNode;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3 first:pt-0">
      <dt className="min-w-0 flex-[1_1_10rem]">
        <Text bold as="span">
          {label}
        </Text>
      </dt>
      <dd className="m-0 flex min-w-0 flex-[2_1_14rem] flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}

/**
 * A commenter at a glance (RFC-0007 §9, §14 commenter page; DESIGN.md §2w): the names they used,
 * the email address only for viewers allowed to see it, first and last comment, the ban state,
 * and their comments counted by status. The body of the commenter page's identity `SectionCard`;
 * the screen passes its actions (Ban…, Export, Erase…).
 */
export function CommenterSummary({
  locale,
  now,
  words,
  labels,
  names,
  counts,
  firstSeen,
  lastSeen,
  ban,
  email,
  canSeeEmail = false,
  actions,
  loading,
  error,
}: CommenterSummaryProps) {
  if (error) return <>{error}</>;
  if (loading)
    return (
      <div className="grid gap-3" data-testid="commenter-summary-loading">
        <span role="status" className="sr-only">
          {labels.loading}
        </span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden className="grid gap-1.5">
            <SkeletonLine minWidth={20} maxWidth={30} />
            <SkeletonLine minWidth={40} maxWidth={70} />
          </div>
        ))}
      </div>
    );
  const time = (iso: string) => {
    const t = formatCommentTime(iso, locale, now);
    return (
      <Text as="span">
        <time dateTime={iso} title={t.absolute}>
          {formatCommentDate(iso, locale)}
        </time>{" "}
        <Text as="span" variant="secondary" size="sm">
          ({t.relative})
        </Text>
      </Text>
    );
  };
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="grid min-w-0 gap-4" data-testid="commenter-summary">
      <dl className="m-0 grid divide-y divide-kumo-hairline">
        <Row label={labels.names}>
          {names.map((n) => (
            <span key={n} dir="auto" className="min-w-0 wrap-anywhere">
              <Badge variant="outline">{n}</Badge>
            </span>
          ))}
        </Row>
        {canSeeEmail && email && (
          <Row label={labels.email}>
            <span className="min-w-0 wrap-anywhere" data-commenter-email>
              <Text as="span" variant="mono">
                {email}
              </Text>
            </span>
          </Row>
        )}
        {firstSeen && <Row label={labels.firstSeen}>{time(firstSeen)}</Row>}
        {lastSeen && <Row label={labels.lastSeen}>{time(lastSeen)}</Row>}
        <Row label={labels.ban}>
          {ban ? (
            <span className="grid min-w-0 gap-1" data-ban="active">
              <span className="inline-flex">
                <Badge variant="error">
                  {ban.until
                    ? labels.bannedUntil(formatCommentDate(ban.until, locale))
                    : labels.bannedForever}
                </Badge>
              </span>
              <Text as="span" variant="secondary" size="sm">
                {[...ban.subjects.map((s) => labels.banSubject[s]), ban.reason]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </span>
          ) : (
            <span className="inline-flex" data-ban="none">
              <Badge variant="neutral" appearance="dot">
                {labels.notBanned}
              </Badge>
            </span>
          )}
        </Row>
      </dl>
      <InsetPanel label={labels.counts} className="@container">
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 @md:grid-cols-5">
          {COMMENT_STATUSES.map((s) => (
            <div key={s} className="grid min-w-0 justify-items-start gap-1" data-count={s}>
              <dt>
                <CommentStatusBadge status={s} words={words} />
              </dt>
              <dd className="m-0">
                <Text as="span" variant="heading">
                  <span className="tabular-nums">{number.format(counts[s] ?? 0)}</span>
                </Text>
              </dd>
            </div>
          ))}
        </dl>
      </InsetPanel>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
