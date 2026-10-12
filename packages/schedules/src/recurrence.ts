/**
 * The RRULE subset (RFC-0008 §9.3, D3) — parse, validate, expand, presets and sentences.
 * `@cloudhal/schedules/recurrence`; Worker-safe, no clock (callers pass `after`).
 *
 * Accepted: FREQ DAILY | WEEKLY | MONTHLY; INTERVAL 1–999; BYDAY (ordinals such as `2TU` and `-1FR`
 * only with MONTHLY); BYMONTHDAY 1–31 or -1 (not with WEEKLY); BYHOUR 0–23; BYMINUTE 0–59 (up to
 * four values); COUNT 1–9999 or UNTIL (`YYYYMMDDTHHMMSSZ`, UTC, inclusive). Week start is Monday.
 * Refused: every other part (SECONDLY, MINUTELY, HOURLY, YEARLY, BYSECOND, BYWEEKNO, BYYEARDAY,
 * BYSETPOS, BYMONTH, WKST, RSCALE, SKIP), the `RRULE:` prefix, a part given twice, a value given
 * twice, COUNT with UNTIL, and rules whose runs come closer than the job's minimum interval
 * (1 hour, at most 24 a day).
 *
 * Semantics:
 * - The expander works in floating local time from `start` and resolves each candidate in the
 *   zone with D2: a candidate inside a DST gap moves to the next valid time (`adjusted: "dst-gap"`),
 *   a repeated wall-clock time runs once, at its first instant. RFC 5545 §3.3.10 drops gap
 *   occurrences instead; this is the documented deviation (§9.2). If a moved candidate lands on an
 *   instant that already ran (the hourly preset at 03:30 after 02:30 moved to 03:30), it counts once.
 * - `start` is an occurrence only when it matches the rule (as in `rrule-temporal` without
 *   `includeDtstart`); parts the rule omits default to `start`'s (weekday, day of month, hour,
 *   minute), so preset rules always include it. A month without the day (the 31st) is skipped.
 * - COUNT counts emitted occurrences; UNTIL compares instants.
 */
import { Temporal } from "temporal-polyfill/implementation";
import { ScheduleError } from "./errors.ts";
import { fnv1a32 } from "./ids.ts";
import {
  assertTimeZone,
  canonicalInstant,
  instantMs,
  isLocalDateTime,
  resolvePlain,
} from "./time.ts";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
/** ISO order (Monday = 1). */
export const WEEKDAYS: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export type RuleFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ByDay {
  day: Weekday;
  /** 1…5 or -5…-1 (MONTHLY only): the nth (from the end) such weekday of the month. */
  ordinal?: number;
}

/** A parsed rule; `formatRule` turns it back into its canonical text. */
export interface ParsedRule {
  freq: RuleFrequency;
  interval: number;
  byDay?: ByDay[];
  byMonthDay?: number[];
  byHour?: number[];
  byMinute?: number[];
  count?: number;
  /** Canonical instant (inclusive). */
  until?: string;
}

/** What `occurrences` needs: the contract's `AutomationRecurrence` without `preset`. */
export interface RecurrenceInput {
  start: string;
  timeZone: string;
  rule?: string;
}

export interface Occurrence {
  /** The instant, canonical (`Date#toISOString()`). */
  at: string;
  /** The wall-clock time the rule produced (before any DST move), to the minute. */
  local: string;
  adjusted?: "dst-gap";
}

export const RULE_MAX_LENGTH = 300;
export const MAX_BYMINUTE = 4;
/** Built-in jobs and agent tasks (§9.3). */
export const DEFAULT_MIN_INTERVAL_MINUTES = 60;
export const MAX_OCCURRENCES_PER_DAY = 24;

const SUPPORTED = new Set([
  "FREQ",
  "INTERVAL",
  "BYDAY",
  "BYMONTHDAY",
  "BYHOUR",
  "BYMINUTE",
  "COUNT",
  "UNTIL",
]);
const KNOWN_UNSUPPORTED = new Set([
  "BYSECOND",
  "BYWEEKNO",
  "BYYEARDAY",
  "BYSETPOS",
  "BYMONTH",
  "WKST",
  "RSCALE",
  "SKIP",
  "RDATE",
  "EXDATE",
]);

function bad(message: string): never {
  throw new ScheduleError("invalid_rule", message);
}
function unsupported(message: string): never {
  throw new ScheduleError("unsupported_rule_part", message);
}

function intList(
  value: string,
  part: string,
  min: number,
  max: number,
  allow?: (n: number) => boolean,
): number[] {
  const out: number[] = [];
  for (const raw of value.split(",")) {
    if (!/^[+-]?[0-9]{1,4}$/.test(raw)) bad(`${part}: "${raw}" is not a number`);
    const n = Number(raw);
    if (!(allow ? allow(n) : n >= min && n <= max)) bad(`${part}: ${raw} is out of range`);
    if (out.includes(n)) bad(`${part}: ${raw} is given twice`);
    out.push(n);
  }
  return out;
}

/** Parses a rule of the subset (without `RRULE:`); throws `ScheduleError` naming the problem. */
export function parseRule(rule: string): ParsedRule {
  if (typeof rule !== "string" || rule.length === 0) bad("empty rule");
  if (rule.length > RULE_MAX_LENGTH) bad(`longer than ${RULE_MAX_LENGTH} characters`);
  if (/^RRULE:/i.test(rule)) bad("write the rule without the RRULE: prefix");
  const parts = new Map<string, string>();
  const order: string[] = [];
  for (const piece of rule.split(";")) {
    const m = /^([A-Z]+)=([^;=]*)$/.exec(piece);
    if (!m) bad(`"${piece}" is not NAME=value`);
    const [, name = "", value = ""] = m;
    if (!SUPPORTED.has(name)) {
      if (KNOWN_UNSUPPORTED.has(name)) unsupported(`${name} is not supported`);
      bad(`unknown part ${name}`);
    }
    if (parts.has(name)) bad(`${name} is given twice`);
    parts.set(name, value);
    order.push(name);
  }
  if (order[0] !== "FREQ") bad("the rule must start with FREQ");
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") {
    if (["SECONDLY", "MINUTELY", "HOURLY", "YEARLY"].includes(freq ?? ""))
      unsupported(`FREQ=${freq} is not supported`);
    bad(`unknown FREQ ${freq}`);
  }
  const out: ParsedRule = { freq, interval: 1 };
  const interval = parts.get("INTERVAL");
  if (interval !== undefined) {
    if (!/^[1-9][0-9]{0,2}$/.test(interval)) bad("INTERVAL must be 1–999");
    out.interval = Number(interval);
  }
  const byDay = parts.get("BYDAY");
  if (byDay !== undefined) {
    const days: ByDay[] = [];
    for (const raw of byDay.split(",")) {
      const m = /^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.exec(raw);
      if (!m) bad(`BYDAY: "${raw}" is not a weekday`);
      const day = m[2] as Weekday;
      const ordinal = m[1] !== undefined ? Number(m[1]) : undefined;
      if (ordinal !== undefined && freq !== "MONTHLY")
        bad("BYDAY ordinals (2TU, -1FR) need FREQ=MONTHLY");
      if (days.some((d) => d.day === day && d.ordinal === ordinal))
        bad(`BYDAY: ${raw} is given twice`);
      days.push(ordinal !== undefined ? { day, ordinal } : { day });
    }
    out.byDay = days;
  }
  const byMonthDay = parts.get("BYMONTHDAY");
  if (byMonthDay !== undefined) {
    if (freq === "WEEKLY") bad("BYMONTHDAY cannot be used with FREQ=WEEKLY");
    out.byMonthDay = intList(
      byMonthDay,
      "BYMONTHDAY",
      1,
      31,
      (n) => n === -1 || (n >= 1 && n <= 31),
    );
  }
  const byHour = parts.get("BYHOUR");
  if (byHour !== undefined) out.byHour = intList(byHour, "BYHOUR", 0, 23);
  const byMinute = parts.get("BYMINUTE");
  if (byMinute !== undefined) {
    out.byMinute = intList(byMinute, "BYMINUTE", 0, 59);
    if (out.byMinute.length > MAX_BYMINUTE) bad(`BYMINUTE takes at most ${MAX_BYMINUTE} values`);
  }
  const count = parts.get("COUNT");
  const until = parts.get("UNTIL");
  if (count !== undefined && until !== undefined) bad("COUNT and UNTIL cannot be used together");
  if (count !== undefined) {
    if (!/^[1-9][0-9]{0,3}$/.test(count)) bad("COUNT must be 1–9999");
    out.count = Number(count);
  }
  if (until !== undefined) {
    const m = /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/.exec(until);
    if (!m) bad("UNTIL must be a UTC time such as 20261231T235959Z");
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== iso.slice(0, 19))
      bad(`UNTIL ${until} is not a valid time`);
    out.until = canonicalInstant(ms);
  }
  return out;
}

function untilText(until: string): string {
  const d = new Date(until);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** The canonical text of a parsed rule (parts in a fixed order). */
export function formatRule(rule: ParsedRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay)
    parts.push(`BYDAY=${rule.byDay.map((d) => `${d.ordinal ?? ""}${d.day}`).join(",")}`);
  if (rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byHour) parts.push(`BYHOUR=${rule.byHour.join(",")}`);
  if (rule.byMinute) parts.push(`BYMINUTE=${rule.byMinute.join(",")}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${untilText(rule.until)}`);
  return parts.join(";");
}

function plainStart(start: string): Temporal.PlainDateTime {
  if (!isLocalDateTime(start))
    throw new ScheduleError(
      "invalid_local_time",
      `not a wall-clock time (YYYY-MM-DDTHH:mm): ${start}`,
    );
  return Temporal.PlainDateTime.from(start, { overflow: "reject" });
}

/** Minutes of the day the rule runs at, sorted. */
function timesOfDay(rule: ParsedRule | undefined, start: Temporal.PlainDateTime): number[] {
  const hours = rule?.byHour ?? [start.hour];
  const minutes = rule?.byMinute ?? [start.minute];
  const out: number[] = [];
  for (const h of hours) for (const m of minutes) out.push(h * 60 + m);
  return out.sort((a, b) => a - b);
}

export interface ValidateOptions {
  /** Minimum minutes between two runs (default 60, §9.3). */
  minIntervalMinutes?: number;
  /** Most runs on one day (default 24). */
  maxPerDay?: number;
}

/**
 * Validates a recurrence for storage: the zone, the start, the rule and the job's minimum interval.
 * Returns the parsed rule (undefined for a one-off).
 */
export function validateRecurrence(
  input: RecurrenceInput,
  options: ValidateOptions = {},
): ParsedRule | undefined {
  assertTimeZone(input.timeZone);
  const start = plainStart(input.start);
  if (input.rule === undefined) return undefined;
  const rule = parseRule(input.rule);
  const minGap = options.minIntervalMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES;
  const maxPerDay = options.maxPerDay ?? MAX_OCCURRENCES_PER_DAY;
  const times = timesOfDay(rule, start);
  if (times.length > maxPerDay)
    throw new ScheduleError(
      "rule_too_frequent",
      `at most ${maxPerDay} runs a day (this rule has ${times.length})`,
    );
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < times.length; i++) gap = Math.min(gap, (times[i] ?? 0) - (times[i - 1] ?? 0));
  const dayTokens = (rule.byDay?.length ?? 0) + (rule.byMonthDay?.length ?? 0);
  const consecutiveDays = (rule.freq === "DAILY" && rule.interval === 1) || dayTokens >= 2;
  if (consecutiveDays && times.length > 0)
    gap = Math.min(gap, (times[0] ?? 0) + 1440 - (times[times.length - 1] ?? 0));
  if (gap < minGap)
    throw new ScheduleError(
      "rule_too_frequent",
      `runs must be at least ${minGap} minutes apart (this rule has ${gap})`,
    );
  if (rule.until !== undefined) {
    const first = occurrences(input, { limit: 1 });
    if (first.length === 0) bad("UNTIL is before the first run");
  }
  return rule;
}

/** Plain dates of one MONTHLY period. */
function monthDays(rule: ParsedRule, ym: Temporal.PlainYearMonth, startDay: number): number[] {
  const dim = ym.daysInMonth;
  const first = ym.toPlainDate({ day: 1 });
  let fromMonthDay: Set<number> | undefined;
  if (rule.byMonthDay) {
    fromMonthDay = new Set();
    for (const d of rule.byMonthDay) {
      const day = d === -1 ? dim : d;
      if (day <= dim) fromMonthDay.add(day);
    }
  }
  let fromByDay: Set<number> | undefined;
  if (rule.byDay) {
    fromByDay = new Set();
    for (const { day, ordinal } of rule.byDay) {
      const iso = WEEKDAYS.indexOf(day) + 1;
      const firstMatch = 1 + ((iso - first.dayOfWeek + 7) % 7);
      const all: number[] = [];
      for (let d = firstMatch; d <= dim; d += 7) all.push(d);
      if (ordinal === undefined) for (const d of all) fromByDay.add(d);
      else {
        const pick = ordinal > 0 ? all[ordinal - 1] : all[all.length + ordinal];
        if (pick !== undefined) fromByDay.add(pick);
      }
    }
  }
  let days: number[];
  if (fromMonthDay && fromByDay) days = [...fromMonthDay].filter((d) => fromByDay.has(d));
  else if (fromMonthDay) days = [...fromMonthDay];
  else if (fromByDay) days = [...fromByDay];
  else days = startDay <= dim ? [startDay] : [];
  return days.sort((a, b) => a - b);
}

function dayMatchesFilters(rule: ParsedRule, date: Temporal.PlainDate): boolean {
  if (rule.byDay && !rule.byDay.some((d) => WEEKDAYS.indexOf(d.day) + 1 === date.dayOfWeek))
    return false;
  if (
    rule.byMonthDay &&
    !rule.byMonthDay.some((d) => (d === -1 ? date.daysInMonth : d) === date.day)
  )
    return false;
  return true;
}

/** Candidate dates of period `k` (chronological). */
function periodDates(
  rule: ParsedRule,
  start: Temporal.PlainDateTime,
  k: number,
): Temporal.PlainDate[] {
  const startDate = start.toPlainDate();
  if (rule.freq === "DAILY") {
    const date = startDate.add({ days: k * rule.interval });
    return dayMatchesFilters(rule, date) ? [date] : [];
  }
  if (rule.freq === "WEEKLY") {
    const monday = startDate
      .subtract({ days: startDate.dayOfWeek - 1 })
      .add({ weeks: k * rule.interval });
    const isoDays = rule.byDay
      ? [...new Set(rule.byDay.map((d) => WEEKDAYS.indexOf(d.day) + 1))].sort((a, b) => a - b)
      : [startDate.dayOfWeek];
    return isoDays.map((iso) => monday.add({ days: iso - 1 }));
  }
  const ym = Temporal.PlainYearMonth.from({ year: start.year, month: start.month }).add({
    months: k * rule.interval,
  });
  return monthDays(rule, ym, start.day).map((day) => ym.toPlainDate({ day }));
}

/** The period index whose dates come at or before `date` (a safe place to start iterating). */
function periodBefore(
  rule: ParsedRule,
  start: Temporal.PlainDateTime,
  date: Temporal.PlainDate,
): number {
  const startDate = start.toPlainDate();
  if (Temporal.PlainDate.compare(date, startDate) <= 0) return 0;
  let units: number;
  if (rule.freq === "DAILY") units = startDate.until(date, { largestUnit: "days" }).days;
  else if (rule.freq === "WEEKLY")
    units = Math.floor(startDate.until(date, { largestUnit: "days" }).days / 7);
  else units = (date.year - start.year) * 12 + (date.month - start.month);
  return Math.max(0, Math.floor(units / rule.interval) - 1);
}

export interface OccurrenceQuery {
  /** Only occurrences strictly after this instant. */
  after?: string | Date | number;
  /** Only occurrences strictly before this instant. */
  before?: string | Date | number;
  /** At most this many (required: a rule without COUNT or UNTIL never ends). */
  limit: number;
  /** Stop after this many periods without reaching `limit` (default: 100 years' worth). */
  maxPeriods?: number;
}

/**
 * Expands a recurrence (a one-off when `rule` is absent) into instants, in order. Pure: pass the
 * clock as `after`.
 */
export function occurrences(input: RecurrenceInput, query: OccurrenceQuery): Occurrence[] {
  assertTimeZone(input.timeZone);
  const start = plainStart(input.start);
  const after = query.after !== undefined ? instantMs(query.after) : Number.NEGATIVE_INFINITY;
  const before = query.before !== undefined ? instantMs(query.before) : Number.POSITIVE_INFINITY;
  const out: Occurrence[] = [];
  if (query.limit <= 0) return out;
  if (input.rule === undefined) {
    const r = resolvePlain(start, input.timeZone);
    const ms = Date.parse(r.at);
    if (ms > after && ms < before)
      out.push({ at: r.at, local: input.start, ...(r.adjusted ? { adjusted: r.adjusted } : {}) });
    return out;
  }
  const rule = parseRule(input.rule);
  const times = timesOfDay(rule, start);
  const until = rule.until !== undefined ? Date.parse(rule.until) : Number.POSITIVE_INFINITY;
  const maxPeriods =
    query.maxPeriods ?? (rule.freq === "DAILY" ? 36_600 : rule.freq === "WEEKLY" ? 5_220 : 1_200);
  // Without COUNT the expansion may begin near `after`; with COUNT it must count from the start.
  let k = 0;
  if (rule.count === undefined && Number.isFinite(after)) {
    const afterLocal = Temporal.Instant.fromEpochMilliseconds(after)
      .toZonedDateTimeISO(input.timeZone)
      .toPlainDate();
    k = periodBefore(rule, start, afterLocal);
  }
  let emitted = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (let periods = 0; periods < maxPeriods; periods++, k++) {
    for (const date of periodDates(rule, start, k)) {
      for (const minutes of times) {
        const local = date.toPlainDateTime({
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
        });
        if (Temporal.PlainDateTime.compare(local, start) < 0) continue;
        const r = resolvePlain(local, input.timeZone);
        const ms = Date.parse(r.at);
        if (ms <= last) continue; // a DST move onto an instant that already ran counts once
        if (ms > until) return out;
        last = ms;
        emitted++;
        if (ms > after) {
          if (ms >= before) return out;
          out.push({
            at: r.at,
            local: local.toString({ smallestUnit: "minute" }),
            ...(r.adjusted ? { adjusted: r.adjusted } : {}),
          });
          if (out.length >= query.limit) return out;
        }
        if (rule.count !== undefined && emitted >= rule.count) return out;
      }
    }
  }
  return out;
}

/** The first occurrence strictly after `after`, or undefined when the recurrence has ended. */
export function nextOccurrence(
  input: RecurrenceInput,
  after: string | Date | number,
): Occurrence | undefined {
  return occurrences(input, { after, limit: 1 })[0];
}

export interface OccurrencesBetween {
  /** The first occurrences in the range, at most `limit`. */
  occurrences: Occurrence[];
  /** The latest occurrence in the range (the one that runs after downtime, §8.6). */
  latest?: Occurrence;
  /** How many there are, saturating at `limit + 1`. */
  count: number;
  truncated: boolean;
}

/**
 * Occurrences in `(after, upTo]` — what a tick that last ran at `after` has to account for. Only
 * the first `limit` are listed, but `latest` is always the true latest (only it runs, §8.6).
 */
export function occurrencesBetween(
  input: RecurrenceInput,
  after: string | Date | number,
  upTo: string | Date | number,
  limit = 1_000,
): OccurrencesBetween {
  const end = instantMs(upTo) + 1;
  const first = occurrences(input, { after, before: end, limit: limit + 1 });
  if (first.length <= limit)
    return { occurrences: first, ...latestOf(first), count: first.length, truncated: false };
  // Many occurrences: look for the latest in a growing window before `upTo` (a dense rule finds it
  // in the first window; a sparse one never has many occurrences to expand).
  const from = instantMs(after);
  for (const days of [2, 64, 800, Number.POSITIVE_INFINITY]) {
    const recent = occurrences(input, {
      after: Math.max(from, instantMs(upTo) - days * 86_400_000),
      before: end,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const latest = recent[recent.length - 1];
    if (latest)
      return { occurrences: first.slice(0, limit), latest, count: limit + 1, truncated: true };
  }
  return { occurrences: first.slice(0, limit), count: limit + 1, truncated: true };
}

function latestOf(list: readonly Occurrence[]): { latest?: Occurrence } {
  const latest = list[list.length - 1];
  return latest ? { latest } : {};
}

// ───────────────────────────── presets ─────────────────────────────

export type RecurrencePreset =
  | "once"
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom";

/**
 * The rule a Studio/MCP preset stands for, given the wall-clock `start` (§9.3), with every part
 * spelled out so the rule reads the same whatever `start` later becomes: `hourly` is
 * `FREQ=DAILY;BYHOUR=0,…,23;BYMINUTE=m` (HOURLY stays out of the vocabulary), `daily` adds
 * `BYHOUR`/`BYMINUTE`, `weekly` the start's weekday, `monthly` its day of the month. `once` has no
 * rule; `custom` has none of its own (the caller supplies it).
 */
export function presetRule(preset: "once", start: string): undefined;
export function presetRule(
  preset: Exclude<RecurrencePreset, "custom" | "once">,
  start: string,
): string;
export function presetRule(
  preset: Exclude<RecurrencePreset, "custom">,
  start: string,
): string | undefined;
export function presetRule(
  preset: Exclude<RecurrencePreset, "custom">,
  start: string,
): string | undefined {
  const s = plainStart(start);
  const at = `BYHOUR=${s.hour};BYMINUTE=${s.minute}`;
  switch (preset) {
    case "once":
      return undefined;
    case "hourly":
      return `FREQ=DAILY;BYHOUR=${Array.from({ length: 24 }, (_, h) => h).join(",")};BYMINUTE=${s.minute}`;
    case "daily":
      return `FREQ=DAILY;${at}`;
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${at}`;
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${WEEKDAYS[s.dayOfWeek - 1]};${at}`;
    case "monthly":
      return `FREQ=MONTHLY;BYMONTHDAY=${s.day};${at}`;
  }
}

/** The preset a rule matches for `start`, or `custom`. */
export function presetOf(rule: string | undefined, start: string): RecurrencePreset {
  if (rule === undefined) return "once";
  const canonical = formatRule(parseRule(rule));
  for (const p of ["hourly", "daily", "weekdays", "weekly", "monthly"] as const)
    if (presetRule(p, start) === canonical) return p;
  return "custom";
}

/**
 * The deterministic minute offset (0–9) a built-in job created from a preset gets, so many sites do
 * not all wake at :00 (§9.5): FNV-1a 32 of the automation id, modulo 10.
 */
export function presetMinuteOffset(automationId: string): number {
  return fnv1a32(automationId) % 10;
}

// ───────────────────────────── sentences ─────────────────────────────

export type RecurrenceSentenceKey =
  | "once"
  | "hourly"
  | "daily"
  | "everyNDays"
  | "weekdays"
  | "weekly"
  | "everyNWeeks"
  | "monthlyOnDays"
  | "everyNMonthsOnDays"
  | "monthlyOnWeekdays"
  | "everyNMonthsOnWeekdays"
  | "custom";

/**
 * A recurrence in words, as data: Studio and the API render it with `renderRecurrence` (or their
 * own templates from the same keys); nothing here is an English string.
 */
export interface RecurrenceSentence {
  key: RecurrenceSentenceKey;
  /** Wall-clock times, `HH:mm`, in the recurrence's zone. */
  times: string[];
  timeZone: string;
  n?: number;
  /** The start's date (`YYYY-MM-DD`), for `once`. */
  date?: string;
  /** `hourly`: the minute (`07`). */
  minute?: string;
  days?: Weekday[];
  /** Days of the month; -1 is the last day. */
  monthDays?: number[];
  /** `monthlyOnWeekdays`: plain weekdays carry no ordinal. */
  weekdays?: ByDay[];
  count?: number;
  /** The last date (`YYYY-MM-DD`, in the zone) for UNTIL. */
  until?: string;
  /** `custom`: the canonical rule. */
  rule?: string;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Describes a recurrence as a `RecurrenceSentence`. */
export function describeRecurrence(input: RecurrenceInput): RecurrenceSentence {
  const start = plainStart(input.start);
  const base = { timeZone: input.timeZone } as const;
  if (input.rule === undefined)
    return {
      ...base,
      key: "once",
      date: start.toPlainDate().toString(),
      times: [hhmm(start.hour * 60 + start.minute)],
    };
  const rule = parseRule(input.rule);
  const times = timesOfDay(rule, start).map(hhmm);
  const limit = {
    ...(rule.count !== undefined ? { count: rule.count } : {}),
    ...(rule.until !== undefined
      ? {
          until: Temporal.Instant.fromEpochMilliseconds(Date.parse(rule.until))
            .toZonedDateTimeISO(input.timeZone)
            .toPlainDate()
            .toString(),
        }
      : {}),
  };
  const n = rule.interval;
  const plainDays = rule.byDay?.every((d) => d.ordinal === undefined)
    ? rule.byDay.map((d) => d.day)
    : undefined;
  const custom = (): RecurrenceSentence => ({
    ...base,
    key: "custom",
    times,
    rule: formatRule(rule),
    ...limit,
  });
  if (rule.freq === "DAILY") {
    if (rule.byMonthDay) return custom();
    if (rule.byDay) {
      if (n !== 1 || !plainDays) return custom();
      return weekly(plainDays);
    }
    if (rule.byHour?.length === 24 && (rule.byMinute?.length ?? 1) === 1 && n === 1)
      return {
        ...base,
        key: "hourly",
        times,
        minute: String(rule.byMinute?.[0] ?? start.minute).padStart(2, "0"),
        ...limit,
      };
    return n === 1
      ? { ...base, key: "daily", times, ...limit }
      : { ...base, key: "everyNDays", n, times, ...limit };
  }
  if (rule.freq === "WEEKLY") {
    const days = plainDays ?? [WEEKDAYS[start.dayOfWeek - 1] as Weekday];
    if (n !== 1) return { ...base, key: "everyNWeeks", n, days: sortDays(days), times, ...limit };
    return weekly(days);
  }
  if (rule.byDay && rule.byMonthDay) return custom();
  const monthly = n === 1;
  if (rule.byDay)
    return {
      ...base,
      key: monthly ? "monthlyOnWeekdays" : "everyNMonthsOnWeekdays",
      ...(monthly ? {} : { n }),
      weekdays: rule.byDay,
      times,
      ...limit,
    };
  return {
    ...base,
    key: monthly ? "monthlyOnDays" : "everyNMonthsOnDays",
    ...(monthly ? {} : { n }),
    monthDays: rule.byMonthDay
      ? [...rule.byMonthDay].sort((a, b) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b))
      : [start.day],
    times,
    ...limit,
  };

  function weekly(days: Weekday[]): RecurrenceSentence {
    const sorted = sortDays(days);
    if (sorted.join(",") === "MO,TU,WE,TH,FR") return { ...base, key: "weekdays", times, ...limit };
    if (sorted.length === 7) return { ...base, key: "daily", times, ...limit };
    return { ...base, key: "weekly", days: sorted, times, ...limit };
  }
}

function sortDays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
}

export type RecurrenceLocale = "en" | "tr";

/** Templates and words for `renderRecurrence`, per locale. `{name}` is a placeholder. */
export interface RecurrenceMessages {
  templates: Record<RecurrenceSentenceKey, string>;
  count: string;
  until: string;
  and: string;
  listSeparator: string;
  dayNames: Record<Weekday, string>;
  /** The weekday as the head of "the second Tuesday of the month" (Turkish possessive). */
  dayNamesOrdinal: Record<Weekday, string>;
  /** 1…5, -1…-5 → "first", "last", "second to last". */
  ordinals: Record<string, string>;
  /** A day of the month: `{n}` → "1st" / "1."; `last` for -1. */
  monthDay: (n: number) => string;
  lastMonthDay: string;
  monthNames: readonly string[];
  /** `{d} {month} {y}` order. */
  date: string;
}

const enOrdinalSuffix = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
};

/** The recurrence words in English and Turkish (§15.8: our own templates, not a cron-to-text library). */
export const RECURRENCE_MESSAGES: Record<RecurrenceLocale, RecurrenceMessages> = {
  en: {
    templates: {
      once: "Once, on {date} at {times}",
      hourly: "Every hour at :{minute}",
      daily: "Every day at {times}",
      everyNDays: "Every {n} days at {times}",
      weekdays: "Weekdays at {times}",
      weekly: "Every {days} at {times}",
      everyNWeeks: "Every {n} weeks on {days} at {times}",
      monthlyOnDays: "Monthly on the {monthDays} at {times}",
      everyNMonthsOnDays: "Every {n} months on the {monthDays} at {times}",
      monthlyOnWeekdays: "On the {weekdays} of every month at {times}",
      everyNMonthsOnWeekdays: "On the {weekdays} of every {n} months at {times}",
      custom: "Custom schedule ({rule}) at {times}",
    },
    count: "{count} times",
    until: "until {until}",
    and: " and ",
    listSeparator: ", ",
    dayNames: {
      MO: "Monday",
      TU: "Tuesday",
      WE: "Wednesday",
      TH: "Thursday",
      FR: "Friday",
      SA: "Saturday",
      SU: "Sunday",
    },
    dayNamesOrdinal: {
      MO: "Monday",
      TU: "Tuesday",
      WE: "Wednesday",
      TH: "Thursday",
      FR: "Friday",
      SA: "Saturday",
      SU: "Sunday",
    },
    ordinals: {
      "1": "first",
      "2": "second",
      "3": "third",
      "4": "fourth",
      "5": "fifth",
      "-1": "last",
      "-2": "second to last",
      "-3": "third to last",
      "-4": "fourth to last",
      "-5": "fifth to last",
      every: "every",
    },
    monthDay: enOrdinalSuffix,
    lastMonthDay: "last day",
    monthNames: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    date: "{d} {month} {y}",
  },
  tr: {
    templates: {
      once: "Bir kez, {date} {times}",
      hourly: "Her saat :{minute}",
      daily: "Her gün {times}",
      everyNDays: "{n} günde bir {times}",
      weekdays: "Hafta içi her gün {times}",
      weekly: "Her {days} {times}",
      everyNWeeks: "{n} haftada bir {days} {times}",
      monthlyOnDays: "Her ayın {monthDays} günü {times}",
      everyNMonthsOnDays: "{n} ayda bir, ayın {monthDays} günü {times}",
      monthlyOnWeekdays: "Her ayın {weekdays} {times}",
      everyNMonthsOnWeekdays: "{n} ayda bir, ayın {weekdays} {times}",
      custom: "Özel tekrar ({rule}) {times}",
    },
    count: "{count} kez",
    until: "{until} tarihine kadar",
    and: " ve ",
    listSeparator: ", ",
    dayNames: {
      MO: "pazartesi",
      TU: "salı",
      WE: "çarşamba",
      TH: "perşembe",
      FR: "cuma",
      SA: "cumartesi",
      SU: "pazar",
    },
    dayNamesOrdinal: {
      MO: "pazartesisi",
      TU: "salısı",
      WE: "çarşambası",
      TH: "perşembesi",
      FR: "cuması",
      SA: "cumartesisi",
      SU: "pazarı",
    },
    ordinals: {
      "1": "birinci",
      "2": "ikinci",
      "3": "üçüncü",
      "4": "dördüncü",
      "5": "beşinci",
      "-1": "son",
      "-2": "sondan ikinci",
      "-3": "sondan üçüncü",
      "-4": "sondan dördüncü",
      "-5": "sondan beşinci",
      every: "her",
    },
    monthDay: (n) => `${n}.`,
    lastMonthDay: "son",
    monthNames: [
      "Ocak",
      "Şubat",
      "Mart",
      "Nisan",
      "Mayıs",
      "Haziran",
      "Temmuz",
      "Ağustos",
      "Eylül",
      "Ekim",
      "Kasım",
      "Aralık",
    ],
    date: "{d} {month} {y}",
  },
};

function list(items: readonly string[], m: RecurrenceMessages): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(m.listSeparator)}${m.and}${items[items.length - 1]}`;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
}

function dateWords(iso: string, m: RecurrenceMessages): string {
  const [y = "", mo = "1", d = "1"] = iso.split("-");
  return fill(m.date, { d: String(Number(d)), month: m.monthNames[Number(mo) - 1] ?? mo, y });
}

/** Renders a sentence with the locale's templates ("Her ayın ikinci salısı 09:07"). */
export function renderRecurrence(sentence: RecurrenceSentence, locale: RecurrenceLocale): string {
  const m = RECURRENCE_MESSAGES[locale];
  const values: Record<string, string> = {
    times: list(sentence.times, m),
    ...(sentence.n !== undefined ? { n: String(sentence.n) } : {}),
    ...(sentence.minute !== undefined ? { minute: sentence.minute } : {}),
    ...(sentence.date !== undefined ? { date: dateWords(sentence.date, m) } : {}),
    ...(sentence.rule !== undefined ? { rule: sentence.rule } : {}),
    ...(sentence.days
      ? {
          days: list(
            sentence.days.map((d) => m.dayNames[d]),
            m,
          ),
        }
      : {}),
    ...(sentence.monthDays
      ? {
          monthDays: list(
            sentence.monthDays.map((d) => (d === -1 ? m.lastMonthDay : m.monthDay(d))),
            m,
          ),
        }
      : {}),
    ...(sentence.weekdays
      ? {
          weekdays: list(
            sentence.weekdays.map((w) =>
              w.ordinal === undefined
                ? `${m.ordinals.every} ${m.dayNamesOrdinal[w.day]}`
                : `${m.ordinals[String(w.ordinal)]} ${m.dayNamesOrdinal[w.day]}`,
            ),
            m,
          ),
        }
      : {}),
  };
  let text = fill(m.templates[sentence.key], values);
  if (sentence.count !== undefined) text += `, ${fill(m.count, { count: String(sentence.count) })}`;
  if (sentence.until !== undefined)
    text += `, ${fill(m.until, { until: dateWords(sentence.until, m) })}`;
  return text;
}
