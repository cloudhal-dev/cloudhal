import { Button, cn, Tabs, Text } from "@cloudflare/kumo";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type CalendarView = "agenda" | "month";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["agenda", "month"];

export interface CalendarNavLabels {
  /** The group's accessible name ("Calendar navigation"). */
  group: string;
  /** Icon buttons: "Previous month", "Next month" (the screen words them for the view). */
  previous: string;
  next: string;
  /** "Today". */
  today: string;
  /** The view switch's name ("View") and its tabs ("Agenda", "Month"). */
  view: string;
  views: Record<CalendarView, string>;
  /** For screen readers, after the switch: "The agenda lists the same items as the month." */
  viewHint?: string;
}

export interface CalendarNavProps {
  /** The period shown, already worded: "October 2026", "12 – 18 October". Spoken politely when it changes. */
  rangeLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** The view switch; left out without `onViewChange`. */
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  views?: readonly CalendarView[];
  labels: CalendarNavLabels;
  /** Today is already shown: "Today" is disabled. */
  todayShown?: boolean;
  /** Next to the period: the screen's "Go to date" `Popover` + `DatePicker`. */
  goTo?: ReactNode;
  className?: string;
}

/**
 * The calendar's navigation row (RFC-0008 §15.1): ‹ Today › as Kumo buttons (square icon
 * buttons with `aria-label`), the period in a polite live region so a screen reader hears where
 * it landed, an optional "Go to date" slot, and the view switch as segmented `Tabs` (Agenda |
 * Month) whose hint says the agenda is a full equivalent. Shortcuts (`j`/`k`, `g t`, `a`/`m`)
 * belong to the screen, which calls the same handlers. Wraps on phones.
 */
export function CalendarNav({
  rangeLabel,
  onPrevious,
  onNext,
  onToday,
  view,
  onViewChange,
  views = CALENDAR_VIEWS,
  labels,
  todayShown,
  goTo,
  className,
}: CalendarNavProps) {
  return (
    <fieldset
      aria-label={labels.group}
      className={cn(
        "m-0 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-0 p-0",
        className,
      )}
      data-calendar-nav=""
    >
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          shape="square"
          aria-label={labels.previous}
          icon={<CaretLeft size={16} />}
          onClick={onPrevious}
          data-nav="previous"
        />
        <Button variant="secondary" onClick={onToday} disabled={todayShown} data-nav="today">
          {labels.today}
        </Button>
        <Button
          variant="secondary"
          shape="square"
          aria-label={labels.next}
          icon={<CaretRight size={16} />}
          onClick={onNext}
          data-nav="next"
        />
      </div>
      <span aria-live="polite" aria-atomic="true" className="min-w-0" data-range-label="">
        <Text as="span" bold>
          {rangeLabel}
        </Text>
      </span>
      {goTo}
      {view && onViewChange && (
        <div className="ms-auto flex items-center">
          <Tabs
            variant="segmented"
            value={view}
            onValueChange={(v) => {
              if ((views as readonly string[]).includes(v)) onViewChange(v as CalendarView);
            }}
            tabs={views.map((v) => ({ value: v, label: labels.views[v] }))}
            className="min-w-0"
            listClassName="min-w-0"
            aria-label={labels.view}
          />
          {labels.viewHint && <span className="sr-only">{labels.viewHint}</span>}
        </div>
      )}
    </fieldset>
  );
}
