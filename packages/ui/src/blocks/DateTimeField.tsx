import { Button, cn, Field, InputGroup, Popover, SkeletonLine } from "@cloudflare/kumo";
import { CalendarBlank } from "@phosphor-icons/react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { type CalendarLabels, calendarLocaleProps } from "./calendar-locale.ts";
import {
  dateToDay,
  dayToDate,
  formatDay,
  formatTimeOfDay,
  hourCycleOf,
  parseTimeOfDay,
} from "./schedule-model.ts";

/** A wall-clock date and time in the site's zone: `YYYY-MM-DD` and 24-hour `HH:mm`. */
export interface DateTimeValue {
  date?: string | undefined;
  time?: string | undefined;
}

export interface DateTimeFieldLabels {
  /** The date button's name, before the date: "Date". */
  date: string;
  /** The date button without a date: "Pick a date". */
  pickDate: string;
  /** The calendar popover's title: "Choose a date". */
  chooseDate: string;
  /** The calendar's own words (`calendarLocaleProps`). */
  calendar: CalendarLabels;
  /** A time that cannot be read: "Enter a time such as 09:30". */
  invalidTime: string;
}

export interface DateTimeFieldProps {
  /** The field's label ("Publish at"). */
  label: string;
  description?: ReactNode;
  value: DateTimeValue | undefined;
  /** Called with the date and the 24-hour time; the time only once it can be read. */
  onChange: (next: DateTimeValue) => void;
  locale: string;
  /** The site's zone (IANA). Its name shows as `zoneLabel`; the value is wall-clock time in it. */
  timeZone: string;
  /** The zone as people read it: "Istanbul (UTC+3)". */
  zoneLabel: string;
  /** Override the locale's hour cycle (Turkish is 24-hour; `h23` everywhere is fine too). */
  hourCycle?: "h23" | "h12";
  labels: DateTimeFieldLabels;
  /**
   * The screen's validation message, already worded: in the past, "less than 5 minutes away",
   * a DST gap ("02:30 does not exist on 29 March in Berlin; it runs at 03:30").
   */
  error?: string | undefined;
  /** First and last days that can be picked (`YYYY-MM-DD`). */
  min?: string;
  max?: string;
  /** Today in the site zone, marked in the calendar. */
  today?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A time-of-day text field's state: shows `time` (`HH:mm`) in the locale's hour cycle, reads what
 * is typed on blur or Enter (`parseTimeOfDay`) and reports `HH:mm`, or `undefined` once cleared.
 * `unreadable` is true while the text cannot be read (the field shows its message).
 */
export function useTimeOfDayDraft(
  time: string | undefined,
  onTime: (time: string | undefined) => void,
  locale: string,
  cycle: "h23" | "h12" = hourCycleOf(locale),
) {
  const shown = time ? formatTimeOfDay(time, locale, cycle) : "";
  const [draft, setDraft] = useState(shown);
  const [unreadable, setUnreadable] = useState(false);
  useEffect(() => {
    setDraft(shown);
    setUnreadable(false);
  }, [shown]);
  const commit = () => {
    if (!draft.trim()) {
      setUnreadable(false);
      if (time) onTime(undefined);
      return;
    }
    const next = parseTimeOfDay(draft, locale);
    if (!next) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setDraft(formatTimeOfDay(next, locale, cycle));
    if (next !== time) onTime(next);
  };
  return {
    unreadable,
    inputProps: {
      value: draft,
      inputMode: cycle === "h23" ? ("numeric" as const) : ("text" as const),
      autoComplete: "off",
      spellCheck: false,
      onChange: (e: { target: EventTarget | null }) =>
        setDraft((e.target as HTMLInputElement).value),
      onBlur: commit,
      onKeyDown: (e: { key: string; preventDefault: () => void }) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      },
    },
  };
}

/** react-day-picker and date-fns (inside Kumo) load when the calendar is about to open. */
const loadDatePicker = () => import("@cloudflare/kumo/components/date-picker");
const DatePicker = lazy(() => loadDatePicker().then((m) => ({ default: m.DatePicker })));

/**
 * A date and a time of day in the site's zone (RFC-0008 §15.4). Kumo has no time picker, so
 * this is a Kumo `Field` around a secondary date `Button` that opens a `Popover` with Kumo's
 * `DatePicker` (lazy, in the Studio locale through `calendarLocaleProps`, days in UTC so a picked
 * day is exactly that day), and an `InputGroup` with the time and the zone as an addon. The time
 * reads "9", "930", "09:30", "9.30" and, in 12-hour locales, the locale's own AM/PM words; it is
 * written back in the locale's hour cycle (24-hour in Turkish) and emitted as `HH:mm`. Validation
 * messages come from the screen (`error`); an unreadable time shows `labels.invalidTime`.
 */
export function DateTimeField({
  label,
  description,
  value,
  onChange,
  locale,
  timeZone,
  zoneLabel,
  hourCycle,
  labels,
  error,
  min,
  max,
  today,
  disabled,
  className,
}: DateTimeFieldProps) {
  const cycle = hourCycle ?? hourCycleOf(locale);
  const time = useTimeOfDayDraft(
    value?.time,
    (t) => onChange({ ...value, time: t }),
    locale,
    cycle,
  );
  const [open, setOpen] = useState(false);
  const calendar = useMemo(
    () => calendarLocaleProps(locale, labels.calendar, "UTC"),
    [locale, labels.calendar],
  );

  const message = error ?? (time.unreadable ? labels.invalidTime : undefined);
  const dateText = value?.date ? formatDay(value.date, locale, "medium") : labels.pickDate;
  const disabledDays = [
    ...(min ? [{ before: dayToDate(min) }] : []),
    ...(max ? [{ after: dayToDate(max) }] : []),
  ];

  return (
    <div className={cn("min-w-0", className)}>
      <Field
        label={label}
        description={description}
        error={message ? { message, match: true } : undefined}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-datetime-field="">
          <Popover open={open} onOpenChange={setOpen}>
            <Popover.Trigger
              render={
                <Button
                  variant="secondary"
                  icon={<CalendarBlank size={16} />}
                  disabled={disabled}
                  aria-label={`${label}, ${labels.date}: ${dateText}`}
                  data-datetime-date={value?.date ?? ""}
                />
              }
              onPointerEnter={() => void loadDatePicker()}
              onFocus={() => void loadDatePicker()}
            >
              {dateText}
            </Popover.Trigger>
            <Popover.Content align="start" positionMethod="fixed" className="grid gap-2">
              <Popover.Title>{labels.chooseDate}</Popover.Title>
              <Suspense
                fallback={
                  <div className="grid w-72 max-w-full gap-3 py-2" data-calendar-loading="">
                    {[0, 1, 2, 3, 4, 5].map((row) => (
                      <SkeletonLine key={row} />
                    ))}
                  </div>
                }
              >
                <DatePicker
                  mode="single"
                  selected={value?.date ? dayToDate(value.date) : undefined}
                  defaultMonth={dayToDate(value?.date ?? today ?? min ?? dateToDay(new Date()))}
                  onChange={(d?: Date) => {
                    if (!d) return;
                    onChange({ ...value, date: dateToDay(d) });
                    setOpen(false);
                  }}
                  {...(today ? { today: dayToDate(today) } : {})}
                  {...(disabledDays.length ? { disabled: disabledDays } : {})}
                  {...calendar}
                />
              </Suspense>
            </Popover.Content>
          </Popover>
          <InputGroup
            className="w-auto min-w-0 flex-1 basis-40 whitespace-nowrap"
            disabled={disabled}
            data-datetime-zone={timeZone}
          >
            <InputGroup.Input
              {...time.inputProps}
              aria-invalid={message ? true : undefined}
              className="tabular-nums"
              data-datetime-time=""
            />
            <InputGroup.Addon align="end">
              <span className="whitespace-nowrap" data-datetime-zone={timeZone}>
                {zoneLabel}
              </span>
            </InputGroup.Addon>
          </InputGroup>
        </div>
      </Field>
    </div>
  );
}
