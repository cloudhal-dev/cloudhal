/**
 * S16 (RFC-0008 §9.4): the only Temporal entry point is `temporal-polyfill/implementation`, and
 * `now` is injected. The repository-wide scan for clock reads lives in core-ts
 * (`test/temporal-guard.test.ts`); this checks that Biome's `noRestrictedImports` refuses the
 * global and shim entries at lint time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");

describe("clock rules (S16)", () => {
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
