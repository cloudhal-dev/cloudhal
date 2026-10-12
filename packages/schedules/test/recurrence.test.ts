import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  formatRule,
  nextOccurrence,
  occurrences,
  occurrencesBetween,
  parseRule,
  presetMinuteOffset,
  presetOf,
  presetRule,
  type RecurrenceInput,
  renderRecurrence,
  ScheduleError,
  validateRecurrence,
} from "../src/index.ts";

const at = (input: RecurrenceInput, limit: number, after?: string) =>
  occurrences(input, { limit, ...(after ? { after } : {}) }).map((o) => o.at);

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof ScheduleError ? e.code : String(e);
  }
}

describe("RRULE subset: parse (D3, §9.3)", () => {
  it("parses the accepted parts and prints them canonically", () => {
    expect(
      parseRule("FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU,-1FR;BYHOUR=9;BYMINUTE=7;COUNT=12"),
    ).toEqual({
      freq: "MONTHLY",
      interval: 2,
      byDay: [
        { day: "TU", ordinal: 2 },
        { day: "FR", ordinal: -1 },
      ],
      byHour: [9],
      byMinute: [7],
      count: 12,
    });
    expect(
      formatRule(parseRule("FREQ=WEEKLY;BYMINUTE=7;BYHOUR=9;BYDAY=MO;UNTIL=20271231T235900Z")),
    ).toBe("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=7;UNTIL=20271231T235900Z");
    expect(parseRule("FREQ=MONTHLY;BYMONTHDAY=-1").byMonthDay).toEqual([-1]);
  });

  it("refuses what the subset excludes, with a code", () => {
    expect(code(() => parseRule("FREQ=HOURLY"))).toBe("unsupported_rule_part");
    expect(code(() => parseRule("FREQ=SECONDLY"))).toBe("unsupported_rule_part");
    expect(code(() => parseRule("FREQ=YEARLY"))).toBe("unsupported_rule_part");
    expect(code(() => parseRule("FREQ=WEEKLY;BYWEEKNO=20"))).toBe("unsupported_rule_part");
    expect(code(() => parseRule("FREQ=DAILY;BYSETPOS=1"))).toBe("unsupported_rule_part");
    expect(code(() => parseRule("FREQ=DAILY;EXDATE=20261020T090000Z"))).toBe(
      "unsupported_rule_part",
    );
    expect(code(() => parseRule("RRULE:FREQ=DAILY"))).toBe("invalid_rule");
    expect(code(() => parseRule("BYHOUR=9;FREQ=DAILY"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=DAILY;BYHOUR=9;BYHOUR=10"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=DAILY;BYHOUR=9,9"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=DAILY;COUNT=3;UNTIL=20271231T235900Z"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=WEEKLY;BYDAY=2TU"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=WEEKLY;BYMONTHDAY=1"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=DAILY;BYMINUTE=0,10,20,30,40"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=MONTHLY;BYMONTHDAY=-2"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=DAILY;UNTIL=20270231T000000Z"))).toBe("invalid_rule");
    expect(code(() => parseRule("FREQ=DAILY;INTERVAL=0"))).toBe("invalid_rule");
  });

  it("refuses rules closer than the minimum interval (1 hour, at most 24 a day)", () => {
    const base = { start: "2026-10-12T09:00", timeZone: "UTC" };
    expect(
      code(() => validateRecurrence({ ...base, rule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0,30" })),
    ).toBe("rule_too_frequent");
    expect(
      code(() => validateRecurrence({ ...base, rule: "FREQ=DAILY;BYHOUR=0,23;BYMINUTE=30" })),
    ).toBeUndefined();
    expect(
      code(() => validateRecurrence({ ...base, rule: "FREQ=DAILY;BYHOUR=23;BYMINUTE=0,50" })),
    ).toBe("rule_too_frequent");
    expect(
      code(() => validateRecurrence({ ...base, rule: presetRule("hourly", base.start) })),
    ).toBeUndefined();
    expect(
      code(() => validateRecurrence({ ...base, rule: "FREQ=DAILY;UNTIL=20200101T000000Z" })),
    ).toBe("invalid_rule");
  });

  it("agrees with the contract fixtures: valid rules parse, invalid rule fixtures do not", () => {
    const root = join(import.meta.dirname, "../../core-contracts/fixtures");
    for (const f of readdirSync(join(root, "valid/automation"))) {
      const a = JSON.parse(readFileSync(join(root, "valid/automation", f), "utf8"));
      expect(() => validateRecurrence(a.recurrence), f).not.toThrow();
    }
    for (const f of readdirSync(join(root, "invalid/automation")).filter((n) =>
      n.startsWith("rule-"),
    )) {
      const a = JSON.parse(readFileSync(join(root, "invalid/automation", f), "utf8"));
      expect(() => parseRule(a.data.recurrence.rule), f).toThrow(ScheduleError);
    }
  });
});

describe("RRULE subset: expand", () => {
  it("a weekly Monday 09:07 stays 09:07 in Berlin across the autumn change (169 hours apart)", () => {
    const rec = {
      start: "2026-10-19T09:07",
      timeZone: "Europe/Berlin",
      rule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=7",
    };
    const list = at(rec, 3);
    expect(list).toEqual([
      "2026-10-19T07:07:00.000Z",
      "2026-10-26T08:07:00.000Z",
      "2026-11-02T08:07:00.000Z",
    ]);
    expect((Date.parse(list[1] as string) - Date.parse(list[0] as string)) / 3_600_000).toBe(169);
  });

  it("D2 for recurrences: a gap occurrence moves forward; colliding with the next it counts once", () => {
    const daily = {
      start: "2026-03-28T02:30",
      timeZone: "Europe/Berlin",
      rule: "FREQ=DAILY;BYHOUR=2;BYMINUTE=30",
    };
    const list = occurrences(daily, { limit: 3 });
    expect(list.map((o) => [o.at, o.adjusted])).toEqual([
      ["2026-03-28T01:30:00.000Z", undefined],
      ["2026-03-29T01:30:00.000Z", "dst-gap"], // 02:30 does not exist; 03:30 CEST
      ["2026-03-30T00:30:00.000Z", undefined],
    ]);
    const hourly = {
      start: "2026-03-29T00:30",
      timeZone: "Europe/Berlin",
      rule: presetRule("hourly", "2026-03-29T00:30"),
    };
    const hours = occurrences(hourly, { limit: 4 });
    expect(hours.map((o) => o.at)).toEqual([
      "2026-03-28T23:30:00.000Z",
      "2026-03-29T00:30:00.000Z",
      "2026-03-29T01:30:00.000Z", // 02:30 moved to 03:30; 03:30 itself is the same instant and counts once
      "2026-03-29T02:30:00.000Z",
    ]);
    expect(hours[2]?.adjusted).toBe("dst-gap");
  });

  it("D2 for recurrences: a repeated wall-clock time runs once, at the first", () => {
    const rec = { start: "2026-10-24T02:30", timeZone: "Europe/Berlin", rule: "FREQ=DAILY" };
    expect(at(rec, 3)).toEqual([
      "2026-10-24T00:30:00.000Z",
      "2026-10-25T00:30:00.000Z",
      "2026-10-26T01:30:00.000Z",
    ]);
  });

  it("monthly by ordinal weekday, by last day, and skipping months without the day", () => {
    const second = {
      start: "2026-10-01T09:07",
      timeZone: "Europe/Istanbul",
      rule: "FREQ=MONTHLY;BYDAY=2TU",
    };
    expect(at(second, 3)).toEqual([
      "2026-10-13T06:07:00.000Z",
      "2026-11-10T06:07:00.000Z",
      "2026-12-08T06:07:00.000Z",
    ]);
    const lastFri = { start: "2026-10-01T17:00", timeZone: "UTC", rule: "FREQ=MONTHLY;BYDAY=-1FR" };
    expect(at(lastFri, 2)).toEqual(["2026-10-30T17:00:00.000Z", "2026-11-27T17:00:00.000Z"]);
    const last = { start: "2026-01-15T08:00", timeZone: "UTC", rule: "FREQ=MONTHLY;BYMONTHDAY=-1" };
    expect(at(last, 3)).toEqual([
      "2026-01-31T08:00:00.000Z",
      "2026-02-28T08:00:00.000Z",
      "2026-03-31T08:00:00.000Z",
    ]);
    const the31st = { start: "2026-01-31T08:00", timeZone: "UTC", rule: "FREQ=MONTHLY" };
    expect(at(the31st, 3)).toEqual([
      "2026-01-31T08:00:00.000Z",
      "2026-03-31T08:00:00.000Z",
      "2026-05-31T08:00:00.000Z",
    ]);
  });

  it("COUNT, UNTIL, INTERVAL and a start that does not match the rule", () => {
    const count = {
      start: "2026-11-02T09:07",
      timeZone: "Europe/Berlin",
      rule: "FREQ=MONTHLY;BYDAY=1MO;COUNT=2",
    };
    expect(at(count, 10)).toHaveLength(2);
    const until = {
      start: "2026-10-13T07:43",
      timeZone: "America/New_York",
      rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261016T114300Z",
    };
    expect(at(until, 10)).toEqual([
      "2026-10-13T11:43:00.000Z",
      "2026-10-14T11:43:00.000Z",
      "2026-10-15T11:43:00.000Z",
      "2026-10-16T11:43:00.000Z",
    ]);
    const everyThird = {
      start: "2026-10-12T06:00",
      timeZone: "UTC",
      rule: "FREQ=DAILY;INTERVAL=3",
    };
    expect(at(everyThird, 3)).toEqual([
      "2026-10-12T06:00:00.000Z",
      "2026-10-15T06:00:00.000Z",
      "2026-10-18T06:00:00.000Z",
    ]);
    // Start on a Wednesday, rule on Mondays: the start is not an occurrence.
    const mondays = { start: "2026-10-14T09:00", timeZone: "UTC", rule: "FREQ=WEEKLY;BYDAY=MO" };
    expect(at(mondays, 1)).toEqual(["2026-10-19T09:00:00.000Z"]);
    expect(at({ start: "2026-10-14T09:00", timeZone: "UTC" }, 5)).toEqual([
      "2026-10-14T09:00:00.000Z",
    ]);
  });

  it("expands from `after` without walking from the start (and agrees with walking)", () => {
    const rec = {
      start: "2020-01-06T09:07",
      timeZone: "Europe/Istanbul",
      rule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=7",
    };
    expect(nextOccurrence(rec, "2026-10-12T06:07:00Z")?.at).toBe("2026-10-19T06:07:00.000Z");
    expect(nextOccurrence(rec, "2026-10-12T06:06:59Z")?.at).toBe("2026-10-12T06:07:00.000Z");
    const walked = occurrences(rec, { limit: 400 }).filter(
      (o) => Date.parse(o.at) > Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(
      occurrences(rec, { after: "2026-01-01T00:00:00Z", limit: walked.length }).map((o) => o.at),
    ).toEqual(walked.map((o) => o.at));
  });

  it("occurrencesBetween counts the missed ones and always knows the latest", () => {
    const rec = {
      start: "2026-10-01T00:17",
      timeZone: "UTC",
      rule: presetRule("hourly", "2026-10-01T00:17"),
    };
    const r = occurrencesBetween(rec, "2026-10-12T00:00:00Z", "2026-10-12T05:30:00Z");
    expect(r.count).toBe(6);
    expect(r.latest?.at).toBe("2026-10-12T05:17:00.000Z");
    const many = occurrencesBetween(rec, "2026-10-01T00:00:00Z", "2026-10-12T05:30:00Z", 10);
    expect(many).toMatchObject({ count: 11, truncated: true });
    expect(many.latest?.at).toBe("2026-10-12T05:17:00.000Z");
  });
});

describe("presets and sentences (§9.3, §15.8)", () => {
  it("presets spell out their parts and are recognised back", () => {
    const start = "2026-10-19T09:07"; // a Monday
    expect(presetRule("daily", start)).toBe("FREQ=DAILY;BYHOUR=9;BYMINUTE=7");
    expect(presetRule("weekly", start)).toBe("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=7");
    expect(presetRule("weekdays", start)).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=7",
    );
    expect(presetRule("monthly", start)).toBe("FREQ=MONTHLY;BYMONTHDAY=19;BYHOUR=9;BYMINUTE=7");
    expect(presetRule("once", start)).toBeUndefined();
    for (const p of ["hourly", "daily", "weekly", "weekdays", "monthly"] as const)
      expect(presetOf(presetRule(p, start), start)).toBe(p);
    expect(presetOf("FREQ=MONTHLY;BYDAY=1MO", start)).toBe("custom");
    expect(presetOf(undefined, start)).toBe("once");
    expect(presetMinuteOffset("aut_01J9X7Q2K4M8N3P6R1S5")).toBe(
      presetMinuteOffset("aut_01J9X7Q2K4M8N3P6R1S5"),
    );
    expect(presetMinuteOffset("aut_01J9X7Q2K4M8N3P6R1S5")).toBeGreaterThanOrEqual(0);
    expect(presetMinuteOffset("aut_01J9X7Q2K4M8N3P6R1S5")).toBeLessThan(10);
  });

  it("describes recurrences as data and renders them in English and Turkish", () => {
    const tz = "Europe/Istanbul";
    const cases: [RecurrenceInput, string, string][] = [
      [
        { start: "2026-10-13T09:07", timeZone: tz, rule: "FREQ=MONTHLY;BYDAY=2TU" },
        "On the second Tuesday of every month at 09:07",
        "Her ayın ikinci salısı 09:07",
      ],
      [
        {
          start: "2026-10-19T09:07",
          timeZone: tz,
          rule: presetRule("weekdays", "2026-10-19T09:07"),
        },
        "Weekdays at 09:07",
        "Hafta içi her gün 09:07",
      ],
      [
        { start: "2026-10-19T09:07", timeZone: tz, rule: "FREQ=WEEKLY;BYDAY=MO,FR" },
        "Every Monday and Friday at 09:07",
        "Her pazartesi ve cuma 09:07",
      ],
      [
        { start: "2026-10-19T09:23", timeZone: tz, rule: presetRule("hourly", "2026-10-19T09:23") },
        "Every hour at :23",
        "Her saat :23",
      ],
      [
        {
          start: "2026-10-31T08:00",
          timeZone: tz,
          rule: "FREQ=MONTHLY;BYMONTHDAY=1,-1;BYHOUR=8;BYMINUTE=0",
        },
        "Monthly on the 1st and last day at 08:00",
        "Her ayın 1. ve son günü 08:00",
      ],
      [
        { start: "2026-10-12T06:00", timeZone: tz, rule: "FREQ=DAILY;INTERVAL=3;COUNT=5" },
        "Every 3 days at 06:00, 5 times",
        "3 günde bir 06:00, 5 kez",
      ],
      [
        {
          start: "2026-10-12T06:00",
          timeZone: tz,
          rule: "FREQ=DAILY;BYHOUR=6,18;BYMINUTE=0;UNTIL=20261231T200000Z",
        },
        "Every day at 06:00 and 18:00, until 31 December 2026",
        "Her gün 06:00 ve 18:00, 31 Aralık 2026 tarihine kadar",
      ],
      [
        { start: "2026-11-02T09:00", timeZone: tz },
        "Once, on 2 November 2026 at 09:00",
        "Bir kez, 2 Kasım 2026 09:00",
      ],
    ];
    for (const [input, en, tr] of cases) {
      const s = describeRecurrence(input);
      expect(renderRecurrence(s, "en")).toBe(en);
      expect(renderRecurrence(s, "tr")).toBe(tr);
    }
    expect(describeRecurrence(cases[0]?.[0] as RecurrenceInput)).toEqual({
      key: "monthlyOnWeekdays",
      timeZone: tz,
      weekdays: [{ day: "TU", ordinal: 2 }],
      times: ["09:07"],
    });
  });
});
