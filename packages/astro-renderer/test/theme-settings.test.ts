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
    expect(themeVariables(site(), schema)).toEqual({
      style: ":root{--ch-brand:#18181b;--ch-width:72}",
      attributes: { "data-ch-font": "system" },
    });
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
    expect(v.style).toBe(":root{--ch-brand:#18181b;--ch-link-color:#2563eb;--ch-width:72}");
    expect(v.attributes).toEqual({ "data-ch-font": "serif", "data-ch-dense": "on" });
  });
});
