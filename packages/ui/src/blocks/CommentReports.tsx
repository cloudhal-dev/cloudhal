import { Badge, Text } from "@cloudflare/kumo";
import { Flag } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { CommentTime } from "./CommentParts.tsx";
import { COMMENT_REPORT_REASONS, type CommentReportReason } from "./comment-model.ts";
import { InsetPanel } from "./InsetPanel.tsx";

/** A `comment_reports` row as the thread view receives it (RFC-0007 §4.1, §6.6): never the reporter's email. */
export interface CommentReport {
  id: string;
  reason: CommentReportReason;
  /** The reporter's words: untrusted plain text, at most 1,000 characters. */
  details?: string;
  createdAt: string;
  resolvedAt?: string;
  /** The decision in words, already worded by the screen ("Hidden — abuse", "No action"). */
  resolution?: string;
}

export interface CommentReportsLabels {
  /** Accessible name of the list ("Reports"). */
  title: string;
  /** `(open, total)` → "2 open reports of 3". */
  summary: (open: number, total: number) => string;
  /** Report reasons as the reader picked them: Spam, Abuse, Personal data, Illegal content, Other. */
  reason: Record<CommentReportReason, string>;
  /** "Open" and "Resolved". */
  open: string;
  resolved: string;
  /** When the reader gave no details ("No details given"). */
  noDetails: string;
  /** Above the details: "The reader's words, as sent". */
  details: string;
}

export interface CommentReportsProps {
  reports: readonly CommentReport[];
  locale: string;
  now?: number;
  labels: CommentReportsLabels;
  /** A report's buttons ("Resolve…"), shown on open reports. */
  renderActions?: (report: CommentReport) => ReactNode;
}

/**
 * The reports on one comment (EU DSA Art. 16 notices; RFC-0007 §6.6, §14 thread): a summary line
 * with the count per reason, then each report — reason badge, open or resolved, time, the
 * reader's details as plain text in a recessed `InsetPanel` (untrusted, no links), and the
 * resolution. A report never changes a comment's status by itself; the screen's actions decide.
 */
export function CommentReports({
  reports,
  locale,
  now,
  labels,
  renderActions,
}: CommentReportsProps) {
  if (reports.length === 0) return null;
  const open = reports.filter((r) => !r.resolvedAt).length;
  const counts = COMMENT_REPORT_REASONS.map(
    (reason) => [reason, reports.filter((r) => r.reason === reason).length] as const,
  ).filter(([, n]) => n > 0);
  const number = new Intl.NumberFormat(locale);
  const sorted = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-label={labels.title} className="grid min-w-0 gap-3" data-testid="comment-reports">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="flex h-lh items-center text-kumo-danger" aria-hidden>
          <Flag size={16} weight="fill" />
        </span>
        <Text as="span" bold>
          {labels.summary(open, reports.length)}
        </Text>
        {counts.map(([reason, n]) => (
          <Badge key={reason} variant="outline">
            {labels.reason[reason]} · <span className="tabular-nums">{number.format(n)}</span>
          </Badge>
        ))}
      </div>
      <ol className="m-0 grid list-none gap-3 p-0">
        {sorted.map((r) => (
          <li key={r.id} className="grid min-w-0 gap-2" data-report-reason={r.reason}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant={r.reason === "illegal-content" ? "error" : "warning"}>
                  {labels.reason[r.reason]}
                </Badge>
                <span
                  className="inline-flex"
                  data-report-state={r.resolvedAt ? "resolved" : "open"}
                >
                  <Badge variant={r.resolvedAt ? "neutral" : "warning"} appearance="dot">
                    {r.resolvedAt ? labels.resolved : labels.open}
                  </Badge>
                </span>
                <CommentTime at={r.createdAt} locale={locale} {...(now ? { now } : {})} />
              </span>
              {!r.resolvedAt && renderActions && (
                <span className="flex items-center gap-2">{renderActions(r)}</span>
              )}
            </div>
            {r.details ? (
              <InsetPanel variant="recessed" label={labels.details}>
                <span
                  dir="auto"
                  className="block min-w-0 whitespace-pre-line wrap-anywhere"
                  data-report-details
                >
                  <Text as="span">{r.details}</Text>
                </span>
              </InsetPanel>
            ) : (
              <Text variant="secondary" size="sm">
                {labels.noDetails}
              </Text>
            )}
            {r.resolution && (
              <Text variant="secondary" size="sm">
                {r.resolution}
              </Text>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
