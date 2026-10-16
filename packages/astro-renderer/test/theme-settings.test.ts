/** RFC-0017 §1: design settings reach the page as typed CSS variables and attributes only. */
import type { PropsSchema } from "@cloudhal/core-ts/blocks";
import { describe, expect, it } from "vitest";
import { themeVariables } from "../src/theme-settings.ts";

const schema: PropsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    brand: { type: "string", format: "color", default: "#18181b" },
    linkColor: { type: "string", format: "color" },
    font: { type: "string", enum: ["system", "serif"], default: "system" },
    width: { type: "integer", minimum: 40, maximum: 90, default: 72 },
    dense: { type: "boolean" },
  },
};
const site = (config?: Record<string, unknown>) => ({
  theme: { name: "blog", ...(config ? { config } : {}) },
});

describe("themeVariables", () => {
  it("writes defaults for unset values, and nothing without a schema", () => {
    const v = themeVariables(site(), schema);
    expect(v.style).toMatch(/^:root\{--ch-brand:#18181b;--ch-width:72;color-scheme:light;/);
    expect(v.attributes).toEqual({ "data-ch-font": "system" });
    expect(themeVariables(site({ brand: "#FF0000" }), undefined)).toEqual({
      style: "",
      attributes: {},
    });
  });

  it("takes the site's typed values and drops anything else for the default", () => {
    const v = themeVariables(
      site({
        brand: "red;}body{display:none",
        linkColor: "#2563EB",
        font: "serif",
        width: 400,
        dense: true,
        extra: "#000000",
      }),
      schema,
    );
    expect(v.style).toMatch(/^:root\{--ch-brand:#18181b;--ch-link-color:#2563eb;--ch-width:72;/);
    expect(v.style).not.toContain("display:none");
    expect(v.attributes).toEqual({ "data-ch-font": "serif", "data-ch-dense": "on" });
  });
});

describe("color roles (RFC-0023 §1)", () => {
  const tokens: PropsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      brand: { type: "string", format: "color", default: "#18181b" },
      seed: { type: "string", format: "color" },
      scheme: { type: "string", enum: ["tonal", "vibrant", "neutral", "mono"], default: "tonal" },
      mode: { type: "string", enum: ["light", "dark", "auto"], default: "light" },
    },
  };
  it("keeps the old look without a seed: the theme's colors and its former greys", () => {
    const { style } = themeVariables(site({ brand: "#2563eb" }), tokens);
    expect(style).toContain("--ch-color-brand:#2563eb");
    expect(style).toContain("--ch-color-surface-muted:#f4f4f5");
    expect(style).toContain("color-scheme:light");
  });
  it("expands a seed, and writes light-dark() for the automatic mode", () => {
    const { style } = themeVariables(
      site({ seed: "#7c3aed", scheme: "vibrant", mode: "auto" }),
      tokens,
    );
    expect(style).toContain("--ch-color-brand:#7c3aed;--ch-color-brand:light-dark(#7c3aed,");
    expect(style).toContain("color-scheme:light dark");
    // a dark mode alone (no seed) expands from the brand color
    expect(themeVariables(site({ mode: "dark" }), tokens).style).toContain("color-scheme:dark");
    // a theme without `seed` never expands
    expect(
      themeVariables(site({ seed: "#7c3aed" }), {
        ...tokens,
        properties: { brand: tokens.properties.brand as never },
      }).style,
    ).toContain("--ch-color-surface:#ffffff");
  });
});

describe("type pairing and scale (RFC-0023 §2)", () => {
  const type: PropsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      typePairing: {
        type: "string",
        enum: ["system", "editorial", "modern", "humanist", "technical", "classic"],
        default: "system",
      },
      typeScale: { type: "string", enum: ["compact", "balanced", "dramatic"] },
    },
  };
  it("keeps fixed sizes until a scale is chosen, and names the pairing for the theme's CSS", () => {
    const before = themeVariables(site({}), type);
    expect(before.style).not.toContain("--ch-step");
    expect(before.attributes["data-ch-type-pairing"]).toBe("system");
    const after = themeVariables(site({ typePairing: "editorial", typeScale: "dramatic" }), type);
    expect(after.attributes).toMatchObject({
      "data-ch-type-pairing": "editorial",
      "data-ch-type-scale": "dramatic",
    });
    expect(after.style).toMatch(/--ch-step--1:clamp\(.*--ch-step-6:clamp\([^)]*\)/);
    // a value the theme does not offer writes nothing
    expect(themeVariables(site({ typeScale: "huge" }), type).style).not.toContain("--ch-step");
  });
});

describe("shape and density (RFC-0023 §3)", () => {
  const shape: PropsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      radius: {
        type: "string",
        enum: ["none", "small", "medium", "large", "full"],
        default: "small",
      },
      density: { type: "string", enum: ["compact", "cozy", "airy"], default: "cozy" },
    },
  };
  it("writes the radii and spaces, the defaults when unset", () => {
    expect(themeVariables(site({}), shape).style).toContain(
      "--ch-radius-control:0.25rem;--ch-radius-s:0.25rem",
    );
    const pill = themeVariables(site({ radius: "full", density: "compact" }), shape);
    expect(pill.style).toContain("--ch-radius-control:9999px");
    expect(pill.style).toContain("--ch-space-unit:0.2188rem");
    expect(pill.attributes).toMatchObject({
      "data-ch-radius": "full",
      "data-ch-density": "compact",
    });
    // a theme with neither setting gets none of it
    expect(
      themeVariables(site({ radius: "full" }), { ...shape, properties: {} }).style,
    ).not.toContain("--ch-radius");
  });
});
