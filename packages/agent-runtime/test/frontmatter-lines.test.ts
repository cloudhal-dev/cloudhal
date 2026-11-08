/**
 * #174 item 5: the frontmatter line parsers give the regexes' groups (seeded random lines over the
 * characters that matter) and stay linear on 100k-character lines that made them backtrack.
 */
import { describe, expect, it } from "vitest";
import { nestedLine, topLine } from "../src/frontmatter-lines.ts";
import { parseFrontmatter } from "../src/skills.ts";

function strings(alphabet: readonly string[], count: number, maxLength: number, seed = 174) {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s;
  };
  const out: string[] = [];
  for (let n = 0; n < count; n++) {
    let v = "";
    const len = next() % (maxLength + 1);
    for (let i = 0; i < len; i++) v += alphabet[next() % alphabet.length];
    out.push(v);
  }
  return out;
}

const groups = (m: RegExpMatchArray | null) => (m ? [m[1], m[2]] : undefined);

describe("frontmatter lines (#174 item 5)", () => {
  it("match exactly what the regexes matched", () => {
    const parts = [" ", " ", "\t", ":", "a", "B", "-", "_", "1", "\r", "\u2028", "'"];
    for (const raw of strings(parts, 10_000, 9)) {
      expect(nestedLine(raw), JSON.stringify(raw)).toEqual(
        groups(raw.match(/^\s+([^:]+):\s*(.*)$/)),
      );
      expect(topLine(raw), JSON.stringify(raw)).toEqual(
        groups(raw.match(/^([A-Za-z][\w-]*):\s*(.*)$/)),
      );
    }
  });

  it("stays linear on lines that made the regexes backtrack", () => {
    const start = performance.now();
    expect(nestedLine(" ".repeat(100_000))).toBeUndefined();
    expect(nestedLine(`  key:${" ".repeat(100_000)}x\r`)).toBeUndefined();
    expect(topLine(`name:${" ".repeat(100_000)}x\r`)).toBeUndefined();
    const fm = `---\nmetadata:\n${" ".repeat(100_000)}\n---\nbody`;
    expect(() => parseFrontmatter(fm)).not.toThrow();
    expect(performance.now() - start).toBeLessThan(100);
  });
});
