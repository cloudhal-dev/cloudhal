/** RFC-0023 §1: one seed, a scheme, a contrast level and a mode → color roles that pass WCAG. */
import { describe, expect, it } from "vitest";
import {
  COLOR_ROLES,
  COLOR_SCHEMES,
  colorRolesCss,
  contrastRatio,
  expandColorTokens,
  legacyColorRoles,
  siteColorTokens,
} from "../src/tokens.ts";

const PAIRS: [string, string, number, number][] = [
  ["text", "surface", 4.5, 7],
  ["text", "surface-muted", 4.5, 7],
  ["text-muted", "surface", 4.5, 7],
  ["text-inverse", "surface-inverse", 4.5, 7],
  ["link", "surface", 4.5, 7],
  ["on-brand", "brand", 4.5, 7],
  ["on-accent", "accent", 4.5, 7],
  ["brand", "surface", 3, 3],
  ["focus", "surface", 3, 3],
];
const SEEDS = [
  "#2563eb",
  "#e11d48",
  "#facc15",
  "#a3e635",
  "#18181b",
  "#ffffff",
  "#7c3aed",
  "#0891b2",
  "#f97316",
];

describe("color tokens (RFC-0023 §1)", () => {
  it("never emits a failing pair, for any seed, scheme, contrast level, light or dark", () => {
    for (const seed of SEEDS)
      for (const scheme of COLOR_SCHEMES)
        for (const contrast of ["standard", "high"] as const) {
          const t = expandColorTokens({ seed, scheme, contrast });
          for (const roles of [t.light, t.dark])
            for (const [fg, bg, aa, aaa] of PAIRS) {
              const got = contrastRatio(
                roles[fg as keyof typeof roles],
                roles[bg as keyof typeof roles],
              );
              expect(got, `${seed} ${scheme} ${contrast} ${fg}/${bg}`).toBeGreaterThanOrEqual(
                (contrast === "high" ? aaa : aa) - 0.01,
              );
            }
        }
  });

  it("keeps the brand exact when it reads, and says what it changed when it does not", () => {
    const blue = expandColorTokens({ seed: "#2563eb", scheme: "tonal" });
    expect(blue.light.brand).toBe("#2563eb");
    expect(blue.light["on-brand"]).toBe("#ffffff");
    expect(blue.notes).toEqual([]);
    const yellow = expandColorTokens({ seed: "#facc15", scheme: "vibrant" });
    expect(yellow.light.brand).not.toBe("#facc15");
    expect(yellow.dark.brand).toBe("#facc15");
    expect(yellow.notes[0]).toMatch(
      /^light: brand on surface darkened \d+ step\(s\) to reach 3:1$/,
    );
  });

  it("is deterministic, gives dark surfaces in dark, and tints greys by scheme", () => {
    expect(expandColorTokens({ seed: "#7c3aed" })).toEqual(expandColorTokens({ seed: "#7c3aed" }));
    const t = expandColorTokens({ seed: "#7c3aed", scheme: "vibrant" });
    expect(contrastRatio(t.dark.surface, "#000000")).toBeLessThan(2);
    expect(expandColorTokens({ seed: "#7c3aed", scheme: "mono" }).light["surface-muted"]).toMatch(
      /^#(..)\1\1$/,
    );
    expect(Object.keys(t.light)).toEqual([...COLOR_ROLES]);
  });

  it("writes CSS for light, dark and auto, with a light fallback before light-dark()", () => {
    const t = expandColorTokens({ seed: "#2563eb", mode: "auto" });
    const auto = colorRolesCss(t);
    expect(auto).toContain("color-scheme:light dark");
    expect(auto).toContain(
      `--ch-color-surface:${t.light.surface};--ch-color-surface:light-dark(${t.light.surface},${t.dark.surface})`,
    );
    expect(colorRolesCss({ ...t, mode: "dark" })).toContain(`--ch-color-text:${t.dark.text}`);
    expect(colorRolesCss({ ...t, mode: "light" })).not.toContain("light-dark");
  });

  it("reproduces the blog theme's old look without a seed", () => {
    const roles = legacyColorRoles({
      brand: "#18181b",
      link: "#0369a1",
      surface: "#ffffff",
      text: "#18181b",
    });
    expect(roles).toMatchObject({
      surface: "#ffffff",
      "surface-muted": "#f4f4f5",
      text: "#18181b",
      "text-muted": "#52525b",
      border: "#e4e4e7",
      brand: "#18181b",
      "on-brand": "#ffffff",
      link: "#0369a1",
    });
    expect(legacyColorRoles({ brand: "#facc15" })["on-brand"]).toBe("#18181b");
  });
});

describe("siteColorTokens", () => {
  const properties = { seed: {}, brand: { default: "#18181b" }, link: { default: "#0369a1" } };

  it("keeps the old colors until a site sets a seed or a dark mode", () => {
    const legacy = siteColorTokens({ brand: "#7c3aed" }, properties);
    expect(legacy).toMatchObject({
      source: "legacy",
      settings: null,
      seedAvailable: true,
      mode: "light",
    });
    expect(legacy.light.brand).toBe("#7c3aed");
    // a theme without `seed` never expands, whatever the site stored
    expect(siteColorTokens({ seed: "#7c3aed" }, { brand: {} }).source).toBe("legacy");
  });

  it("expands the seed, the brand standing in for it in dark mode, and reports every pair", () => {
    const seeded = siteColorTokens(
      { seed: "#7C3AED", scheme: "vibrant", mode: "auto" },
      properties,
    );
    expect(seeded.settings).toEqual({
      seed: "#7c3aed",
      scheme: "vibrant",
      contrast: "standard",
      mode: "auto",
    });
    for (const p of seeded.pairs) {
      expect(p.light).toBeGreaterThanOrEqual(p.needs);
      expect(p.dark).toBeGreaterThanOrEqual(p.needs);
    }
    expect(seeded.pairs.find((p) => p.foreground === "on-brand")?.needs).toBe(4.5);
    const dark = siteColorTokens({ mode: "dark", contrast: "high", scheme: "bogus" }, properties);
    expect(dark.settings).toMatchObject({ seed: "#18181b", scheme: "tonal", contrast: "high" });
    expect(dark.pairs.find((p) => p.foreground === "text")?.needs).toBe(7);
  });
});
