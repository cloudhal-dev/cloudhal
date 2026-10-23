/**
 * RFC-0042 §3.1: `fieldGateInstant` — a datetime ends at its `at`, a date at the start of the next
 * day in the site's zone, plus the grace. The date rule is checked against `temporal-polyfill`
 * (the oracle; the site Worker itself never loads it) on every day of several years, in zones with
 * DST at midnight, half-hour and 30-minute DST, a skipped calendar day and fixed offsets: the
 * result equals Temporal's `disambiguation: "later"` and is never before the day has ended.
 */
import type {
  CollectionExpiry,
  CollectionSettings,
  FieldDefinition,
} from "@cloudhal/core-contracts";
import { Temporal } from "temporal-polyfill/implementation";
import { describe, expect, it } from "vitest";
import { dayIn } from "../src/fields/conversions.ts";
import {
  dayStartIn,
  effectiveUntil,
  expiryInstant,
  fieldGateInstant,
  nextDay,
} from "../src/fields/gate.ts";
import { resolveFields } from "../src/fields/resolve.ts";

const DATE = { type: "date" } as const;
const DATETIME = { type: "datetime" } as const;
const ms = (iso: string) => Date.parse(iso);

const ZONES = [
  "UTC",
  "Europe/Istanbul",
  "Europe/London",
  "America/New_York",
  "America/Havana", // DST at midnight (gap and overlap at 00:00)
  "America/Santiago", // DST at midnight
  "America/Asuncion",
  "America/Sao_Paulo", // midnight DST until 2019
  "Asia/Beirut", // midnight DST
  "Asia/Tehran", // midnight DST until 2022
  "Australia/Lord_Howe", // 30-minute DST
  "America/St_Johns", // half-hour offset
  "Asia/Kolkata",
  "Africa/Casablanca", // DST suspended during Ramadan
  "Pacific/Apia", // skipped 30 December 2011
  "Pacific/Kiritimati", // +14
  "Etc/GMT+12", // −12
];
const YEARS = [2011, 2016, 2018, 2025];
/**
 * Where the oracle itself is wrong: temporal-polyfill's transition search misses Casablanca's
 * 35-day Ramadan suspension of 2018 (it reports +01:00 on 14 May; `Intl`, from the same tz data,
 * says +00:00). Checked against `Intl` directly below.
 */
const ORACLE_BLIND = new Set(["Africa/Casablanca 2018"]);

function* days(year: number): Generator<string> {
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; ) {
    yield d.toISOString().slice(0, 10);
    d = new Date(d.getTime() + 86_400_000);
  }
}

/** The oracle: 00:00 of the next day, `disambiguation: "later"`. */
const oracle = (day: string, zone: string) =>
  Temporal.PlainDateTime.from(`${nextDay(day)}T00:00`).toZonedDateTime(zone, {
    disambiguation: "later",
  }).epochMilliseconds;

describe("fieldGateInstant: date fields against Temporal (oracle)", () => {
  for (const zone of ZONES)
    it(`${zone}: every day of ${YEARS.join(", ")}`, () => {
      const site = { timeZone: zone };
      for (const year of YEARS)
        for (const day of days(year)) {
          const got = fieldGateInstant(day, DATE, site);
          if (!ORACLE_BLIND.has(`${zone} ${year}`))
            expect(got, `${zone} ${day}`).toBe(oracle(day, zone));
          const end = got as number;
          // never early: at the instant, the zone's wall clock shows a later day
          expect(dayIn(new Date(end).toISOString(), zone) > day, `${zone} ${day}`).toBe(true);
          // and never before Temporal's own start of the next day
          const start = Temporal.PlainDate.from(nextDay(day)).toZonedDateTime(zone);
          expect(end >= start.epochMilliseconds, `${zone} ${day}`).toBe(true);
        }
    });

  it("an ambiguous midnight takes the later instant (Havana, 2016-11-06 falls back at 01:00)", () => {
    // 00:00–00:59 on 6 November happens twice: first at UTC−4, then at UTC−5
    expect(dayStartIn("2016-11-06", "America/Havana")).toBe(ms("2016-11-06T05:00:00Z"));
    expect(fieldGateInstant("2016-11-05", DATE, { timeZone: "America/Havana" })).toBe(
      ms("2016-11-06T05:00:00Z"),
    );
  });

  it("Casablanca's 2018 Ramadan suspension, where the oracle is blind, follows Intl", () => {
    // DST ends 2018-05-13 03:00 → 02:00 (UTC+0) and resumes 2018-06-17 02:00 → 03:00
    const zone = { timeZone: "Africa/Casablanca" };
    expect(fieldGateInstant("2018-05-13", DATE, zone)).toBe(ms("2018-05-14T00:00:00Z"));
    expect(fieldGateInstant("2018-06-17", DATE, zone)).toBe(ms("2018-06-17T23:00:00Z"));
    expect(fieldGateInstant("2018-05-12", DATE, zone)).toBe(ms("2018-05-12T23:00:00Z"));
  });

  it("a midnight in a gap is the end of the gap (Havana, 2016-03-13 springs forward at 00:00)", () => {
    expect(dayStartIn("2016-03-13", "America/Havana")).toBe(ms("2016-03-13T05:00:00Z"));
  });

  it("a skipped calendar day (Apia, 2011-12-30) ends the day before at the jump", () => {
    expect(fieldGateInstant("2011-12-29", DATE, { timeZone: "Pacific/Apia" })).toBe(
      ms("2011-12-30T10:00:00Z"),
    );
  });

  it("an event on 5 November is listed all of 5 November in the site's zone", () => {
    expect(fieldGateInstant("2026-11-05", DATE, { timeZone: "Europe/Istanbul" })).toBe(
      ms("2026-11-05T21:00:00Z"),
    );
    expect(fieldGateInstant("2026-11-05", DATE, {})).toBe(ms("2026-11-06T00:00:00Z"));
    expect(fieldGateInstant("2026-12-31", DATE, {})).toBe(ms("2027-01-01T00:00:00Z"));
    expect(fieldGateInstant("2028-02-28", DATE, {})).toBe(ms("2028-02-29T00:00:00Z"));
  });

  it("an unknown zone takes the latest start of that day anywhere (UTC−12), never early", () => {
    expect(fieldGateInstant("2026-11-05", DATE, { timeZone: "Mars/Olympus_Mons" })).toBe(
      ms("2026-11-06T12:00:00Z"),
    );
  });
});

describe("fieldGateInstant: datetime, grace and non-values", () => {
  const value = { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" };

  it("a datetime ends at its at, whatever the site's zone", () => {
    expect(fieldGateInstant(value, DATETIME, { timeZone: "America/New_York" })).toBe(
      ms("2026-11-05T16:30:00Z"),
    );
  });

  it("adds afterMinutes to either", () => {
    expect(fieldGateInstant(value, DATETIME, {}, 60)).toBe(ms("2026-11-05T17:30:00Z"));
    expect(fieldGateInstant("2026-11-05", DATE, {}, 10_080)).toBe(ms("2026-11-13T00:00:00Z"));
    expect(fieldGateInstant(value, DATETIME, {}, 0)).toBe(ms("2026-11-05T16:30:00Z"));
    expect(fieldGateInstant(value, DATETIME, {}, -5)).toBe(ms("2026-11-05T16:30:00Z"));
  });

  it("no value, an unreadable value or another type: no gate", () => {
    expect(fieldGateInstant(undefined, DATE, {})).toBeUndefined();
    expect(fieldGateInstant("2026-02-30", DATE, {})).toBeUndefined();
    expect(fieldGateInstant("5 Nov", DATE, {})).toBeUndefined();
    expect(fieldGateInstant({ at: "soon" }, DATETIME, {})).toBeUndefined();
    expect(fieldGateInstant("2026-11-05", DATETIME, {})).toBeUndefined();
    expect(fieldGateInstant("2026-11-05", { type: "text" }, {})).toBeUndefined();
  });

  it("nextDay crosses months, years and leap days", () => {
    expect(nextDay("2026-01-31")).toBe("2026-02-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2023-02-28")).toBe("2023-03-01");
  });
});

describe("expiryInstant and effectiveUntil", () => {
  const fields: FieldDefinition[] = [
    { key: "endsAt", type: "datetime", labels: { en: { label: "Ends" } }, localized: false },
    { key: "day", type: "date", labels: { en: { label: "Day" } }, localized: false },
    { key: "venue", type: "text", labels: { en: { label: "Venue" } }, localized: true },
  ];
  const site = (expiry?: CollectionExpiry) => ({
    timeZone: "Europe/Istanbul",
    collections: { events: { fields, ...(expiry ? { expiry } : {}) } as CollectionSettings },
  });
  const entry = (values: Record<string, unknown>) => ({
    id: "entry_01HZX8K3Q9AA",
    collection: "events",
    fields: values,
  });

  it("reads the rule's field from the resolved values, with the grace", () => {
    const s = site({ field: "endsAt", action: "unlist", afterMinutes: 60 });
    const resolved = resolveFields(
      s,
      entry({ endsAt: { at: "2026-11-05T20:00:00Z", timeZone: "UTC" } }),
    );
    expect(expiryInstant(s, "events", resolved)).toBe(ms("2026-11-05T21:00:00Z"));
    const d = site({ field: "day", action: "hide" });
    expect(expiryInstant(d, "events", resolveFields(d, entry({ day: "2026-11-05" })))).toBe(
      ms("2026-11-05T21:00:00Z"),
    );
  });

  it("a translation reads the original's non-localized date", () => {
    const s = site({ field: "day", action: "unlist" });
    const translation = {
      ...entry({}),
      id: "entry_01HZX8K3Q9TR",
      translation: { group: "entry_01HZX8K3Q9AA", method: "human" as const },
    };
    const resolved = resolveFields(s, translation, {
      id: "entry_01HZX8K3Q9AA",
      fields: { day: "2026-11-05" },
    });
    expect(expiryInstant(s, "events", resolved)).toBe(ms("2026-11-05T21:00:00Z"));
  });

  it("no rule, no value, an unknown field or a non-date field: no derived gate", () => {
    expect(
      expiryInstant(site(), "events", resolveFields(site(), entry({ day: "2026-11-05" }))),
    ).toBeUndefined();
    const s = site({ field: "day", action: "unlist" });
    expect(expiryInstant(s, "events", resolveFields(s, entry({})))).toBeUndefined();
    const ghost = site({ field: "gone", action: "unlist" });
    expect(expiryInstant(ghost, "events", resolveFields(ghost, entry({})))).toBeUndefined();
    const text = site({ field: "venue", action: "unlist" });
    expect(
      expiryInstant(text, "events", resolveFields(text, entry({ venue: "Hall" }))),
    ).toBeUndefined();
    expect(expiryInstant(s, "posts", {})).toBeUndefined();
  });

  it("the effective gate is the earlier of availability.until and the derived one", () => {
    const until = { until: "2026-11-05T12:00:00Z" };
    expect(effectiveUntil(until, ms("2026-11-06T00:00:00Z"))).toBe(ms("2026-11-05T12:00:00Z"));
    expect(effectiveUntil(until, ms("2026-11-05T00:00:00Z"))).toBe(ms("2026-11-05T00:00:00Z"));
    expect(effectiveUntil(until, undefined)).toBe(ms("2026-11-05T12:00:00Z"));
    expect(effectiveUntil(undefined, 5)).toBe(5);
    expect(effectiveUntil({ from: "2026-01-01T00:00:00Z" }, 5)).toBe(5);
    expect(effectiveUntil(undefined, undefined)).toBeUndefined();
  });

  it("an unparsable until stays closed (NaN), as gateState fails closed", () => {
    expect(effectiveUntil({ until: "never" }, 5)).toBeNaN();
  });
});
