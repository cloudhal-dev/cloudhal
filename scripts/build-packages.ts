/**
 * Builds the publishable packages for npm (ADR-0013). In the monorepo every package exports its
 * TypeScript sources; the published tarballs point at `dist/` instead (pnpm `publishConfig`):
 *
 * - JavaScript: Node's own type stripper (`module.stripTypeScriptTypes`) per file — the sources use
 *   only erasable syntax — with relative `.ts` specifiers rewritten to `.js` (es-module-lexer).
 * - Declarations: one `tsc --emitDeclarationOnly` pass over all packages (tsconfig.build.json);
 *   each package keeps its own `.d.ts` files, specifiers rewritten the same way.
 * - Assets (`.astro`, `.json`, generated `.js`/`.d.ts`, `.css`) are copied, `.ts` specifiers in
 *   `.astro`/`.js` rewritten too.
 *
 *   node scripts/build-packages.ts            # build all
 *   node scripts/build-packages.ts --check    # verify publishConfig matches exports (CI)
 *   node scripts/build-packages.ts --write-publish-config
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "packages/core-ts/package.json"));

/** Publishable packages, dependencies first. */
export const PACKAGES = [
  "core-contracts",
  "storage",
  "analytics",
  "core-ts",
  "astro-renderer",
  "agent-runtime",
  "mcp-server",
  "api",
  "cloudflare",
  "cli",
  "create-cloudhal",
] as const;

/** Directories inside a package that hold code or runtime assets (mirrored into dist/). */
const SOURCE_DIRS = ["src", "scripts", "bin", "migrations"];
const SKIP_FILE = /(\.test\.tsx?|[\\/]testing\.ts)$/;

type Json = Record<string, unknown>;
interface LexedImport {
  specifier?: string | null;
  start?: number;
  end?: number;
  n?: string;
  s?: number;
  e?: number;
}
interface Lexer {
  init: Promise<void>;
  parse(code: string): [unknown[], unknown[]];
}
let lexer: Lexer | undefined;
async function getLexer(): Promise<Lexer> {
  if (!lexer) {
    const pnpmDir = path.join(ROOT, "node_modules/.pnpm");
    const dir = (await readdir(pnpmDir))
      .filter((d) => d.startsWith("es-module-lexer@"))
      .sort()
      .at(-1);
    if (!dir) throw new Error("es-module-lexer not found in node_modules/.pnpm");
    lexer = (await import(
      path.join(pnpmDir, dir, "node_modules/es-module-lexer/dist/lexer.js")
    )) as Lexer;
    await lexer.init;
  }
  return lexer;
}

/** Rewrites relative `./x.ts` / `../x.tsx` specifiers to `.js` (static, dynamic and re-exports). */
export async function rewriteSpecifiers(code: string): Promise<string> {
  const { parse } = await getLexer();
  const [imports] = parse(code) as unknown as [LexedImport[]];
  let out = "";
  let last = 0;
  for (const raw of imports) {
    // es-module-lexer 3 names the fields specifier/start/end; 1–2 used n/s/e.
    const spec = raw.specifier ?? raw.n;
    const start = raw.start ?? raw.s;
    const end = raw.end ?? raw.e;
    if (spec == null || start == null || end == null) continue;
    if (!/^\.{1,2}\//.test(spec) || !/\.(m|c)?tsx?$/.test(spec)) continue;
    const rewritten = spec.replace(/\.(m|c)?tsx?$/, (_, m: string | undefined) => `.${m ?? ""}js`);
    out += code.slice(last, start) + code.slice(start, end).replace(spec, rewritten);
    last = end;
  }
  return out + code.slice(last);
}

/** Same rewrite for .d.ts / .astro, where the lexer may not apply: plain string specifiers only. */
function rewriteSpecifiersLoose(code: string): string {
  return code.replace(
    /((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']+?)\.(m|c)?tsx?(["'])/g,
    (_, pre: string, p: string, m: string | undefined, q: string) => `${pre}${p}.${m ?? ""}js${q}`,
  );
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "test" || e.name.startsWith(".")) continue;
      out.push(...(await walk(full)));
    } else out.push(full);
  }
  return out;
}

const toDist = (rel: string) => `./dist/${rel.replace(/^\.\//, "")}`;
const jsOf = (rel: string) => toDist(rel).replace(/\.tsx?$/, ".js");
const dtsOf = (rel: string) => toDist(rel).replace(/\.tsx?$/, ".d.ts");

/** `exports` (sources) → `publishConfig.exports` (dist). */
export function publishExports(value: unknown): unknown {
  if (typeof value === "string") {
    if (/\.tsx?$/.test(value)) return { types: dtsOf(value), default: jsOf(value) };
    if (
      value.startsWith("./src/") ||
      value.startsWith("./scripts/") ||
      value.startsWith("./migrations/")
    )
      return toDist(value);
    return value; // e.g. ./schemas/* ships as-is
  }
  if (value && typeof value === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) out[k] = publishExports(v);
    return out;
  }
  return value;
}

export function publishConfigFor(pkg: Json): Json {
  const config: Json = { access: "public" };
  if (pkg.exports) config.exports = publishExports(pkg.exports);
  if (pkg.bin) {
    const bin: Json = {};
    for (const [k, v] of Object.entries(pkg.bin as Record<string, string>)) bin[k] = jsOf(v);
    config.bin = bin;
  }
  return config;
}

async function buildPackage(name: string, typesRoot: string): Promise<void> {
  const dir = path.join(ROOT, "packages", name);
  const dist = path.join(dir, "dist");
  await rm(dist, { recursive: true, force: true });
  for (const sub of SOURCE_DIRS) {
    for (const file of await walk(path.join(dir, sub))) {
      if (SKIP_FILE.test(file)) continue;
      const rel = path.relative(dir, file);
      const target = path.join(dist, rel);
      await mkdir(path.dirname(target), { recursive: true });
      if (/\.tsx?$/.test(file) && !file.endsWith(".d.ts")) {
        const source = await readFile(file, "utf8");
        const shebang = source.startsWith("#!")
          ? `${source.slice(0, source.indexOf("\n") + 1)}`
          : "";
        const body = shebang ? source.slice(shebang.length) : source;
        const js = stripTypeScriptTypes(body, { mode: "strip" });
        await writeFile(target.replace(/\.tsx?$/, ".js"), shebang + (await rewriteSpecifiers(js)));
        const dts = path.join(typesRoot, name, rel.replace(/\.tsx?$/, ".d.ts"));
        try {
          await writeFile(
            target.replace(/\.tsx?$/, ".d.ts"),
            rewriteSpecifiersLoose(await readFile(dts, "utf8")),
          );
        } catch {
          throw new Error(`no declarations for ${name}/${rel} (is it in tsconfig.build.json?)`);
        }
      } else if (/\.(astro|js|mjs)$/.test(file) || file.endsWith(".d.ts")) {
        await writeFile(target, rewriteSpecifiersLoose(await readFile(file, "utf8")));
      } else {
        await cp(file, target);
      }
    }
  }
}

const ASSET_SKIP = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".cloudhal",
  "cloudhal.json",
  ".wrangler",
  "wrangler.jsonc",
]);

/** The CLI ships the built Studio, the starters (with real dependency versions) and the skills. */
async function buildCliAssets(): Promise<void> {
  const { materializeDependencies, monorepoVersions } = (await import(
    path.join(ROOT, "packages/cli/src/assets.ts")
  )) as typeof import("../packages/cli/src/assets.ts");
  const assets = path.join(ROOT, "packages/cli/dist/assets");
  const studio = path.join(ROOT, "apps/studio/dist");
  try {
    await stat(path.join(studio, "index.html"));
  } catch {
    execFileSync("pnpm", ["--filter", "@cloudhal/studio", "build"], {
      stdio: "inherit",
      cwd: ROOT,
    });
  }
  await cp(studio, path.join(assets, "studio"), {
    recursive: true,
    filter: (src) => !src.endsWith(".map"),
  });
  await cp(path.join(ROOT, "skills/official"), path.join(assets, "skills"), { recursive: true });
  const versions = await monorepoVersions(ROOT);
  for (const starter of await readdir(path.join(ROOT, "starters"))) {
    const from = path.join(ROOT, "starters", starter);
    const to = path.join(assets, "starters", starter);
    await cp(from, to, { recursive: true, filter: (src) => !ASSET_SKIP.has(path.basename(src)) });
    // npm drops .gitignore from published tarballs; ship it as _gitignore (init renames it back).
    try {
      await cp(path.join(from, ".gitignore"), path.join(to, "_gitignore"));
      await rm(path.join(to, ".gitignore"), { force: true });
    } catch {
      // starter without .gitignore
    }
    const pkg = JSON.parse(await readFile(path.join(from, "package.json"), "utf8")) as Json;
    await writeFile(
      path.join(to, "package.json"),
      `${JSON.stringify(materializeDependencies(pkg, versions), null, 2)}\n`,
    );
  }
}

async function readPkg(name: string): Promise<Json> {
  return JSON.parse(
    await readFile(path.join(ROOT, "packages", name, "package.json"), "utf8"),
  ) as Json;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check") || args.has("--write-publish-config")) {
    let stale = 0;
    for (const name of PACKAGES) {
      const file = path.join(ROOT, "packages", name, "package.json");
      const pkg = await readPkg(name);
      const want = publishConfigFor(pkg);
      if (JSON.stringify(pkg.publishConfig) === JSON.stringify(want)) continue;
      if (args.has("--write-publish-config")) {
        pkg.publishConfig = want;
        await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
        console.log(`updated ${name}/package.json publishConfig`);
      } else {
        console.error(
          `${name}: publishConfig is out of date (run node scripts/build-packages.ts --write-publish-config)`,
        );
        stale++;
      }
    }
    process.exit(stale ? 1 : 0);
  }
  const typesRoot = path.join(ROOT, ".build/types");
  await rm(typesRoot, { recursive: true, force: true });
  const tsc = path.join(path.dirname(require.resolve("typescript/package.json")), "bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", path.join(ROOT, "tsconfig.build.json")], {
    stdio: "inherit",
    cwd: ROOT,
  });
  for (const name of PACKAGES) {
    try {
      await stat(path.join(ROOT, "packages", name));
    } catch {
      continue;
    }
    await buildPackage(name, typesRoot);
    if (name === "cli") await buildCliAssets();
    console.log(`built ${name}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
