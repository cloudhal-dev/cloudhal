/** `mail.from` in cloudhal.json: the linear sender check gives the old regex's answers (rule 13). */
import { describe, expect, it } from "vitest";
import { isMailAddress, parseMailConfig } from "../src/config.ts";

const OLD = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

describe("isMailAddress", () => {
  it("accepts exactly what the old regex accepted", () => {
    let all = [""];
    for (let len = 1; len <= 6; len++) {
      all = all.flatMap((s) => ["a", ".", "@", " ", ">"].map((c) => s + c));
      for (const s of all) expect(isMailAddress(s), JSON.stringify(s)).toBe(OLD.test(s));
    }
    expect(parseMailConfig({ from: "studio@example.com" })?.from).toBe("studio@example.com");
    expect(() => parseMailConfig({ from: "Studio <studio@example.com>" })).toThrow(/plain address/);
  });

  it("is linear on a long run of .x", () => {
    const start = performance.now();
    expect(isMailAddress(`a@b${".".repeat(100_000)} `)).toBe(false);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
