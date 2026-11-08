/** #174 item 6: the editor's newline trims answer as `/\n*$/` did, in linear time. */
import { trimEndChar } from "@cloudhal/core-ts/names";
import { describe, expect, it } from "vitest";
import { mergeBlocks, splitMarkdown } from "../src/blocks/editor/markdown-blocks.ts";

describe("markdown block trims (#174)", () => {
  it("trimEndChar on newlines is the old /\\n*$/ replace", () => {
    let s = 174;
    const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s;
    };
    for (let n = 0; n < 5000; n++) {
      let t = "";
      for (let i = next() % 10; i > 0; i--) t += ["\n", "\n", "a", "\r", " "][next() % 5];
      expect(`${trimEndChar(t, "\n")}\n`, JSON.stringify(t)).toBe(t.replace(/\n*$/, "\n"));
      expect(trimEndChar(t, "\n"), JSON.stringify(t)).toBe(t.replace(/\n*$/, ""));
    }
  });

  it("merges a block with a long run of blank lines in linear time", () => {
    const tall = `x${"\n".repeat(100_000)}y`;
    const start = performance.now();
    const out = mergeBlocks(splitMarkdown(""), [], ["a", tall, "b"]);
    expect(performance.now() - start).toBeLessThan(500);
    expect(out).toBe(`a\n\n${tall}\n\nb\n`);
  });
});
