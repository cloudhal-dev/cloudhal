import {
  Button,
  cn,
  type DateRange,
  Popover,
  SkeletonLine,
  Switch,
  Tabs,
  Text,
} from "@cloudflare/kumo";
import { CalendarBlank, GlobeHemisphereWest } from "@phosphor-icons/react";
import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import { createAnalyticsFormatter } from "./analytics-format.ts";
import {
  ANALYTICS_RANGE_PRESETS,
  type AnalyticsRange,
  type AnalyticsRangePreset,
  addDays,
  isAnalyticsRangePreset,
  isoDay,
  isValidCustomRange,
  MAX_RANGE_DAYS,
  pickedDay,
  utcMidnight,
} from "./analytics-range.ts";
import { type CalendarLabels, calendarLocaleProps } from "./calendar-locale.ts";

export interface AnalyticsRangePickerLabels {
  /** Accessible name of the whole control ("Date range"). */
  group: string;
  /** One label per preset ("Today", "7 days", "30 days", "90 days", "12 months"). */
  presets: Record<AnalyticsRangePreset, string>;
  /** The custom button while a preset is chosen ("Custom…"). */
  custom: string;
  /** The custom popover's title ("Custom range"). */
  customTitle: string;
  apply: string;
  cancel: string;
  /** Under the calendar: which zone its days are in ("Days are in UTC"). */
  timezone: string;
  /** The calendar's own words; month and weekday names come from `Intl` in `locale`. */
  calendar: CalendarLabels;
  /** While a day is missing ("Choose the first and the last day."). */
  pickHint: string;
  /** A range past the API's limit ("Choose at most 2 years."). */
  tooLong: string;
  /** The compare switch ("Compare with the previous period"); the switch shows only with `onCompareChange`. */
  compare?: string;
}

export interface AnalyticsRangePickerProps {
  /** Controlled: a preset, or custom UTC days (`to` exclusive). The screen keeps it in the URL. */
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
  labels: AnalyticsRangePickerLabels;
  /** Studio locale: the custom range's dates, the calendar's month and weekday names, its week. */
  locale: string;
  /** Presets offered, in order. Default: Today, 7 days, 30 days, 90 days, 12 months. */
  presets?: readonly AnalyticsRangePreset[];
  /** Compare with the previous period of the same length. */
  compare?: boolean;
  onCompareChange?: (compare: boolean) => void;
  /** Controls that belong with the range (the screen's refresh button); they wrap with it on phones. */
  trailing?: ReactNode;
  /** The clock, for tests: days after today (UTC) cannot be picked. */
  now?: number;
  className?: string;
}

const CUSTOM = "custom";

/**
 * The calendar (react-day-picker and date-fns inside Kumo, ~60 kB minified) loads when the
 * custom range is about to open — on hover or focus of "Custom…" — not with the Analytics screen.
 */
const loadDatePicker = () => import("@cloudflare/kumo/components/date-picker");
const DatePicker = lazy(() => loadDatePicker().then((m) => ({ default: m.DatePicker })));

/**
 * The Analytics screen's range control (RFC-0006 §10.1, DESIGN.md §2v): segmented `Tabs` of
 * presets, a "Custom…" button that opens a `Popover` with Kumo's `DatePicker` in range mode (two
 * months, days in UTC, the current custom range preselected, nothing after today) and, when the
 * screen offers it, a compare-with-previous `Switch`. Controlled through `{preset}` or
 * `{from, to}`; picked days are applied on "Apply".
 *
 * The calendar speaks the Studio locale through `calendarLocaleProps` (month and weekday names,
 * accessible day names, first day of the week). Kumo's older `DateRangePicker` is deprecated and
 * hard-codes English (Kumo 2.14; `docs/design/kumo-upstream-notes.md`), so it is not used.
 */
export function AnalyticsRangePicker({
  value,
  onChange,
  labels,
  locale,
  presets = ANALYTICS_RANGE_PRESETS,
  compare,
  onCompareChange,
  trailing,
  now,
  className,
}: AnalyticsRangePickerProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const calendar = useMemo(
    () => calendarLocaleProps(locale, labels.calendar, "UTC"),
    [locale, labels.calendar],
  );
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<DateRange | undefined>(undefined);
  const [month, setMonth] = useState<Date>(() => new Date());
  const isCustom = !("preset" in value);
  const today = utcMidnight(isoDay(now ?? Date.now()));

  const draft = useMemo(() => {
    if (!selection?.from || !selection.to) return undefined;
    let [a, b] = [pickedDay(selection.from), pickedDay(selection.to)];
    if (b < a) [a, b] = [b, a];
    return { from: a, to: addDays(b, 1) };
  }, [selection]);
  const valid = draft !== undefined && isValidCustomRange(draft.from, draft.to);

  const openChange = (next: boolean) => {
    if (next) {
      // Open on the range in force: its days selected, its last month on the right.
      const last = isCustom ? addDays(value.to, -1) : isoDay(today.getTime());
      setSelection(isCustom ? { from: utcMidnight(value.from), to: utcMidnight(last) } : undefined);
      const shown = utcMidnight(last);
      shown.setUTCDate(1);
      shown.setUTCMonth(shown.getUTCMonth() - 1);
      setMonth(shown);
    }
    setOpen(next);
  };

  return (
    <fieldset
      aria-label={labels.group}
      className={cn("m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0", className)}
      data-range={isCustom ? `${value.from}/${value.to}` : value.preset}
    >
      <Tabs
        variant="segmented"
        size="sm"
        className="max-w-full min-w-0"
        value={isCustom ? CUSTOM : value.preset}
        onValueChange={(v) => {
          if (isAnalyticsRangePreset(v)) onChange({ preset: v });
        }}
        tabs={presets.map((p) => ({ value: p, label: labels.presets[p] }))}
      />
      <Popover open={open} onOpenChange={openChange}>
        <Popover.Trigger
          render={
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarBlank size={16} />}
              aria-pressed={isCustom}
            />
          }
          onPointerEnter={() => void loadDatePicker()}
          onFocus={() => void loadDatePicker()}
        >
          {isCustom ? fmt.dayRange(value.from, value.to) : labels.custom}
        </Popover.Trigger>
        <Popover.Content
          align="end"
          positionMethod="fixed"
          className="grid max-w-[calc(100vw-1rem)] gap-3"
        >
          <Popover.Title>{labels.customTitle}</Popover.Title>
          <div className="grid max-w-full gap-1 overflow-x-auto">
            {/* Two months wrap onto two rows when the popover is narrower than both (phones). */}
            <Suspense
              fallback={
                <div className="grid w-72 max-w-full gap-3 py-2" data-calendar-loading>
                  {[0, 1, 2, 3, 4, 5].map((row) => (
                    <SkeletonLine key={row} />
                  ))}
                </div>
              }
            >
              <DatePicker
                mode="range"
                numberOfMonths={2}
                selected={selection}
                // Two clicks pick a range: a click on a finished range starts a new one there
                // (react-day-picker would move the nearer end instead).
                onChange={(next, day) =>
                  setSelection((prev) =>
                    prev?.from && prev.to && pickedDay(prev.from) !== pickedDay(prev.to)
                      ? { from: day, to: day }
                      : next,
                  )
                }
                month={month}
                onMonthChange={setMonth}
                today={today}
                endMonth={today}
                disabled={{ after: today }}
                {...calendar}
              />
            </Suspense>
            <Text variant="secondary" size="xs" as="span">
              <span className="inline-flex items-center gap-1.5">
                <GlobeHemisphereWest size={14} aria-hidden="true" />
                {labels.timezone}
              </span>
            </Text>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span aria-live="polite" className="min-w-0">
              {draft && !valid ? (
                <Text variant="error" size="sm" as="span">
                  {labels.tooLong}
                </Text>
              ) : (
                <Text variant="secondary" size="sm" as="span">
                  {draft ? fmt.dayRange(draft.from, draft.to) : labels.pickHint}
                </Text>
              )}
            </span>
            <span className="flex items-center gap-2">
              <Popover.Close render={<Button variant="ghost" size="sm" />}>
                {labels.cancel}
              </Popover.Close>
              <Button
                variant="primary"
                size="sm"
                disabled={!valid}
                data-max-days={MAX_RANGE_DAYS}
                onClick={() => {
                  if (!draft || !valid) return;
                  onChange({ from: draft.from, to: draft.to });
                  setOpen(false);
                }}
              >
                {labels.apply}
              </Button>
            </span>
          </div>
        </Popover.Content>
      </Popover>
      {onCompareChange && labels.compare && (
        <Switch
          size="sm"
          label={labels.compare}
          checked={compare ?? false}
          onCheckedChange={(checked: boolean) => onCompareChange(checked)}
        />
      )}
      {trailing}
    </fieldset>
  );
}
