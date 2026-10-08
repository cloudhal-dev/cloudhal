/** What makes the published packages installable (ADR-0013). */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PACKAGES,
  publishConfigFor,
  publishExports,
  rewriteSpecifiers,
} from "../../../scripts/build-packages.ts";
import { assetDir, materializeDependencies, parseCatalog } from "../src/assets.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("build: specifiers and exports", () => {
  it("rewrites relative .ts specifiers in static, dynamic and re-exports only", async () => {
    const src = [
      'import { a } from "./a.ts";',
      'export * from "../b/c.ts";',
      'export { d } from "./d.mts";',
      'const e = await import("./e.ts");',
      'import x from "@scope/pkg";',
      'import y from "./y.json" with { type: "json" };',
      'const s = "not ./f.ts an import";',
    ].join("\n");
    const out = await rewriteSpecifiers(src);
    expect(out).toContain('from "./a.js"');
    expect(out).toContain('from "../b/c.js"');
    expect(out).toContain('from "./d.mjs"');
    expect(out).toContain('import("./e.js")');
    expect(out).toContain('from "@scope/pkg"');
    expect(out).toContain('from "./y.json"');
    expect(out).toContain('"not ./f.ts an import"');
  });

  it("maps source exports to dist, keeping conditions and non-code paths", () => {
    expect(
      publishExports({
        ".": "./src/index.ts",
        "./runtime": { workerd: "./src/runtime-workerd.ts", default: "./src/runtime.ts" },
        "./components/*": "./src/components/*",
        "./schemas/*": "./schemas/*",
      }),
    ).toEqual({
      ".": { types: "./dist/src/index.d.ts", default: "./dist/src/index.js" },
      "./runtime": {
        workerd: {
          types: "./dist/src/runtime-workerd.d.ts",
          default: "./dist/src/runtime-workerd.js",
        },
        default: { types: "./dist/src/runtime.d.ts", default: "./dist/src/runtime.js" },
      },
      "./components/*": "./dist/src/components/*",
      "./schemas/*": "./schemas/*",
    });
    expect(publishConfigFor({ bin: { cloudhal: "./bin/cloudhal.ts" } })).toEqual({
      access: "public",
      bin: { cloudhal: "./dist/bin/cloudhal.js" },
    });
  });

  it("every publishable package has an up-to-date publishConfig and ships dist", async () => {
    for (const name of PACKAGES) {
      const pkg = JSON.parse(
        await readFile(path.join(ROOT, "packages", name, "package.json"), "utf8"),
      );
      expect(pkg.publishConfig, name).toEqual(publishConfigFor(pkg));
      expect(pkg.files, name).toContain("dist");
      expect(pkg.private, name).toBeUndefined();
    }
  });
});

describe("starter dependencies outside the monorepo", () => {
  it("parses the pnpm catalog and materialises workspace:/catalog: specifiers", async () => {
    const catalog = parseCatalog(await readFile(path.join(ROOT, "pnpm-workspace.yaml"), "utf8"));
    expect(catalog.astro).toMatch(/^\^?7\./);
    expect(catalog["@astrojs/cloudflare"]).toBeDefined();
    const out = materializeDependencies(
      {
        dependencies: { "@cloudhal/cli": "workspace:*", astro: "catalog:", left: "^1.0.0" },
        devDependencies: { wrangler: "catalog:" },
      },
      { workspace: { "@cloudhal/cli": "0.3.0" }, catalog },
    );
    expect(out.dependencies).toEqual({
      "@cloudhal/cli": "^0.3.0",
      astro: catalog.astro,
      left: "^1.0.0",
    });
    expect(out.devDependencies).toEqual({ wrangler: catalog.wrangler });
    expect(() =>
      materializeDependencies({ dependencies: { x: "workspace:*" } }, { workspace: {}, catalog }),
    ).toThrow(/x/);
  });

  it("finds Studio, starters and skills from the source layout", async () => {
    expect(await assetDir("starters")).toMatch(/starters$/);
    expect(await assetDir("skills")).toMatch(/skills[\\/]official$|assets[\\/]skills$/);
  });
});
