/** #174 item 3: `isPagePath` answers as `/\.[^/]*$/` did, in linear time. */
import { describe, expect, it } from "vitest";
import { isPagePath } from "../src/worker/paths.ts";

describe("isPagePath (#174)", () => {
  it("answers as the regex did", () => {
    const old = (p: string) => !/\.[^/]*$/.test(p);
    let s = 174;
    const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s;
    };
    for (let n = 0; n < 5000; n++) {
      let p = "";
      for (let i = next() % 10; i > 0; i--) p += ["/", ".", "a", "md"][next() % 4];
      expect(isPagePath(p), p).toBe(old(p));
    }
    expect(isPagePath("/guides/search")).toBe(true);
    expect(isPagePath("/llms.txt")).toBe(false);
    expect(isPagePath("/v0.6/guide")).toBe(true);
  });

  it("stays linear on a long run of dots", () => {
    const start = performance.now();
    expect(isPagePath(`/${".".repeat(200_000)}/`)).toBe(true);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
