/** RFC-0025 §2: the chrome module's code, name, budget and guards. */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CHROME_SCRIPT } from "../src/chrome-client.ts";

describe("chrome module", () => {
  it("pins its code to its versioned name, stays small and keeps its guards", () => {
    // Bump `chrome.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(CHROME_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "d69bda60f5d0",
    );
    expect(CHROME_SCRIPT.path).toBe("/_cloudhal/chrome.1.js");
    expect(gzipSync(CHROME_SCRIPT.code).length).toBeLessThan(2 * 1024);
    expect(CHROME_SCRIPT.code).not.toMatch(/\beval\b|new Function|innerHTML/);
    // Hiding never happens at motion none, under reduced motion, or with keyboard focus in the header.
    expect(CHROME_SCRIPT.code).toContain('h.getAttribute("data-ch-motion")==="none"');
    expect(CHROME_SCRIPT.code).toContain("prefers-reduced-motion: reduce");
    expect(CHROME_SCRIPT.code).toContain('hd.querySelector(":focus-visible")');
    // The menu link opens its dialog only where the browser has one; the link works otherwise.
    expect(CHROME_SCRIPT.code).toContain('typeof dlg.showModal!=="function"');
    // Scroll listening is passive.
    expect(CHROME_SCRIPT.code).toContain("{passive:true}");
  });
});
