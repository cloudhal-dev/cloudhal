/**
 * S16 (RFC-0008 §9.4): no code in the repository reads the clock through `Temporal.Now`, imports
 * the global or shim entry of `temporal-polyfill`, or relies on a native `Temporal`. The only
 * Temporal entry point is `temporal-polyfill/implementation`, and `now` is injected. Biome's
 * `noRestrictedImports` refuses the same imports at lint time.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const DIRS = ["packages", "apps", "starters", "capabilities", "scripts", "examples"];
const SKIP = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".astro",
  ".wrangler",
  "target",
  "generated",
  ".build",
]);
const EXT = /\.(?:ts|tsx|js|mjs|cjs|astro)$/;

function* files(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) yield* files(path);
    else if (EXT.test(name)) yield path;
  }
}

// Built from parts so this file does not match itself.
const NOW = new RegExp(["Temporal", "Now"].join("\\.\\s*"));
const GLOBAL_IMPORT = /["']temporal-polyfill(?:\/global|\/shim|\/full(?:\/global|\/shim)?)?["']/;
const GLOBAL_TEMPORAL = new RegExp(["globalThis", "Temporal"].join("\\."));

describe("clock rules (S16)", () => {
  it("nothing reads Temporal's clock or uses a global Temporal", () => {
    const offenders: string[] = [];
    for (const d of DIRS)
      for (const f of files(join(ROOT, d))) {
        if (f === import.meta.filename) continue;
        const text = readFileSync(f, "utf8");
        if (NOW.test(text) || GLOBAL_IMPORT.test(text) || GLOBAL_TEMPORAL.test(text))
          offenders.push(relative(ROOT, f));
      }
    expect(offenders).toEqual([]);
  });

  it("Biome refuses the global and shim entries of temporal-polyfill", () => {
    const biome = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8"));
    const sets = [
      biome.linter.rules.style.noRestrictedImports.options.paths,
      ...biome.overrides
        .map(
          (o: {
            linter?: {
              rules?: { style?: { noRestrictedImports?: { options: { paths: object } } } };
            };
          }) => o.linter?.rules?.style?.noRestrictedImports?.options.paths,
        )
        .filter(Boolean),
    ];
    for (const paths of sets)
      for (const name of [
        "temporal-polyfill",
        "temporal-polyfill/global",
        "temporal-polyfill/shim",
      ])
        expect(Object.keys(paths)).toContain(name);
  });
});
