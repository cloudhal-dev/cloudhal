import { describe, expect, it } from "vitest";
import { newGrantId } from "../src/auth/grants.ts";

describe("newGrantId", () => {
  it("is 24 base62 characters", () => {
    for (let i = 0; i < 200; i++) expect(newGrantId()).toMatch(/^[A-Za-z0-9]{24}$/);
  });

  it("draws every character evenly (rejection sampling, no modulo bias)", () => {
    const counts = new Map<string, number>();
    const ids = 4_000;
    for (let i = 0; i < ids; i++)
      for (const ch of newGrantId()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(62);
    const expected = (ids * 24) / 62;
    // With `b % 62` the first 8 characters came up 5/4 as often; allow ±20% around the mean.
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(expected * 0.8);
      expect(n).toBeLessThan(expected * 1.2);
    }
  });
});
