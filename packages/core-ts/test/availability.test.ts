/**
 * RFC-0008 §7.1: the one gate helper, with an injected clock (S2: nothing opens before `from`), the
 * gate index and the cache cap (§7.4), asset inheritance (§7.2), the change classes the policy layer
 * uses for D8, and the wall-clock resolution of §9.2 (DST gap forward, overlap at the first).
 */
import { describe, expect, it } from "vitest";
import {
  checkAvailability,
  edgeMaxAge,
  gateChanges,
  gateInstants,
  gateState,
  inheritedGate,
  isAvailable,
  isTimeZone,
  MAX_EDGE_AGE,
  nextGate,
  nextInstant,
} from "../src/availability.ts";
import { resolveWallClock, siteZone, wallClockOf } from "../src/time.ts";

const FROM = "2026-11-02T06:00:00.000Z";
const UNTIL = "2026-11-09T06:00:00.000Z";
const at = (iso: string, deltaMs = 0) => Date.parse(iso) + deltaMs;

describe("isAvailable / gateState", () => {
  const node = { status: "published" as const, availability: { from: FROM, until: UNTIL } };

  it("opens at from (inclusive) and closes at until (exclusive), to the millisecond", () => {
    expect(gateState(node, at(FROM, -1))).toBe("embargoed");
    expect(gateState(node, at(FROM))).toBe("open");
    expect(gateState(node, at(UNTIL, -1))).toBe("open");
    expect(gateState(node, at(UNTIL))).toBe("expired");
    expect(isAvailable(node, at(FROM, -1))).toBe(false);
    expect(isAvailable(node, at(FROM))).toBe(true);
    expect(isAvailable(node, at(UNTIL))).toBe(false);
  });

  it("needs published status; no gates means always open", () => {
    expect(isAvailable({ ...node, status: "draft" }, at(FROM, 1))).toBe(false);
    expect(isAvailable({ status: "published" }, 0)).toBe(true);
    expect(gateState({ availability: { until: UNTIL } }, 0)).toBe("open");
  });

  it("compares instants, whatever offset a gate was written with", () => {
    const istanbul = {
      status: "published" as const,
      availability: { from: "2026-11-02T09:00:00+03:00" },
    };
    expect(isAvailable(istanbul, at(FROM, -1))).toBe(false);
    expect(isAvailable(istanbul, at(FROM))).toBe(true);
  });

  it("fails closed on a gate that does not parse", () => {
    expect(gateState({ availability: { from: "soon" } }, Date.now())).toBe("embargoed");
    expect(gateState({ availability: { until: "never" } }, 0)).toBe("expired");
  });
});

describe("gate index and cache cap", () => {
  const nodes = [
    { availability: { from: FROM } },
    { availability: { from: FROM, until: UNTIL } },
    {},
    { availability: { until: "2026-10-01T00:00:00Z" } },
  ];

  it("lists every instant once, sorted, and finds the next one strictly after now", () => {
    const instants = gateInstants(nodes);
    expect(instants).toEqual([at("2026-10-01T00:00:00Z"), at(FROM), at(UNTIL)]);
    expect(nextInstant(instants, at(FROM, -1))).toBe(at(FROM));
    expect(nextInstant(instants, at(FROM))).toBe(at(UNTIL));
    expect(nextInstant(instants, at(UNTIL))).toBeUndefined();
    expect(nextGate(nodes, 0)).toBe(at("2026-10-01T00:00:00Z"));
    expect(nextGate([{}], 0)).toBeUndefined();
  });

  it("caps max-age at the seconds until the next gate, at least 1, at most a year", () => {
    expect(edgeMaxAge(undefined, 0)).toBe(MAX_EDGE_AGE);
    expect(MAX_EDGE_AGE).toBe(31_536_000);
    expect(edgeMaxAge(at(FROM), at(FROM, -90_000))).toBe(90);
    expect(edgeMaxAge(at(FROM), at(FROM, -89_001))).toBe(90);
    expect(edgeMaxAge(at(FROM), at(FROM, -1))).toBe(1);
    expect(edgeMaxAge(at(FROM), at(FROM, -2 * 31_536_000_000))).toBe(MAX_EDGE_AGE);
  });
});

describe("asset inheritance (§7.2)", () => {
  it("inherits the earliest embargo when every referrer is embargoed", () => {
    expect(
      inheritedGate([
        { availability: { from: UNTIL } },
        { availability: { from: FROM, until: UNTIL } },
      ]),
    ).toEqual({ from: FROM });
  });

  it("stays ungated with one referrer without an embargo, or none, and never inherits expiry", () => {
    expect(inheritedGate([{ availability: { from: FROM } }, {}])).toBeUndefined();
    expect(inheritedGate([])).toBeUndefined();
    expect(inheritedGate([{ availability: { until: UNTIL } }])).toBeUndefined();
  });
});

describe("write rules", () => {
  it("checks that gates parse and from is before until", () => {
    expect(() => checkAvailability({ from: FROM, until: UNTIL })).not.toThrow();
    expect(() => checkAvailability(undefined)).not.toThrow();
    for (const bad of [
      { from: UNTIL, until: FROM },
      { from: FROM, until: FROM },
      { from: "x" },
      {},
    ])
      expect(() => checkAvailability(bad)).toThrow(
        expect.objectContaining({ code: "invalid_availability" }),
      );
  });

  it("classifies changes for the policy layer: lifting an embargo is its own class (D8)", () => {
    const before = at(FROM, -3_600_000);
    expect(gateChanges({ from: FROM }, { from: FROM }, before)).toEqual(["none"]);
    expect(gateChanges({ from: FROM }, undefined, before)).toEqual(["lift-embargo"]);
    expect(gateChanges({ from: UNTIL }, { from: FROM }, before)).toEqual(["lift-embargo"]);
    expect(gateChanges(undefined, { from: FROM }, before)).toEqual(["embargo"]);
    expect(gateChanges({ from: FROM }, { from: UNTIL }, before)).toEqual(["embargo"]);
    // an embargo that has passed can no longer be lifted
    expect(gateChanges({ from: FROM }, undefined, at(FROM, 1))).toEqual(["none"]);
    expect(gateChanges(undefined, { until: UNTIL }, before)).toEqual(["expire"]);
    expect(gateChanges({ until: UNTIL }, undefined, before)).toEqual(["extend"]);
    expect(
      gateChanges({ from: UNTIL, until: "2026-12-01T00:00:00Z" }, { until: UNTIL }, before),
    ).toEqual(["lift-embargo", "expire"]);
  });

  it("knows IANA zones", () => {
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Europe/Istanbul")).toBe(true);
    expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("wall-clock times in the site's zone (§9.1–§9.2)", () => {
  it("resolves a wall-clock time to its instant; absent zone means UTC", () => {
    expect(siteZone({})).toBe("UTC");
    expect(siteZone({ timeZone: "Europe/Istanbul" })).toBe("Europe/Istanbul");
    expect(resolveWallClock("2026-11-02T09:00", "Europe/Istanbul")).toBe("2026-11-02T06:00:00Z");
    expect(resolveWallClock("2026-11-02T09:00", "UTC")).toBe("2026-11-02T09:00:00Z");
    expect(wallClockOf("2026-11-02T06:00:00Z", "Europe/Istanbul")).toBe("2026-11-02T09:00");
  });

  it("moves a time in a spring-forward gap forward and takes the first of a repeated time", () => {
    // Berlin, 29 March 2026: 02:00 → 03:00 (02:30 does not exist) → 03:30 +02:00
    expect(resolveWallClock("2026-03-29T02:30", "Europe/Berlin")).toBe("2026-03-29T01:30:00Z");
    // Berlin, 25 October 2026: 03:00 → 02:00 (02:30 twice) → the first, +02:00
    expect(resolveWallClock("2026-10-25T02:30", "Europe/Berlin")).toBe("2026-10-25T00:30:00Z");
  });

  it("refuses unknown zones", () => {
    expect(() => resolveWallClock("2026-11-02T09:00", "Mars/Olympus_Mons")).toThrow(RangeError);
  });
});
