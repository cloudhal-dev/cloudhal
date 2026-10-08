import { describe, expect, it } from "vitest";
import { translate } from "../src/i18n/index.tsx";
import { KEY_MODES, modeRules } from "../src/lib/agents.ts";
import {
  activeElevation,
  ELEVATION_PRESETS,
  elevationSummary,
  formatDuration,
  formatUntil,
  isMoreAutonomous,
  modesAbove,
  nextElevationEnd,
  parseCustomDuration,
  remainingLabel,
  remainingMinutes,
} from "../src/lib/elevation.ts";

const NOW = Date.parse("2026-10-08T11:30:00Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const en = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate("en", key, params);
const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate("tr", key, params);
const elevation = (until: string, mode: "manual" | "edits" | "auto" = "auto") => ({
  mode,
  until,
  grantedBy: "user_owner",
  grantedAt: at(-1),
});

describe("elevation targets", () => {
  it("offers only key modes above the own mode, never bypass", () => {
    expect(modesAbove("plan", KEY_MODES)).toEqual(["manual", "edits", "auto"]);
    expect(modesAbove("manual", KEY_MODES)).toEqual(["edits", "auto"]);
    expect(modesAbove("edits", KEY_MODES)).toEqual(["auto"]);
    expect(modesAbove("auto", KEY_MODES)).toEqual([]);
    expect(isMoreAutonomous("bypass", "auto")).toBe(true);
    expect(isMoreAutonomous("edits", "edits")).toBe(false);
  });

  it("reads the server's bounds, with a fallback", () => {
    expect(modeRules().elevation).toEqual({ minMinutes: 5, maxMinutes: 1440 });
    const info = { modes: KEY_MODES.slice(), default: "edits" as const, scopes: {} };
    expect(
      modeRules({ ...info, autoPublishLimit: 20, elevation: { minMinutes: 10, maxMinutes: 60 } })
        .elevation,
    ).toEqual({ minMinutes: 10, maxMinutes: 60 });
    // Nonsense from a server falls back rather than breaking the dialog.
    expect(
      modeRules({ ...info, autoPublishLimit: 20, elevation: { minMinutes: 90, maxMinutes: 60 } })
        .elevation,
    ).toEqual({ minMinutes: 5, maxMinutes: 1440 });
    expect(ELEVATION_PRESETS).toEqual([15, 60, 240, 1440]);
  });
});

describe("elevation in force", () => {
  it("applies only while higher than the own mode and before its end", () => {
    expect(activeElevation({ mode: "edits", elevation: elevation(at(5)) }, NOW)).toBeDefined();
    expect(activeElevation({ mode: "edits", elevation: elevation(at(0)) }, NOW)).toBeUndefined();
    expect(activeElevation({ mode: "edits", elevation: elevation(at(-5)) }, NOW)).toBeUndefined();
    // The own mode was raised to meet it: no longer an elevation.
    expect(
      activeElevation({ mode: "auto", elevation: elevation(at(5), "auto") }, NOW),
    ).toBeUndefined();
    expect(activeElevation({ mode: "edits" }, NOW)).toBeUndefined();
  });

  it("counts the minutes left and finds the next end", () => {
    expect(remainingMinutes(at(42), NOW)).toBe(42);
    expect(remainingMinutes(new Date(NOW + 90 * 60_000 + 900).toISOString(), NOW)).toBe(90);
    expect(remainingMinutes(new Date(NOW + 10_000).toISOString(), NOW)).toBe(1);
    expect(remainingMinutes(at(-1), NOW)).toBe(0);
    expect(
      nextElevationEnd(
        [
          { mode: "edits", elevation: elevation(at(30)) },
          { mode: "manual", elevation: elevation(at(10), "edits") },
          { mode: "edits", elevation: elevation(at(-3)) },
          { mode: "plan" },
        ],
        NOW,
      ),
    ).toBe(10 * 60_000);
    expect(nextElevationEnd([{ mode: "edits" }], NOW)).toBeUndefined();
  });
});

describe("words for durations and ends", () => {
  it("formats durations in the person's language", () => {
    expect(formatDuration(15, "en", "long")).toBe("15 minutes");
    expect(formatDuration(60, "en", "long")).toBe("1 hour");
    expect(formatDuration(90, "en", "long")).toBe("1 hour 30 minutes");
    expect(formatDuration(1440, "en", "long")).toBe("1 day");
    expect(formatDuration(42, "en", "short")).toBe("42 min");
    expect(formatDuration(200, "en", "short")).toBe("3 hr 20 min");
    expect(formatDuration(240, "tr", "long")).toBe("4 saat");
    expect(formatDuration(1440, "tr", "long")).toBe("1 gün");
  });

  it("says when it ends as briefly as is unambiguous, in the given time zone", () => {
    const opts = { now: NOW, timeZone: "Europe/Istanbul" };
    expect(formatUntil(at(60), "tr", opts)).toBe("15:30");
    expect(formatUntil(at(60), "en", opts)).toBe("3:30 PM");
    // Tomorrow in Istanbul: the weekday disambiguates.
    expect(formatUntil(at(12 * 60), "en", opts)).toBe("Fri 2:30 AM");
    expect(formatUntil(at(20 * 24 * 60), "en", opts)).toMatch(/Oct 28, 2026/);
    expect(formatUntil("not a date", "en", opts)).toBe("not a date");
  });

  it("writes the dialog summary and the remaining label", () => {
    const zone = { now: NOW, timeZone: "UTC" };
    expect(elevationSummary(en, "en", { from: "edits", minutes: 60, ...zone })).toBe(
      "Until 12:30 PM (in 1 hour), then back to Edits.",
    );
    expect(elevationSummary(tr, "tr", { from: "manual", minutes: 15, ...zone })).toBe(
      "Bitiş: 11:45 (15 dakika sonra). Ardından yeniden Manuel modunda çalışır.",
    );
    expect(remainingLabel(en, "en", at(42), NOW)).toBe("42 min left");
    expect(remainingLabel(en, "en", at(125), NOW)).toBe("2 hr 5 min left");
    expect(remainingLabel(tr, "tr", at(42), NOW)).toBe("42 dk. kaldı");
  });
});

describe("custom durations", () => {
  const bounds = { minMinutes: 5, maxMinutes: 1440 };
  it("reads minutes or hours (with a decimal comma) as whole minutes within bounds", () => {
    expect(parseCustomDuration("90", "minutes", bounds)).toEqual({ minutes: 90 });
    expect(parseCustomDuration("1,5", "hours", bounds)).toEqual({ minutes: 90 });
    expect(parseCustomDuration("24", "hours", bounds)).toEqual({ minutes: 1440 });
    expect(parseCustomDuration("4", "minutes", bounds)).toEqual({ error: "tooShort" });
    expect(parseCustomDuration("25", "hours", bounds)).toEqual({ error: "tooLong" });
    expect(parseCustomDuration("", "minutes", bounds)).toEqual({ error: "invalid" });
    expect(parseCustomDuration("abc", "minutes", bounds)).toEqual({ error: "invalid" });
    expect(parseCustomDuration("-10", "minutes", bounds)).toEqual({ error: "invalid" });
  });
});
