/**
 * The recurrence a person sets in `RecurrenceEditor` (RFC-0008 §9.3, D3), as a structured value,
 * and the RRULE subset it stands for. Expanding a rule into runs is the server's job
 * (`@cloudhal/schedules/recurrence`, `POST …/automations/preview-rule`); Studio only writes the
 * rule and shows the runs it gets back (`NextRuns`).
 */

export type RecurrencePreset =
  | "once"
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom";
export const RECURRENCE_PRESETS: readonly RecurrencePreset[] = [
  "hourly",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "once",
  "custom",
];

/** RRULE weekday codes; the week starts on Monday in the rule (§9.3), whatever the display order. */
export type RecurrenceWeekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";
/** By weekday number (0 = Sunday, like `Date#getUTCDay`). */
export const RRULE_WEEKDAYS: readonly RecurrenceWeekday[] = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
];

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";
/** Monthly: on day N (`monthDay`, −1 = last day), or on the Nth weekday (`ordinal` + `weekdays[0]`). */
export type RecurrenceMonthly = "day" | "weekday";
export type RecurrenceOrdinal = 1 | 2 | 3 | 4 | -1;
export type RecurrenceEnd =
  | { kind: "never" }
  | { kind: "on"; date: string }
  | { kind: "after"; count: number };

export interface RecurrenceValue {
  preset: RecurrencePreset;
  /** The time of day, 24-hour `HH:mm`; `hourly` uses its minutes. */
  time: string;
  /** `weekly` (one day) and custom weekly (several), as RRULE codes. */
  weekdays: RecurrenceWeekday[];
  /** `monthly` and custom monthly "on day N": 1–31, or −1 for the last day. */
  monthDay: number;
  /** Custom only. */
  frequency: RecurrenceFrequency;
  /** Custom: every N days, weeks or months (1–999). */
  interval: number;
  monthly: RecurrenceMonthly;
  ordinal: RecurrenceOrdinal;
  end: RecurrenceEnd;
}

/** A sensible start: daily at 09:07 (a minute off the hour, RFC-0008 §9.5). */
export const DEFAULT_RECURRENCE: RecurrenceValue = {
  preset: "daily",
  time: "09:07",
  weekdays: ["MO"],
  monthDay: 1,
  frequency: "weekly",
  interval: 1,
  monthly: "day",
  ordinal: 1,
  end: { kind: "never" },
};

const parseTime = (time: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : { hour: 0, minute: 0 };
};

/** "MO,TU" in Monday-first order, as the rule wants it. */
const byDay = (days: readonly RecurrenceWeekday[]) =>
  ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].filter((d) => days.includes(d as RecurrenceWeekday));

/**
 * The RRULE subset (D3) for a value; `undefined` for `once` (no rule). Never SECONDLY, MINUTELY,
 * HOURLY or BYSETPOS: "hourly" is DAILY with every hour in BYHOUR.
 */
export function recurrenceRule(value: RecurrenceValue): string | undefined {
  const { hour, minute } = parseTime(value.time);
  const at = `BYHOUR=${hour};BYMINUTE=${minute}`;
  switch (value.preset) {
    case "once":
      return undefined;
    case "hourly":
      return `FREQ=DAILY;BYHOUR=${Array.from({ length: 24 }, (_, h) => h).join(",")};BYMINUTE=${minute}`;
    case "daily":
      return `FREQ=DAILY;${at}`;
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${at}`;
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${byDay(value.weekdays.slice(0, 1)).join(",") || "MO"};${at}`;
    case "monthly":
      return `FREQ=MONTHLY;BYMONTHDAY=${value.monthDay};${at}`;
    case "custom": {
      const parts = [`FREQ=${value.frequency.toUpperCase()}`];
      if (value.interval > 1) parts.push(`INTERVAL=${value.interval}`);
      if (value.frequency === "weekly")
        parts.push(`BYDAY=${byDay(value.weekdays).join(",") || "MO"}`);
      if (value.frequency === "monthly") {
        if (value.monthly === "weekday")
          parts.push(`BYDAY=${value.ordinal}${byDay(value.weekdays)[0] ?? "MO"}`);
        else parts.push(`BYMONTHDAY=${value.monthDay}`);
      }
      parts.push(at);
      if (value.end.kind === "after") parts.push(`COUNT=${value.end.count}`);
      // Floating local time, like the expander (§9.3): the last day in the site's zone.
      if (value.end.kind === "on") parts.push(`UNTIL=${value.end.date.replaceAll("-", "")}T235959`);
      return parts.join(";");
    }
  }
}

/** What is wrong with a value, as codes the screen words (empty when it can be saved). */
export type RecurrenceProblem = "time" | "weekdays" | "interval" | "count" | "until";
export function recurrenceProblems(value: RecurrenceValue): RecurrenceProblem[] {
  const out: RecurrenceProblem[] = [];
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) out.push("time");
  if (value.preset === "custom") {
    if (!Number.isInteger(value.interval) || value.interval < 1 || value.interval > 999)
      out.push("interval");
    if (value.frequency === "weekly" && value.weekdays.length === 0) out.push("weekdays");
    if (value.end.kind === "after" && (!Number.isInteger(value.end.count) || value.end.count < 1))
      out.push("count");
    if (value.end.kind === "on" && !/^\d{4}-\d{2}-\d{2}$/.test(value.end.date)) out.push("until");
  }
  return out;
}
