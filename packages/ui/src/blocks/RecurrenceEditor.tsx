import { Checkbox, cn, Input, Radio, Select, Text } from "@cloudflare/kumo";
import { Info } from "@phosphor-icons/react";
import { useId } from "react";
import { useTimeOfDayDraft } from "./DateTimeField.tsx";
import { InsetPanel } from "./InsetPanel.tsx";
import {
  RECURRENCE_PRESETS,
  type RecurrenceFrequency,
  type RecurrenceOrdinal,
  type RecurrencePreset,
  type RecurrenceProblem,
  type RecurrenceValue,
  type RecurrenceWeekday,
  RRULE_WEEKDAYS,
} from "./recurrence.ts";
import { hourCycleOf, type WeekDay, weekdayNames, weekdayOrder } from "./schedule-model.ts";

export interface RecurrenceEditorLabels {
  /** The preset group's legend ("Repeats"). */
  legend: string;
  /** Preset names ("Every hour", "Every day", "Weekdays", "Every week", "Every month", "Once", "Custom"). */
  presets: Record<RecurrencePreset, string>;
  /** One line under each preset card (optional per preset). */
  presetHints?: Partial<Record<RecurrencePreset, string>>;
  /** The time of day ("At"); "hourly" asks for the minute ("Minutes past the hour"). */
  time: string;
  minute: string;
  /** Weekly: "On". */
  weekday: string;
  /** Monthly: "Day of the month", each day ("12th", "On the 12th") and the last day ("Last day"). */
  monthDay: string;
  monthDayOption: (day: number) => string;
  lastDay: string;
  /** Custom: "Every", the unit ("days", "weeks", "months" by count), "On these days". */
  interval: string;
  frequency: string;
  frequencies: Record<RecurrenceFrequency, (count: number) => string>;
  weekdays: string;
  /** Custom monthly: "On day 12" / "On the second Tuesday". */
  monthlyOn: string;
  monthlyDay: string;
  monthlyWeekday: string;
  ordinal: string;
  ordinals: Record<`${RecurrenceOrdinal}`, string>;
  /** End: "Ends", "Never", "On a date", "After a number of runs", the date and the count. */
  end: string;
  ends: { never: string; on: string; after: string };
  endDate: string;
  endCount: string;
  /** Under the time when it is on the hour: "Pick a minute such as :07 so many sites do not all run at :00." */
  avoidOnTheHour: string;
  /** A time that cannot be read. */
  invalidTime: string;
  /** The sentence panel's name ("Summary"). */
  summary: string;
}

export interface RecurrenceEditorProps {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  locale: string;
  /** Custom weekday checkboxes start here (Monday in Turkish). */
  weekStartsOn: WeekDay;
  labels: RecurrenceEditorLabels;
  /**
   * The rule in words, from the screen's own templates ("Weekdays at 09:07", "Her ayın ikinci
   * salısı 09:07"): no cron-to-text library (RFC-0008 §15.8). Spoken politely when it changes.
   */
  sentence?: string | undefined;
  /** Messages for problems to show (`recurrenceProblems`), already worded. */
  problems?: Partial<Record<RecurrenceProblem, string>>;
  /** Presets offered, in order. Default: hourly, daily, weekdays, weekly, monthly, once, custom. */
  presets?: readonly RecurrencePreset[];
  hourCycle?: "h23" | "h12";
  disabled?: boolean;
  className?: string;
}

const ORDINALS: readonly RecurrenceOrdinal[] = [1, 2, 3, 4, -1];
const MONTH_DAYS = [...Array.from({ length: 31 }, (_, i) => i + 1), -1];

/**
 * How often an automation runs (RFC-0008 §9.3 D3, §15.4): the presets as `Radio
 * appearance="card"` (hourly, daily, weekdays, weekly, monthly, once, custom), then only the
 * controls the choice needs — the time (24-hour in Turkish; minutes for hourly), the weekday, the
 * day of the month, or for custom: every N days/weeks/months, weekday `Checkbox`es in
 * `weekStartsOn` order, monthly "on day 12" / "on the second Tuesday" / the last day, and the end
 * (never / on a date / after N runs). A hint asks for a minute off the hour. It emits a
 * structured `RecurrenceValue` (`recurrenceRule` turns it into the RRULE subset) and shows the
 * screen's sentence for it in an `InsetPanel`. Weekday names come from `Intl` in `locale`.
 */
export function RecurrenceEditor({
  value,
  onChange,
  locale,
  weekStartsOn,
  labels,
  sentence,
  problems = {},
  presets = RECURRENCE_PRESETS,
  hourCycle,
  disabled,
  className,
}: RecurrenceEditorProps) {
  const set = (patch: Partial<RecurrenceValue>) => onChange({ ...value, ...patch });
  const cycle = hourCycle ?? hourCycleOf(locale);
  const time = useTimeOfDayDraft(
    value.time,
    (t) => {
      if (t) set({ time: t });
    },
    locale,
    cycle,
  );
  const id = useId();
  const longNames = weekdayNames(locale, "long");
  const shortNames = weekdayNames(locale, "short");
  const order = weekdayOrder(weekStartsOn);
  const weekdayItems = order.map((d) => ({
    value: RRULE_WEEKDAYS[d] as RecurrenceWeekday,
    label: longNames[d] as string,
  }));
  const minute = Number(value.time.slice(3, 5));
  const timeError = problems.time ?? (time.unreadable ? labels.invalidTime : undefined);
  const custom = value.preset === "custom";

  const timeField =
    value.preset === "once" ? null : value.preset === "hourly" ? (
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        label={labels.minute}
        value={String(minute)}
        onValueChange={(v: string) => {
          const n = Math.min(59, Math.max(0, Math.trunc(Number(v) || 0)));
          set({ time: `${value.time.slice(0, 2)}:${String(n).padStart(2, "0")}` });
        }}
        disabled={disabled}
        className="w-full"
        data-recurrence="minute"
      />
    ) : (
      <Input
        label={labels.time}
        {...time.inputProps}
        error={timeError}
        disabled={disabled}
        className="w-full tabular-nums"
        data-recurrence="time"
      />
    );

  return (
    <div
      className={cn("@container grid min-w-0 gap-5", className)}
      data-recurrence-editor={value.preset}
    >
      <Radio.Group
        appearance="card"
        legend={labels.legend}
        value={value.preset}
        onValueChange={(v) => set({ preset: v as RecurrencePreset })}
        disabled={disabled}
        className="grid gap-2 @md:grid-cols-2"
      >
        {presets.map((p) => (
          <Radio.Item
            key={p}
            value={p}
            label={labels.presets[p]}
            description={labels.presetHints?.[p]}
          />
        ))}
      </Radio.Group>

      {value.preset !== "once" && (
        <div className="grid items-start gap-5 @lg:grid-cols-2">
          {timeField}
          {value.preset === "weekly" && (
            <Select
              label={labels.weekday}
              value={value.weekdays[0] ?? "MO"}
              onValueChange={(v) => set({ weekdays: [String(v) as RecurrenceWeekday] })}
              items={weekdayItems}
              disabled={disabled}
              className="w-full"
            />
          )}
          {value.preset === "monthly" && (
            <Select
              label={labels.monthDay}
              value={String(value.monthDay)}
              onValueChange={(v) => set({ monthDay: Number(v) })}
              items={MONTH_DAYS.map((d) => ({
                value: String(d),
                label: d === -1 ? labels.lastDay : labels.monthDayOption(d),
              }))}
              disabled={disabled}
              className="w-full"
            />
          )}
          {custom && (
            <div className="grid grid-cols-2 items-start gap-3">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                label={labels.interval}
                value={String(value.interval)}
                onValueChange={(v: string) =>
                  set({ interval: Math.min(999, Math.max(1, Math.trunc(Number(v) || 1))) })
                }
                error={problems.interval}
                disabled={disabled}
                className="w-full"
                data-recurrence="interval"
              />
              <Select
                label={labels.frequency}
                value={value.frequency}
                onValueChange={(v) => set({ frequency: String(v) as RecurrenceFrequency })}
                items={(["daily", "weekly", "monthly"] as const).map((f) => ({
                  value: f,
                  label: labels.frequencies[f](value.interval),
                }))}
                disabled={disabled}
                className="w-full"
              />
            </div>
          )}
        </div>
      )}

      {value.preset !== "once" && value.preset !== "hourly" && minute === 0 && !timeError && (
        <div className="flex items-start gap-2" data-recurrence-hint="">
          <span aria-hidden className="flex h-lh items-center text-kumo-subtle">
            <Info size={16} />
          </span>
          <Text as="span" variant="secondary" size="sm">
            {labels.avoidOnTheHour}
          </Text>
        </div>
      )}

      {custom && value.frequency === "weekly" && (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" data-recurrence="weekdays">
          <legend className="mb-2 p-0">
            <Text as="span" bold size="sm">
              {labels.weekdays}
            </Text>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {order.map((d) => {
              const code = RRULE_WEEKDAYS[d] as RecurrenceWeekday;
              const on = value.weekdays.includes(code);
              return (
                <Checkbox
                  key={code}
                  label={
                    <span>
                      <span aria-hidden>{shortNames[d]}</span>
                      <span className="sr-only">{longNames[d]}</span>
                    </span>
                  }
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={(checked: boolean) =>
                    set({
                      weekdays: checked
                        ? [...value.weekdays, code]
                        : value.weekdays.filter((w) => w !== code),
                    })
                  }
                  data-weekday={code}
                />
              );
            })}
          </div>
          {problems.weekdays && (
            <Text as="span" variant="error" size="sm">
              {problems.weekdays}
            </Text>
          )}
        </fieldset>
      )}

      {custom && value.frequency === "monthly" && (
        <div className="grid gap-3" data-recurrence="monthly">
          <Radio.Group
            legend={labels.monthlyOn}
            value={value.monthly}
            onValueChange={(v) => set({ monthly: v as RecurrenceValue["monthly"] })}
            disabled={disabled}
          >
            <Radio.Item value="day" label={labels.monthlyDay} />
            <Radio.Item value="weekday" label={labels.monthlyWeekday} />
          </Radio.Group>
          <div className="grid items-start gap-3 @lg:grid-cols-2">
            {value.monthly === "day" ? (
              <Select
                label={labels.monthDay}
                value={String(value.monthDay)}
                onValueChange={(v) => set({ monthDay: Number(v) })}
                items={MONTH_DAYS.map((d) => ({
                  value: String(d),
                  label: d === -1 ? labels.lastDay : labels.monthDayOption(d),
                }))}
                disabled={disabled}
                className="w-full"
              />
            ) : (
              <>
                <Select
                  label={labels.ordinal}
                  value={String(value.ordinal)}
                  onValueChange={(v) => set({ ordinal: Number(v) as RecurrenceOrdinal })}
                  items={ORDINALS.map((o) => ({
                    value: String(o),
                    label: labels.ordinals[`${o}`],
                  }))}
                  disabled={disabled}
                  className="w-full"
                />
                <Select
                  label={labels.weekday}
                  value={value.weekdays[0] ?? "MO"}
                  onValueChange={(v) => set({ weekdays: [String(v) as RecurrenceWeekday] })}
                  items={weekdayItems}
                  disabled={disabled}
                  className="w-full"
                />
              </>
            )}
          </div>
        </div>
      )}

      {custom && (
        <div className="grid gap-3" data-recurrence="end">
          <Radio.Group
            legend={labels.end}
            value={value.end.kind}
            onValueChange={(v) =>
              set({
                end:
                  v === "on"
                    ? { kind: "on", date: value.end.kind === "on" ? value.end.date : "" }
                    : v === "after"
                      ? { kind: "after", count: value.end.kind === "after" ? value.end.count : 10 }
                      : { kind: "never" },
              })
            }
            disabled={disabled}
          >
            <Radio.Item value="never" label={labels.ends.never} />
            <Radio.Item value="on" label={labels.ends.on} />
            <Radio.Item value="after" label={labels.ends.after} />
          </Radio.Group>
          {value.end.kind === "on" && (
            <Input
              type="date"
              label={labels.endDate}
              value={value.end.date}
              onValueChange={(v: string) => set({ end: { kind: "on", date: v } })}
              error={problems.until}
              disabled={disabled}
              className="w-full"
              data-recurrence="until"
            />
          )}
          {value.end.kind === "after" && (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              label={labels.endCount}
              value={String(value.end.count)}
              onValueChange={(v: string) =>
                set({ end: { kind: "after", count: Math.max(1, Math.trunc(Number(v) || 1)) } })
              }
              error={problems.count}
              disabled={disabled}
              className="w-full"
              data-recurrence="count"
            />
          )}
        </div>
      )}

      {sentence && (
        <InsetPanel label={labels.summary}>
          <span id={`${id}-sentence`} aria-live="polite" data-recurrence-sentence="">
            <Text as="span" bold>
              {sentence}
            </Text>
          </span>
        </InsetPanel>
      )}
    </div>
  );
}
