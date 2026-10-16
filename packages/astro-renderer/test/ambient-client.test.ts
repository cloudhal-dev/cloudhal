/** RFC-0024 §4: the ambient module's code, name, budget and guards. */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AMBIENT_SCRIPT } from "../src/ambient-client.ts";
import { MOTION_SCRIPT } from "../src/motion-client.ts";

describe("ambient module", () => {
  it("pins its code to its versioned name, stays within its budget and keeps its guards", () => {
    // Bump `ambient.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(AMBIENT_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "710768e8ec66",
    );
    expect(AMBIENT_SCRIPT.path).toBe("/_cloudhal/ambient.1.js");
    expect(gzipSync(AMBIENT_SCRIPT.code).length).toBeLessThan(8 * 1024);
    expect(AMBIENT_SCRIPT.code).not.toMatch(/\beval\b|new Function|innerHTML/);
    // device-pixel ratio capped, particles capped, 30 frames a second, paused off screen and when asked
    expect(AMBIENT_SCRIPT.code).toContain("Math.min(2,devicePixelRatio||1)");
    expect(AMBIENT_SCRIPT.code).toContain('preset==="links"?120:400');
    expect(AMBIENT_SCRIPT.code).toContain("if(t-last<33)return;");
    expect(AMBIENT_SCRIPT.code).toContain('!h.hasAttribute("data-ch-motion-paused")');
    // the motion module loads it only where motion plays and the device can afford it
    expect(MOTION_SCRIPT.code).toContain(
      'if(moving&&level!=="subtle"&&d.querySelector("canvas.ch-ambient")&&!(nav.connection&&nav.connection.saveData)&&!(nav.deviceMemory&&nav.deviceMemory<=2))import("/_cloudhal/ambient.1.js")',
    );
  });
});
