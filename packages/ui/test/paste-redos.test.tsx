/** Alert 32: `looksLikeMarkdown`'s link check answers as its regex did, in linear time. */
import { describe, expect, it } from "vitest";
import { hasInlineLink, looksLikeMarkdown } from "../src/blocks/editor/paste.ts";

const oldLink = (text: string) => /\[[^\]\n]+\]\([^)\s]+\)/.test(text);
const oldLooks = (text: string) =>
  /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|.*\|\s*$|- \[[ xX]\]\s)/m.test(text) ||
  /\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|~~[^~\n]+~~/.test(text);

describe("hasInlineLink (alert 32)", () => {
  it("answers as the regex did", () => {
    for (const t of [
      "see [docs](https://x.test) here",
      "[a](b)",
      "[](b)",
      "[a]()",
      "[a] (b)",
      "[a](b c)",
      "[a\nb](c)",
      "[a](b\n)",
      "[x [y](z)",
      "[a](b(c)d)",
      "](x) [",
      "plain text",
      "",
    ])
      expect(hasInlineLink(t), JSON.stringify(t)).toBe(oldLink(t));
    // random strings over the characters that matter
    let s = 32;
    const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s;
    };
    for (let n = 0; n < 20_000; n++) {
      let t = "";
      for (let i = next() % 14; i > 0; i--)
        t += ["[", "]", "(", ")", " ", "\n", "a", "!"][next() % 8];
      expect(hasInlineLink(t), JSON.stringify(t)).toBe(oldLink(t));
      expect(looksLikeMarkdown(t), JSON.stringify(t)).toBe(oldLooks(t));
    }
  });

  it("is linear on long runs of [ and [!](", () => {
    for (const t of [
      "[".repeat(100_000),
      `[\\](${"[!](".repeat(25_000)}`,
      `[a](${"](x".repeat(33_000)}`,
    ]) {
      const start = performance.now();
      expect(looksLikeMarkdown(t)).toBe(false);
      expect(performance.now() - start).toBeLessThan(1500);
    }
  });
});
