/**
 * The theme check of `deploy --release` (RFC-0046 §11b): the bundle's site and admin code were
 * built from this CLI version's own starter, so a project whose build inputs differ from that
 * starter would silently lose its changes. Compared, as normalised relative paths, byte for byte
 * after CRLF → LF:
 *
 * - every file under `src/` and `public/` (and `skills/`, which `resolveSkillsDir` prefers and the
 *   admin build bakes in; the starter has none);
 * - the root build inputs `astro.config.mjs`, `tsconfig.json` and `jsconfig.json`;
 * - every PostCSS config Vite would load, in every directory from the project up to Vite's
 *   workspace root (`searchForWorkspaceRoot`: the nearest directory with `pnpm-workspace.yaml`,
 *   `lerna.json`, a `package.json` with `workspaces`, or a `deno.json(c)` with `workspace`; without
 *   one, the project alone), including a `postcss` key in `package.json`.
 *
 * Checked against Astro 7.4.7 and Vite 8.3.5 (`resolvePostcssConfig`, the `postcss-load-config`
 * 6.0.1 search places). Astro passes `configFile: false` to Vite, so `vite.config.*` is never read;
 * `.env*` files are not compared (the starter's code reads no `import.meta.env`). Recheck this list
 * on every Astro or Vite major upgrade.
 *
 * `.DS_Store`, `Thumbs.db` and `desktop.ini` are skipped wherever they appear (exact basenames).
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assetDir } from "../../../assets.ts";
import { starterFilter } from "../../../starter-files.ts";

const TREES = ["src", "public", "skills"];
const ROOT_FILES = ["astro.config.mjs", "tsconfig.json", "jsconfig.json"];
const JS_EXT = ["js", "cjs", "mjs", "ts", "cts", "mts"];
/** `postcss-load-config` 6.0.1's search places (the `package.json` key aside). */
export const POSTCSS_FILES = [
  ...JS_EXT.map((e) => `postcss.config.${e}`),
  ".postcssrc",
  ...["json", "yaml", "yml", ...JS_EXT].map((e) => `.postcssrc.${e}`),
];
const OS_METADATA = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

export interface ThemeDifference {
  /** Relative to the project (`../postcss.config.cjs` above it). */
  readonly path: string;
  readonly change: "changed" | "added" | "missing";
}

type Keep = (abs: string) => boolean;

async function filesUnder(root: string, rel: string, keep: Keep): Promise<string[]> {
  const dir = path.join(root, rel);
  if (!existsSync(dir)) return [];
  if (!(await stat(dir)).isDirectory()) return [rel]; // e.g. a file named `skills`
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const r = `${rel}/${entry.name}`;
    if (OS_METADATA.has(entry.name) || !keep(path.join(root, r))) continue;
    if (entry.isDirectory()) out.push(...(await filesUnder(root, r, keep)));
    else out.push(r);
  }
  return out;
}

/** The compared files of `root`: the trees and the root build inputs. */
async function comparedFiles(root: string, keep: Keep): Promise<Set<string>> {
  const files = new Set<string>();
  for (const tree of TREES) for (const f of await filesUnder(root, tree, keep)) files.add(f);
  for (const f of [...ROOT_FILES, ...POSTCSS_FILES])
    if (existsSync(path.join(root, f)) && keep(path.join(root, f))) files.add(f);
  return files;
}

/** The file's bytes with every CRLF as LF, so a Windows checkout of the starter compares equal. */
async function normalised(file: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(file));
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++)
    if (!(bytes[i] === 0x0d && bytes[i + 1] === 0x0a)) out[n++] = bytes[i] as number;
  return out.subarray(0, n);
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const postcssKey = async (dir: string): Promise<string | undefined> => {
  const file = path.join(dir, "package.json");
  if (!existsSync(file)) return undefined;
  try {
    const pkg = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    return Object.hasOwn(pkg, "postcss") ? JSON.stringify(pkg.postcss) : undefined;
  } catch {
    return undefined;
  }
};

async function isWorkspaceRoot(dir: string): Promise<boolean> {
  if (existsSync(path.join(dir, "pnpm-workspace.yaml")) || existsSync(path.join(dir, "lerna.json")))
    return true;
  const has = async (name: string, key: string) => {
    const file = path.join(dir, name);
    if (!existsSync(file)) return false;
    try {
      return Object.hasOwn(JSON.parse(await readFile(file, "utf8")) as object, key);
    } catch {
      return false; // deno.jsonc with comments: Vite strips them; a parse failure is no workspace
    }
  };
  return (
    (await has("package.json", "workspaces")) ||
    (await has("deno.json", "workspace")) ||
    (await has("deno.jsonc", "workspace"))
  );
}

/** The directories Vite searches for a PostCSS config: the project up to its workspace root. */
export async function postcssSearchDirs(projectDir: string): Promise<string[]> {
  const dirs: string[] = [];
  let cur = path.resolve(projectDir);
  for (;;) {
    dirs.push(cur);
    if (await isWorkspaceRoot(cur)) return dirs;
    const parent = path.dirname(cur);
    if (parent === cur) return [path.resolve(projectDir)]; // no workspace: the project alone
    cur = parent;
  }
}

/** This CLI version's starter (the one `cloudhal init` copies): its directory and file filter. */
export async function cliStarter(name = "blog"): Promise<{ dir: string; keep: Keep }> {
  const starters = await assetDir("starters");
  const dir = starters ? path.join(starters, name) : undefined;
  if (!dir || !existsSync(dir)) throw new Error(`this CLI ships no starter "${name}"`);
  return { dir, keep: await starterFilter(dir) };
}

/** Every difference between the project's build inputs and the starter's (see the file comment). */
export async function themeDifferences(
  projectDir: string,
  starter: { dir: string; keep: Keep },
): Promise<ThemeDifference[]> {
  const mine = await comparedFiles(projectDir, () => true);
  const theirs = await comparedFiles(starter.dir, starter.keep);
  const out: ThemeDifference[] = [];
  for (const f of [...new Set([...mine, ...theirs])].sort()) {
    if (!theirs.has(f)) out.push({ path: f, change: "added" });
    else if (!mine.has(f)) out.push({ path: f, change: "missing" });
    else if (
      !sameBytes(
        await normalised(path.join(projectDir, f)),
        await normalised(path.join(starter.dir, f)),
      )
    )
      out.push({ path: f, change: "changed" });
  }
  // `resolveSkillsDir` takes `skills/` whenever it exists, even empty: that alone is a difference.
  const skills = (root: string) => existsSync(path.join(root, "skills"));
  if (skills(projectDir) && !skills(starter.dir) && !out.some((d) => d.path.startsWith("skills")))
    out.push({ path: "skills/", change: "added" });
  // `postcss` in the project's package.json, compared with the starter's.
  const [own, starters] = [await postcssKey(projectDir), await postcssKey(starter.dir)];
  if (own !== starters)
    out.push({
      path: "package.json#postcss",
      change: starters === undefined ? "added" : own === undefined ? "missing" : "changed",
    });
  // Above the project, up to Vite's workspace root: any PostCSS config at all.
  for (const dir of (await postcssSearchDirs(projectDir)).slice(1)) {
    const rel = path.relative(projectDir, dir).split(path.sep).join("/");
    for (const f of POSTCSS_FILES)
      if (existsSync(path.join(dir, f))) out.push({ path: `${rel}/${f}`, change: "added" });
    if ((await postcssKey(dir)) !== undefined)
      out.push({ path: `${rel}/package.json#postcss`, change: "added" });
  }
  return out;
}

/** The differences as lines: the first 20 and a count, or with `all` every one. */
export function listDifferences(diffs: readonly ThemeDifference[], all = false): string {
  const shown = all ? diffs : diffs.slice(0, 20);
  const lines = shown.map((d) => `  ${d.change}: ${d.path}`);
  if (diffs.length > shown.length) lines.push(`  … and ${diffs.length - shown.length} more`);
  return lines.join("\n");
}
