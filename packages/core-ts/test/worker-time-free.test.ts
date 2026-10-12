/**
 * RFC-0008 §9.4: the site Worker compares instants and never bundles the time-zone library. The
 * store's index now applies releases (`publishRelease`, holds, locks) through
 * `@cloudhal/schedules/engine`, so this walks the static import graph — relative files and
 * `@cloudhal/*` packages through their `exports` — from every entry the site Worker reaches, and
 * fails if `temporal-polyfill` is on it. Type-only imports are erased and not followed.
 * `@cloudhal/core-ts/time` and `/releases` are the time-zone entries; they must reach it.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES = path.resolve(here, "../..");

async function packageMap(): Promise<
  Map<string, { dir: string; exports: Record<string, unknown> }>
> {
  const out = new Map<string, { dir: string; exports: Record<string, unknown> }>();
  for (const name of await readdir(PACKAGES)) {
    try {
      const dir = path.join(PACKAGES, name);
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
        name?: string;
        exports?: Record<string, unknown>;
      };
      if (pkg.name && pkg.exports) out.set(pkg.name, { dir, exports: pkg.exports });
    } catch {
      // not a package
    }
  }
  return out;
}

const SPECIFIERS =
  /(?:^|[\s;])(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Every module the given entry reaches at run time, and the bare packages it imports. */
async function reach(entry: string) {
  const pkgs = await packageMap();
  const seen = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(SPECIFIERS)) {
      if (m[1]) continue; // `import type` / `export type`
      const spec = (m[2] ?? m[3]) as string;
      if (spec.startsWith(".")) {
        queue.push(path.resolve(path.dirname(file), spec));
        continue;
      }
      const scoped = /^(@cloudhal\/[^/]+)(\/.*)?$/.exec(spec);
      const pkg = scoped ? pkgs.get(scoped[1] as string) : undefined;
      if (pkg) {
        const raw = pkg.exports[`.${scoped?.[2] ?? ""}`];
        // condition maps (`{ workerd, default }`): every branch may be bundled
        const targets =
          typeof raw === "string"
            ? [raw]
            : raw && typeof raw === "object"
              ? Object.values(raw).filter((v): v is string => typeof v === "string")
              : [];
        for (const target of targets) queue.push(path.join(pkg.dir, target));
        continue;
      }
      external.add(spec);
    }
  }
  return { modules: seen, external };
}

const usesTemporal = (external: Set<string>) =>
  [...external].filter((s) => s === "temporal-polyfill" || s.startsWith("temporal-polyfill/"));

describe("the site Worker never bundles the time-zone library (§9.4)", () => {
  it("core-ts's index, its availability entry and the schedules engine reach no temporal-polyfill", async () => {
    for (const entry of [
      path.join(PACKAGES, "core-ts/src/index.ts"),
      path.join(PACKAGES, "core-ts/src/availability.ts"),
      path.join(PACKAGES, "schedules/src/engine.ts"),
      path.join(PACKAGES, "astro-renderer/src/cloudflare-entry.ts"),
      path.join(PACKAGES, "astro-renderer/src/runtime-workerd.ts"),
      path.join(PACKAGES, "astro-renderer/src/source.ts"),
    ]) {
      const { modules, external } = await reach(entry);
      expect(modules.size, entry).toBeGreaterThan(0);
      expect(usesTemporal(external), entry).toEqual([]);
    }
    // the release engine is on the index's graph (it is what this guards)
    const { modules } = await reach(path.join(PACKAGES, "core-ts/src/index.ts"));
    expect([...modules].some((m) => m.endsWith(path.join("schedules", "src", "release.ts")))).toBe(
      true,
    );
  });

  it("the time entries do reach it (one time model, from @cloudhal/schedules)", async () => {
    for (const entry of ["core-ts/src/time.ts", "core-ts/src/releases.ts"]) {
      const { external } = await reach(path.join(PACKAGES, entry));
      expect(usesTemporal(external), entry).toEqual(["temporal-polyfill/implementation"]);
    }
  });
});
