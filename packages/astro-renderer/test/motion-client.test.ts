/** RFC-0024 §7: the motion module's code, name and budget. */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MOTION_SCRIPT, MOTION_SCRIPT_ALIASES } from "../src/motion-client.ts";

describe("motion module", () => {
  it("pins its code to its versioned name and stays within its budget", () => {
    // Bump `motion.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(MOTION_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "c387768ba445",
    );
    expect(MOTION_SCRIPT.path).toBe("/_cloudhal/motion.4.js");
    expect(MOTION_SCRIPT_ALIASES).toEqual([
      "/_cloudhal/motion.1.js",
      "/_cloudhal/motion.2.js",
      "/_cloudhal/motion.3.js",
    ]);
    expect(gzipSync(MOTION_SCRIPT.code).length).toBeLessThan(5 * 1024);
    // it never evaluates code and never writes HTML
    expect(MOTION_SCRIPT.code).not.toMatch(/\beval\b|new Function|innerHTML|insertAdjacentHTML/);
    // nothing moves at "none" or for readers who ask for reduced motion
    expect(MOTION_SCRIPT.code).toContain('const moving=!reduce&&level!=="none"');
  });
});
