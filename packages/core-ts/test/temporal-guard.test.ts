/**
 * Invariant S16 (RFC-0008 §9.4): no code reads the clock through Temporal or uses a native
 * Temporal. Every file in the repository that says `Temporal.` must import it from
 * `temporal-polyfill/implementation`, and nothing reads `Now` from it: `now` is injected. Biome's
 * `noRestrictedImports` refuses the polyfill's other entry points; this test covers what an import
 * rule cannot see (a global `Temporal`, `globalThis.Temporal`, `Now`).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(here), "../../..");
const DIRS = ["packages", "apps", "starters", "capabilities", "scripts"];
const SKIP = new Set([
  "node_modules",
  "dist",
  "generated",
  ".astro",
  ".turbo",
  "target",
  ".bundled",
]);
const SOURCE = /\.(?:[cm]?[jt]sx?|astro)$/;

// Built from parts so this file does not match itself.
const T = "Temporal";
const NOW = new RegExp(`\\b${T}\\s*\\.\\s*Now\\b`);
const GLOBAL = new RegExp(`globalThis\\s*\\.\\s*${T}\\b|\\bglobalThis\\s*\\[\\s*["']${T}["']`);
const USES = new RegExp(`(?<![\\w.])${T}\\s*\\.`);
const IMPORTS = new RegExp(
  `import\\s*\\{[^}]*\\b${T}\\b[^}]*\\}\\s*from\\s*["']temporal-polyfill/implementation["']`,
);

async function* sources(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (SOURCE.test(e.name)) yield p;
  }
}

describe("S16: no Temporal clock, no native Temporal", () => {
  it("finds no read of the Temporal clock and no global Temporal anywhere in the repository", async () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const dir of DIRS)
      for await (const file of sources(path.join(ROOT, dir))) {
        if (file === here) continue;
        scanned++;
        const text = await readFile(file, "utf8");
        if (NOW.test(text))
          offenders.push(`${path.relative(ROOT, file)}: reads the Temporal clock`);
        if (GLOBAL.test(text))
          offenders.push(`${path.relative(ROOT, file)}: uses a global Temporal`);
        if (USES.test(text) && !IMPORTS.test(text))
          offenders.push(
            `${path.relative(ROOT, file)}: uses Temporal without importing temporal-polyfill/implementation`,
          );
      }
    expect(scanned).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("would catch an offender", () => {
    expect(NOW.test(`const t = ${T}.Now.instant();`)).toBe(true);
    expect(GLOBAL.test(`globalThis.${T}`)).toBe(true);
    expect(USES.test(`${T}.Instant.from(x)`) && !IMPORTS.test(`${T}.Instant.from(x)`)).toBe(true);
    expect(
      IMPORTS.test(
        `import { ${T} } from "temporal-polyfill/implementation";\n${T}.Instant.from(x)`,
      ),
    ).toBe(true);
  });
});
