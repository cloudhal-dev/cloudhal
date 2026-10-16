/** RFC-0025 §2: the chrome module's code, name, budget and guards. */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CHROME_SCRIPT, CHROME_SCRIPT_ALIASES } from "../src/chrome-client.ts";
import { PREFS_SCRIPT } from "../src/prefs-client.ts";

describe("chrome module", () => {
  it("pins its code to its versioned name, stays small and keeps its guards", () => {
    // Bump `chrome.<n>.js` with any change to the code (`/_cloudhal/*` is cached as immutable).
    expect(createHash("sha256").update(CHROME_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "9e579ae46547",
    );
    expect(CHROME_SCRIPT.path).toBe("/_cloudhal/chrome.2.js");
    expect(CHROME_SCRIPT_ALIASES).toEqual(["/_cloudhal/chrome.1.js"]);
    // RFC-0025 25d: choices go to first-party cookies, a year, SameSite=Lax.
    expect(CHROME_SCRIPT.code).toContain("Max-Age=31536000; Path=/; SameSite=Lax");
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

  it("pins the preferences script: tiny, classic, reading cookies only", () => {
    expect(createHash("sha256").update(PREFS_SCRIPT.code).digest("hex").slice(0, 12)).toBe(
      "b33e24cf5e81",
    );
    expect(PREFS_SCRIPT.path).toBe("/_cloudhal/prefs.1.js");
    expect(gzipSync(PREFS_SCRIPT.code).length).toBeLessThan(512);
    expect(PREFS_SCRIPT.code).not.toMatch(/document\.cookie\s*=/);
    expect(PREFS_SCRIPT.code).not.toMatch(/\bimport\b|\bexport\b/);
  });
});
