/**
 * Property tests of the expander against `rrule-temporal` (MIT) as an oracle (§9.3). Rules are
 * drawn from the subset with a seeded generator, so a failure names a reproducible case. The one
 * documented difference (D2) is excluded: Cloudhal moves an occurrence in a DST gap to the next
 * valid time (`adjusted: "dst-gap"`) where RFC 5545 §3.3.10 and the oracle drop it.
 */
import { RRuleTemporal } from "rrule-temporal";
import { Temporal } from "temporal-polyfill/implementation";
import { describe, expect, it } from "vitest";
import { occurrences, resolveLocalTime, WEEKDAYS, type Weekday } from "../src/index.ts";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES = [
  "UTC",
  "Europe/Istanbul",
  "Asia/Tokyo",
  "Europe/Berlin",
  "America/New_York",
  "Australia/Sydney",
  "America/Santiago",
];

interface Case {
  start: string;
  timeZone: string;
  rule: string;
}

function draw(rand: () => number, nearGap = false): Case {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const subset = <T>(xs: readonly T[], max: number): T[] => {
    const n = int(1, max);
    const pool = [...xs];
    const out: T[] = [];
    while (out.length < n && pool.length > 0)
      out.push(pool.splice(int(0, pool.length - 1), 1)[0] as T);
    return out;
  };
  const p2 = (n: number) => String(n).padStart(2, "0");
  for (;;) {
    const timeZone = nearGap ? pick(["Europe/Berlin", "America/New_York"]) : pick(ZONES);
    const start = nearGap
      ? `2026-03-${p2(int(1, 20))}T0${int(1, 3)}:${p2(int(0, 59))}`
      : `${int(2026, 2027)}-${p2(int(1, 12))}-${p2(int(1, 28))}T${p2(int(0, 23))}:${p2(int(0, 59))}`;
    if (resolveLocalTime(start, timeZone).adjusted) continue; // the oracle's DTSTART must exist
    const freq = nearGap ? "DAILY" : pick(["DAILY", "WEEKLY", "MONTHLY"] as const);
    const parts = [`FREQ=${freq}`];
    if (rand() < 0.3) parts.push(`INTERVAL=${int(2, 4)}`);
    if (freq === "WEEKLY" && rand() < 0.8) parts.push(`BYDAY=${subset(WEEKDAYS, 4).join(",")}`);
    if (freq === "DAILY" && rand() < 0.3) parts.push(`BYDAY=${subset(WEEKDAYS, 5).join(",")}`);
    if (freq === "MONTHLY") {
      const mode = int(0, 3);
      if (mode === 1)
        parts.push(
          `BYDAY=${subset(WEEKDAYS, 2)
            .map((d: Weekday) => `${pick([1, 2, 3, 4, -1])}${d}`)
            .join(",")}`,
        );
      if (mode === 2)
        parts.push(`BYMONTHDAY=${subset([1, 5, 10, 15, 28, 30, 31, -1], 3).join(",")}`);
      if (mode === 3) parts.push(`BYDAY=${subset(WEEKDAYS, 3).join(",")}`);
    }
    if (nearGap)
      parts.push(
        `BYHOUR=${subset([1, 2, 3], 3)
          .sort((a, b) => a - b)
          .join(",")}`,
      );
    else if (rand() < 0.5)
      parts.push(
        `BYHOUR=${subset(
          Array.from({ length: 24 }, (_, h) => h),
          3,
        )
          .sort((a, b) => a - b)
          .join(",")}`,
      );
    if (rand() < 0.4) parts.push(`BYMINUTE=${subset([0, 7, 15, 30, 45], 2).join(",")}`);
    const end = rand();
    if (end < 0.2) parts.push(`COUNT=${int(1, 30)}`);
    else if (end < 0.35) parts.push(`UNTIL=${int(2027, 2028)}0${int(1, 9)}15T120000Z`);
    return { start, timeZone, rule: parts.join(";") };
  }
}

function oracle(c: Case, n: number): number[] {
  const dtstart = Temporal.PlainDateTime.from(c.start).toZonedDateTime(c.timeZone);
  const r = new RRuleTemporal({ rruleString: c.rule, dtstart, tzid: c.timeZone });
  return r.all((_d, i) => i < n).map((z) => z.epochMilliseconds);
}

describe("expander vs rrule-temporal (property, seeded)", () => {
  const SEED = 20261012;
  const CASES = 400;
  it(`agrees on the first occurrences of ${CASES} random rules (DST gaps excluded, D2)`, () => {
    const rand = mulberry32(SEED);
    let gapCases = 0;
    for (let k = 0; k < CASES; k++) {
      const c = draw(rand, k % 8 === 0);
      const ours = occurrences(c, { limit: 25 });
      const moved = new Set(ours.filter((o) => o.adjusted).map((o) => Date.parse(o.at)));
      if (moved.size > 0) gapCases++;
      const mine = ours.filter((o) => !o.adjusted).map((o) => Date.parse(o.at));
      const theirs = oracle(c, 60).filter((ms) => !moved.has(ms));
      expect(mine, `case ${k}: ${JSON.stringify(c)}`).toEqual(theirs.slice(0, mine.length));
      if (!/COUNT|UNTIL/.test(c.rule) && moved.size === 0)
        expect(mine.length, `case ${k}: ${JSON.stringify(c)}`).toBe(25);
    }
    // The generator does reach DST gaps, so the documented difference is exercised.
    expect(gapCases).toBeGreaterThan(0);
  });

  it("agrees from a later `after` (skip-ahead) on rules without COUNT", () => {
    const rand = mulberry32(SEED + 1);
    for (let k = 0; k < 100; k++) {
      const c = draw(rand);
      if (/COUNT/.test(c.rule)) continue;
      const after =
        Date.parse(resolveLocalTime(c.start, c.timeZone).at) +
        Math.floor(400 * 86_400_000 * rand());
      const ours = occurrences(c, { after, limit: 10 });
      const moved = new Set(ours.filter((o) => o.adjusted).map((o) => Date.parse(o.at)));
      const mine = ours.filter((o) => !o.adjusted).map((o) => Date.parse(o.at));
      const dtstart = Temporal.PlainDateTime.from(c.start).toZonedDateTime(c.timeZone);
      const r = new RRuleTemporal({ rruleString: c.rule, dtstart, tzid: c.timeZone });
      const theirs = r
        .between(new Date(after + 1), new Date(after + 10 * 366 * 86_400_000), true)
        .map((z) => z.epochMilliseconds)
        .filter((ms) => ms > after && !moved.has(ms));
      expect(
        mine,
        `case ${k}: ${JSON.stringify(c)} after ${new Date(after).toISOString()}`,
      ).toEqual(theirs.slice(0, mine.length));
    }
  });
});
