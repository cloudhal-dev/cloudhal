/** Alert 8: the fake WAE's type-error check answers as its regex did, in linear time. */
import { describe, expect, it } from "vitest";
import { weightsBesideLiteralZero } from "./helpers/fake-wae.ts";

const old = (q: string) => /quantileWeighted\([^;]*?if\([^,]+,\s*double\d+\s*,/.test(q);

describe("weightsBesideLiteralZero", () => {
  it("answers as the regex did", () => {
    for (const q of [
      "SELECT quantileWeighted(0.5)(double1, if(blob2 = 'x', double3, 0)) FROM t",
      "SELECT quantileWeighted(0.5)(double1, if(blob2 = 'x', 1, 0)) FROM t",
      "SELECT quantileWeighted(0.5)(double1, _sample_interval) FROM t; SELECT if(a, double1, 0)",
      "quantileWeighted(if(,double1,",
      "quantileWeighted(if(a,  double12 ,",
      "if(a, double1, 0) quantileWeighted(",
      "",
    ])
      expect(weightsBesideLiteralZero(q), q).toBe(old(q));
    let s = 8;
    const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s;
    };
    const tokens = ["quantileWeighted(", "if(", ",", " ", "double1", ";", "a", "double"];
    for (let n = 0; n < 20_000; n++) {
      let q = "";
      for (let i = next() % 10; i > 0; i--) q += tokens[next() % tokens.length];
      expect(weightsBesideLiteralZero(q), JSON.stringify(q)).toBe(old(q));
    }
  });

  it("is linear on many quantileWeighted( and if(", () => {
    const start = performance.now();
    expect(weightsBesideLiteralZero("quantileWeighted(".repeat(10_000))).toBe(false);
    expect(weightsBesideLiteralZero(`quantileWeighted(${"if(".repeat(50_000)}`)).toBe(false);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
