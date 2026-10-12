/**
 * Shared model of the schedule blocks (RFC-0008 §15, DESIGN.md §2x): the words every block takes,
 * the display states, and the little date math the calendar needs.
 *
 * Dates stay plain values. Calendar days are ISO dates (`YYYY-MM-DD`) in the **site's zone**;
 * instants are RFC 3339 strings. Day arithmetic works on the calendar date alone (UTC midnight, so
 * no zone or DST can shift it); instants are placed on days and written out through `Intl` with
 * the site's `timeZone`. No date library: recurrence and "next runs" come from the server (RFC-0008
 * §9.4), and Studio only displays them.
 */
import type {
  AutomationState,
  ReleaseState,
  ScheduleRun,
  ScheduleRunState,
} from "@cloudhal/core-contracts";

// ---------------------------------------------------------------------------------------------
// Kinds, states and words
// ---------------------------------------------------------------------------------------------

/** What is scheduled (RFC-0008 §15.5 facet "kind"). */
export type ScheduleKind = "publish" | "expiry" | "embargo" | "release" | "automation";
export const SCHEDULE_KINDS: readonly ScheduleKind[] = [
  "publish",
  "expiry",
  "embargo",
  "release",
  "automation",
];

export const RELEASE_STATES: readonly ReleaseState[] = [
  "draft",
  "awaiting_approval",
  "scheduled",
  "running",
  "published",
  "conflict",
  "missed",
  "expired",
  "failed",
  "canceled",
];
export const AUTOMATION_STATES: readonly AutomationState[] = [
  "active",
  "paused",
  "auto-paused",
  "broken",
  "ended",
];
export const SCHEDULE_RUN_STATES: readonly ScheduleRunState[] = [
  "due",
  "ready",
  "running",
  "succeeded",
  "failed",
  "missed",
  "skipped",
  "budget-exceeded",
  "killed",
];

/** How an item stands with approval (RFC-0008 §15.3, §15.5 facet "approval"). */
export type ScheduleApprovalState = "waiting" | "approved" | "auto" | "denied" | "expired";
export const SCHEDULE_APPROVAL_STATES: readonly ScheduleApprovalState[] = [
  "waiting",
  "approved",
  "auto",
  "denied",
  "expired",
];

/** A state with the thing it belongs to: a release, an automation, one run, or an approval. */
export type ScheduleStatus =
  | { subject: "release"; state: ReleaseState }
  | { subject: "automation"; state: AutomationState }
  | { subject: "run"; state: ScheduleRunState }
  | { subject: "approval"; state: ScheduleApprovalState };

/** Who put it on the calendar. */
export type ScheduleOrigin = "person" | "agent" | "system";

/**
 * The words the schedule blocks share. Studio builds this once from `useT("schedules")`; nothing
 * here has an English default (DESIGN.md §2x).
 */
export interface ScheduleWords {
  /** "Publish", "Expiry", "Embargo", "Release", "Automation". */
  kind: Record<ScheduleKind, string>;
  /** State names per subject: "Waiting for approval", "Published", "Paused", "Ran" … */
  status: {
    release: Record<ReleaseState, string>;
    automation: Record<AutomationState, string>;
    run: Record<ScheduleRunState, string>;
    approval: Record<ScheduleApprovalState, string>;
  };
}

// ---------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------

/** One thing on the calendar or in the agenda. Data only; words come from `ScheduleWords`. */
export interface ScheduleEntry {
  id: string;
  kind: ScheduleKind;
  /** The article, page or release title, or the automation's name. Plain text. */
  title: string;
  /** When it happens: an RFC 3339 instant. */
  at: string;
  /** The calendar day in the site zone (`YYYY-MM-DD`); computed from `at` when absent. */
  day?: string;
  status: ScheduleStatus;
  /** Approval, shown next to the state (approved agent items, `auto`, denied). */
  approval?: ScheduleApprovalState;
  origin?: ScheduleOrigin;
  /** Who, already worded: "proposed by Desk", "by Ayşe". Read in the accessible sentence. */
  originLabel?: string;
  /** A future occurrence of a recurring automation (ghost chip, folded per day in the agenda). */
  recurring?: boolean;
  /** Waiting for approval: the time left, already worded ("3 h left"). */
  timeLeft?: string;
  /** Can be dragged or moved: future, not running, not locked by a conflict, not an occurrence. */
  movable?: boolean;
  /** Where the title links (the editor, the release). */
  href?: string;
  /** The time as the screen wants it shown ("09:00"); formatted from `at` otherwise. */
  timeLabel?: string;
  /** The whole accessible sentence, when the screen words it itself. */
  label?: string;
}

/**
 * How an item looks (RFC-0008 §15.3: fill = certainty, tone = state, icon = kind and origin):
 * - `quiet` — scheduled by a person or approved: filled neutral tint;
 * - `auto` — scheduled by an `auto`-mode agent without a person: filled + Lightning;
 * - `proposed` — waiting for approval: dashed outline, empty fill;
 * - `struck` — denied, expired, canceled, skipped: struck through, inactive text;
 * - `danger` — conflict, failed, missed, broken: danger tint;
 * - `running` — filled + a spinner;
 * - `done` — published, ran: faded fill;
 * - `ghost` — a recurring occurrence (outline only); `paused` — the same with a pause icon.
 */
export type ScheduleLook =
  | "quiet"
  | "auto"
  | "proposed"
  | "struck"
  | "danger"
  | "running"
  | "done"
  | "ghost"
  | "paused";

/** The look of an item from its state, approval and recurrence. */
export function scheduleLook(
  entry: Pick<ScheduleEntry, "status" | "approval" | "recurring">,
): ScheduleLook {
  const { status, approval, recurring } = entry;
  if (approval === "denied" || approval === "expired") return "struck";
  switch (status.subject) {
    case "release":
      switch (status.state) {
        case "draft":
        case "awaiting_approval":
          return "proposed";
        case "scheduled":
          return approval === "auto" ? "auto" : approval === "waiting" ? "proposed" : "quiet";
        case "running":
          return "running";
        case "published":
          return "done";
        case "conflict":
        case "failed":
        case "missed":
          return "danger";
        case "expired":
        case "canceled":
          return "struck";
      }
      break;
    case "automation":
      switch (status.state) {
        case "active":
          return "ghost";
        case "paused":
        case "auto-paused":
          return "paused";
        case "broken":
          return "danger";
        case "ended":
          return "done";
      }
      break;
    case "run":
      switch (status.state) {
        case "due":
        case "ready":
          return recurring ? "ghost" : "quiet";
        case "running":
          return "running";
        case "succeeded":
          return "done";
        case "failed":
        case "missed":
        case "budget-exceeded":
          return "danger";
        case "skipped":
        case "killed":
          return "struck";
      }
      break;
    case "approval":
      switch (status.state) {
        case "waiting":
          return "proposed";
        case "auto":
          return "auto";
        case "approved":
          return "quiet";
        case "denied":
        case "expired":
          return "struck";
      }
  }
  return "quiet";
}

/** The status word of an entry. */
export function statusWord(status: ScheduleStatus, words: Pick<ScheduleWords, "status">): string {
  switch (status.subject) {
    case "release":
      return words.status.release[status.state];
    case "automation":
      return words.status.automation[status.state];
    case "run":
      return words.status.run[status.state];
    case "approval":
      return words.status.approval[status.state];
  }
}

/** True when the default schedule views hide the item (canceled, denied, expired: RFC §15.5). */
export function isHiddenByDefault(entry: Pick<ScheduleEntry, "status" | "approval">): boolean {
  if (entry.approval === "denied" || entry.approval === "expired") return true;
  return (
    entry.status.subject === "release" &&
    (entry.status.state === "canceled" || entry.status.state === "expired")
  );
}

// ---------------------------------------------------------------------------------------------
// Calendar days (`YYYY-MM-DD`, no zone) and instants in a zone
// ---------------------------------------------------------------------------------------------

/** 0 = Sunday … 6 = Saturday, like `Date#getUTCDay` and `firstDayOfWeek`. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** UTC midnight of a calendar day (`YYYY-MM-DD`). */
export function dayToDate(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`not a calendar day: ${day}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** The calendar day of a UTC-midnight date. */
export function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, n: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToDay(d);
}

/** The same day of another month, clamped to its length (31 Jan + 1 month = 28/29 Feb). */
export function shiftMonth(day: string, n: number): string {
  const d = dayToDate(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return dateToDay(target);
}

/** `YYYY-MM` of a day. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The weekday of a calendar day (0 = Sunday). */
export function weekdayOf(day: string): WeekDay {
  return dayToDate(day).getUTCDay() as WeekDay;
}

/** The seven weekdays starting at `weekStartsOn`. */
export function weekdayOrder(weekStartsOn: WeekDay): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as WeekDay);
}

/**
 * The weeks shown for `month` (`YYYY-MM`): from the week that holds its first day to the week
 * that holds its last, each week starting on `weekStartsOn` (4 to 6 rows).
 */
export function monthGrid(month: string, weekStartsOn: WeekDay): string[][] {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`not a month: ${month}`);
  const first = `${month}-01`;
  const lastDate = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0));
  const last = dateToDay(lastDate);
  let start = shiftDay(first, -((weekdayOf(first) - weekStartsOn + 7) % 7));
  const end = shiftDay(last, (weekStartsOn + 6 - weekdayOf(last) + 7) % 7);
  const weeks: string[][] = [];
  while (start <= end) {
    weeks.push(Array.from({ length: 7 }, (_, i) => shiftDay(start, i)));
    start = shiftDay(start, 7);
  }
  return weeks;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

/** Year, month, day, hour and minute of an instant on the wall clock of `timeZone`. */
export function zonedParts(at: string, timeZone: string) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, f);
  }
  const parts = Object.fromEntries(f.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** The calendar day an instant falls on in `timeZone`. */
export function zonedDay(at: string, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The entry's day: its own `day`, or `at` placed in the site zone. */
export function entryDay(entry: Pick<ScheduleEntry, "at" | "day">, timeZone: string): string {
  return entry.day ?? zonedDay(entry.at, timeZone);
}

/** `h23` or `h12`: what the locale writes by default (Turkish: 24-hour). */
export function hourCycleOf(locale: string): "h23" | "h12" {
  try {
    const hc = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
    return hc === "h11" || hc === "h12" ? "h12" : "h23";
  } catch {
    return "h23";
  }
}

/** An instant's time of day in the site zone and the locale ("09:00", "9:00 AM"). */
export function formatScheduleTime(
  at: string,
  locale: string,
  timeZone: string,
  hourCycle: "h23" | "h12" = hourCycleOf(locale),
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: hourCycle === "h23" ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle,
  }).format(new Date(at));
}

/** A calendar day written out: "Monday 12 October" (`long`), "12 Oct 2026" (`medium`). */
export function formatDay(
  day: string,
  locale: string,
  style: "long" | "medium" | "full" = "long",
): string {
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long" }
      : style === "full"
        ? { dateStyle: "full" }
        : { dateStyle: "medium" };
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(dayToDate(day));
}

/** "October 2026". */
export function formatMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dayToDate(`${month}-01`));
}

/** Weekday names in the locale, by weekday number (0 = Sunday). */
export function weekdayNames(locale: string, width: "long" | "short" | "narrow"): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" });
  // 2026-10-11 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => f.format(dayToDate(shiftDay("2026-10-11", i))));
}

/** "Today", "Tomorrow", "Yesterday" in the locale (sentence case), or undefined further away. */
export function relativeDay(day: string, today: string, locale: string): string | undefined {
  const diff = Math.round((dayToDate(day).getTime() - dayToDate(today).getTime()) / 86_400_000);
  if (Math.abs(diff) > 1) return undefined;
  const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day");
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Sorts entries by time, then title (stable for equal times). */
export function sortEntries<T extends Pick<ScheduleEntry, "at" | "title">>(entries: readonly T[]) {
  return [...entries].sort((a, b) =>
    a.at === b.at ? a.title.localeCompare(b.title) : Date.parse(a.at) - Date.parse(b.at),
  );
}

/** Entries grouped by their day in the site zone, days ascending, entries by time. */
export function groupByDay<T extends ScheduleEntry>(
  entries: readonly T[],
  timeZone: string,
): { day: string; entries: T[] }[] {
  const map = new Map<string, T[]>();
  for (const e of sortEntries(entries)) {
    const d = entryDay(e, timeZone);
    const list = map.get(d);
    if (list) list.push(e);
    else map.set(d, [e]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => ({ day, entries: list }));
}

// ---------------------------------------------------------------------------------------------
// Times of day typed by people (`HH:mm`, 24-hour inside)
// ---------------------------------------------------------------------------------------------

/** The day-period words of a 12-hour locale ("AM", "PM"), from `Intl`. */
function dayPeriods(locale: string): { am: string; pm: string } {
  const f = new Intl.DateTimeFormat(locale, { hour: "numeric", hourCycle: "h12", timeZone: "UTC" });
  const period = (h: number) =>
    f.formatToParts(new Date(Date.UTC(2026, 0, 1, h))).find((p) => p.type === "dayPeriod")?.value ??
    "";
  return { am: period(1), pm: period(13) };
}

/**
 * Reads a time of day as people type it — "9", "930", "09:30", "9.30", "21:05", and in 12-hour
 * locales "9:30 pm" with the locale's own AM/PM words — into `HH:mm`. Undefined when it is not one.
 */
export function parseTimeOfDay(text: string, locale: string): string | undefined {
  let t = text.trim().toLocaleLowerCase(locale);
  if (!t) return undefined;
  let offset: number | undefined;
  const { am, pm } = dayPeriods(locale);
  for (const [word, add] of [
    [am, 0],
    [pm, 12],
  ] as const) {
    const w = word.toLocaleLowerCase(locale).replace(/\./g, "");
    if (w && t.replace(/\./g, "").endsWith(w)) {
      offset = add;
      t = t.replace(/\./g, "").slice(0, -w.length).trim();
    }
  }
  const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?$/.exec(t);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (minute > 59) return undefined;
  if (offset !== undefined) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + offset;
  } else if (hour > 23) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** `HH:mm` written in the locale's hour cycle ("21:05", "9:05 PM"). */
export function formatTimeOfDay(
  time: string,
  locale: string,
  hourCycle: "h23" | "h12" = hourCycleOf(locale),
): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  return new Intl.DateTimeFormat(locale, {
    hour: hourCycle === "h23" ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, Number(m[1]), Number(m[2]))));
}

// ---------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------

export type ScheduleRunTrigger = NonNullable<ScheduleRun["trigger"]>;
export type ScheduleRunOutcome = NonNullable<ScheduleRun["outcome"]>;
export const SCHEDULE_RUN_TRIGGERS: readonly ScheduleRunTrigger[] = [
  "cron",
  "alarm",
  "request",
  "node",
  "manual",
];
export const SCHEDULE_RUN_OUTCOMES: readonly ScheduleRunOutcome[] = [
  "did-work",
  "nothing-to-do",
  "proposed",
  "waiting-approval",
];
