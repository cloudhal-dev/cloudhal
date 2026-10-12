import { describe, expect, it } from "vitest";
import {
  canonicalInstant,
  floorToMinute,
  isLocalDateTime,
  isTimeZone,
  latenessSeconds,
  recomputeExecuteAt,
  resolveLocalTime,
  ScheduleError,
  toLocalDateTime,
  zoneOffset,
} from "../src/index.ts";

describe("time model (§9)", () => {
  it("resolves a wall-clock time in a zone (Istanbul is UTC+3 all year)", () => {
    expect(resolveLocalTime("2026-11-02T09:00", "Europe/Istanbul")).toEqual({
      at: "2026-11-02T06:00:00.000Z",
      offset: "+03:00",
    });
    expect(resolveLocalTime("2026-07-02T09:00", "Europe/Istanbul").at).toBe(
      "2026-07-02T06:00:00.000Z",
    );
    expect(resolveLocalTime("2026-11-02T09:00", "UTC").at).toBe("2026-11-02T09:00:00.000Z");
  });

  it("D2: a time in a spring-forward gap runs at the next valid time", () => {
    expect(resolveLocalTime("2026-03-29T02:30", "Europe/Berlin")).toEqual({
      at: "2026-03-29T01:30:00.000Z",
      offset: "+02:00",
      adjusted: "dst-gap",
    });
    expect(resolveLocalTime("2026-03-08T02:15", "America/New_York")).toMatchObject({
      at: "2026-03-08T07:15:00.000Z",
      adjusted: "dst-gap",
    });
  });

  it("D2: a time that occurs twice runs once, at the first", () => {
    expect(resolveLocalTime("2026-10-25T02:30", "Europe/Berlin")).toEqual({
      at: "2026-10-25T00:30:00.000Z",
      offset: "+02:00",
    });
  });

  it("knows zones by the runtime's data and refuses offsets and bare cities", () => {
    expect(isTimeZone("Europe/Istanbul")).toBe(true);
    expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Etc/GMT+3")).toBe(true);
    expect(isTimeZone("+03:00")).toBe(false);
    expect(isTimeZone("Istanbul")).toBe(false);
    expect(isTimeZone("Europe/Atlantis")).toBe(false);
    expect(() => resolveLocalTime("2026-11-02T09:00", "Mars/Olympus")).toThrow(ScheduleError);
  });

  it("wall-clock values are to the minute and must exist in the calendar", () => {
    expect(isLocalDateTime("2026-11-02T09:00")).toBe(true);
    expect(isLocalDateTime("2026-11-02T09:00:00")).toBe(false);
    expect(isLocalDateTime("2026-02-30T09:00")).toBe(false);
    expect(() => resolveLocalTime("2026-02-30T09:00", "UTC")).toThrow(/wall-clock/);
  });

  it("shows instants as wall-clock time and offset in a zone, seconds dropped", () => {
    expect(toLocalDateTime("2026-11-02T06:00:41.500Z", "Europe/Istanbul")).toBe("2026-11-02T09:00");
    expect(zoneOffset("2026-01-15T12:00:00Z", "Europe/Berlin")).toBe("+01:00");
    expect(zoneOffset("2026-07-15T12:00:00Z", "Europe/Berlin")).toBe("+02:00");
  });

  it("never early (S2): a stored instant earlier than the wall clock moves later (tzdata)", () => {
    // Planned with rules that put 09:00 Istanbul at 05:00Z (as UTC+4 would); today's tzdata says 06:00Z.
    expect(
      recomputeExecuteAt({
        at: "2026-11-02T05:00:00Z",
        timeZone: "Europe/Istanbul",
        localTime: "2026-11-02T09:00",
      }),
    ).toEqual({ at: "2026-11-02T06:00:00.000Z", changed: true, adjusted: "tzdata" });
    // A stored instant later than the wall clock stands: late, never early.
    expect(
      recomputeExecuteAt({
        at: "2026-11-02T07:00:00Z",
        timeZone: "Europe/Istanbul",
        localTime: "2026-11-02T09:00",
      }),
    ).toEqual({ at: "2026-11-02T07:00:00.000Z", changed: false });
    // An absolute instant (an agent's) never moves.
    expect(recomputeExecuteAt({ at: "2026-11-02T05:00:00Z", timeZone: "Europe/Istanbul" })).toEqual(
      {
        at: "2026-11-02T05:00:00.000Z",
        changed: false,
      },
    );
  });

  it("lateness is whole seconds, never negative; instants are canonical", () => {
    expect(latenessSeconds("2026-11-02T06:00:00Z", "2026-11-02T06:00:41.900Z")).toBe(41);
    expect(latenessSeconds("2026-11-02T06:00:00Z", "2026-11-02T05:59:00Z")).toBe(0);
    expect(canonicalInstant("2026-11-02T09:00:00+03:00")).toBe("2026-11-02T06:00:00.000Z");
    expect(new Date(floorToMinute("2026-11-02T06:00:41.900Z")).toISOString()).toBe(
      "2026-11-02T06:00:00.000Z",
    );
    expect(() => canonicalInstant("yesterday")).toThrow(ScheduleError);
  });
});
