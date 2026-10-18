import { cn, Popover, Table, Text } from "@cloudflare/kumo";
import { useDirection } from "@cloudflare/kumo/primitives/direction-provider";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { readingKey } from "./reading-keys.ts";
import { ScheduleItem } from "./ScheduleItem.tsx";
import {
  entryDay,
  formatDay,
  formatMonth,
  monthGrid,
  monthOf,
  relativeDay,
  type ScheduleEntry,
  type ScheduleLook,
  type ScheduleWords,
  scheduleLook,
  shiftDay,
  shiftMonth,
  sortEntries,
  type WeekDay,
  weekdayNames,
  weekdayOf,
  weekdayOrder,
} from "./schedule-model.ts";

/** What a day cell's accessible name is made from; the screen words it. */
export interface CalendarDayContext {
  day: string;
  /** "Monday 12 October" in the locale. */
  date: string;
  today: boolean;
  /** A day of the previous or next month shown to fill the week. */
  outside: boolean;
  entries: readonly ScheduleEntry[];
}

export interface CalendarMonthLabels {
  /** The grid's name; default the month in the locale ("October 2026"). */
  grid?: string;
  /** Keyboard help, read as the grid's description. */
  instructions: string;
  /** A cell's name: "Monday 12 October, today, 3 items: 2 publishes, 1 waiting for approval". */
  day: (ctx: CalendarDayContext) => string;
  /** The overflow button: "+2 more". */
  more: (count: number) => string;
  /** Phones: the name of the day list under the dots ("Monday 12 October"); default the date. */
  dayList?: (date: string) => string;
  /** Phones: a day without items ("Nothing scheduled"). */
  emptyDay: string;
}

/** A drop or a keyboard move. Nothing is written: the screen opens `RescheduleDialog`. */
export interface CalendarMove {
  entry: ScheduleEntry;
  fromDay: string;
  toDay: string;
  via: "pointer" | "keyboard";
}

export type CalendarDensity = "auto" | "chips" | "dots";

export interface CalendarMonthProps {
  /** The month shown, `YYYY-MM`. */
  month: string;
  /** Today in the site zone, `YYYY-MM-DD`. */
  today: string;
  entries: readonly ScheduleEntry[];
  locale: string;
  /** The site's zone (IANA): entries are placed on days and timed in it. Default UTC. */
  timeZone?: string;
  /** First column (0 = Sunday): `firstDayOfWeek(locale)` — Monday in Turkish. */
  weekStartsOn: WeekDay;
  /** Weekend days, tinted like past days. Default Saturday and Sunday. */
  weekend?: readonly WeekDay[];
  words: ScheduleWords;
  labels: CalendarMonthLabels;
  /**
   * `chips` (desktop: up to `maxChips` chips and "+N more"), `dots` (phones: the day number, up
   * to three dots and the chosen day's list below) or `auto` (dots at 640 px and below).
   */
  density?: CalendarDensity;
  maxChips?: number;
  /** The day the person chose (phones: whose list shows). Uncontrolled when absent. */
  selectedDay?: string | undefined;
  onSelectDay?: (day: string) => void;
  /** Moving past the shown weeks (arrows, PageUp/PageDown) asks for another month. */
  onMonthChange?: (month: string, focusDay: string) => void;
  /** A click or Enter on a chip. */
  onOpenEntry?: (entry: ScheduleEntry) => void;
  /**
   * Drag a chip onto another day (desktop chips, pointer), or Alt+arrow on a focused chip. Only
   * `movable` entries move; without `onMove` nothing is draggable.
   */
  onMove?: (move: CalendarMove) => void;
  /** Trailing actions of an entry in the "+N more" popover and the phone day list ("Move to…"). */
  renderActions?: (entry: ScheduleEntry) => ReactNode;
  /** Origin badges of an entry in those lists. */
  renderOrigin?: (entry: ScheduleEntry) => ReactNode;
  /** Spoken by the grid's polite live region ("Election results moved to 14 October 09:00"). */
  announcement?: string | undefined;
  hourCycle?: "h23" | "h12";
  className?: string;
}

const PHONE = "(max-width: 640px)";

function useMediaQuery(query: string, enabled: boolean): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!enabled || typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", notify);
      return () => mq.removeEventListener?.("change", notify);
    },
    [query, enabled],
  );
  return useSyncExternalStore(
    subscribe,
    () => enabled && typeof window !== "undefined" && !!window.matchMedia?.(query).matches,
    () => false,
  );
}

const DOT: Record<ScheduleLook, string> = {
  quiet: "bg-kumo-brand",
  auto: "bg-kumo-brand",
  proposed: "ring-1 ring-inset ring-kumo-warning",
  struck: "bg-kumo-fill",
  danger: "bg-kumo-danger",
  running: "bg-kumo-info",
  done: "bg-kumo-fill",
  ghost: "ring-1 ring-inset ring-kumo-line",
  paused: "ring-1 ring-inset ring-kumo-line",
};

/** Days an arrow key moves, read in the reading order (`readingKey`). */
const DAY_STEPS: Partial<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * The Month view (RFC-0008 §15.2, §15.4, §15.7; DESIGN.md §2x): a WAI-ARIA APG data grid on a
 * fixed Kumo `Table` (seven columns starting on `weekStartsOn`) with **one tab stop** and a roving
 * `tabindex`. Arrows move by day and week, Home/End to the week's ends, PageUp/PageDown by month
 * (Shift: year) — asking `onMonthChange` when the day leaves the shown weeks; Enter or F2 goes into
 * the day's chips (arrows between them), Escape back to the day. Alt+arrow on a movable chip is
 * the keyboard twin of dragging (`onMove`, `via: "keyboard"`); on desktop, chips of movable
 * entries drag onto another day with the pointer. Neither writes: the screen confirms in
 * `RescheduleDialog`, and every item's menu keeps "Move to…" (WCAG 2.2 SC 2.5.7).
 *
 * Cells show at most `maxChips` chips and a "+N more" `Popover` with the day's agenda. Weekends
 * and past days are recessed; today has `aria-current="date"`. On phones (`density="dots"`, or
 * `auto` at ≤ 640 px) a cell is the day number and up to three dots (plus an approval dot), the
 * whole cell is the target, and the chosen day's agenda shows under the grid. Targets are at
 * least 24 px (SC 2.5.8). Every word is a prop; dates come from `Intl` in `locale`.
 */
export function CalendarMonth({
  month,
  today,
  entries,
  locale,
  timeZone = "UTC",
  weekStartsOn,
  weekend = [6, 0],
  words,
  labels,
  density = "auto",
  maxChips = 3,
  selectedDay,
  onSelectDay,
  onMonthChange,
  onOpenEntry,
  onMove,
  renderActions,
  renderOrigin,
  announcement,
  hourCycle,
  className,
}: CalendarMonthProps) {
  const direction = useDirection();
  const phone = useMediaQuery(PHONE, density === "auto");
  const dots = density === "dots" || (density === "auto" && phone);
  const weeks = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn]);
  const days = useMemo(() => weeks.flat(), [weeks]);
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const e of sortEntries(entries)) {
      const d = entryDay(e, timeZone);
      const list = map.get(d);
      if (list) list.push(e);
      else map.set(d, [e]);
    }
    return map;
  }, [entries, timeZone]);

  const fallbackDay = monthOf(today) === month ? today : `${month}-01`;
  const [ownSelected, setOwnSelected] = useState<string | undefined>(undefined);
  // The chosen day (phones: whose list shows) belongs to the weeks shown; otherwise today or the 1st.
  const chosen = [selectedDay, ownSelected].find((d) => d && days.includes(d)) ?? fallbackDay;
  const [focusDay, setFocusDay] = useState<string>(chosen);
  const activeDay = days.includes(focusDay)
    ? focusDay
    : days.includes(chosen)
      ? chosen
      : fallbackDay;

  const cells = useRef(new Map<string, HTMLTableCellElement>());
  const pendingFocus = useRef(false);
  const [dragging, setDragging] = useState<{ entry: ScheduleEntry; from: string } | undefined>();
  const [dropDay, setDropDay] = useState<string | undefined>();

  useEffect(() => {
    if (!pendingFocus.current) return;
    const cell = cells.current.get(activeDay);
    if (cell) {
      pendingFocus.current = false;
      cell.focus();
    }
  });

  const moveFocus = (day: string) => {
    const shown = days.includes(day);
    // Without `onMonthChange` the grid cannot leave its weeks: focus stays where it is.
    if (!shown && !onMonthChange) return;
    pendingFocus.current = true;
    setFocusDay(day);
    if (!shown) onMonthChange?.(monthOf(day), day);
  };

  const select = (day: string) => {
    setFocusDay(day);
    setOwnSelected(day);
    onSelectDay?.(day);
  };

  const itemsOf = (cell: HTMLElement) =>
    Array.from(cell.querySelectorAll<HTMLElement>("[data-cell-item]"));

  const onCellKeyDown = (e: KeyboardEvent<HTMLTableCellElement>, day: string) => {
    const cell = e.currentTarget;
    // The week runs right to left in right-to-left languages: Left is the next day there.
    const key = readingKey(e.key, direction);
    // Keys from the "+N more" popover reach here through the React tree, not the DOM: not ours.
    if (!cell.contains(e.target as Node)) return;
    // Inside the cell: its chips and "+N more".
    if (e.target !== cell) {
      const items = itemsOf(cell);
      const i = items.indexOf(e.target as HTMLElement);
      const id = (e.target as HTMLElement).dataset.entryId;
      const entry = id ? byDay.get(day)?.find((x) => x.id === id) : undefined;
      if (e.altKey) {
        const step = DAY_STEPS[key];
        if (step && entry && onMove && entry.movable) {
          e.preventDefault();
          onMove({ entry, fromDay: day, toDay: shiftDay(day, step), via: "keyboard" });
        }
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cell.focus();
      } else if (key === "ArrowDown" || key === "ArrowRight") {
        e.preventDefault();
        items[Math.min(i + 1, items.length - 1)]?.focus();
      } else if (key === "ArrowUp" || key === "ArrowLeft") {
        e.preventDefault();
        items[Math.max(i - 1, 0)]?.focus();
      }
      return;
    }
    const col = weekdayOrder(weekStartsOn).indexOf(weekdayOf(day));
    let next: string | undefined;
    switch (key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        next = shiftDay(day, DAY_STEPS[key] ?? 0);
        break;
      case "Home":
        next = shiftDay(day, -col);
        break;
      case "End":
        next = shiftDay(day, 6 - col);
        break;
      case "PageUp":
        next = shiftMonth(day, e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = shiftMonth(day, e.shiftKey ? 12 : 1);
        break;
      case "Enter":
      case "F2": {
        e.preventDefault();
        if (dots) select(day);
        else itemsOf(cell)[0]?.focus();
        return;
      }
      case " ":
        e.preventDefault();
        select(day);
        return;
      default:
        return;
    }
    e.preventDefault();
    moveFocus(next);
  };

  const weekdayShort = weekdayNames(locale, dots ? "narrow" : "short");
  const weekdayLong = weekdayNames(locale, "long");
  const instructionsId = useId();
  const draggable = !dots && !!onMove;

  const listRow = (entry: ScheduleEntry) => (
    <li key={entry.id}>
      <ScheduleItem
        variant="row"
        entry={entry}
        words={words}
        locale={locale}
        timeZone={timeZone}
        hourCycle={hourCycle}
        origin={renderOrigin?.(entry)}
        actions={renderActions?.(entry)}
        className="px-4 py-2.5"
      />
    </li>
  );

  const chosenEntries = byDay.get(chosen) ?? [];
  const chosenDate = formatDay(chosen, locale, "long");
  const chosenRelative = relativeDay(chosen, today, locale);

  return (
    <div className={cn("grid min-w-0", className)} data-calendar-month={dots ? "dots" : "chips"}>
      <Table
        layout="fixed"
        role="grid"
        aria-label={labels.grid ?? formatMonth(month, locale)}
        aria-describedby={instructionsId}
        className="[&_td]:p-0 [&_th]:px-1 [&_th]:py-2 [&_th]:text-center [&_th]:text-sm [&_th]:font-normal [&_th]:text-kumo-subtle"
      >
        <colgroup>
          {weekdayOrder(weekStartsOn).map((d) => (
            <col key={d} />
          ))}
        </colgroup>
        <Table.Header>
          <Table.Row role="row" className="even:bg-transparent">
            {weekdayOrder(weekStartsOn).map((d) => (
              <Table.Head key={d} role="columnheader">
                <span aria-hidden>{weekdayShort[d]}</span>
                <span className="sr-only">{weekdayLong[d]}</span>
              </Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {weeks.map((week) => (
            <Table.Row key={week[0]} role="row" className="even:bg-transparent">
              {week.map((day) => {
                const list = byDay.get(day) ?? [];
                const isToday = day === today;
                const outside = monthOf(day) !== month;
                const recessed = day < today || weekend.includes(weekdayOf(day));
                const name = labels.day({
                  day,
                  date: formatDay(day, locale, "long"),
                  today: isToday,
                  outside,
                  entries: list,
                });
                const shown = list.length > maxChips ? list.slice(0, maxChips) : list;
                const more = list.length - shown.length;
                const waiting = list.some((x) => scheduleLook(x) === "proposed");
                return (
                  <Table.Cell
                    key={day}
                    ref={(el: HTMLTableCellElement | null) => {
                      if (el) cells.current.set(day, el);
                      else cells.current.delete(day);
                    }}
                    role="gridcell"
                    tabIndex={day === activeDay ? 0 : -1}
                    aria-label={name}
                    aria-current={isToday ? "date" : undefined}
                    aria-selected={dots ? day === chosen : undefined}
                    data-day={day}
                    data-outside={outside ? "" : undefined}
                    data-drop={dropDay === day ? "" : undefined}
                    onFocus={(e) => {
                      if (e.target === e.currentTarget) setFocusDay(day);
                    }}
                    onKeyDown={(e) => onCellKeyDown(e, day)}
                    onClick={(e) => {
                      if (!e.currentTarget.contains(e.target as Node)) return;
                      if (dots) select(day);
                      else if (e.target === e.currentTarget) setFocusDay(day);
                    }}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = day === dragging.from ? "none" : "move";
                      if (dropDay !== day) setDropDay(day);
                    }}
                    onDrop={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      const { entry, from } = dragging;
                      setDragging(undefined);
                      setDropDay(undefined);
                      if (from !== day && onMove)
                        onMove({ entry, fromDay: from, toDay: day, via: "pointer" });
                    }}
                    className={cn(
                      "relative border-e border-b border-kumo-hairline align-top outline-none last:border-e-0",
                      "focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:ring-inset",
                      dots ? "h-12 cursor-pointer" : "h-28",
                      recessed && "bg-kumo-recessed",
                      dots && day === chosen && "bg-kumo-tint",
                      dropDay === day && "bg-kumo-tint ring-2 ring-kumo-brand ring-inset",
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-0.5 p-1",
                        dots ? "items-center" : "items-stretch",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                          !dots && "self-end",
                          outside && "text-kumo-inactive",
                          isToday && "bg-kumo-brand text-kumo-inverse",
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      {dots ? (
                        list.length > 0 && (
                          <span aria-hidden className="flex items-center gap-0.5" data-dots="">
                            {list.slice(0, 3).map((x) => (
                              <span
                                key={x.id}
                                data-dot={scheduleLook(x)}
                                className={cn("size-1.5 rounded-full", DOT[scheduleLook(x)])}
                              />
                            ))}
                            {waiting && (
                              <span
                                data-dot="approval"
                                className="ms-0.5 size-1.5 rounded-full bg-kumo-warning"
                              />
                            )}
                          </span>
                        )
                      ) : (
                        <>
                          {shown.map((x) => {
                            const canDrag = draggable && x.movable === true;
                            return (
                              <ScheduleItem
                                key={x.id}
                                variant="chip"
                                entry={x}
                                words={words}
                                locale={locale}
                                timeZone={timeZone}
                                hourCycle={hourCycle}
                                tabIndex={-1}
                                data-cell-item=""
                                onOpen={onOpenEntry}
                                draggable={canDrag || undefined}
                                className={cn(
                                  canDrag && "cursor-grab",
                                  dragging?.entry.id === x.id && "opacity-50",
                                )}
                                onDragStart={(e) => {
                                  if (!canDrag) return;
                                  e.dataTransfer.effectAllowed = "move";
                                  try {
                                    e.dataTransfer.setData("text/plain", x.id);
                                  } catch {}
                                  setDragging({ entry: x, from: day });
                                }}
                                onDragEnd={() => {
                                  setDragging(undefined);
                                  setDropDay(undefined);
                                }}
                              />
                            );
                          })}
                          {more > 0 && (
                            <Popover>
                              <Popover.Trigger
                                render={
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    data-cell-item=""
                                    data-more=""
                                    className="flex min-h-6 w-full items-center rounded-md px-1.5 text-start text-sm text-kumo-subtle outline-none hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand"
                                  />
                                }
                              >
                                {labels.more(more)}
                              </Popover.Trigger>
                              <Popover.Content
                                align="start"
                                positionMethod="fixed"
                                className="grid w-96 max-w-[calc(100vw-1rem)] gap-2 p-0"
                              >
                                <div className="px-4 pt-3">
                                  <Popover.Title>{formatDay(day, locale, "long")}</Popover.Title>
                                </div>
                                <ul className="m-0 grid max-h-80 list-none divide-y divide-kumo-hairline overflow-y-auto p-0 pb-1">
                                  {list.map(listRow)}
                                </ul>
                              </Popover.Content>
                            </Popover>
                          )}
                        </>
                      )}
                    </div>
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {dots && (
        <section
          aria-label={labels.dayList?.(chosenDate) ?? chosenDate}
          className="grid border-t border-kumo-line"
          data-day-list={chosen}
        >
          <div className="px-4 pt-3 pb-1">
            <Text as="span" bold>
              {chosenRelative ? `${chosenRelative} · ${chosenDate}` : chosenDate}
            </Text>
          </div>
          {chosenEntries.length > 0 ? (
            <ul className="m-0 grid list-none divide-y divide-kumo-hairline p-0">
              {chosenEntries.map(listRow)}
            </ul>
          ) : (
            <div className="px-4 pt-1 pb-4">
              <Text as="span" variant="secondary">
                {labels.emptyDay}
              </Text>
            </div>
          )}
        </section>
      )}
      <span id={instructionsId} className="sr-only">
        {labels.instructions}
      </span>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
