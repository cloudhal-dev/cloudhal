/**
 * Wall-clock time in an IANA zone and the instants it stands for, through `Intl` only (no date
 * library): what `DateTimeField` edits (RFC-0008 §15.4) and what a typed `datetime` field stores
 * (`{ at, timeZone }`, RFC-0041 §2). Studio's schedule screens re-export these from
 * `lib/schedules.ts`.
 */
import { zonedParts } from "./schedule-model.ts";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** A date (`YYYY-MM-DD`) and a 24-hour time (`HH:mm`) on a zone's wall clock. */
export interface WallClock {
  date: string;
  time: string;
}

/** The zone's offset from UTC at an instant, in ms (Istanbul: +3 h). */
export function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(new Date(ms).toISOString(), timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/** Where an instant is on the wall clock of `timeZone`. */
export function wallClockOf(at: string, timeZone: string): WallClock {
  const p = zonedParts(at, timeZone);
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${String(p.year).padStart(4, "0")}-${two(p.month)}-${two(p.day)}`,
    time: `${two(p.hour)}:${two(p.minute)}`,
  };
}

/**
 * The instant a wall-clock time in `timeZone` stands for. Times that occur twice (the clock goes
 * back) take the first; a time that does not exist (the clock goes forward) moves forward by the
 * gap, as the server does (RFC-0008 D2: "02:30 does not exist on 29 March in Berlin; it runs at
 * 03:30") and says so in `gap`.
 */
export function zonedToInstant(
  { date, time }: WallClock,
  timeZone: string,
): { at: string; gap?: { runsAt: string } } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const target = Date.UTC(y, m - 1, d, hh, mm);
  const offsets = [
    ...new Set([offsetAt(target - DAY_MS, timeZone), offsetAt(target + DAY_MS, timeZone)]),
  ];
  const exact = offsets
    .map((o) => target - o)
    .filter((ms) => {
      const w = wallClockOf(new Date(ms).toISOString(), timeZone);
      return w.date === date && w.time === time;
    })
    .sort((a, b) => a - b);
  if (exact[0] !== undefined) return { at: new Date(exact[0]).toISOString() };
  // A gap: the later offset's instant is the time after the jump.
  const at = new Date(target - Math.min(...offsets)).toISOString();
  return { at, gap: { runsAt: wallClockOf(at, timeZone).time } };
}
