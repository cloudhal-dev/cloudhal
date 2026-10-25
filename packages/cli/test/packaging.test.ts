/** What makes the published packages installable (ADR-0013). */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  exportedSources,
  PACKAGES,
  publishConfigFor,
  publishExports,
  rewriteSpecifiers,
  shipsFile,
} from "../../../scripts/build-packages.ts";
import { verifyPublishTargets } from "../../../scripts/verify-exports.ts";
import {
  assetDir,
  materializeDependencies,
  monorepoVersions,
  parseCatalog,
} from "../src/assets.ts";

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

  it("ships every source a package exports; tests and unexported testing.ts stay out", async () => {
    for (const name of PACKAGES) {
      const pkg = JSON.parse(
        await readFile(path.join(ROOT, "packages", name, "package.json"), "utf8"),
      );
      const exported = exportedSources(pkg);
      for (const rel of exported) {
        if (rel.includes("*") || !/\.tsx?$/.test(rel)) continue;
        expect(shipsFile(name, rel, exported), `${name}/${rel}`).toBe(true);
      }
    }
    expect(shipsFile("core-ts", "src/testing.ts", new Set())).toBe(false);
    expect(shipsFile("storage", "src/a.test.ts", new Set(["src/a.test.ts"]))).toBe(false);
    expect(shipsFile("core-ts", "scripts/gen-icons.ts", new Set(["scripts/gen-icons.ts"]))).toBe(
      false,
    );
  });

  it("reports published exports/bin targets outside files or missing from dist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cloudhal-exports-"));
    try {
      await mkdir(path.join(dir, "dist/src/c"), { recursive: true });
      for (const file of ["dist/src/index.js", "dist/src/index.d.ts", "dist/src/c/a.js"])
        await writeFile(path.join(dir, file), "");
      const pkg = {
        name: "fixture",
        files: ["dist"],
        publishConfig: {
          exports: {
            ".": { types: "./dist/src/index.d.ts", default: "./dist/src/index.js" },
            "./testing": { types: "./dist/src/testing.d.ts", default: "./dist/src/testing.js" },
            "./c/*": "./dist/src/c/*",
            "./schemas/*": "./schemas/*",
          },
          bin: { y: "./dist/bin/y.js" },
        },
      };
      expect(await verifyPublishTargets(dir, pkg)).toEqual([
        "fixture: ./testing (types) → ./dist/src/testing.d.ts: missing",
        "fixture: ./testing (default) → ./dist/src/testing.js: missing",
        "fixture: ./schemas/* → ./schemas/*: outside files",
        "fixture: bin (y) → ./dist/bin/y.js: missing",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
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
      { workspace: { "@cloudhal/cli": "0.3.0" }, catalog, installed: { astro: "7.3.6" } },
    );
    // exact, like `pnpm publish` writes workspace:* (the packages are released together); the
    // shared Astro peer at the version the monorepo installed, so a project gets one copy
    expect(out.dependencies).toEqual({
      "@cloudhal/cli": "0.3.0",
      astro: "7.3.6",
      left: "^1.0.0",
    });
    expect(out.devDependencies).toEqual({ wrangler: catalog.wrangler });
    expect(() =>
      materializeDependencies({ dependencies: { x: "workspace:*" } }, { workspace: {}, catalog }),
    ).toThrow(/x/);
  });

  it("links @cloudhal/* to a checkout, relative to the project", () => {
    const out = materializeDependencies(
      { dependencies: { "@cloudhal/cli": "workspace:*" } },
      {
        workspace: { "@cloudhal/cli": "0.3.0" },
        catalog: {},
        dirs: { "@cloudhal/cli": "/src/cloudhal/packages/cli" },
      },
      { linkFrom: "/src/my-site" },
    );
    expect(out.dependencies).toEqual({ "@cloudhal/cli": "link:../cloudhal/packages/cli" });
  });

  it("the monorepo's versions: every package's own, Astro as the renderer resolves it", async () => {
    const v = await monorepoVersions(ROOT);
    const cli = JSON.parse(await readFile(path.join(ROOT, "packages/cli/package.json"), "utf8"));
    expect(v.workspace["@cloudhal/cli"]).toBe(cli.version);
    expect(v.dirs?.["@cloudhal/cli"]).toBe(await realpath(path.join(ROOT, "packages/cli")));
    const astro = JSON.parse(
      await readFile(
        path.join(ROOT, "packages/astro-renderer/node_modules/astro/package.json"),
        "utf8",
      ),
    );
    expect(v.installed?.astro).toBe(astro.version);
    expect(v.installed?.astro).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("the published packages share one version (changesets fixed group = PACKAGES)", async () => {
    const config = JSON.parse(await readFile(path.join(ROOT, ".changeset/config.json"), "utf8"));
    const names = await Promise.all(
      PACKAGES.map(
        async (name) =>
          JSON.parse(await readFile(path.join(ROOT, "packages", name, "package.json"), "utf8"))
            .name as string,
      ),
    );
    expect(config.fixed).toEqual([names]);
  });

  it("from source, prefers the live monorepo folders over a stale dist/assets copy", async () => {
    expect(await assetDir("starters")).toBe(path.join(ROOT, "starters"));
    expect(await assetDir("skills")).toBe(path.join(ROOT, "skills/official"));
    const studio = await assetDir("studio");
    if (studio) expect(studio).toBe(path.join(ROOT, "apps/studio/dist"));
  });
});
