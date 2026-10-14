/** RFC-0017 §1: a theme's design settings — the subset with contrast rules, checked by the store. */
import { describe, expect, it } from "vitest";
import { checkPropsSchema, contrastRatio, type PropsSchema, validateProps } from "../src/blocks.ts";

const schema: PropsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    brand: { type: "string", format: "color", default: "#18181b" },
    surface: { type: "string", format: "color", default: "#ffffff" },
    text: { type: "string", format: "color", default: "#18181b" },
    font: {
      type: "string",
      enum: ["system", "serif"],
      "x-labels": { system: { en: "System" }, serif: { en: "Serif", tr: "Tırnaklı" } },
    },
  },
  "x-contrast": [
    ["text", "surface", 4.5],
    ["brand", "surface", 3],
  ],
};

describe("contrast", () => {
  it("measures WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("holds color pairs to their ratio, defaults counting for unset values", () => {
    expect(checkPropsSchema(schema)).toEqual([]);
    expect(validateProps(schema, {})).toEqual([]);
    expect(validateProps(schema, { text: "#bbbbbb" })).toEqual([
      {
        path: "text",
        message: expect.stringMatching(/^contrast with surface is 1\.9:1; needs 4\.5:1$/),
      },
    ]);
    // A dark page: light text passes, the default dark brand does not.
    expect(
      validateProps(schema, { surface: "#111111", text: "#f4f4f5" }).map((i) => i.path),
    ).toEqual(["brand"]);
  });

  it("refuses rules that name missing or non-color props, or impossible ratios, and labels for other values", () => {
    const bad = (rules: unknown) =>
      checkPropsSchema({ ...schema, "x-contrast": rules }).map((i) => i.message);
    expect(bad([["text", "font", 4.5]])).toEqual(["font is not a color prop"]);
    expect(bad([["text", "nope", 4.5]])).toEqual(["nope is not a color prop"]);
    expect(bad([["text", "surface", 30]])).toEqual(["a ratio from 1 to 21"]);
    expect(
      checkPropsSchema({
        ...schema,
        properties: {
          ...schema.properties,
          font: { type: "string", enum: ["system"], "x-labels": { serif: "Serif" } },
        },
      }).map((i) => i.message),
    ).toEqual(["not an enum value"]);
  });
});

describe("store: Site.theme.config", () => {
  it("checks the settings when they change, and keeps values a theme change made misfit", async () => {
    const { MemoryBlobStore } = await import("@cloudhal/storage");
    const { BetterSqlite3Driver } = await import("@cloudhal/storage/sqlite");
    const { SiteGraphStore, seedStarterSite, InvariantError } = await import("../src/index.ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    const plain = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await plain.init();
    const site = await seedStarterSite(plain, { name: "Look", slug: "look" });
    // Written while the theme declared no settings (or other ones): kept as is.
    const stale = await plain.updateSite({
      ...site,
      theme: { ...site.theme, config: { font: "comic" } },
    });

    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore(), themeSettings: schema });
    const renamed = await store.updateSite({ ...stale, name: "Look again" });
    expect(renamed.theme.config).toEqual({ font: "comic" });
    const bad = store.updateSite({
      ...renamed,
      theme: { ...renamed.theme, config: { font: "serif", text: "#cccccc" } },
    });
    await expect(bad).rejects.toBeInstanceOf(InvariantError);
    await expect(bad).rejects.toMatchObject({
      code: "invalid_props",
      details: { type: "theme", issues: [{ path: "text" }] },
    });
    const good = await store.updateSite({
      ...renamed,
      theme: { ...renamed.theme, config: { font: "serif", brand: "#1d4ed8" } },
    });
    expect(good.theme.config).toEqual({ font: "serif", brand: "#1d4ed8" });
  });
});
