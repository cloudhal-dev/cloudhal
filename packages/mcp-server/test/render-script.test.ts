import { describe, expect, it } from "vitest";
import { RENDER_CHECK_IDS, RENDER_CHECK_SCRIPT } from "../src/render.ts";

/** `RENDER_CHECK_SCRIPT` is assembled from ordered parts (src/render/checks); they must still form one script. */
describe("RENDER_CHECK_SCRIPT", () => {
  it("parses as one async expression and names every check id", () => {
    // Constructing a Function parses the source without running it (tests only; Workers forbid eval).
    expect(() => new Function(`return ${RENDER_CHECK_SCRIPT};`)).not.toThrow();
    expect(RENDER_CHECK_SCRIPT.startsWith("(async () => {\n")).toBe(true);
    expect(RENDER_CHECK_SCRIPT.endsWith("\n  return ids.map((id) => out[id]);\n})()")).toBe(true);
    expect(RENDER_CHECK_SCRIPT).toContain(JSON.stringify(RENDER_CHECK_IDS));
  });
});
