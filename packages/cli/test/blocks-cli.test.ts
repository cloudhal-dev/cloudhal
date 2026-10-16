/**
 * RFC-0015 §6 in the CLI: the theme's `src/blocks.ts` joins the built-ins for `studio`, `mcp` and
 * `deploy`, which refuses invalid types; the admin Worker bundles the file with its entry.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBlockRegistry, loadThemeDesign, loadThemeSettings } from "../src/blocks.ts";
import { adminEntry } from "../src/cloudflare/admin.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const starter = path.resolve(here, "../../../starters/blog");

describe("theme block types", () => {
  it("loads the starter's types next to the built-ins", async () => {
    const registry = await loadBlockRegistry(starter);
    expect(registry.list().map((t) => t.name)).toEqual([
      "callout",
      "button",
      "embed",
      "faq",
      "testimonial",
    ]);
    expect(registry.checkSection("testimonial", { author: "Ada", content: "Yes." })).toEqual([]);
  });

  it("uses the built-ins without a file, and names the file when its types are invalid", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-blocks-"));
    try {
      expect((await loadBlockRegistry(tmp)).list()).toHaveLength(4);
      await mkdir(path.join(tmp, "src"));
      // Pure data, like a theme's file; `callout` is a built-in's name.
      await writeFile(
        path.join(tmp, "src", "blocks.ts"),
        `export const blockTypes = [{ name: "callout", title: { en: "Mine" }, where: ["section"], props: { type: "object", additionalProperties: false, properties: {} }, example: { props: {} } }];\n`,
      );
      await expect(loadBlockRegistry(tmp)).rejects.toThrow(
        /src\/blocks\.ts: callout: a built-in block type has this name/,
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("loads the starter's design settings and refuses settings outside the subset (RFC-0017)", async () => {
    const settings = await loadThemeSettings(starter);
    expect(Object.keys(settings?.properties ?? {})).toEqual([
      "seed",
      "scheme",
      "contrast",
      "mode",
      "brand",
      "link",
      "surface",
      "text",
      "typePairing",
      "typeScale",
      "font",
      "radius",
      "density",
      "motion",
    ]);
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-settings-"));
    try {
      expect(await loadThemeSettings(tmp)).toBeUndefined();
      await mkdir(path.join(tmp, "src"));
      await writeFile(
        path.join(tmp, "src", "settings.ts"),
        `export const themeSettings = { type: "object", additionalProperties: false, properties: { css: { type: "string", format: "css" } } };\n`,
      );
      await expect(loadThemeSettings(tmp)).rejects.toThrow(/src\/settings\.ts: themeSettings/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("imports the theme's file in the admin Worker's entry, after the prelude", () => {
    const entry = adminEntry("../../../src/blocks.ts");
    expect(entry.indexOf('import "@cloudhal/cloudflare/workerd-prelude";')).toBeLessThan(
      entry.indexOf('import { blockTypes } from "../../../src/blocks.ts";'),
    );
    expect(entry).toContain("createAdminWorker({ skills, blockTypes })");
    expect(adminEntry()).toContain("createAdminWorker({ skills })");
    expect(adminEntry()).not.toContain("blockTypes");
    expect(adminEntry(undefined, "../../../src/settings.ts")).toContain(
      'import { themeSettings } from "../../../src/settings.ts";',
    );
    expect(adminEntry("../../../src/blocks.ts", "../../../src/settings.ts")).toContain(
      "createAdminWorker({ skills, blockTypes, themeSettings })",
    );
  });

  it("reads the theme's DESIGN.md and bundles it with the admin Worker (RFC-0021)", async () => {
    const starter = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../starters/blog",
    );
    const design = await loadThemeDesign(starter);
    expect(design).toMatch(/^## Brand\nThe blog theme is an editorial theme/);
    const tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-design-"));
    try {
      expect(await loadThemeDesign(tmp)).toBeUndefined();
      await mkdir(path.join(tmp, "src"));
      await writeFile(path.join(tmp, "src", "DESIGN.md"), "   \n");
      expect(await loadThemeDesign(tmp)).toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    const entry = adminEntry(undefined, undefined, true);
    expect(entry).toContain('import themeDesign from "./theme-design.ts";');
    expect(entry).toContain("createAdminWorker({ skills, themeDesign })");
    expect(adminEntry()).not.toContain("themeDesign");
  });
});
