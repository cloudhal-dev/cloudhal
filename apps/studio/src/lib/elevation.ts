/**
 * Time-boxed elevation (ADR-0016): an owner lets a key work in a more autonomous mode for a while;
 * it ends by itself. Pure helpers for Studio: which modes a key can be elevated to, the time left,
 * and the words for "until when" in the person's locale and time zone.
 */
import type { MessageKey } from "../i18n/index.tsx";
import type { AgentKeyElevation, AgentKeySummary, AgentMode, KeyMode } from "./api.ts";

/** Every agent mode in order of increasing autonomy (`packages/agent-runtime/src/modes.ts`). */
const AUTONOMY: readonly AgentMode[] = ["plan", "manual", "edits", "auto", "bypass"];

/** Durations the elevation dialog offers at one click, in minutes: 15 min, 1 hour, 4 hours, 1 day. */
export const ELEVATION_PRESETS = [15, 60, 240, 1440] as const;

/** `a` lets the agent do more on its own than `b`. */
export function isMoreAutonomous(a: AgentMode, b: AgentMode): boolean {
  return AUTONOMY.indexOf(a) > AUTONOMY.indexOf(b);
}

/** The key modes an elevation from `own` may target: only more autonomous ones, never bypass. */
export function modesAbove(own: KeyMode, offered: readonly KeyMode[]): KeyMode[] {
  return offered.filter((m) => isMoreAutonomous(m, own));
}

/** The elevation that applies at `now`, if any (expired or no-longer-higher ones do not). */
export function activeElevation(
  key: Pick<AgentKeySummary, "mode" | "elevation">,
  now: number = Date.now(),
): AgentKeyElevation | undefined {
  const elevation = key.elevation;
  if (!elevation || !isMoreAutonomous(elevation.mode, key.mode)) return undefined;
  const until = Date.parse(elevation.until);
  return Number.isFinite(until) && until > now ? elevation : undefined;
}

/**
 * Whole minutes left until `until`, to the nearest minute (a fresh 90-minute grant reads "90", not
 * "91" because of a second of clock skew), at least 1 while any time is left; 0 once over.
 */
export function remainingMinutes(until: string, now: number = Date.now()): number {
  const ms = Date.parse(until) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0;
}

/** Milliseconds until the first elevation in `keys` ends, so the list can refetch right then. */
export function nextElevationEnd(
  keys: readonly Pick<AgentKeySummary, "mode" | "elevation">[],
  now: number = Date.now(),
): number | undefined {
  const ends = keys
    .map((k) => activeElevation(k, now))
    .filter((e): e is AgentKeyElevation => e !== undefined)
    .map((e) => Date.parse(e.until) - now);
  return ends.length > 0 ? Math.min(...ends) : undefined;
}

type UnitDisplay = "short" | "long";
function unit(
  locale: string,
  name: "minute" | "hour" | "day",
  value: number,
  display: UnitDisplay,
) {
  return new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: display }).format(
    value,
  );
}

/**
 * A duration in the person's language: "15 minutes", "1 hour 30 minutes", "1 day" (`long`) or
 * "42 min", "3 hr 20 min" (`short`). Whole days only when the duration is exactly that.
 */
export function formatDuration(minutes: number, locale: string, display: UnitDisplay): string {
  const m = Math.max(0, Math.round(minutes));
  if (m >= 1440 && m % 1440 === 0) return unit(locale, "day", m / 1440, display);
  if (m < 60) return unit(locale, "minute", m, display);
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  const h = unit(locale, "hour", hours, display);
  return rest === 0 ? h : `${h} ${unit(locale, "minute", rest, display)}`;
}

/** Calendar day of `date` in `timeZone`, for "same day?" checks. */
function dayKey(date: Date, timeZone: string | undefined): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

/**
 * When an elevation ends, as briefly as is unambiguous: "14:30" today, "Thu 14:30" within the
 * week, else the date and time. Uses the browser's time zone unless one is given (tests).
 */
export function formatUntil(
  until: string,
  locale: string,
  options: { now?: number | undefined; timeZone?: string | undefined } = {},
): string {
  const end = new Date(until);
  if (Number.isNaN(end.getTime())) return until;
  const now = new Date(options.now ?? Date.now());
  const timeZone = options.timeZone;
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone };
  if (dayKey(end, timeZone) === dayKey(now, timeZone)) return end.toLocaleTimeString(locale, time);
  if (Math.abs(end.getTime() - now.getTime()) < 6 * 86_400_000) {
    return end.toLocaleString(locale, { ...time, weekday: "short" });
  }
  return end.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
}

export type CustomUnit = "minutes" | "hours";
export type CustomDurationError = "invalid" | "tooShort" | "tooLong";

/**
 * A custom duration typed by the person ("90" minutes, "1,5" hours) as whole minutes, or why it
 * cannot be used. Rounded to the minute: the server takes whole minutes only.
 */
export function parseCustomDuration(
  value: string,
  unitName: CustomUnit,
  bounds: { minMinutes: number; maxMinutes: number },
): { minutes: number } | { error: CustomDurationError } {
  const text = value.trim().replace(",", ".");
  const n = text === "" ? Number.NaN : Number(text);
  if (!Number.isFinite(n) || n <= 0) return { error: "invalid" };
  const minutes = Math.round(unitName === "hours" ? n * 60 : n);
  if (minutes < bounds.minMinutes) return { error: "tooShort" };
  if (minutes > bounds.maxMinutes) return { error: "tooLong" };
  return { minutes };
}

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * The sentence right above the elevation dialog's primary action: "Until 14:30 (in 1 hour), then
 * back to Edits." The modes themselves sit next to it as badges.
 */
export function elevationSummary(
  t: Translate,
  locale: string,
  input: { from: KeyMode; minutes: number; now?: number; timeZone?: string | undefined },
): string {
  const now = input.now ?? Date.now();
  const until = new Date(now + input.minutes * 60_000).toISOString();
  return t("agents.elevate.summary", {
    time: formatUntil(until, locale, { now, timeZone: input.timeZone }),
    duration: formatDuration(input.minutes, locale, "long"),
    from: t(`agents.modes.names.${input.from}`),
  });
}

/** What the key list says while an elevation runs: "42 min left". */
export function remainingLabel(t: Translate, locale: string, until: string, now: number): string {
  return t("agents.elevation.left", {
    time: formatDuration(Math.max(1, remainingMinutes(until, now)), locale, "short"),
  });
}
