import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RENDER_CHECK_IDS, RENDER_CHECK_SCRIPT } from "../src/render.ts";

const CHECKS_DIR = path.join(import.meta.dirname, "../src/render/checks");

/** `RENDER_CHECK_SCRIPT` is assembled from ordered parts (src/render/checks); they must still form one script. */
describe("RENDER_CHECK_SCRIPT", () => {
  it("parses as one async expression and names every check id", () => {
    // Constructing a Function parses the source without running it (tests only; Workers forbid eval).
    expect(() => new Function(`return ${RENDER_CHECK_SCRIPT};`)).not.toThrow();
    expect(RENDER_CHECK_SCRIPT.startsWith("(async () => {\n")).toBe(true);
    expect(RENDER_CHECK_SCRIPT.endsWith("\n  return ids.map((id) => out[id]);\n})()")).toBe(true);
    expect(RENDER_CHECK_SCRIPT).toContain(JSON.stringify(RENDER_CHECK_IDS));
  });

  it("every part is a String.raw template, so backslashes reach the page as written", () => {
    const parts: string[] = [];
    for (const file of readdirSync(CHECKS_DIR)) {
      if (!file.endsWith(".ts") || file === "index.ts") continue;
      const source = readFileSync(path.join(CHECKS_DIR, file), "utf8");
      for (const [, name, start] of source.matchAll(/export const (\w+) = (\S+)/g)) {
        expect(start, `${file}: ${name}`).toMatch(/^String\.raw`/);
        parts.push(`${file}: ${name}`);
      }
    }
    expect(parts).toHaveLength(10);
  });

  it("the page receives its whitespace regexes with their backslashes", () => {
    for (const code of [
      String.raw`const blank = /\s/.test(`,
      String.raw`.split(/\s+/).some(`,
      String.raw`.split(/\s+/).slice(0, 2)`,
      String.raw`.replace(/\s+/g, " ")`,
    ])
      expect(RENDER_CHECK_SCRIPT).toContain(code);
  });
});
