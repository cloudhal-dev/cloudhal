/** CodeQL alerts 11 and 19: the sender-address check and Studio's origin trim, linear (rule 13). */
import { describe, expect, it } from "vitest";
import { isMailAddress } from "../src/email.ts";
import { studioOrigin } from "../src/tokens.ts";

const OLD_MAIL_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Every string of up to `max` characters over `alphabet`. */
function* strings(alphabet: readonly string[], max: number): Generator<string> {
  let all = [""];
  yield "";
  for (let len = 1; len <= max; len++) {
    all = all.flatMap((s) => alphabet.map((c) => s + c));
    yield* all;
  }
}

const fast = (f: () => void) => {
  const start = performance.now();
  f();
  expect(performance.now() - start).toBeLessThan(1500);
};

describe("isMailAddress (alert 19)", () => {
  it("accepts exactly what the old regex accepted", () => {
    for (const s of [
      "studio@example.com",
      "Studio <studio@example.com>",
      '"q"@example.com',
      "a@b.c",
      "a@b.c\n",
      " a@b.c",
      `${"a".repeat(300)}@b.c`,
    ])
      expect(isMailAddress(s), JSON.stringify(s)).toBe(OLD_MAIL_ADDRESS.test(s));
    for (const s of strings(["a", ".", "@", " ", "<", '"'], 6))
      expect(isMailAddress(s), JSON.stringify(s)).toBe(OLD_MAIL_ADDRESS.test(s));
  });

  it("is linear on a long run of .x after the @", () => {
    fast(() => expect(isMailAddress(`!@!.${"!.".repeat(100_000)} `)).toBe(false));
    fast(() => expect(isMailAddress(`a@b${".c".repeat(100_000)}`)).toBe(true));
  });
});

describe("studioOrigin (alert 11)", () => {
  const origin = (configured: string) => studioOrigin({} as never, configured, new Set());
  it("trims trailing slashes as /\\/+$/ did", () => {
    for (const s of [
      "https://studio.example",
      "https://studio.example/",
      "https://s.example///",
      "/",
    ])
      expect(origin(s)).toBe(s.replace(/\/+$/, ""));
    // An empty result falls through to the request's own origin, as before: not tested here.
  });
  it("is linear on a long run of / with something after it", () => {
    const inner = `https://a${"/".repeat(100_000)}b`;
    fast(() => expect(origin(`${inner}/`)).toBe(inner));
  });
});
