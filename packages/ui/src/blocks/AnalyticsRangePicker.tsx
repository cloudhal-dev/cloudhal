import { Button, cn, DateRangePicker, Popover, Switch, Tabs, Text } from "@cloudflare/kumo";
import { CalendarBlank } from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";
import { createAnalyticsFormatter } from "./analytics-format.ts";
import {
  ANALYTICS_RANGE_PRESETS,
  type AnalyticsRange,
  type AnalyticsRangePreset,
  addDays,
  isAnalyticsRangePreset,
  isValidCustomRange,
  MAX_RANGE_DAYS,
  pickedDay,
} from "./analytics-range.ts";

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
  /** The calendar footer's time zone ("UTC"). */
  timezone: string;
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
  /** Studio locale, for the custom range's dates. */
  locale: string;
  /** Presets offered, in order. Default: Today, 7 days, 30 days, 90 days, 12 months. */
  presets?: readonly AnalyticsRangePreset[];
  /** Compare with the previous period of the same length. */
  compare?: boolean;
  onCompareChange?: (compare: boolean) => void;
  /** Controls that belong with the range (the screen's refresh button); they wrap with it on phones. */
  trailing?: ReactNode;
  className?: string;
}

const CUSTOM = "custom";

/**
 * The Analytics screen's range control (RFC-0006 §10.1, DESIGN.md §2v): segmented `Tabs` of
 * presets, a "Custom…" button that opens a `Popover` with Kumo's `DateRangePicker` (UTC) and, when
 * the screen offers it, a compare-with-previous `Switch`. Controlled through `{preset}` or
 * `{from, to}`; the block keeps its own copy of the picked days because `DateRangePicker` only
 * reports changes, and applies them on "Apply".
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
  className,
}: AnalyticsRangePickerProps) {
  const fmt = useMemo(() => createAnalyticsFormatter(locale), [locale]);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [round, setRound] = useState(0);
  const isCustom = !("preset" in value);

  const draft = useMemo(() => {
    if (!start || !end) return undefined;
    let [a, b] = [pickedDay(start), pickedDay(end)];
    if (b < a) [a, b] = [b, a];
    return { from: a, to: addDays(b, 1) };
  }, [start, end]);
  const valid = draft !== undefined && isValidCustomRange(draft.from, draft.to);

  const openChange = (next: boolean) => {
    if (next) {
      // A fresh calendar each time: the picker cannot be preset, so neither is our copy.
      setStart(null);
      setEnd(null);
      setRound((r) => r + 1);
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
        >
          {isCustom ? fmt.dayRange(value.from, value.to) : labels.custom}
        </Popover.Trigger>
        <Popover.Content
          align="end"
          positionMethod="fixed"
          className="grid max-w-[calc(100vw-1rem)] gap-3"
        >
          <Popover.Title>{labels.customTitle}</Popover.Title>
          <div className="max-w-full overflow-x-auto">
            <DateRangePicker
              key={round}
              size="sm"
              variant="subtle"
              // Two months side by side need ~380 px: below `sm` they stack, so the popover fits a
              // phone without scrolling sideways (the scroller above stays as a last resort).
              className="max-sm:[&>div:first-child]:flex-col"
              timezone={labels.timezone}
              onStartDateChange={setStart}
              onEndDateChange={setEnd}
            />
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
