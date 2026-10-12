import { Button, cn, SkeletonLine, Text } from "@cloudflare/kumo";
import { CalendarDots, CaretDown, CaretRight } from "@phosphor-icons/react";
import { Fragment, type ReactNode, useId, useMemo, useState } from "react";
import { ScheduleItem } from "./ScheduleItem.tsx";
import { SectionEmpty } from "./SectionEmpty.tsx";
import {
  formatDay,
  groupByDay,
  relativeDay,
  type ScheduleEntry,
  type ScheduleWords,
  scheduleLook,
} from "./schedule-model.ts";

export interface AgendaListLabels {
  /** The list's accessible name ("Agenda"). */
  list: string;
  /** A day's heading from its parts; default "Today · Monday 12 October" (relative only near today). */
  dayHeading?: (parts: { date: string; relative?: string | undefined }) => string;
  /** The rule between past and future today ("Now"). */
  now: string;
  /** Today's finished items, folded: "3 done today". */
  doneToday: (count: number) => string;
  /** A day's folded recurring runs: "24 more automation runs". */
  moreRuns: (count: number) => string;
  /** The footer button ("Load more"). */
  loadMore: string;
  /** Spoken while loading ("Loading schedules"). */
  loading: string;
  /** No items in the range or view. */
  emptyTitle: string;
  emptyDescription?: string;
}

export interface AgendaListProps {
  entries: readonly ScheduleEntry[];
  /** Today in the site zone, `YYYY-MM-DD`. */
  today: string;
  /** The clock for the "Now" rule (ms). Default `Date.now()`. */
  now?: number;
  locale: string;
  /** The site's zone (IANA). Default UTC. */
  timeZone?: string;
  hourCycle?: "h23" | "h12";
  words: ScheduleWords;
  labels: AgendaListLabels;
  /** Trailing actions per row (Deny/Approve, the ⋯ menu with "Move to…"). */
  renderActions?: (entry: ScheduleEntry) => ReactNode;
  /** Who per row (`ActorBadge` + `ModeBadge subtle`). */
  renderOrigin?: (entry: ScheduleEntry) => ReactNode;
  /** Under the title (collection, locale, terms as outline badges). */
  renderMeta?: (entry: ScheduleEntry) => ReactNode;
  /** Why an entry is in its state (the status badge's tooltip). */
  renderReason?: (entry: ScheduleEntry) => string | undefined;
  /** Recurring runs shown per day before the rest fold. Default 3. */
  foldRecurringAfter?: number;
  loading?: boolean;
  /** Cursor paging ("Load more"). */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Extra content of the empty state (the screen's "New schedule"). */
  emptyContents?: ReactNode;
  /**
   * Where day headings stick: under Studio's 48 px top bar (`topbar`, default) or at the top of
   * the nearest scroll container (`top`).
   */
  stick?: "topbar" | "top";
  className?: string;
}

/**
 * The Agenda view (RFC-0008 §15.2, the default on every width; DESIGN.md §2x): entries grouped
 * by their day in the site zone, under sticky day headings ("Today · Monday 12 October",
 * `border-b` to separate them from the rows), rows as `ScheduleItem variant="row"` in a
 * `divide-y` list. Today has a "Now" rule between past and future, its finished items fold
 * behind "3 done today", and recurring automation runs past `foldRecurringAfter` fold per day.
 * It is a complete equivalent of the Month view. Loading is skeleton rows with a status line,
 * nothing is a frameless `SectionEmpty`, more is a secondary "Load more".
 */
export function AgendaList({
  entries,
  today,
  now,
  locale,
  timeZone = "UTC",
  hourCycle,
  words,
  labels,
  renderActions,
  renderOrigin,
  renderMeta,
  renderReason,
  foldRecurringAfter = 3,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyContents,
  stick = "topbar",
  className,
}: AgendaListProps) {
  const groups = useMemo(() => groupByDay(entries, timeZone), [entries, timeZone]);
  const [showDone, setShowDone] = useState(false);
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(new Set());
  const baseId = useId();
  const clock = now ?? Date.now();

  if (loading) {
    return (
      <div className={cn("grid gap-4 px-5 py-4", className)} data-agenda-loading="">
        <span role="status" className="sr-only">
          {labels.loading}
        </span>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonLine key={i} />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <SectionEmpty
        icon={<CalendarDots size={48} />}
        title={labels.emptyTitle}
        description={labels.emptyDescription}
        contents={emptyContents}
        className={className}
      />
    );
  }

  const heading = (day: string) => {
    const parts = {
      date: formatDay(day, locale, "long"),
      relative: relativeDay(day, today, locale),
    };
    return labels.dayHeading
      ? labels.dayHeading(parts)
      : parts.relative
        ? `${parts.relative} · ${parts.date}`
        : parts.date;
  };

  const row = (entry: ScheduleEntry) => (
    <li key={entry.id}>
      <ScheduleItem
        variant="row"
        entry={entry}
        words={words}
        locale={locale}
        timeZone={timeZone}
        hourCycle={hourCycle}
        meta={renderMeta?.(entry)}
        origin={renderOrigin?.(entry)}
        actions={renderActions?.(entry)}
        reason={renderReason?.(entry)}
      />
    </li>
  );

  const nowRule = (
    <li key="now" data-now-rule="" className="px-5 py-1">
      <span className="sr-only">{labels.now}</span>
      <span aria-hidden className="flex items-center gap-2 text-kumo-danger">
        <span className="size-2 rounded-full bg-kumo-danger" />
        <Text as="span" size="xs" variant="secondary">
          {labels.now}
        </Text>
        <span className="h-px flex-1 bg-kumo-danger" />
      </span>
    </li>
  );

  return (
    <section className={cn("grid min-w-0", className)} aria-label={labels.list}>
      {groups.map(({ day, entries: list }, index) => {
        const isToday = day === today;
        const done = isToday
          ? list.filter((e) => Date.parse(e.at) < clock && scheduleLook(e) === "done")
          : [];
        const visible = showDone ? list : list.filter((e) => !done.includes(e));
        const runs = visible.filter((e) => e.recurring);
        const foldRuns = runs.length > foldRecurringAfter && !openRuns.has(day);
        const folded = foldRuns ? new Set(runs.slice(foldRecurringAfter)) : new Set();
        const shown = visible.filter((e) => !folded.has(e));
        const nowAt = isToday ? shown.findIndex((e) => Date.parse(e.at) >= clock) : -1;
        const headingId = `${baseId}-${day}`;
        return (
          <div key={day} data-agenda-day={day}>
            <div
              className={cn(
                "sticky z-1 border-b border-kumo-line bg-kumo-base px-5 py-2",
                stick === "topbar" ? "top-12" : "top-0",
                // The first heading follows the card's corners (sticky needs a card that does not clip).
                index === 0 && "rounded-t-lg",
              )}
            >
              <div id={headingId}>
                <Text as="h3" bold>
                  {heading(day)}
                </Text>
              </div>
            </div>
            <ul className="m-0 grid list-none divide-y divide-kumo-hairline p-0">
              {done.length > 0 && (
                <li key="done" className="px-3 py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={showDone ? <CaretDown size={16} /> : <CaretRight size={16} />}
                    aria-expanded={showDone}
                    onClick={() => setShowDone((v) => !v)}
                    data-fold="done"
                  >
                    {labels.doneToday(done.length)}
                  </Button>
                </li>
              )}
              {shown.map((e, i) => (
                <Fragment key={e.id}>
                  {i === nowAt && nowRule}
                  {row(e)}
                </Fragment>
              ))}
              {isToday && nowAt === -1 && nowRule}
              {(foldRuns || openRuns.has(day)) && runs.length > foldRecurringAfter && (
                <li key="runs" className="px-3 py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={foldRuns ? <CaretRight size={16} /> : <CaretDown size={16} />}
                    aria-expanded={!foldRuns}
                    onClick={() =>
                      setOpenRuns((prev) => {
                        const next = new Set(prev);
                        if (next.has(day)) next.delete(day);
                        else next.add(day);
                        return next;
                      })
                    }
                    data-fold="runs"
                  >
                    {labels.moreRuns(runs.length - foldRecurringAfter)}
                  </Button>
                </li>
              )}
            </ul>
          </div>
        );
      })}
      {hasMore && onLoadMore && (
        <div className="flex justify-center border-t border-kumo-hairline px-5 py-3">
          <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>
            {labels.loadMore}
          </Button>
        </div>
      )}
    </section>
  );
}
